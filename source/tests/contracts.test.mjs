import test from "node:test";
import assert from "node:assert/strict";
import { createApiHandler } from "../apps/api/src/app.mjs";
import {
  USER_ROLES,
  assertTenantAccess
} from "../packages/shared/src/domain.mjs";
import {
  AUTH_POLICY,
  invitationExpiresAt,
  canAcceptProviderInvitation
} from "../packages/auth/src/policy.mjs";
import {
  MEDIA_POLICY,
  validateProductMedia
} from "../packages/storage/src/policy.mjs";
import { CORE_TABLES, DATABASE_RULES } from "../packages/database/src/schema-plan.mjs";

function captureResponse() {
  return {
    statusCode: null,
    headers: null,
    body: "",
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    end(body = "") {
      this.body = String(body);
    }
  };
}

test("un proveedor no puede acceder a recursos de otro taller", () => {
  assert.equal(assertTenantAccess({
    role: USER_ROLES.PROVIDER_OWNER,
    actorProviderId: "taller-a",
    resourceProviderId: "taller-b"
  }), false);

  assert.equal(assertTenantAccess({
    role: USER_ROLES.PROVIDER_OWNER,
    actorProviderId: "taller-a",
    resourceProviderId: "taller-a"
  }), true);

  assert.equal(assertTenantAccess({
    role: USER_ROLES.ADMIN,
    actorProviderId: null,
    resourceProviderId: "taller-b"
  }), true);
});

test("las invitaciones caducan a las 48 horas y requieren doble factor", () => {
  assert.equal(AUTH_POLICY.invitationTtlHours, 48);
  assert.equal(
    invitationExpiresAt("2026-08-02T08:00:00.000Z").toISOString(),
    "2026-08-04T08:00:00.000Z"
  );
  assert.equal(canAcceptProviderInvitation({
    role: USER_ROLES.PROVIDER_OWNER,
    emailVerified: true,
    twoFactorEnabled: false
  }), false);
  assert.equal(canAcceptProviderInvitation({
    role: USER_ROLES.PROVIDER_OWNER,
    emailVerified: true,
    twoFactorEnabled: true
  }), true);
});

test("la política multimedia limita imágenes y vídeo", () => {
  assert.equal(MEDIA_POLICY.maxImagesPerProduct, 8);
  const tooManyImages = Array.from({ length: 9 }, () => ({
    type: "image/webp",
    size: 1024
  }));
  const result = validateProductMedia({ images: tooManyImages });
  assert.equal(result.valid, false);
  assert.match(result.errors[0], /8 imágenes/);
});

test("el mapa de datos incluye credenciales y exige seguridad antes del acceso", () => {
  assert.ok(CORE_TABLES.includes("audit_events"));
  assert.ok(CORE_TABLES.includes("user_credentials"));
  assert.equal(DATABASE_RULES.providerScopedTablesRequireProviderId, true);
  assert.equal(DATABASE_RULES.allMutationsCreateAuditEvent, true);
  assert.equal(DATABASE_RULES.passwordsStoredWithScrypt, true);
  assert.equal(DATABASE_RULES.providerAccessRequiresVerifiedEmailAndTwoFactor, true);
});

test("la API informa de conexión y capacidades sin exponer configuración", async () => {
  const database = {
    enabled: true,
    async ping() {
      return true;
    }
  };
  const response = captureResponse();
  const handler = createApiHandler({
    version: "0.3.0-test",
    database,
    onboardingService: {},
    mailService: { enabled: false },
    now: () => new Date("2026-08-02T09:00:00.000Z")
  });

  await handler({ method: "GET", url: "/health", headers: {} }, response);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body), {
    status: "ok",
    service: "atelier-lumiere-api",
    version: "0.3.0-test",
    environment: "development",
    database: "connected",
    smtp: "disabled",
    timestamp: "2026-08-02T09:00:00.000Z"
  });

  const metaResponse = captureResponse();
  await handler({ method: "GET", url: "/api/meta", headers: {} }, metaResponse);
  const meta = JSON.parse(metaResponse.body);
  assert.equal(meta.brand, "Atelier Lumière");
  assert.equal(meta.publicDemoProtected, true);
  assert.equal(meta.capabilities.database, true);
  assert.equal(meta.capabilities.providerIsolation, true);
  assert.equal(meta.capabilities.providerInvitationAcceptance, true);
  assert.equal(meta.capabilities.authentication, false);
  assert.equal(meta.capabilities.emailVerification, false);
  assert.equal(meta.capabilities.emailDelivery, false);
  assert.equal(meta.capabilities.twoFactorAuthentication, false);
  assert.equal(JSON.stringify(meta).includes("SMTP_PASSWORD"), false);
});

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

test("el mapa de datos incluye auditoría y exige ámbito de proveedor", () => {
  assert.ok(CORE_TABLES.includes("audit_events"));
  assert.equal(DATABASE_RULES.providerScopedTablesRequireProviderId, true);
  assert.equal(DATABASE_RULES.allMutationsCreateAuditEvent, true);
});

test("la API informa de salud sin fingir capacidades no conectadas", () => {
  const response = captureResponse();
  const handler = createApiHandler({
    version: "0.1.0-test",
    now: () => new Date("2026-08-02T09:00:00.000Z")
  });

  handler({ method: "GET", url: "/health" }, response);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body), {
    status: "ok",
    service: "atelier-lumiere-api",
    version: "0.1.0-test",
    environment: "development",
    timestamp: "2026-08-02T09:00:00.000Z"
  });

  const metaResponse = captureResponse();
  handler({ method: "GET", url: "/api/meta" }, metaResponse);
  const meta = JSON.parse(metaResponse.body);
  assert.equal(meta.brand, "Atelier Lumière");
  assert.equal(meta.publicDemoProtected, true);
  assert.equal(meta.capabilities.database, false);
  assert.equal(meta.capabilities.authentication, false);
});

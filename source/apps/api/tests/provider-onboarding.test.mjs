import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { createApiHandler } from "../src/app.mjs";
import { createDatabase } from "../src/database.mjs";
import {
  createDevelopmentAdminContext,
  createRequestAuthenticator,
  ensureDevelopmentAdmin
} from "../src/auth-context.mjs";
import { createProvidersService } from "../src/providers-service.mjs";
import { createProviderOnboardingService } from "../src/provider-onboarding-service.mjs";

const connectionString = process.env.DATABASE_URL;

async function jsonRequest(baseUrl, path, {
  method = "POST",
  token,
  body
} = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const payload = await response.json();
  return { response, payload };
}

test("una invitación crea una cuenta pendiente sin conceder acceso", {
  skip: !connectionString
}, async (t) => {
  const developmentAdminToken = "onboarding-test-admin-token-atelier-000000000001";
  const developmentAdminUserId = "00000000-0000-4000-8000-000000000001";
  const authOptions = {
    environment: "test",
    allowDevelopmentAdminAuth: true,
    developmentAdminToken,
    developmentAdminUserId
  };
  const fixedNow = new Date("2026-08-02T12:00:00.000Z");

  const database = createDatabase({
    connectionString,
    maxConnections: 4,
    statementTimeoutMs: 5000,
    logger: { error() {} }
  });
  const adminContext = createDevelopmentAdminContext(authOptions);
  await ensureDevelopmentAdmin(database, adminContext, {
    email: "admin-onboarding@atelier.example",
    displayName: "Administración de incorporación"
  });

  const providersService = createProvidersService({
    database,
    invitationTtlHours: 48,
    now: () => fixedNow
  });
  const onboardingService = createProviderOnboardingService({
    database,
    systemContext: adminContext,
    now: () => fixedNow
  });
  const handler = createApiHandler({
    environment: "test",
    database,
    providersService,
    onboardingService,
    authenticateRequest: createRequestAuthenticator(authOptions),
    logger: { error() {} }
  });
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await database.close();
  });

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const suffix = randomUUID().slice(0, 8);
  const email = `proveedora-${suffix}@atelier.example`;

  const created = await providersService.create(adminContext, {
    slug: `incorporacion-${suffix}`,
    displayName: `Taller incorporación ${suffix}`,
    contactName: "Responsable de prueba",
    contactEmail: email,
    specialty: "Papelería artesanal"
  });

  const preview = await jsonRequest(baseUrl, "/api/provider-invitations/preview", {
    body: { token: created.token }
  });
  assert.equal(preview.response.status, 200);
  assert.equal(preview.payload.provider.displayName, `Taller incorporación ${suffix}`);
  assert.equal(preview.payload.invitation.emailMasked.includes(email), false);
  assert.deepEqual(preview.payload.requiredSteps, [
    "CREATE_PASSWORD",
    "VERIFY_EMAIL",
    "ENABLE_2FA"
  ]);

  const weakPassword = await jsonRequest(baseUrl, "/api/provider-invitations/accept", {
    body: {
      token: created.token,
      displayName: "Artesana de prueba",
      password: "password1234"
    }
  });
  assert.equal(weakPassword.response.status, 422);
  assert.equal(weakPassword.payload.error, "VALIDATION_ERROR");

  const rawPassword = "Clave-segura-Atelier-2026!";
  const accepted = await jsonRequest(baseUrl, "/api/provider-invitations/accept", {
    body: {
      token: created.token,
      displayName: "Artesana de prueba",
      password: rawPassword
    }
  });
  assert.equal(accepted.response.status, 201);
  assert.equal(accepted.payload.user.status, "PENDING");
  assert.equal(accepted.payload.user.emailVerified, false);
  assert.equal(accepted.payload.user.twoFactorEnabled, false);
  assert.equal(accepted.payload.membership.status, "INVITED");
  assert.equal(accepted.payload.accessGranted, false);
  assert.deepEqual(accepted.payload.nextSteps, ["VERIFY_EMAIL", "ENABLE_2FA"]);
  assert.equal(JSON.stringify(accepted.payload).includes(rawPassword), false);
  assert.equal(JSON.stringify(accepted.payload).includes("passwordHash"), false);
  assert.equal(JSON.stringify(accepted.payload).includes("passwordSalt"), false);

  const stored = await database.withContext(adminContext, async (transaction) => {
    const result = await transaction.query(
      `SELECT
         u.status AS user_status,
         u.email_verified_at,
         u.two_factor_enabled,
         c.password_hash,
         c.password_salt,
         c.password_algorithm,
         pm.status AS membership_status,
         pi.status AS invitation_status,
         ae.action AS audit_action
       FROM users u
       INNER JOIN user_credentials c ON c.user_id = u.id
       INNER JOIN provider_members pm ON pm.user_id = u.id
       INNER JOIN provider_invitations pi ON pi.accepted_by = u.id
       INNER JOIN audit_events ae
         ON ae.entity_id = pi.id
        AND ae.action = 'PROVIDER_INVITATION_ACCEPTED'
       WHERE u.email = $1`,
      [email]
    );
    return result.rows[0];
  });

  assert.equal(stored.user_status, "PENDING");
  assert.equal(stored.email_verified_at, null);
  assert.equal(stored.two_factor_enabled, false);
  assert.equal(stored.password_algorithm, "scrypt-v1");
  assert.notEqual(stored.password_hash, rawPassword);
  assert.ok(stored.password_hash.length >= 64);
  assert.ok(stored.password_salt.length >= 16);
  assert.equal(stored.membership_status, "INVITED");
  assert.equal(stored.invitation_status, "ACCEPTED");
  assert.equal(stored.audit_action, "PROVIDER_INVITATION_ACCEPTED");

  const reused = await jsonRequest(baseUrl, "/api/provider-invitations/preview", {
    body: { token: created.token }
  });
  assert.equal(reused.response.status, 410);
  assert.equal(reused.payload.error, "INVITATION_UNAVAILABLE");
});

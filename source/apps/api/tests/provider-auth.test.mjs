import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { createApiHandler } from "../src/app.mjs";
import {
  createDevelopmentAdminContext,
  createRequestAuthenticator,
  ensureDevelopmentAdmin
} from "../src/auth-context.mjs";
import { createDatabase } from "../src/database.mjs";
import { createEmailVerificationService } from "../src/email-verification-service.mjs";
import { createProviderAuthService } from "../src/provider-auth-service.mjs";
import { createProviderOnboardingService } from "../src/provider-onboarding-service.mjs";
import { createProvidersService } from "../src/providers-service.mjs";
import { createTwoFactorService, generateTotpCode } from "../src/two-factor-service.mjs";

const connectionString = process.env.DATABASE_URL;

async function requestJson(baseUrl, path, {
  method = "POST",
  body,
  bearer
} = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const payload = await response.json();
  return { response, payload };
}

test("el proveedor necesita aprobación, contraseña y segundo factor para crear sesión", {
  skip: !connectionString
}, async (t) => {
  const authOptions = {
    environment: "test",
    allowDevelopmentAdminAuth: true,
    developmentAdminToken: "provider-auth-admin-token-atelier-000000000001",
    developmentAdminUserId: "00000000-0000-4000-8000-000000000001"
  };
  let currentTime = new Date("2026-08-02T13:00:00.000Z");
  const now = () => new Date(currentTime);
  const encryptionKey = Buffer.alloc(32, 81);
  const recoveryPepper = "recovery-pepper-provider-login-atelier-000000000001";
  const loginPepper = "login-throttle-pepper-atelier-lumiere-000000000001";

  const database = createDatabase({
    connectionString,
    maxConnections: 5,
    statementTimeoutMs: 5000,
    logger: { error() {} }
  });
  const adminContext = createDevelopmentAdminContext(authOptions);
  await ensureDevelopmentAdmin(database, adminContext, {
    email: "admin-provider-auth@atelier.example",
    displayName: "Administración acceso proveedor"
  });

  const providersService = createProvidersService({ database, now });
  const onboardingService = createProviderOnboardingService({
    database,
    systemContext: adminContext,
    now
  });
  const emailVerificationService = createEmailVerificationService({
    database,
    systemContext: adminContext,
    now
  });
  const twoFactorService = createTwoFactorService({
    database,
    systemContext: adminContext,
    encryptionKey,
    recoveryPepper,
    now
  });
  const providerAuthService = createProviderAuthService({
    database,
    systemContext: adminContext,
    loginPepper,
    twoFactorEncryptionKey: encryptionKey.toString("base64"),
    recoveryPepper,
    challengeTtlMinutes: 10,
    sessionTtlHours: 12,
    now
  });

  const handler = createApiHandler({
    environment: "test",
    database,
    providersService,
    onboardingService,
    emailVerificationService,
    twoFactorService,
    providerAuthService,
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
  const email = `login-${suffix}@atelier.example`;
  const password = "Clave-segura-login-2026!";

  const provider = await providersService.create(adminContext, {
    slug: `login-${suffix}`,
    displayName: `Taller acceso ${suffix}`,
    contactName: "Responsable acceso",
    contactEmail: email,
    specialty: "Bordado"
  });

  const accepted = await requestJson(baseUrl, "/api/provider-invitations/accept", {
    body: {
      token: provider.token,
      displayName: "Artesana acceso",
      password
    }
  });
  assert.equal(accepted.response.status, 201);

  const verified = await requestJson(baseUrl, "/api/email-verifications/verify", {
    body: { token: accepted.payload.verificationToken }
  });
  assert.equal(verified.response.status, 200);

  const setup = await requestJson(baseUrl, "/api/two-factor/setup", {
    body: { token: verified.payload.twoFactorSetupToken }
  });
  assert.equal(setup.response.status, 200);
  const firstTotp = generateTotpCode(setup.payload.secret, currentTime);

  const enabled = await requestJson(baseUrl, "/api/two-factor/confirm", {
    body: {
      token: verified.payload.twoFactorSetupToken,
      code: firstTotp
    }
  });
  assert.equal(enabled.response.status, 200);
  assert.equal(enabled.payload.provider.status, "INVITED");
  assert.equal(enabled.payload.recoveryCodes.length, 10);

  currentTime = new Date("2026-08-02T13:01:00.000Z");
  const pending = await requestJson(baseUrl, "/api/provider-auth/password", {
    body: { email, password }
  });
  assert.equal(pending.response.status, 403);
  assert.equal(pending.payload.error, "PROVIDER_PENDING_APPROVAL");

  await providersService.setStatus(adminContext, provider.provider.id, "ACTIVE");

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const rejected = await requestJson(baseUrl, "/api/provider-auth/password", {
      body: { email, password: "contraseña-incorrecta" }
    });
    assert.equal(rejected.response.status, 401);
    assert.equal(rejected.payload.error, "INVALID_CREDENTIALS");
  }

  const throttled = await requestJson(baseUrl, "/api/provider-auth/password", {
    body: { email, password }
  });
  assert.equal(throttled.response.status, 429);
  assert.equal(throttled.payload.error, "LOGIN_THROTTLED");
  assert.ok(throttled.payload.details.retryAfterSeconds > 0);

  currentTime = new Date("2026-08-02T13:17:00.000Z");
  const passwordAccepted = await requestJson(baseUrl, "/api/provider-auth/password", {
    body: { email, password }
  });
  assert.equal(passwordAccepted.response.status, 200);
  assert.equal(passwordAccepted.payload.provider.displayName, `Taller acceso ${suffix}`);
  assert.deepEqual(passwordAccepted.payload.methods, ["TOTP", "RECOVERY_CODE"]);
  assert.equal(passwordAccepted.payload.attemptsRemaining, 5);

  const wrongFactor = await requestJson(baseUrl, "/api/provider-auth/second-factor", {
    body: {
      challengeToken: passwordAccepted.payload.challengeToken,
      code: "000000"
    }
  });
  assert.equal(wrongFactor.response.status, 422);
  assert.equal(wrongFactor.payload.error, "INVALID_SECOND_FACTOR");
  assert.equal(wrongFactor.payload.details.attemptsRemaining, 4);

  const loginTotp = generateTotpCode(setup.payload.secret, currentTime);
  const completed = await requestJson(baseUrl, "/api/provider-auth/second-factor", {
    body: {
      challengeToken: passwordAccepted.payload.challengeToken,
      code: loginTotp
    }
  });
  assert.equal(completed.response.status, 200);
  assert.ok(completed.payload.sessionToken.length >= 32);
  assert.equal(completed.payload.provider.status, "ACTIVE");
  assert.equal(completed.payload.membership.status, "ACTIVE");

  const me = await requestJson(baseUrl, "/api/provider/me", {
    method: "GET",
    bearer: completed.payload.sessionToken
  });
  assert.equal(me.response.status, 200);
  assert.equal(me.payload.context.providerId, provider.provider.id);
  assert.equal(me.payload.context.role, "PROVIDER_OWNER");
  assert.equal(me.payload.provider.displayName, `Taller acceso ${suffix}`);

  const reusedChallenge = await requestJson(baseUrl, "/api/provider-auth/second-factor", {
    body: {
      challengeToken: passwordAccepted.payload.challengeToken,
      code: loginTotp
    }
  });
  assert.equal(reusedChallenge.response.status, 410);

  const logout = await requestJson(baseUrl, "/api/provider-auth/logout", {
    bearer: completed.payload.sessionToken
  });
  assert.equal(logout.response.status, 200);

  const afterLogout = await requestJson(baseUrl, "/api/provider/me", {
    method: "GET",
    bearer: completed.payload.sessionToken
  });
  assert.equal(afterLogout.response.status, 401);

  const recoveryStart = await requestJson(baseUrl, "/api/provider-auth/password", {
    body: { email, password }
  });
  assert.equal(recoveryStart.response.status, 200);

  const recoveryLogin = await requestJson(baseUrl, "/api/provider-auth/second-factor", {
    body: {
      challengeToken: recoveryStart.payload.challengeToken,
      code: enabled.payload.recoveryCodes[0]
    }
  });
  assert.equal(recoveryLogin.response.status, 200);
  assert.ok(recoveryLogin.payload.sessionToken);

  const stored = await database.withContext(adminContext, async (transaction) => {
    const sessions = await transaction.query(
      `SELECT token_hash, revoked_at, expires_at
       FROM sessions
       WHERE provider_id = $1
       ORDER BY created_at`,
      [provider.provider.id]
    );
    const recovery = await transaction.query(
      `SELECT COUNT(*) FILTER (WHERE used_at IS NOT NULL)::int AS used,
              COUNT(*)::int AS total
       FROM user_recovery_codes urc
       INNER JOIN provider_members pm ON pm.user_id = urc.user_id
       WHERE pm.provider_id = $1`,
      [provider.provider.id]
    );
    const throttle = await transaction.query(
      "SELECT COUNT(*)::int AS total FROM login_throttles"
    );
    const audits = await transaction.query(
      `SELECT action, metadata::text AS metadata
       FROM audit_events
       WHERE provider_id = $1
         AND action LIKE 'PROVIDER_LOGIN%'`,
      [provider.provider.id]
    );
    return {
      sessions: sessions.rows,
      recovery: recovery.rows[0],
      throttle: throttle.rows[0],
      audits: audits.rows
    };
  });

  assert.equal(stored.sessions.length, 2);
  assert.ok(stored.sessions.every((item) => item.token_hash.length === 64));
  assert.equal(JSON.stringify(stored.sessions).includes(completed.payload.sessionToken), false);
  assert.equal(stored.recovery.used, 1);
  assert.equal(stored.recovery.total, 10);
  assert.equal(stored.throttle.total, 0);
  assert.ok(stored.audits.some((item) => item.action === "PROVIDER_LOGIN_SUCCEEDED"));
  assert.equal(JSON.stringify(stored.audits).includes(password), false);
  assert.equal(JSON.stringify(stored.audits).includes(enabled.payload.recoveryCodes[0]), false);
});

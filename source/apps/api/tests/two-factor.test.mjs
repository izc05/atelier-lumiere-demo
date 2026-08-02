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
import { createProviderOnboardingService } from "../src/provider-onboarding-service.mjs";
import { createProvidersService } from "../src/providers-service.mjs";
import { createTwoFactorService, generateTotpCode } from "../src/two-factor-service.mjs";

const connectionString = process.env.DATABASE_URL;

async function postJson(baseUrl, path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const payload = await response.json();
  return { response, payload };
}

test("2FA activa la cuenta sin publicar automáticamente el taller", {
  skip: !connectionString
}, async (t) => {
  const authOptions = {
    environment: "test",
    allowDevelopmentAdminAuth: true,
    developmentAdminToken: "two-factor-admin-token-atelier-0000000000000001",
    developmentAdminUserId: "00000000-0000-4000-8000-000000000001"
  };
  const fixedTime = new Date("2026-08-02T13:00:00.000Z");
  const now = () => new Date(fixedTime);
  const encryptionKey = Buffer.alloc(32, 73);
  const recoveryPepper = "recovery-pepper-test-atelier-lumiere-000000000001";

  const database = createDatabase({
    connectionString,
    maxConnections: 4,
    statementTimeoutMs: 5000,
    logger: { error() {} }
  });
  const adminContext = createDevelopmentAdminContext(authOptions);
  await ensureDevelopmentAdmin(database, adminContext, {
    email: "admin-2fa@atelier.example",
    displayName: "Administración 2FA"
  });

  const providersService = createProvidersService({ database, now });
  const onboardingService = createProviderOnboardingService({
    database,
    systemContext: adminContext,
    emailVerificationTtlHours: 24,
    now
  });
  const emailVerificationService = createEmailVerificationService({
    database,
    systemContext: adminContext,
    twoFactorSetupTtlMinutes: 15,
    now
  });
  const twoFactorService = createTwoFactorService({
    database,
    systemContext: adminContext,
    encryptionKey,
    recoveryPepper,
    now
  });
  const handler = createApiHandler({
    environment: "test",
    database,
    providersService,
    onboardingService,
    emailVerificationService,
    twoFactorService,
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
  const email = `totp-${suffix}@atelier.example`;

  const provider = await providersService.create(adminContext, {
    slug: `totp-${suffix}`,
    displayName: `Taller TOTP ${suffix}`,
    contactName: "Responsable TOTP",
    contactEmail: email,
    specialty: "Cerámica"
  });

  const accepted = await postJson(baseUrl, "/api/provider-invitations/accept", {
    token: provider.token,
    displayName: "Artesana TOTP",
    password: "Clave-segura-TOTP-2026!"
  });
  assert.equal(accepted.response.status, 201);

  const emailVerified = await postJson(baseUrl, "/api/email-verifications/verify", {
    token: accepted.payload.verificationToken
  });
  assert.equal(emailVerified.response.status, 200);
  assert.equal(emailVerified.payload.user.emailVerified, true);
  assert.equal(emailVerified.payload.accessGranted, false);
  assert.ok(emailVerified.payload.twoFactorSetupToken.length >= 32);

  const setupToken = emailVerified.payload.twoFactorSetupToken;
  const setup = await postJson(baseUrl, "/api/two-factor/setup", {
    token: setupToken
  });
  assert.equal(setup.response.status, 200);
  assert.equal(setup.payload.algorithm, "SHA1");
  assert.equal(setup.payload.digits, 6);
  assert.equal(setup.payload.period, 30);
  assert.ok(setup.payload.secret.length >= 32);
  assert.match(setup.payload.otpauthUri, /^otpauth:\/\/totp\//);
  assert.equal(setup.payload.otpauthUri.includes(setup.payload.secret), true);
  assert.equal(setup.payload.accessGranted, false);

  const storedBeforeConfirm = await database.withContext(adminContext, async (transaction) => {
    const result = await transaction.query(
      `SELECT secret_ciphertext, secret_iv, secret_auth_tag, status
       FROM user_totp_credentials utc
       INNER JOIN users u ON u.id = utc.user_id
       WHERE u.email = $1`,
      [email]
    );
    return result.rows[0];
  });
  assert.equal(storedBeforeConfirm.status, "PENDING");
  assert.notEqual(storedBeforeConfirm.secret_ciphertext, setup.payload.secret);
  assert.equal(JSON.stringify(storedBeforeConfirm).includes(setup.payload.secret), false);
  assert.ok(storedBeforeConfirm.secret_iv.length >= 16);
  assert.ok(storedBeforeConfirm.secret_auth_tag.length >= 16);

  const incorrect = await postJson(baseUrl, "/api/two-factor/confirm", {
    token: setupToken,
    code: "000000"
  });
  assert.equal(incorrect.response.status, 422);
  assert.equal(incorrect.payload.error, "INVALID_TWO_FACTOR_CODE");

  const code = generateTotpCode(setup.payload.secret, fixedTime);
  const confirmed = await postJson(baseUrl, "/api/two-factor/confirm", {
    token: setupToken,
    code
  });
  assert.equal(confirmed.response.status, 200);
  assert.equal(confirmed.payload.user.status, "ACTIVE");
  assert.equal(confirmed.payload.user.emailVerified, true);
  assert.equal(confirmed.payload.user.twoFactorEnabled, true);
  assert.equal(confirmed.payload.membership.status, "ACTIVE");
  assert.equal(confirmed.payload.provider.status, "INVITED");
  assert.equal(confirmed.payload.provider.publicationEnabled, false);
  assert.equal(confirmed.payload.accessGranted, true);
  assert.deepEqual(confirmed.payload.nextSteps, ["ADMIN_PROVIDER_ACTIVATION"]);
  assert.equal(confirmed.payload.recoveryCodes.length, 10);
  assert.equal(new Set(confirmed.payload.recoveryCodes).size, 10);
  assert.ok(confirmed.payload.recoveryCodes.every((item) => /^[A-Z2-7]{4}(?:-[A-Z2-7]{4}){3}$/.test(item)));

  const reused = await postJson(baseUrl, "/api/two-factor/setup", {
    token: setupToken
  });
  assert.equal(reused.response.status, 410);
  assert.equal(reused.payload.error, "TWO_FACTOR_SETUP_UNAVAILABLE");

  const storedAfterConfirm = await database.withContext(adminContext, async (transaction) => {
    const account = await transaction.query(
      `SELECT
         u.status AS user_status, u.two_factor_enabled, u.email_verified_at,
         pm.status AS membership_status, p.status AS provider_status,
         utc.status AS totp_status, utc.activated_at, utc.last_used_step,
         oc.status AS continuation_status, oc.used_at
       FROM users u
       INNER JOIN provider_members pm ON pm.user_id = u.id
       INNER JOIN providers p ON p.id = pm.provider_id
       INNER JOIN user_totp_credentials utc ON utc.user_id = u.id
       INNER JOIN onboarding_continuations oc ON oc.user_id = u.id
       WHERE u.email = $1`,
      [email]
    );
    const recovery = await transaction.query(
      `SELECT code_hash, used_at
       FROM user_recovery_codes urc
       INNER JOIN users u ON u.id = urc.user_id
       WHERE u.email = $1`,
      [email]
    );
    const audit = await transaction.query(
      `SELECT action, metadata::text AS metadata
       FROM audit_events
       WHERE provider_id = $1
         AND action IN ('PROVIDER_2FA_SETUP_ISSUED', 'PROVIDER_2FA_SETUP_STARTED', 'PROVIDER_2FA_ENABLED')`,
      [provider.provider.id]
    );
    return {
      account: account.rows[0],
      recovery: recovery.rows,
      audit: audit.rows
    };
  });

  assert.equal(storedAfterConfirm.account.user_status, "ACTIVE");
  assert.equal(storedAfterConfirm.account.two_factor_enabled, true);
  assert.ok(storedAfterConfirm.account.email_verified_at);
  assert.equal(storedAfterConfirm.account.membership_status, "ACTIVE");
  assert.equal(storedAfterConfirm.account.provider_status, "INVITED");
  assert.equal(storedAfterConfirm.account.totp_status, "ACTIVE");
  assert.ok(storedAfterConfirm.account.activated_at);
  assert.ok(storedAfterConfirm.account.last_used_step);
  assert.equal(storedAfterConfirm.account.continuation_status, "USED");
  assert.ok(storedAfterConfirm.account.used_at);
  assert.equal(storedAfterConfirm.recovery.length, 10);
  assert.ok(storedAfterConfirm.recovery.every((item) => item.code_hash.length === 64 && item.used_at === null));
  for (const rawRecoveryCode of confirmed.payload.recoveryCodes) {
    assert.equal(JSON.stringify(storedAfterConfirm.recovery).includes(rawRecoveryCode), false);
    assert.equal(JSON.stringify(storedAfterConfirm.audit).includes(rawRecoveryCode), false);
  }
  const actions = new Set(storedAfterConfirm.audit.map((item) => item.action));
  assert.ok(actions.has("PROVIDER_2FA_SETUP_ISSUED"));
  assert.ok(actions.has("PROVIDER_2FA_SETUP_STARTED"));
  assert.ok(actions.has("PROVIDER_2FA_ENABLED"));
});

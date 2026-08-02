import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { createApiHandler } from "../src/app.mjs";
import { createAccountRecoveryApiHandler } from "../src/account-recovery-api.mjs";
import { createAccountRecoveryService } from "../src/account-recovery-service.mjs";
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

async function requestJson(baseUrl, path, { method = "POST", body, bearer } = {}) {
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

const disabledMail = Object.freeze({
  enabled: false,
  async sendPasswordReset() { return { status: "DISABLED" }; },
  async sendTwoFactorReset() { return { status: "DISABLED" }; }
});

test("la recuperación cambia contraseña y sustituye 2FA revocando sesiones", {
  skip: !connectionString
}, async (t) => {
  const authOptions = {
    environment: "test",
    allowDevelopmentAdminAuth: true,
    developmentAdminToken: "account-recovery-admin-token-atelier-000000001",
    developmentAdminUserId: "00000000-0000-4000-8000-000000000001"
  };
  let currentTime = new Date("2026-08-02T14:00:00.000Z");
  const now = () => new Date(currentTime);
  const encryptionKey = Buffer.alloc(32, 73);
  const recoveryPepper = "account-recovery-codes-pepper-atelier-000000000001";
  const loginPepper = "account-recovery-login-pepper-atelier-000000000001";

  const database = createDatabase({
    connectionString,
    maxConnections: 5,
    statementTimeoutMs: 5000,
    logger: { error() {} }
  });
  const adminContext = createDevelopmentAdminContext(authOptions);
  await ensureDevelopmentAdmin(database, adminContext, {
    email: "admin-account-recovery@atelier.example",
    displayName: "Administración recuperación"
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
  const accountRecoveryService = createAccountRecoveryService({
    database,
    systemContext: adminContext,
    mailService: disabledMail,
    environment: "test",
    loginPepper,
    passwordResetTtlMinutes: 30,
    twoFactorResetTtlMinutes: 30,
    requestCooldownSeconds: 300,
    now,
    logger: { error() {} }
  });

  const baseHandler = createApiHandler({
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
  const server = createServer(createAccountRecoveryApiHandler({
    baseHandler,
    accountRecoveryService,
    logger: { error() {} }
  }));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await database.close();
  });

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const suffix = randomUUID().slice(0, 8);
  const email = `recovery-${suffix}@atelier.example`;
  const originalPassword = "Clave-inicial-recuperacion-2026!";
  const newPassword = "Clave-nueva-recuperacion-2026!";

  const provider = await providersService.create(adminContext, {
    slug: `recovery-${suffix}`,
    displayName: `Taller recuperación ${suffix}`,
    contactName: "Responsable recuperación",
    contactEmail: email,
    specialty: "Cerámica"
  });
  const accepted = await onboardingService.accept({
    token: provider.token,
    displayName: "Artesana recuperación",
    password: originalPassword
  });
  const verified = await emailVerificationService.verify(accepted.verificationToken);
  const setup = await twoFactorService.begin(verified.twoFactorSetupToken);
  const firstCode = generateTotpCode(setup.secret, currentTime);
  const enabled = await twoFactorService.confirm(verified.twoFactorSetupToken, firstCode);
  assert.equal(enabled.recoveryCodes.length, 10);
  await providersService.setStatus(adminContext, provider.provider.id, "ACTIVE");

  currentTime = new Date("2026-08-02T14:01:00.000Z");
  const loginStart = await requestJson(baseUrl, "/api/provider-auth/password", {
    body: { email, password: originalPassword }
  });
  const loginCode = generateTotpCode(setup.secret, currentTime);
  const login = await requestJson(baseUrl, "/api/provider-auth/second-factor", {
    body: { challengeToken: loginStart.payload.challengeToken, code: loginCode }
  });
  assert.equal(login.response.status, 200);
  const oldSession = login.payload.sessionToken;

  const unknown = await requestJson(baseUrl, "/api/provider-recovery/password/request", {
    body: { email: `unknown-${suffix}@atelier.example` }
  });
  assert.equal(unknown.response.status, 202);
  assert.deepEqual(unknown.payload, { accepted: true, delivery: "manual-development" });

  const requested = await requestJson(baseUrl, "/api/provider-recovery/password/request", {
    body: { email }
  });
  assert.equal(requested.response.status, 202);
  assert.ok(requested.payload.recoveryToken.length >= 32);
  assert.match(requested.payload.recoveryPath, /recuperar-clave/);

  const duplicate = await requestJson(baseUrl, "/api/provider-recovery/password/request", {
    body: { email }
  });
  assert.equal(duplicate.response.status, 202);
  assert.equal("recoveryToken" in duplicate.payload, false);

  const weak = await requestJson(baseUrl, "/api/provider-recovery/password/confirm", {
    body: { token: requested.payload.recoveryToken, password: "123456789012" }
  });
  assert.equal(weak.response.status, 422);

  const changed = await requestJson(baseUrl, "/api/provider-recovery/password/confirm", {
    body: { token: requested.payload.recoveryToken, password: newPassword }
  });
  assert.equal(changed.response.status, 200);
  assert.equal(changed.payload.nextStep, "LOGIN");

  const reusedPasswordLink = await requestJson(baseUrl, "/api/provider-recovery/password/confirm", {
    body: { token: requested.payload.recoveryToken, password: newPassword }
  });
  assert.equal(reusedPasswordLink.response.status, 410);

  const oldSessionAfterReset = await requestJson(baseUrl, "/api/provider/me", {
    method: "GET",
    bearer: oldSession
  });
  assert.equal(oldSessionAfterReset.response.status, 401);

  const oldPassword = await requestJson(baseUrl, "/api/provider-auth/password", {
    body: { email, password: originalPassword }
  });
  assert.equal(oldPassword.response.status, 401);
  const newPasswordAccepted = await requestJson(baseUrl, "/api/provider-auth/password", {
    body: { email, password: newPassword }
  });
  assert.equal(newPasswordAccepted.response.status, 200);

  const wrongTwoFactorRequest = await requestJson(baseUrl, "/api/provider-recovery/two-factor/request", {
    body: { email, password: originalPassword }
  });
  assert.equal(wrongTwoFactorRequest.response.status, 202);
  assert.equal("recoveryToken" in wrongTwoFactorRequest.payload, false);

  const twoFactorRequest = await requestJson(baseUrl, "/api/provider-recovery/two-factor/request", {
    body: { email, password: newPassword }
  });
  assert.equal(twoFactorRequest.response.status, 202);
  assert.ok(twoFactorRequest.payload.recoveryToken);

  const resetTwoFactor = await requestJson(baseUrl, "/api/provider-recovery/two-factor/confirm", {
    body: { token: twoFactorRequest.payload.recoveryToken }
  });
  assert.equal(resetTwoFactor.response.status, 200);
  assert.equal(resetTwoFactor.payload.nextStep, "SETUP_2FA");
  assert.ok(resetTwoFactor.payload.twoFactorSetupToken.length >= 32);

  const blockedUntilSetup = await requestJson(baseUrl, "/api/provider-auth/password", {
    body: { email, password: newPassword }
  });
  assert.equal(blockedUntilSetup.response.status, 403);
  assert.equal(blockedUntilSetup.payload.error, "ACCOUNT_NOT_READY");

  currentTime = new Date("2026-08-02T14:03:00.000Z");
  const newSetup = await twoFactorService.begin(resetTwoFactor.payload.twoFactorSetupToken);
  assert.notEqual(newSetup.secret, setup.secret);
  const newCode = generateTotpCode(newSetup.secret, currentTime);
  const reenabled = await twoFactorService.confirm(
    resetTwoFactor.payload.twoFactorSetupToken,
    newCode
  );
  assert.equal(reenabled.user.twoFactorEnabled, true);
  assert.equal(reenabled.recoveryCodes.length, 10);

  const stored = await database.withContext(adminContext, async (transaction) => {
    const tokens = await transaction.query(
      `SELECT purpose, status, used_at
       FROM account_recovery_tokens
       WHERE provider_id = $1
       ORDER BY created_at`,
      [provider.provider.id]
    );
    const sessions = await transaction.query(
      `SELECT revoked_at FROM sessions WHERE provider_id = $1`,
      [provider.provider.id]
    );
    const totp = await transaction.query(
      `SELECT status FROM user_totp_credentials WHERE provider_id = $1`,
      [provider.provider.id]
    );
    const codes = await transaction.query(
      `SELECT COUNT(*)::int AS total
       FROM user_recovery_codes urc
       INNER JOIN provider_members pm ON pm.user_id = urc.user_id
       WHERE pm.provider_id = $1`,
      [provider.provider.id]
    );
    const audits = await transaction.query(
      `SELECT action, metadata::text AS metadata
       FROM audit_events
       WHERE provider_id = $1
         AND action IN (
           'PROVIDER_PASSWORD_RESET_COMPLETED',
           'PROVIDER_2FA_RESET_COMPLETED'
         )`,
      [provider.provider.id]
    );
    return {
      tokens: tokens.rows,
      sessions: sessions.rows,
      totp: totp.rows,
      codes: codes.rows[0],
      audits: audits.rows
    };
  });

  assert.deepEqual(stored.tokens.map((item) => item.purpose), ["PASSWORD_RESET", "RESET_2FA"]);
  assert.ok(stored.tokens.every((item) => item.status === "USED" && item.used_at));
  assert.ok(stored.sessions.length >= 1);
  assert.ok(stored.sessions.every((item) => item.revoked_at));
  assert.deepEqual(stored.totp, [{ status: "ACTIVE" }]);
  assert.equal(stored.codes.total, 10);
  assert.equal(stored.audits.length, 2);
  assert.equal(JSON.stringify(stored.audits).includes(newPassword), false);
  assert.equal(JSON.stringify(stored.audits).includes(twoFactorRequest.payload.recoveryToken), false);
});

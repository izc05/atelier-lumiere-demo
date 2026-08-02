import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { createHash, randomUUID } from "node:crypto";
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

const connectionString = process.env.DATABASE_URL;

async function jsonRequest(baseUrl, path, body) {
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

test("el correo se verifica con enlaces revocables y de un solo uso", {
  skip: !connectionString
}, async (t) => {
  const developmentAdminToken = "email-test-admin-token-atelier-0000000000000001";
  const developmentAdminUserId = "00000000-0000-4000-8000-000000000001";
  const authOptions = {
    environment: "test",
    allowDevelopmentAdminAuth: true,
    developmentAdminToken,
    developmentAdminUserId
  };
  let currentTime = new Date("2026-08-02T12:00:00.000Z");
  const now = () => new Date(currentTime);

  const database = createDatabase({
    connectionString,
    maxConnections: 4,
    statementTimeoutMs: 5000,
    logger: { error() {} }
  });
  const adminContext = createDevelopmentAdminContext(authOptions);
  await ensureDevelopmentAdmin(database, adminContext, {
    email: "admin-email@atelier.example",
    displayName: "Administración de correo"
  });

  const providersService = createProvidersService({
    database,
    invitationTtlHours: 48,
    now
  });
  const onboardingService = createProviderOnboardingService({
    database,
    systemContext: adminContext,
    emailVerificationTtlHours: 24,
    now
  });
  const emailVerificationService = createEmailVerificationService({
    database,
    systemContext: adminContext,
    tokenTtlHours: 24,
    resendCooldownSeconds: 60,
    now
  });
  const handler = createApiHandler({
    environment: "test",
    database,
    providersService,
    onboardingService,
    emailVerificationService,
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
  const email = `verificacion-${suffix}@atelier.example`;

  const providerCreation = await providersService.create(adminContext, {
    slug: `correo-${suffix}`,
    displayName: `Taller correo ${suffix}`,
    contactName: "Responsable correo",
    contactEmail: email,
    specialty: "Bordado artesanal"
  });

  const accepted = await jsonRequest(baseUrl, "/api/provider-invitations/accept", {
    token: providerCreation.token,
    displayName: "Artesana verificada",
    password: "Clave-segura-correo-2026!"
  });
  assert.equal(accepted.response.status, 201);
  assert.equal(accepted.payload.emailDelivery, "manual-development");
  assert.equal(accepted.payload.emailVerification.status, "PENDING");
  assert.ok(accepted.payload.verificationToken.length >= 32);
  assert.match(accepted.payload.verificationPath, /^\/proveedor\/verificar-correo\?token=/);
  assert.equal(accepted.payload.accessGranted, false);

  const firstToken = accepted.payload.verificationToken;
  const firstHash = createHash("sha256").update(firstToken).digest("hex");

  const initialStorage = await database.withContext(adminContext, async (transaction) => {
    const result = await transaction.query(
      `SELECT evt.status, evt.token_hash, evt.expires_at, u.email_verified_at
       FROM email_verification_tokens evt
       INNER JOIN users u ON u.id = evt.user_id
       WHERE u.email = $1`,
      [email]
    );
    return result.rows[0];
  });
  assert.equal(initialStorage.status, "PENDING");
  assert.equal(initialStorage.token_hash, firstHash);
  assert.notEqual(initialStorage.token_hash, firstToken);
  assert.equal(initialStorage.email_verified_at, null);

  const tooSoon = await jsonRequest(baseUrl, "/api/email-verifications/resend", {
    token: firstToken
  });
  assert.equal(tooSoon.response.status, 429);
  assert.equal(tooSoon.payload.error, "EMAIL_VERIFICATION_RESEND_TOO_SOON");
  assert.ok(tooSoon.payload.details.retryAfterSeconds > 0);

  currentTime = new Date("2026-08-02T12:01:01.000Z");
  const resent = await jsonRequest(baseUrl, "/api/email-verifications/resend", {
    token: firstToken
  });
  assert.equal(resent.response.status, 201);
  assert.equal(resent.payload.emailDelivery, "manual-development");
  assert.equal(resent.payload.verification.status, "PENDING");
  assert.notEqual(resent.payload.verificationToken, firstToken);
  const secondToken = resent.payload.verificationToken;

  const oldLink = await jsonRequest(baseUrl, "/api/email-verifications/verify", {
    token: firstToken
  });
  assert.equal(oldLink.response.status, 410);
  assert.equal(oldLink.payload.error, "EMAIL_VERIFICATION_UNAVAILABLE");

  const verified = await jsonRequest(baseUrl, "/api/email-verifications/verify", {
    token: secondToken
  });
  assert.equal(verified.response.status, 200);
  assert.equal(verified.payload.user.emailVerified, true);
  assert.equal(verified.payload.user.twoFactorEnabled, false);
  assert.equal(verified.payload.user.status, "PENDING");
  assert.equal(verified.payload.membership.status, "INVITED");
  assert.deepEqual(verified.payload.nextSteps, ["ENABLE_2FA"]);
  assert.equal(verified.payload.accessGranted, false);

  const reused = await jsonRequest(baseUrl, "/api/email-verifications/verify", {
    token: secondToken
  });
  assert.equal(reused.response.status, 410);
  assert.equal(reused.payload.error, "EMAIL_VERIFICATION_UNAVAILABLE");

  const resendAfterVerification = await jsonRequest(
    baseUrl,
    "/api/email-verifications/resend",
    { token: secondToken }
  );
  assert.equal(resendAfterVerification.response.status, 410);

  const finalStorage = await database.withContext(adminContext, async (transaction) => {
    const tokenResult = await transaction.query(
      `SELECT evt.status, evt.verified_at, evt.revoked_at
       FROM email_verification_tokens evt
       INNER JOIN users u ON u.id = evt.user_id
       WHERE u.email = $1
       ORDER BY evt.created_at ASC`,
      [email]
    );
    const accountResult = await transaction.query(
      `SELECT u.status, u.email_verified_at, u.two_factor_enabled, pm.status AS membership_status
       FROM users u
       INNER JOIN provider_members pm ON pm.user_id = u.id
       WHERE u.email = $1`,
      [email]
    );
    const auditResult = await transaction.query(
      `SELECT action
       FROM audit_events
       WHERE provider_id = $1
         AND action IN (
           'PROVIDER_EMAIL_VERIFICATION_ISSUED',
           'PROVIDER_EMAIL_VERIFICATION_REISSUED',
           'PROVIDER_EMAIL_VERIFIED'
         )`,
      [providerCreation.provider.id]
    );
    return {
      tokens: tokenResult.rows,
      account: accountResult.rows[0],
      actions: new Set(auditResult.rows.map((row) => row.action))
    };
  });

  assert.equal(finalStorage.tokens.length, 2);
  assert.equal(finalStorage.tokens[0].status, "REVOKED");
  assert.ok(finalStorage.tokens[0].revoked_at);
  assert.equal(finalStorage.tokens[1].status, "VERIFIED");
  assert.ok(finalStorage.tokens[1].verified_at);
  assert.equal(finalStorage.account.status, "PENDING");
  assert.ok(finalStorage.account.email_verified_at);
  assert.equal(finalStorage.account.two_factor_enabled, false);
  assert.equal(finalStorage.account.membership_status, "INVITED");
  assert.ok(finalStorage.actions.has("PROVIDER_EMAIL_VERIFICATION_ISSUED"));
  assert.ok(finalStorage.actions.has("PROVIDER_EMAIL_VERIFICATION_REISSUED"));
  assert.ok(finalStorage.actions.has("PROVIDER_EMAIL_VERIFIED"));
});

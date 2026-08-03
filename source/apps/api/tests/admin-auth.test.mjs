import test from "node:test";
import assert from "node:assert/strict";
import {
  createCipheriv,
  createHmac,
  randomBytes,
  scrypt
} from "node:crypto";
import { promisify } from "node:util";
import { createServer } from "node:http";
import { once } from "node:events";
import { createAdminAuthApiHandler } from "../src/admin-auth-api.mjs";
import { createAdminAuthService } from "../src/admin-auth-service.mjs";
import { createRequestAuthenticator } from "../src/auth-context.mjs";
import { createDatabase } from "../src/database.mjs";

const scryptAsync = promisify(scrypt);
const connectionString = process.env.DATABASE_URL;
const ADMIN_CONTEXT = {
  role: "ADMIN",
  userId: "00000000-0000-4000-8000-000000000001",
  providerId: null
};
const AUTH_CONTEXT = {
  role: "AUTH_SERVICE",
  userId: "00000000-0000-4000-8000-000000000008",
  providerId: null
};
const TEST_USER_ID = "00000000-0000-4000-8000-000000000106";
const TEST_EMAIL = "admin-auth-api@example.test";
const TEST_PASSWORD = "Atelier-Admin-2026-Segura";
const TEST_SECRET = "JBSWY3DPEHPK3PXP";
const LOGIN_PEPPER = "admin-login-test-pepper-with-more-than-32-characters";
const RECOVERY_PEPPER = "admin-recovery-test-pepper-with-more-than-32-characters";
const ENCRYPTION_KEY = Buffer.from("0123456789abcdef0123456789abcdef", "utf8");
const ENCRYPTION_KEY_BASE64 = ENCRYPTION_KEY.toString("base64");
const FIXED_TIME = new Date("2026-08-03T10:30:00.000Z");
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function decodeBase32(value) {
  let bits = 0;
  let accumulator = 0;
  const bytes = [];
  for (const character of value.replace(/=+$/g, "").toUpperCase()) {
    accumulator = (accumulator << 5) | BASE32_ALPHABET.indexOf(character);
    bits += 5;
    if (bits >= 8) {
      bytes.push((accumulator >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function totpCode(secret, date) {
  const step = Math.floor(date.getTime() / 1000 / 30);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac("sha1", decodeBase32(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  const binary = (
    ((digest[offset] & 127) << 24)
    | (digest[offset + 1] << 16)
    | (digest[offset + 2] << 8)
    | digest[offset + 3]
  );
  return String(binary % 1_000_000).padStart(6, "0");
}

function encryptSecret(secret) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return {
    secretCiphertext: ciphertext.toString("base64url"),
    secretIv: iv.toString("base64url"),
    secretAuthTag: cipher.getAuthTag().toString("base64url")
  };
}

async function passwordCredential(password) {
  const salt = randomBytes(16).toString("base64url");
  const derived = await scryptAsync(password, salt, 64, {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024
  });
  return {
    hash: Buffer.from(derived).toString("base64url"),
    salt
  };
}

async function start(handler) {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}` };
}

async function readJson(response) {
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

test("el administrador inicia sesión con contraseña y TOTP", { skip: !connectionString }, async (t) => {
  const database = createDatabase({
    connectionString,
    maxConnections: 4,
    statementTimeoutMs: 5000,
    logger: { error() {} }
  });
  const credential = await passwordCredential(TEST_PASSWORD);
  const encrypted = encryptSecret(TEST_SECRET);

  await database.withContext(ADMIN_CONTEXT, async (transaction) => {
    await transaction.query("DELETE FROM audit_events WHERE actor_user_id=$1", [TEST_USER_ID]);
    await transaction.query("DELETE FROM admin_memberships WHERE user_id=$1", [TEST_USER_ID]);
    await transaction.query("DELETE FROM users WHERE id=$1", [TEST_USER_ID]);
    await transaction.query(
      `INSERT INTO users
        (id, email, display_name, status, email_verified_at, two_factor_enabled)
       VALUES ($1, $2, 'Propietaria de plataforma', 'ACTIVE', $3, true)`,
      [TEST_USER_ID, TEST_EMAIL, FIXED_TIME]
    );
    await transaction.query(
      `INSERT INTO user_credentials
        (user_id, password_hash, password_salt, password_algorithm)
       VALUES ($1, $2, $3, 'scrypt-v1')`,
      [TEST_USER_ID, credential.hash, credential.salt]
    );
    await transaction.query(
      `INSERT INTO admin_memberships (user_id, role, status, created_by)
       VALUES ($1, 'PLATFORM_OWNER', 'ACTIVE', $2)`,
      [TEST_USER_ID, ADMIN_CONTEXT.userId]
    );
    await transaction.query(
      `INSERT INTO admin_totp_credentials
        (user_id, secret_ciphertext, secret_iv, secret_auth_tag, status, activated_at)
       VALUES ($1, $2, $3, $4, 'ACTIVE', $5)`,
      [
        TEST_USER_ID,
        encrypted.secretCiphertext,
        encrypted.secretIv,
        encrypted.secretAuthTag,
        FIXED_TIME
      ]
    );
  });

  const service = createAdminAuthService({
    database,
    systemContext: AUTH_CONTEXT,
    loginPepper: LOGIN_PEPPER,
    recoveryPepper: RECOVERY_PEPPER,
    twoFactorEncryptionKey: ENCRYPTION_KEY_BASE64,
    now: () => new Date(FIXED_TIME)
  });
  const authenticator = createRequestAuthenticator({
    environment: "production",
    adminAuthService: service
  });
  const app = await start(createAdminAuthApiHandler({
    adminAuthService: service,
    logger: { error() {} },
    baseHandler(_request, response) {
      response.writeHead(404, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "NOT_FOUND" }));
    }
  }));

  t.after(async () => {
    await new Promise((resolve) => app.server.close(resolve));
    await database.withContext(ADMIN_CONTEXT, async (transaction) => {
      await transaction.query("DELETE FROM audit_events WHERE actor_user_id=$1", [TEST_USER_ID]);
      await transaction.query("DELETE FROM admin_memberships WHERE user_id=$1", [TEST_USER_ID]);
      await transaction.query("DELETE FROM users WHERE id=$1", [TEST_USER_ID]);
    });
    await database.close();
  });

  const rejected = await fetch(`${app.baseUrl}/api/admin-auth/password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: TEST_EMAIL, password: "incorrecta" })
  });
  assert.equal(rejected.status, 401);
  assert.equal((await readJson(rejected)).error, "INVALID_ADMIN_CREDENTIALS");

  const passwordResponse = await fetch(`${app.baseUrl}/api/admin-auth/password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD })
  });
  const passwordPayload = await readJson(passwordResponse);
  assert.equal(passwordResponse.status, 200);
  assert.equal(passwordPayload.account.role, "PLATFORM_OWNER");
  assert.ok(passwordPayload.challengeToken);

  const factorResponse = await fetch(`${app.baseUrl}/api/admin-auth/second-factor`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Atelier admin auth test"
    },
    body: JSON.stringify({
      challengeToken: passwordPayload.challengeToken,
      code: totpCode(TEST_SECRET, FIXED_TIME)
    })
  });
  const factorPayload = await readJson(factorResponse);
  assert.equal(factorResponse.status, 200);
  assert.equal(factorPayload.account.role, "PLATFORM_OWNER");
  assert.ok(factorPayload.sessionToken);

  const authenticated = await authenticator({
    headers: { authorization: `Bearer ${factorPayload.sessionToken}` }
  });
  assert.equal(authenticated.role, "ADMIN");
  assert.equal(authenticated.adminRole, "PLATFORM_OWNER");
  assert.equal(authenticated.providerId, null);

  const meResponse = await fetch(`${app.baseUrl}/api/admin-auth/me`, {
    headers: { Authorization: `Bearer ${factorPayload.sessionToken}` }
  });
  const mePayload = await readJson(meResponse);
  assert.equal(meResponse.status, 200);
  assert.equal(mePayload.account.email, TEST_EMAIL);

  await database.withContext(ADMIN_CONTEXT, async (transaction) => {
    const sessions = await transaction.query(
      `SELECT role, provider_id, token_hash, user_agent
       FROM sessions
       WHERE user_id=$1 AND revoked_at IS NULL`,
      [TEST_USER_ID]
    );
    assert.equal(sessions.rowCount, 1);
    assert.equal(sessions.rows[0].role, "PLATFORM_OWNER");
    assert.equal(sessions.rows[0].provider_id, null);
    assert.match(sessions.rows[0].token_hash, /^[a-f0-9]{64}$/);
    assert.equal(JSON.stringify(sessions.rows).includes(factorPayload.sessionToken), false);
    assert.equal(sessions.rows[0].user_agent, "Atelier admin auth test");
  });

  const logoutResponse = await fetch(`${app.baseUrl}/api/admin-auth/logout`, {
    method: "POST",
    headers: { Authorization: `Bearer ${factorPayload.sessionToken}` }
  });
  assert.equal(logoutResponse.status, 200);
  assert.equal(await service.authenticate(factorPayload.sessionToken), null);
});

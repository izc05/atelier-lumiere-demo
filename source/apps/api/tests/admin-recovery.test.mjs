import test from "node:test";
import assert from "node:assert/strict";
import {
  createCipheriv,
  createHmac,
  randomBytes,
  scrypt
} from "node:crypto";
import { promisify } from "node:util";
import { createAdminAuthService } from "../src/admin-auth-service.mjs";
import { createAdminRecoveryService } from "../src/admin-recovery-service.mjs";
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
const TEST_USER_ID = "00000000-0000-4000-8000-000000000107";
const TEST_EMAIL = "admin-recovery@example.test";
const OLD_PASSWORD = "Clave-antigua-segura-2026";
const NEW_PASSWORD = "Nueva-clave-robusta-2026-!Z";
const OLD_SECRET = "JBSWY3DPEHPK3PXP";
const LOGIN_PEPPER = "admin-recovery-login-pepper-with-more-than-32-characters";
const RECOVERY_PEPPER = "admin-recovery-code-pepper-with-more-than-32-characters";
const ENCRYPTION_KEY = Buffer.from("0123456789abcdef0123456789abcdef", "utf8");
const ENCRYPTION_KEY_BASE64 = ENCRYPTION_KEY.toString("base64");
const FIXED_TIME = new Date(Date.now() + 24 * 60 * 60 * 1000);
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
    ciphertext: ciphertext.toString("base64url"),
    iv: iv.toString("base64url"),
    authTag: cipher.getAuthTag().toString("base64url")
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

test("la recuperación administrativa sustituye contraseña y 2FA y revoca sesiones", { skip: !connectionString }, async (t) => {
  const database = createDatabase({
    connectionString,
    maxConnections: 4,
    statementTimeoutMs: 5000,
    logger: { error() {} }
  });
  const oldCredential = await passwordCredential(OLD_PASSWORD);
  const oldTotp = encryptSecret(OLD_SECRET);

  await database.withContext(ADMIN_CONTEXT, async (transaction) => {
    await transaction.query("DELETE FROM audit_events WHERE actor_user_id=$1", [TEST_USER_ID]);
    await transaction.query("DELETE FROM admin_memberships WHERE user_id=$1", [TEST_USER_ID]);
    await transaction.query("DELETE FROM users WHERE id=$1", [TEST_USER_ID]);
    await transaction.query(
      `INSERT INTO users
        (id, email, display_name, status, email_verified_at, two_factor_enabled)
       VALUES ($1, $2, 'Administradora Recuperación', 'ACTIVE', $3, true)`,
      [TEST_USER_ID, TEST_EMAIL, FIXED_TIME]
    );
    await transaction.query(
      `INSERT INTO user_credentials
        (user_id, password_hash, password_salt, password_algorithm)
       VALUES ($1, $2, $3, 'scrypt-v1')`,
      [TEST_USER_ID, oldCredential.hash, oldCredential.salt]
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
      [TEST_USER_ID, oldTotp.ciphertext, oldTotp.iv, oldTotp.authTag, FIXED_TIME]
    );
    await transaction.query(
      `INSERT INTO user_recovery_codes (user_id, code_hash)
       VALUES ($1, repeat('a', 64))`,
      [TEST_USER_ID]
    );
    await transaction.query(
      `INSERT INTO sessions
        (user_id, token_hash, provider_id, role, expires_at, last_seen_at)
       VALUES ($1, repeat('b', 64), NULL, 'PLATFORM_OWNER', $2, $3)`,
      [TEST_USER_ID, new Date(FIXED_TIME.getTime() + 3_600_000), FIXED_TIME]
    );
  });

  const service = createAdminRecoveryService({
    database,
    systemContext: AUTH_CONTEXT,
    mailService: { enabled: false },
    environment: "development",
    twoFactorEncryptionKey: ENCRYPTION_KEY_BASE64,
    recoveryPepper: RECOVERY_PEPPER,
    now: () => new Date(FIXED_TIME),
    logger: { error() {} }
  });

  t.after(async () => {
    await database.withContext(ADMIN_CONTEXT, async (transaction) => {
      await transaction.query("DELETE FROM audit_events WHERE actor_user_id=$1", [TEST_USER_ID]);
      await transaction.query("DELETE FROM admin_memberships WHERE user_id=$1", [TEST_USER_ID]);
      await transaction.query("DELETE FROM users WHERE id=$1", [TEST_USER_ID]);
    });
    await database.close();
  });

  const unknown = await service.request("no-existe-admin@example.test");
  assert.deepEqual(unknown, { accepted: true, delivery: "manual-development" });

  const issued = await service.request(TEST_EMAIL);
  assert.equal(issued.accepted, true);
  assert.equal(issued.delivery, "manual-development");
  assert.match(issued.recoveryToken, /^[A-Za-z0-9_-]{32,180}$/);
  assert.match(issued.recoveryPath, /^\/admin\/recuperar\/\?token=/);

  await database.withContext(ADMIN_CONTEXT, async (transaction) => {
    const stored = await transaction.query(
      `SELECT token_hash, secret_ciphertext, status
       FROM admin_account_recovery_tokens
       WHERE user_id=$1`,
      [TEST_USER_ID]
    );
    assert.equal(stored.rowCount, 1);
    assert.match(stored.rows[0].token_hash, /^[a-f0-9]{64}$/);
    assert.notEqual(stored.rows[0].token_hash, issued.recoveryToken);
    assert.notEqual(stored.rows[0].secret_ciphertext, OLD_SECRET);
    assert.equal(stored.rows[0].status, "PENDING");
  });

  const setup = await service.begin(issued.recoveryToken);
  assert.equal(setup.account.role, "PLATFORM_OWNER");
  assert.match(setup.manualKey, /^[A-Z2-7]{32}$/);
  assert.match(setup.qrDataUrl, /^data:image\/png;base64,/);

  await assert.rejects(
    () => service.confirm({
      token: issued.recoveryToken,
      password: NEW_PASSWORD,
      code: "000000"
    }),
    (error) => error?.code === "INVALID_ADMIN_RECOVERY_CODE"
  );

  const recovered = await service.confirm({
    token: issued.recoveryToken,
    password: NEW_PASSWORD,
    code: totpCode(setup.manualKey, FIXED_TIME)
  });
  assert.equal(recovered.recovered, true);
  assert.equal(recovered.account.email, TEST_EMAIL);
  assert.equal(recovered.recoveryCodes.length, 10);
  assert.equal(new Set(recovered.recoveryCodes).size, 10);
  for (const code of recovered.recoveryCodes) {
    assert.match(code, /^[A-Z2-7]{4}(?:-[A-Z2-7]{4}){3}$/);
  }

  await assert.rejects(
    () => service.begin(issued.recoveryToken),
    (error) => error?.code === "ADMIN_RECOVERY_UNAVAILABLE"
  );

  await database.withContext(ADMIN_CONTEXT, async (transaction) => {
    const state = await transaction.query(
      `SELECT
         c.password_hash, c.password_salt, c.password_algorithm,
         t.secret_ciphertext, t.status AS totp_status, t.last_used_step,
         r.status AS recovery_status,
         (SELECT count(*)::integer FROM user_recovery_codes WHERE user_id=$1 AND used_at IS NULL) AS codes,
         (SELECT count(*)::integer FROM sessions WHERE user_id=$1 AND revoked_at IS NULL) AS active_sessions
       FROM user_credentials c
       INNER JOIN admin_totp_credentials t ON t.user_id=c.user_id
       INNER JOIN admin_account_recovery_tokens r ON r.user_id=c.user_id
       WHERE c.user_id=$1`,
      [TEST_USER_ID]
    );
    const row = state.rows[0];
    assert.equal(row.password_algorithm, "scrypt-v1");
    assert.notEqual(row.password_hash, oldCredential.hash);
    assert.notEqual(row.password_salt, oldCredential.salt);
    assert.notEqual(row.secret_ciphertext, oldTotp.ciphertext);
    assert.equal(row.totp_status, "ACTIVE");
    assert.ok(row.last_used_step !== null);
    assert.equal(row.recovery_status, "USED");
    assert.equal(row.codes, 10);
    assert.equal(row.active_sessions, 0);

    const audits = await transaction.query(
      "SELECT action, metadata::text AS metadata FROM audit_events WHERE actor_user_id=$1",
      [TEST_USER_ID]
    );
    assert.equal(audits.rows.some((item) => item.action === "ADMIN_RECOVERY_COMPLETED"), true);
    const serialized = JSON.stringify(audits.rows);
    assert.equal(serialized.includes(NEW_PASSWORD), false);
    assert.equal(serialized.includes(setup.manualKey), false);
    assert.equal(recovered.recoveryCodes.some((code) => serialized.includes(code)), false);
  });

  const loginTime = new Date(FIXED_TIME.getTime() + 31_000);
  const authService = createAdminAuthService({
    database,
    systemContext: AUTH_CONTEXT,
    loginPepper: LOGIN_PEPPER,
    recoveryPepper: RECOVERY_PEPPER,
    twoFactorEncryptionKey: ENCRYPTION_KEY_BASE64,
    now: () => new Date(loginTime)
  });

  await assert.rejects(
    () => authService.start({ email: TEST_EMAIL, password: OLD_PASSWORD }),
    (error) => error?.code === "INVALID_ADMIN_CREDENTIALS"
  );
  const challenge = await authService.start({ email: TEST_EMAIL, password: NEW_PASSWORD });
  const login = await authService.complete({
    challengeToken: challenge.challengeToken,
    code: totpCode(setup.manualKey, loginTime)
  });
  assert.equal(login.account.role, "PLATFORM_OWNER");
  assert.match(login.sessionToken, /^[A-Za-z0-9_-]{32,180}$/);
});

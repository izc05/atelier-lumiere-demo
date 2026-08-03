import test from "node:test";
import assert from "node:assert/strict";
import {
  createCipheriv,
  createHmac,
  randomBytes,
  randomUUID,
  scrypt
} from "node:crypto";
import { promisify } from "node:util";
import { createAdminAccountsService } from "../src/admin-accounts-service.mjs";
import { createAdminSensitiveActionService } from "../src/admin-sensitive-action-service.mjs";
import { createDatabase } from "../src/database.mjs";
import { createSecuredAdminAccountsService } from "../src/secured-admin-accounts-service.mjs";

const scryptAsync = promisify(scrypt);
const connectionString = process.env.DATABASE_URL;
const AUTH_CONTEXT = Object.freeze({
  role: "AUTH_SERVICE",
  userId: "00000000-0000-4000-8000-000000000008",
  providerId: null
});
const LOGIN_PEPPER = "sensitive-action-login-pepper-with-more-than-32-characters";
const ENCRYPTION_KEY = Buffer.from("0123456789abcdef0123456789abcdef", "utf8");
const ENCRYPTION_KEY_BASE64 = ENCRYPTION_KEY.toString("base64");
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const PASSWORD = "Propietaria-segura-2026-!";
const SECRET = "JBSWY3DPEHPK3PXP";

function decodeBase32(value) {
  let bits = 0;
  let accumulator = 0;
  const bytes = [];
  for (const character of String(value).replace(/=+$/g, "").toUpperCase()) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index < 0) throw new Error("Secreto base32 inválido.");
    accumulator = (accumulator << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((accumulator >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function totp(secret, date) {
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

async function credential(password) {
  const salt = randomBytes(16).toString("base64url");
  const derived = await scryptAsync(password, salt, 64, {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024
  });
  return { hash: Buffer.from(derived).toString("base64url"), salt };
}

function encryptedSecret(secret) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64url"),
    iv: iv.toString("base64url"),
    authTag: cipher.getAuthTag().toString("base64url")
  };
}

function recoveryStub(calls) {
  return {
    async request(email, options) {
      calls.push({ email, options });
      return {
        accepted: true,
        delivery: "manual-development",
        recoveryPath: `/admin/recuperar/?token=${randomBytes(32).toString("base64url")}`
      };
    }
  };
}

test("las acciones críticas exigen contraseña y un TOTP no reutilizado", { skip: !connectionString }, async (t) => {
  const database = createDatabase({
    connectionString,
    maxConnections: 4,
    statementTimeoutMs: 5000,
    logger: { error() {} }
  });
  const ownerId = randomUUID();
  const targetId = randomUUID();
  const ownerEmail = `owner-${ownerId.slice(0, 8)}@example.test`;
  const targetEmail = `target-${targetId.slice(0, 8)}@example.test`;
  const OWNER = Object.freeze({
    role: "ADMIN",
    userId: ownerId,
    providerId: null,
    adminRole: "PLATFORM_OWNER"
  });
  const managerContext = Object.freeze({ ...OWNER, adminRole: "PROVIDER_MANAGER" });
  const ownerCredential = await credential(PASSWORD);
  const targetCredential = await credential("Destino-seguro-2026-!");
  const ownerTotp = encryptedSecret(SECRET);
  const targetTotp = encryptedSecret("KRSXG5DSNFXGOIDB");
  let currentTime = new Date(Date.now() + 120_000);
  const deliveryCalls = [];
  const recovery = recoveryStub(deliveryCalls);

  await database.withContext(OWNER, async (tx) => {
    await tx.query(
      `INSERT INTO users
        (id,email,display_name,status,email_verified_at,two_factor_enabled)
       VALUES
        ($1,$2,'Propietaria de prueba','ACTIVE',$5,true),
        ($3,$4,'Gestora de prueba','ACTIVE',$5,true)`,
      [ownerId, ownerEmail, targetId, targetEmail, currentTime]
    );
    await tx.query(
      `INSERT INTO user_credentials
        (user_id,password_hash,password_salt,password_algorithm)
       VALUES
        ($1,$2,$3,'scrypt-v1'),
        ($4,$5,$6,'scrypt-v1')`,
      [
        ownerId,
        ownerCredential.hash,
        ownerCredential.salt,
        targetId,
        targetCredential.hash,
        targetCredential.salt
      ]
    );
    await tx.query(
      `INSERT INTO admin_memberships (user_id,role,status,created_by)
       VALUES
        ($1,'PLATFORM_OWNER','ACTIVE',$1),
        ($2,'PROVIDER_MANAGER','ACTIVE',$1)`,
      [ownerId, targetId]
    );
    await tx.query(
      `INSERT INTO admin_totp_credentials
        (user_id,secret_ciphertext,secret_iv,secret_auth_tag,status,activated_at)
       VALUES
        ($1,$2,$3,$4,'ACTIVE',$9),
        ($5,$6,$7,$8,'ACTIVE',$9)`,
      [
        ownerId,
        ownerTotp.ciphertext,
        ownerTotp.iv,
        ownerTotp.authTag,
        targetId,
        targetTotp.ciphertext,
        targetTotp.iv,
        targetTotp.authTag,
        currentTime
      ]
    );
    await tx.query(
      `INSERT INTO sessions
        (user_id,token_hash,provider_id,role,user_agent,expires_at,last_seen_at)
       VALUES($1,$2,NULL,'PROVIDER_MANAGER','Sesión objetivo',$3,$4)`,
      [
        targetId,
        randomBytes(32).toString("hex"),
        new Date(currentTime.getTime() + 3_600_000),
        currentTime
      ]
    );
  });

  t.after(async () => {
    await database.withContext(OWNER, async (tx) => {
      await tx.query(
        "DELETE FROM audit_events WHERE actor_user_id IN ($1,$2) OR entity_id IN ($1,$2)",
        [ownerId, targetId]
      );
      await tx.query("DELETE FROM admin_memberships WHERE user_id IN ($1,$2)", [ownerId, targetId]);
      await tx.query("DELETE FROM users WHERE id IN ($1,$2)", [ownerId, targetId]);
    });
    await database.close();
  });

  const sensitive = createAdminSensitiveActionService({
    database,
    systemContext: AUTH_CONTEXT,
    loginPepper: LOGIN_PEPPER,
    twoFactorEncryptionKey: ENCRYPTION_KEY_BASE64,
    now: () => new Date(currentTime)
  });
  const base = createAdminAccountsService({
    database,
    adminRecoveryService: recovery,
    logger: { error() {} }
  });
  const secured = createSecuredAdminAccountsService({
    baseService: base,
    database,
    sensitiveActionService: sensitive,
    adminRecoveryService: recovery,
    now: () => new Date(currentTime)
  });

  await assert.rejects(
    sensitive.confirm(managerContext, { password: PASSWORD, code: totp(SECRET, currentTime) }, {
      action: "CHANGE_ADMIN_ROLE",
      targetUserId: targetId
    }),
    (error) => error.code === "ADMIN_ROLE_FORBIDDEN"
  );

  const firstCode = totp(SECRET, currentTime);
  const verified = await sensitive.confirm(OWNER, { password: PASSWORD, code: firstCode }, {
    action: "CHANGE_ADMIN_ROLE",
    targetUserId: targetId
  });
  assert.equal(verified.verified, true);

  await assert.rejects(
    sensitive.confirm(OWNER, { password: PASSWORD, code: firstCode }, {
      action: "CHANGE_ADMIN_ROLE",
      targetUserId: targetId
    }),
    (error) => error.code === "INVALID_ADMIN_SENSITIVE_CONFIRMATION"
  );

  currentTime = new Date(currentTime.getTime() + 31_000);
  const changed = await secured.updateRole(OWNER, targetId, {
    role: "PLATFORM_OWNER",
    confirmation: { password: PASSWORD, code: totp(SECRET, currentTime) }
  });
  assert.equal(changed.account.role, "PLATFORM_OWNER");
  assert.equal(changed.revokedSessions, 1);

  currentTime = new Date(currentTime.getTime() + 31_000);
  const reset = await secured.resetSecurity(OWNER, targetId, {
    confirmation: { password: PASSWORD, code: totp(SECRET, currentTime) }
  });
  assert.equal(reset.account.securityReady, false);
  assert.equal(reset.setup.delivery, "manual-development");
  assert.equal(deliveryCalls.length, 1);

  const stored = await database.withContext(OWNER, async (tx) => {
    const result = await tx.query(
      `SELECT u.two_factor_enabled, t.status AS totp_status,
              count(s.id) FILTER (WHERE s.revoked_at IS NULL)::integer AS active_sessions
       FROM users u
       INNER JOIN admin_totp_credentials t ON t.user_id=u.id
       LEFT JOIN sessions s ON s.user_id=u.id
       WHERE u.id=$1
       GROUP BY u.id,t.user_id`,
      [targetId]
    );
    return result.rows[0];
  });
  assert.equal(stored.two_factor_enabled, false);
  assert.equal(stored.totp_status, "REVOKED");
  assert.equal(stored.active_sessions, 0);
});

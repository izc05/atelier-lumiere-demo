import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  scrypt,
  timingSafeEqual
} from "node:crypto";
import { promisify } from "node:util";
import { toDataURL } from "qrcode";
import { ServiceError } from "./providers-service.mjs";

const scryptAsync = promisify(scrypt);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,180}$/;
const TOTP_PATTERN = /^\d{6}$/;
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const ADMIN_ROLES = new Set(["PLATFORM_OWNER", "PROVIDER_MANAGER", "EDITORIAL_REVIEWER"]);
const MAX_ATTEMPTS = 5;
const COMMON_PASSWORDS = new Set([
  "password1234",
  "contraseña1234",
  "atelierlumiere",
  "qwerty123456",
  "123456789012"
]);

function normalizeEmail(value) {
  const email = typeof value === "string" ? value.trim().toLocaleLowerCase("es") : "";
  return EMAIL_PATTERN.test(email) && email.length <= 254 ? email : null;
}

function rawToken(value) {
  const token = typeof value === "string" ? value.trim() : "";
  if (!TOKEN_PATTERN.test(token)) throw unavailable();
  return token;
}

function unavailable() {
  return new ServiceError(
    "ADMIN_RECOVERY_UNAVAILABLE",
    "El enlace de recuperación no es válido, ha caducado o ya se ha utilizado.",
    410
  );
}

function hashToken(value) {
  return createHash("sha256").update(value).digest("hex");
}

function hashRecoveryCode(value, pepper) {
  return createHmac("sha256", pepper).update(value).digest("hex");
}

function secureEquals(left, right) {
  const a = Buffer.from(left ?? "", "utf8");
  const b = Buffer.from(right ?? "", "utf8");
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

function encodeBase32(buffer) {
  let bits = 0;
  let accumulator = 0;
  let output = "";
  for (const byte of buffer) {
    accumulator = (accumulator << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(accumulator >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(accumulator << (5 - bits)) & 31];
  return output;
}

function decodeBase32(value) {
  let bits = 0;
  let accumulator = 0;
  const bytes = [];
  for (const character of String(value).replace(/=+$/g, "").toUpperCase()) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index < 0) throw new Error("Secreto TOTP inválido.");
    accumulator = (accumulator << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((accumulator >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function totpCode(secret, step) {
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

function matchedTotpStep(secret, code, currentTime) {
  const currentStep = Math.floor(currentTime.getTime() / 1000 / 30);
  for (const offset of [-1, 0, 1]) {
    const step = currentStep + offset;
    if (secureEquals(code, totpCode(secret, step))) return step;
  }
  return null;
}

function encryptSecret(secret, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return {
    secretCiphertext: ciphertext.toString("base64url"),
    secretIv: iv.toString("base64url"),
    secretAuthTag: cipher.getAuthTag().toString("base64url")
  };
}

function decryptSecret(row, key) {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(row.secret_iv, "base64url")
  );
  decipher.setAuthTag(Buffer.from(row.secret_auth_tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(row.secret_ciphertext, "base64url")),
    decipher.final()
  ]).toString("utf8");
}

function validatePassword(value, account) {
  if (typeof value !== "string" || value.length < 12 || value.length > 128) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "La nueva contraseña debe tener entre 12 y 128 caracteres.",
      422,
      { field: "password" }
    );
  }
  const lower = value.toLocaleLowerCase("es");
  const compact = lower.replace(/\s+/g, "");
  const local = String(account.email).split("@", 1)[0].toLocaleLowerCase("es");
  const name = String(account.display_name).toLocaleLowerCase("es").replace(/\s+/g, "");
  if (
    COMMON_PASSWORDS.has(lower)
    || (local.length >= 4 && lower.includes(local))
    || (name.length >= 4 && compact.includes(name))
  ) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "La contraseña es demasiado fácil de relacionar con la cuenta.",
      422,
      { field: "password" }
    );
  }
  return value;
}

async function derivePassword(password) {
  const salt = randomBytes(16).toString("base64url");
  const derived = await scryptAsync(password, salt, 64, {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024
  });
  return {
    hash: Buffer.from(derived).toString("base64url"),
    salt,
    algorithm: "scrypt-v1"
  };
}

function generateRecoveryCodes() {
  return Array.from({ length: 10 }, () => {
    const value = encodeBase32(randomBytes(10)).slice(0, 16);
    return value.match(/.{1,4}/g).join("-");
  });
}

function accountReady(row) {
  return Boolean(
    row
    && row.user_status === "ACTIVE"
    && row.email_verified_at
    && row.membership_status === "ACTIVE"
    && ADMIN_ROLES.has(row.admin_role)
  );
}

async function loadAccount(transaction, email, { lock = false } = {}) {
  const result = await transaction.query(
    `SELECT
       u.id AS user_id, u.email, u.display_name, u.status AS user_status,
       u.email_verified_at, am.role AS admin_role, am.status AS membership_status
     FROM users u
     INNER JOIN user_credentials c ON c.user_id = u.id
     INNER JOIN admin_memberships am ON am.user_id = u.id
     INNER JOIN admin_totp_credentials t ON t.user_id = u.id
     WHERE u.email = $1
     LIMIT 1
     ${lock ? "FOR UPDATE OF u, c, am, t" : ""}`,
    [email]
  );
  return result.rows[0] ?? null;
}

async function findRecovery(transaction, token, { lock = false } = {}) {
  const result = await transaction.query(
    `SELECT
       r.id, r.user_id, r.status, r.failed_attempts, r.expires_at,
       r.secret_ciphertext, r.secret_iv, r.secret_auth_tag,
       u.email, u.display_name, u.status AS user_status,
       u.email_verified_at, am.role AS admin_role, am.status AS membership_status
     FROM admin_account_recovery_tokens r
     INNER JOIN users u ON u.id = r.user_id
     INNER JOIN admin_memberships am ON am.user_id = r.user_id
     WHERE r.token_hash = $1
     ${lock ? "FOR UPDATE OF r, u, am" : ""}`,
    [hashToken(token)]
  );
  return result.rows[0] ?? null;
}

function recoveryAvailable(row, currentTime) {
  return Boolean(
    row
    && row.status === "PENDING"
    && Number(row.failed_attempts) < MAX_ATTEMPTS
    && new Date(row.expires_at).getTime() > currentTime.getTime()
    && accountReady(row)
  );
}

async function audit(transaction, userId, action, entityId, metadata = {}) {
  await transaction.query(
    `INSERT INTO audit_events
      (actor_user_id, provider_id, action, entity_type, entity_id, metadata)
     VALUES ($1, NULL, $2, 'admin_account_recovery', $3, $4::jsonb)`,
    [userId, action, entityId, JSON.stringify(metadata)]
  );
}

function deliveryLabel(delivery, environment) {
  if (delivery?.status === "SENT") return "sent";
  if (delivery?.status === "FAILED") return "failed";
  return environment === "production" ? "disabled" : "manual-development";
}

export function createAdminRecoveryService({
  database,
  systemContext,
  mailService,
  environment = process.env.NODE_ENV ?? "development",
  twoFactorEncryptionKey = process.env.TWO_FACTOR_ENCRYPTION_KEY_BASE64,
  recoveryPepper = process.env.TWO_FACTOR_RECOVERY_PEPPER,
  ttlMinutes = Number.parseInt(process.env.ADMIN_RECOVERY_TTL_MINUTES ?? "30", 10),
  cooldownSeconds = Number.parseInt(process.env.ADMIN_RECOVERY_COOLDOWN_SECONDS ?? "300", 10),
  now = () => new Date(),
  logger = console
} = {}) {
  if (!database || typeof database.withContext !== "function") {
    throw new TypeError("La recuperación administrativa necesita una base de datos.");
  }
  if (!systemContext || systemContext.role !== "AUTH_SERVICE" || systemContext.providerId) {
    throw new TypeError("La recuperación administrativa necesita AUTH_SERVICE sin taller.");
  }
  const encryptionKey = typeof twoFactorEncryptionKey === "string"
    ? Buffer.from(twoFactorEncryptionKey, "base64")
    : Buffer.alloc(0);
  if (encryptionKey.length !== 32) {
    throw new TypeError("TWO_FACTOR_ENCRYPTION_KEY_BASE64 debe contener 32 bytes.");
  }
  if (typeof recoveryPepper !== "string" || recoveryPepper.length < 32) {
    throw new TypeError("TWO_FACTOR_RECOVERY_PEPPER debe tener al menos 32 caracteres.");
  }
  if (!Number.isInteger(ttlMinutes) || ttlMinutes < 10 || ttlMinutes > 120) {
    throw new TypeError("ADMIN_RECOVERY_TTL_MINUTES debe estar entre 10 y 120.");
  }
  if (!Number.isInteger(cooldownSeconds) || cooldownSeconds < 60 || cooldownSeconds > 3600) {
    throw new TypeError("ADMIN_RECOVERY_COOLDOWN_SECONDS debe estar entre 60 y 3600.");
  }

  return Object.freeze({
    async request(emailValue) {
      const email = normalizeEmail(emailValue);
      const currentTime = now();
      let issued = null;

      if (email) {
        issued = await database.withContext(systemContext, async (transaction) => {
          const account = await loadAccount(transaction, email, { lock: true });
          if (!accountReady(account)) return null;

          const pending = await transaction.query(
            `SELECT id, created_at
             FROM admin_account_recovery_tokens
             WHERE user_id = $1 AND status = 'PENDING'
             ORDER BY created_at DESC
             LIMIT 1
             FOR UPDATE`,
            [account.user_id]
          );
          if (pending.rowCount === 1) {
            const elapsed = currentTime.getTime() - new Date(pending.rows[0].created_at).getTime();
            if (elapsed < cooldownSeconds * 1000) return null;
            await transaction.query(
              `UPDATE admin_account_recovery_tokens
               SET status = 'REVOKED', revoked_at = $2
               WHERE id = $1`,
              [pending.rows[0].id, currentTime]
            );
          }

          const token = randomBytes(32).toString("base64url");
          const secret = encodeBase32(randomBytes(20));
          const encrypted = encryptSecret(secret, encryptionKey);
          const expiresAt = new Date(currentTime.getTime() + ttlMinutes * 60 * 1000);
          const result = await transaction.query(
            `INSERT INTO admin_account_recovery_tokens
              (user_id, token_hash, secret_ciphertext, secret_iv, secret_auth_tag,
               expires_at, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id`,
            [
              account.user_id,
              hashToken(token),
              encrypted.secretCiphertext,
              encrypted.secretIv,
              encrypted.secretAuthTag,
              expiresAt,
              currentTime
            ]
          );
          await audit(transaction, account.user_id, "ADMIN_RECOVERY_REQUESTED", result.rows[0].id, {
            adminRole: account.admin_role,
            expiresAt
          });
          return { token, expiresAt, account, id: result.rows[0].id };
        });
      }

      let delivery = { status: "DISABLED" };
      if (issued && mailService?.enabled) {
        try {
          delivery = await mailService.sendAdminRecovery({
            to: issued.account.email,
            displayName: issued.account.display_name,
            token: issued.token,
            expiresAt: issued.expiresAt
          });
        } catch (error) {
          logger.error("No se pudo entregar la recuperación administrativa.", {
            entityId: issued.id,
            code: typeof error?.code === "string" ? error.code : "SMTP_DELIVERY_FAILED"
          });
          delivery = { status: "FAILED" };
        }
      }

      return {
        accepted: true,
        delivery: deliveryLabel(delivery, environment),
        ...(environment !== "production" && issued
          ? {
              recoveryToken: issued.token,
              recoveryPath: `/admin/recuperar/?token=${encodeURIComponent(issued.token)}`
            }
          : {})
      };
    },

    async begin(tokenValue) {
      const token = rawToken(tokenValue);
      const currentTime = now();
      const row = await database.withContext(systemContext, async (transaction) => {
        const recovery = await findRecovery(transaction, token);
        return recoveryAvailable(recovery, currentTime) ? recovery : null;
      });
      if (!row) throw unavailable();

      const secret = decryptSecret(row, encryptionKey);
      const label = encodeURIComponent(row.email);
      const issuer = encodeURIComponent("Atelier Lumière");
      const otpauthUri = `otpauth://totp/${issuer}:${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
      const qrDataUrl = await toDataURL(otpauthUri, {
        errorCorrectionLevel: "M",
        margin: 1,
        width: 280
      });
      return {
        account: {
          displayName: row.display_name,
          email: row.email,
          role: row.admin_role
        },
        manualKey: secret,
        qrDataUrl,
        expiresAt: row.expires_at
      };
    },

    async confirm(input = {}) {
      const token = rawToken(input.token);
      const currentTime = now();
      const code = typeof input.code === "string" ? input.code.trim() : "";
      if (!TOTP_PATTERN.test(code)) {
        throw new ServiceError("INVALID_ADMIN_RECOVERY_CODE", "El código de autenticación no es correcto.", 422);
      }

      const preflight = await database.withContext(systemContext, async (transaction) => {
        const row = await findRecovery(transaction, token);
        return recoveryAvailable(row, currentTime) ? row : null;
      });
      if (!preflight) throw unavailable();
      const password = validatePassword(input.password, preflight);
      const credential = await derivePassword(password);
      const recoveryCodes = generateRecoveryCodes();
      const codeHashes = recoveryCodes.map((value) => hashRecoveryCode(value, recoveryPepper));

      const outcome = await database.withContext(systemContext, async (transaction) => {
        const row = await findRecovery(transaction, token, { lock: true });
        if (!recoveryAvailable(row, currentTime)) return { unavailable: true };
        const secret = decryptSecret(row, encryptionKey);
        const matchedStep = matchedTotpStep(secret, code, currentTime);
        if (matchedStep === null) {
          const attempts = Number(row.failed_attempts) + 1;
          const revoke = attempts >= MAX_ATTEMPTS;
          await transaction.query(
            `UPDATE admin_account_recovery_tokens
             SET failed_attempts = $2,
                 status = CASE WHEN $3 THEN 'REVOKED' ELSE status END,
                 revoked_at = CASE WHEN $3 THEN $4 ELSE revoked_at END
             WHERE id = $1`,
            [row.id, attempts, revoke, currentTime]
          );
          await audit(transaction, row.user_id, "ADMIN_RECOVERY_CODE_REJECTED", row.id, {
            attempts,
            revoked: revoke
          });
          return { invalidCode: true, attemptsRemaining: Math.max(0, MAX_ATTEMPTS - attempts) };
        }

        await transaction.query(
          `UPDATE user_credentials
           SET password_hash = $2, password_salt = $3, password_algorithm = $4
           WHERE user_id = $1`,
          [row.user_id, credential.hash, credential.salt, credential.algorithm]
        );
        await transaction.query(
          `UPDATE admin_totp_credentials
           SET secret_ciphertext = $2,
               secret_iv = $3,
               secret_auth_tag = $4,
               key_version = 1,
               status = 'ACTIVE',
               last_used_step = $5,
               activated_at = $6,
               revoked_at = NULL
           WHERE user_id = $1`,
          [
            row.user_id,
            row.secret_ciphertext,
            row.secret_iv,
            row.secret_auth_tag,
            matchedStep,
            currentTime
          ]
        );
        await transaction.query("DELETE FROM user_recovery_codes WHERE user_id = $1", [row.user_id]);
        for (const codeHash of codeHashes) {
          await transaction.query(
            "INSERT INTO user_recovery_codes (user_id, code_hash, created_at) VALUES ($1, $2, $3)",
            [row.user_id, codeHash, currentTime]
          );
        }
        await transaction.query(
          `UPDATE sessions
           SET revoked_at = $2
           WHERE user_id = $1
             AND provider_id IS NULL
             AND role IN ('PLATFORM_OWNER', 'PROVIDER_MANAGER', 'EDITORIAL_REVIEWER')
             AND revoked_at IS NULL`,
          [row.user_id, currentTime]
        );
        await transaction.query(
          `UPDATE admin_login_challenges
           SET status = 'REVOKED', revoked_at = $2
           WHERE user_id = $1 AND status = 'PENDING'`,
          [row.user_id, currentTime]
        );
        await transaction.query(
          `UPDATE admin_account_recovery_tokens
           SET status = 'USED', used_at = $2
           WHERE id = $1`,
          [row.id, currentTime]
        );
        await transaction.query(
          `UPDATE admin_account_recovery_tokens
           SET status = 'REVOKED', revoked_at = $2
           WHERE user_id = $1 AND status = 'PENDING' AND id <> $3`,
          [row.user_id, currentTime, row.id]
        );
        await audit(transaction, row.user_id, "ADMIN_RECOVERY_COMPLETED", row.id, {
          adminRole: row.admin_role,
          sessionsRevoked: true,
          recoveryCodesRotated: true
        });

        return {
          account: {
            displayName: row.display_name,
            email: row.email,
            role: row.admin_role
          }
        };
      });

      if (outcome.unavailable) throw unavailable();
      if (outcome.invalidCode) {
        throw new ServiceError(
          "INVALID_ADMIN_RECOVERY_CODE",
          "El código de autenticación no es correcto.",
          422,
          { attemptsRemaining: outcome.attemptsRemaining }
        );
      }
      return {
        recovered: true,
        account: outcome.account,
        recoveryCodes
      };
    }
  });
}

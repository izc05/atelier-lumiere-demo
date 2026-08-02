import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual
} from "node:crypto";
import { ServiceError } from "./providers-service.mjs";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,180}$/;
const CODE_PATTERN = /^\d{6}$/;
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const ISSUER = "Atelier Lumière";

function hashToken(value) {
  return createHash("sha256").update(value).digest("hex");
}

function continuationToken(value) {
  const token = typeof value === "string" ? value.trim() : "";
  if (!TOKEN_PATTERN.test(token)) throw unavailableContinuation();
  return token;
}

function unavailableContinuation() {
  return new ServiceError(
    "TWO_FACTOR_SETUP_UNAVAILABLE",
    "La sesión de configuración no es válida, ha caducado o ya se ha utilizado.",
    410
  );
}

function parseEncryptionKey(value) {
  if (Buffer.isBuffer(value) && value.length === 32) return Buffer.from(value);
  const decoded = typeof value === "string" ? Buffer.from(value, "base64") : Buffer.alloc(0);
  if (decoded.length !== 32) {
    throw new TypeError("TWO_FACTOR_ENCRYPTION_KEY_BASE64 debe contener exactamente 32 bytes.");
  }
  return decoded;
}

function parseRecoveryPepper(value) {
  if (typeof value !== "string" || value.length < 32) {
    throw new TypeError("TWO_FACTOR_RECOVERY_PEPPER debe tener al menos 32 caracteres.");
  }
  return value;
}

export function encodeBase32(buffer) {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

function decodeBase32(value) {
  const normalized = String(value).replace(/=+$/g, "").toUpperCase();
  let bits = 0;
  let accumulator = 0;
  const bytes = [];
  for (const character of normalized) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index < 0) throw new TypeError("Secreto TOTP no válido.");
    accumulator = (accumulator << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((accumulator >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function counterBuffer(step) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(step));
  return buffer;
}

export function generateTotpCode(secretBase32, currentTime = new Date(), stepSeconds = 30) {
  const step = Math.floor(new Date(currentTime).getTime() / 1000 / stepSeconds);
  const digest = createHmac("sha1", decodeBase32(secretBase32))
    .update(counterBuffer(step))
    .digest();
  const offset = digest[digest.length - 1] & 15;
  const binary = (
    ((digest[offset] & 127) << 24)
    | (digest[offset + 1] << 16)
    | (digest[offset + 2] << 8)
    | digest[offset + 3]
  );
  return String(binary % 1_000_000).padStart(6, "0");
}

function encryptSecret(secretBase32, encryptionKey) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
  const ciphertext = Buffer.concat([
    cipher.update(secretBase32, "utf8"),
    cipher.final()
  ]);
  return {
    ciphertext: ciphertext.toString("base64url"),
    iv: iv.toString("base64url"),
    authTag: cipher.getAuthTag().toString("base64url")
  };
}

function decryptSecret(row, encryptionKey) {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey,
    Buffer.from(row.secret_iv, "base64url")
  );
  decipher.setAuthTag(Buffer.from(row.secret_auth_tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(row.secret_ciphertext, "base64url")),
    decipher.final()
  ]).toString("utf8");
}

function secureCodeEquals(received, expected) {
  const left = Buffer.from(received, "utf8");
  const right = Buffer.from(expected, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

function matchedTotpStep(secret, code, currentTime, stepSeconds) {
  const currentStep = Math.floor(currentTime.getTime() / 1000 / stepSeconds);
  for (const offset of [-1, 0, 1]) {
    const candidateTime = new Date((currentStep + offset) * stepSeconds * 1000);
    if (secureCodeEquals(code, generateTotpCode(secret, candidateTime, stepSeconds))) {
      return currentStep + offset;
    }
  }
  return null;
}

function recoveryCode() {
  const compact = encodeBase32(randomBytes(10));
  return compact.match(/.{1,4}/g).join("-");
}

function recoveryHash(code, pepper) {
  return createHmac("sha256", pepper).update(code.replace(/-/g, "")).digest("hex");
}

async function writeAudit(transaction, {
  actorUserId,
  providerId,
  action,
  entityId,
  metadata = {}
}) {
  await transaction.query(
    `INSERT INTO audit_events
      (actor_user_id, provider_id, action, entity_type, entity_id, metadata)
     VALUES ($1, $2, $3, 'two_factor_authentication', $4, $5::jsonb)`,
    [actorUserId, providerId, action, entityId, JSON.stringify(metadata)]
  );
}

export async function issueTwoFactorContinuation(transaction, {
  userId,
  providerId,
  currentTime,
  ttlMinutes = 15
}) {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(currentTime.getTime() + ttlMinutes * 60 * 1000);

  await transaction.query(
    `UPDATE onboarding_continuations
     SET status = 'REVOKED', revoked_at = $2
     WHERE user_id = $1 AND purpose = 'SETUP_2FA' AND status = 'PENDING'`,
    [userId, currentTime]
  );

  const result = await transaction.query(
    `INSERT INTO onboarding_continuations
      (user_id, provider_id, token_hash, purpose, expires_at, created_at)
     VALUES ($1, $2, $3, 'SETUP_2FA', $4, $5)
     RETURNING id, expires_at`,
    [userId, providerId, tokenHash, expiresAt, currentTime]
  );

  await writeAudit(transaction, {
    actorUserId: userId,
    providerId,
    action: "PROVIDER_2FA_SETUP_ISSUED",
    entityId: result.rows[0].id,
    metadata: { expiresAt: result.rows[0].expires_at }
  });

  return {
    token,
    expiresAt: result.rows[0].expires_at
  };
}

async function findContinuation(transaction, tokenHash, { lock = false } = {}) {
  const result = await transaction.query(
    `SELECT
       oc.id, oc.user_id, oc.provider_id, oc.status, oc.expires_at,
       u.email, u.display_name, u.status AS user_status,
       u.email_verified_at, u.two_factor_enabled,
       p.display_name AS provider_display_name, p.status AS provider_status,
       pm.id AS membership_id, pm.role AS membership_role, pm.status AS membership_status
     FROM onboarding_continuations oc
     INNER JOIN users u ON u.id = oc.user_id
     INNER JOIN providers p ON p.id = oc.provider_id
     INNER JOIN provider_members pm
       ON pm.user_id = oc.user_id AND pm.provider_id = oc.provider_id
     WHERE oc.token_hash = $1 AND oc.purpose = 'SETUP_2FA'
     ${lock ? "FOR UPDATE OF oc, u, pm" : ""}`,
    [tokenHash]
  );
  return result.rows[0] ?? null;
}

function continuationIsAvailable(row, currentTime) {
  return Boolean(
    row
    && row.status === "PENDING"
    && row.provider_status !== "SUSPENDED"
    && row.email_verified_at
    && !row.two_factor_enabled
    && new Date(row.expires_at).getTime() > currentTime.getTime()
  );
}

export function createTwoFactorService({
  database,
  systemContext,
  encryptionKey = process.env.TWO_FACTOR_ENCRYPTION_KEY_BASE64,
  recoveryPepper = process.env.TWO_FACTOR_RECOVERY_PEPPER,
  stepSeconds = 30,
  now = () => new Date()
} = {}) {
  if (!database || typeof database.withContext !== "function") {
    throw new TypeError("createTwoFactorService necesita una base de datos.");
  }
  if (!systemContext || systemContext.role !== "ADMIN") {
    throw new TypeError("2FA necesita un contexto interno de administración.");
  }
  const key = parseEncryptionKey(encryptionKey);
  const pepper = parseRecoveryPepper(recoveryPepper);
  if (stepSeconds !== 30) throw new TypeError("El periodo TOTP debe ser de 30 segundos.");

  return Object.freeze({
    async begin(rawContinuationToken) {
      const token = continuationToken(rawContinuationToken);
      const tokenHash = hashToken(token);
      const currentTime = now();

      const outcome = await database.withContext(systemContext, async (transaction) => {
        const continuation = await findContinuation(transaction, tokenHash, { lock: true });
        if (!continuationIsAvailable(continuation, currentTime)) return { unavailable: true };

        const existing = await transaction.query(
          `SELECT secret_ciphertext, secret_iv, secret_auth_tag, status
           FROM user_totp_credentials
           WHERE user_id = $1
           FOR UPDATE`,
          [continuation.user_id]
        );

        let secret;
        if (existing.rowCount === 1 && existing.rows[0].status === "PENDING") {
          secret = decryptSecret(existing.rows[0], key);
        } else if (existing.rowCount === 1) {
          return { unavailable: true };
        } else {
          secret = encodeBase32(randomBytes(20));
          const encrypted = encryptSecret(secret, key);
          await transaction.query(
            `INSERT INTO user_totp_credentials
              (user_id, provider_id, secret_ciphertext, secret_iv, secret_auth_tag)
             VALUES ($1, $2, $3, $4, $5)`,
            [
              continuation.user_id,
              continuation.provider_id,
              encrypted.ciphertext,
              encrypted.iv,
              encrypted.authTag
            ]
          );
          await writeAudit(transaction, {
            actorUserId: continuation.user_id,
            providerId: continuation.provider_id,
            action: "PROVIDER_2FA_SETUP_STARTED",
            entityId: continuation.id
          });
        }

        const label = `${ISSUER}:${continuation.email}`;
        const uri = `otpauth://totp/${encodeURIComponent(label)}?secret=${secret}`
          + `&issuer=${encodeURIComponent(ISSUER)}&algorithm=SHA1&digits=6&period=30`;

        return {
          provider: {
            id: continuation.provider_id,
            displayName: continuation.provider_display_name
          },
          secret,
          otpauthUri: uri,
          algorithm: "SHA1",
          digits: 6,
          period: 30,
          setupExpiresAt: continuation.expires_at,
          accessGranted: false
        };
      });

      if (outcome.unavailable) throw unavailableContinuation();
      return outcome;
    },

    async confirm(rawContinuationToken, rawCode) {
      const token = continuationToken(rawContinuationToken);
      const code = typeof rawCode === "string" ? rawCode.trim() : "";
      if (!CODE_PATTERN.test(code)) {
        throw new ServiceError(
          "INVALID_TWO_FACTOR_CODE",
          "El código de la aplicación autenticadora no es válido.",
          422
        );
      }
      const tokenHash = hashToken(token);
      const currentTime = now();

      const outcome = await database.withContext(systemContext, async (transaction) => {
        const continuation = await findContinuation(transaction, tokenHash, { lock: true });
        if (!continuationIsAvailable(continuation, currentTime)) return { unavailable: true };

        const credentialResult = await transaction.query(
          `SELECT secret_ciphertext, secret_iv, secret_auth_tag, status, last_used_step
           FROM user_totp_credentials
           WHERE user_id = $1
           FOR UPDATE`,
          [continuation.user_id]
        );
        if (credentialResult.rowCount !== 1 || credentialResult.rows[0].status !== "PENDING") {
          return { unavailable: true };
        }

        const credential = credentialResult.rows[0];
        const secret = decryptSecret(credential, key);
        const matchedStep = matchedTotpStep(secret, code, currentTime, stepSeconds);
        if (
          matchedStep === null
          || (credential.last_used_step !== null && matchedStep <= Number(credential.last_used_step))
        ) {
          throw new ServiceError(
            "INVALID_TWO_FACTOR_CODE",
            "El código de la aplicación autenticadora no es válido.",
            422
          );
        }

        const recoveryCodes = Array.from({ length: 10 }, recoveryCode);
        await transaction.query("DELETE FROM user_recovery_codes WHERE user_id = $1", [continuation.user_id]);
        for (const recovery of recoveryCodes) {
          await transaction.query(
            `INSERT INTO user_recovery_codes (user_id, code_hash, created_at)
             VALUES ($1, $2, $3)`,
            [continuation.user_id, recoveryHash(recovery, pepper), currentTime]
          );
        }

        await transaction.query(
          `UPDATE user_totp_credentials
           SET status = 'ACTIVE', activated_at = $2, last_used_step = $3
           WHERE user_id = $1`,
          [continuation.user_id, currentTime, matchedStep]
        );
        await transaction.query(
          `UPDATE users
           SET status = 'ACTIVE', two_factor_enabled = true
           WHERE id = $1`,
          [continuation.user_id]
        );
        await transaction.query(
          `UPDATE provider_members
           SET status = 'ACTIVE'
           WHERE id = $1`,
          [continuation.membership_id]
        );
        await transaction.query(
          `UPDATE onboarding_continuations
           SET status = 'USED', used_at = $2
           WHERE id = $1`,
          [continuation.id, currentTime]
        );

        await writeAudit(transaction, {
          actorUserId: continuation.user_id,
          providerId: continuation.provider_id,
          action: "PROVIDER_2FA_ENABLED",
          entityId: continuation.id,
          metadata: {
            recoveryCodeCount: recoveryCodes.length,
            providerPublicationEnabled: continuation.provider_status === "ACTIVE"
          }
        });

        return {
          provider: {
            id: continuation.provider_id,
            displayName: continuation.provider_display_name,
            status: continuation.provider_status,
            publicationEnabled: continuation.provider_status === "ACTIVE"
          },
          user: {
            id: continuation.user_id,
            displayName: continuation.display_name,
            status: "ACTIVE",
            emailVerified: true,
            twoFactorEnabled: true
          },
          membership: {
            id: continuation.membership_id,
            role: continuation.membership_role,
            status: "ACTIVE"
          },
          recoveryCodes,
          accessGranted: true,
          nextSteps: continuation.provider_status === "ACTIVE"
            ? []
            : ["ADMIN_PROVIDER_ACTIVATION"]
        };
      });

      if (outcome.unavailable) throw unavailableContinuation();
      return outcome;
    }
  });
}

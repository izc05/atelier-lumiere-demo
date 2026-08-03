import {
  createDecipheriv,
  createHmac,
  scrypt,
  timingSafeEqual
} from "node:crypto";
import { promisify } from "node:util";
import { ServiceError } from "./providers-service.mjs";

const scryptAsync = promisify(scrypt);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOTP_PATTERN = /^\d{6}$/;
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const ALLOWED_ACTIONS = new Set([
  "CREATE_PLATFORM_OWNER",
  "CHANGE_ADMIN_ROLE",
  "SUSPEND_PLATFORM_OWNER",
  "REACTIVATE_PLATFORM_OWNER",
  "RESET_ADMIN_SECURITY"
]);
const MAX_FAILURES = 5;
const WINDOW_MINUTES = 15;
const LOCK_MINUTES = 15;

function ownerContext(context) {
  if (
    !context
    || context.role !== "ADMIN"
    || context.adminRole !== "PLATFORM_OWNER"
    || !UUID_PATTERN.test(context.userId ?? "")
  ) {
    throw new ServiceError(
      "ADMIN_ROLE_FORBIDDEN",
      "Solo un propietario de plataforma puede confirmar esta operación.",
      403
    );
  }
  return context.userId.toLowerCase();
}

function rawPassword(value) {
  if (typeof value !== "string" || value.length < 1 || value.length > 128) {
    throw invalidConfirmation();
  }
  return value;
}

function rawCode(value) {
  const code = typeof value === "string" ? value.trim() : "";
  if (!TOTP_PATTERN.test(code)) throw invalidConfirmation();
  return code;
}

function actionName(value) {
  const action = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!ALLOWED_ACTIONS.has(action)) {
    throw new TypeError("La acción administrativa reforzada no está permitida.");
  }
  return action;
}

function targetId(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new TypeError("El destino de la confirmación reforzada no es válido.");
  }
  return value.toLowerCase();
}

function invalidConfirmation(attemptsRemaining) {
  return new ServiceError(
    "INVALID_ADMIN_SENSITIVE_CONFIRMATION",
    "La contraseña o el código de autenticación no son correctos. Usa un código nuevo, distinto al empleado para iniciar sesión.",
    401,
    Number.isInteger(attemptsRemaining) ? { attemptsRemaining } : undefined
  );
}

function secureEquals(left, right) {
  const a = Buffer.from(left ?? "", "utf8");
  const b = Buffer.from(right ?? "", "utf8");
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

async function verifyPassword(password, row) {
  const salt = row?.password_salt ?? "AAAAAAAAAAAAAAAAAAAAAA";
  const expected = row?.password_hash
    ?? "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  const derived = await scryptAsync(password, salt, 64, {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024
  });
  return row?.password_algorithm === "scrypt-v1"
    && secureEquals(Buffer.from(derived).toString("base64url"), expected);
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

function decryptTotp(row, encryptionKey) {
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

function matchedTotpStep(secret, code, currentTime) {
  const currentStep = Math.floor(currentTime.getTime() / 1000 / 30);
  for (const offset of [-1, 0, 1]) {
    const step = currentStep + offset;
    if (secureEquals(code, totpCode(secret, step))) return step;
  }
  return null;
}

function throttleHash(userId, pepper) {
  return createHmac("sha256", pepper)
    .update(`admin-sensitive:${userId}`)
    .digest("hex");
}

async function throttleState(transaction, keyHash, currentTime) {
  const result = await transaction.query(
    `SELECT failed_attempts, window_started_at, locked_until
     FROM login_throttles
     WHERE key_hash = $1
     FOR UPDATE`,
    [keyHash]
  );
  const row = result.rows[0];
  if (row?.locked_until && new Date(row.locked_until).getTime() > currentTime.getTime()) {
    const retryAfterSeconds = Math.ceil(
      (new Date(row.locked_until).getTime() - currentTime.getTime()) / 1000
    );
    throw new ServiceError(
      "ADMIN_SENSITIVE_CONFIRMATION_THROTTLED",
      "Demasiados intentos de confirmación. Espera antes de volver a probar.",
      429,
      { retryAfterSeconds }
    );
  }
  return row;
}

async function recordFailure(transaction, keyHash, throttle, currentTime) {
  const windowMs = WINDOW_MINUTES * 60 * 1000;
  const insideWindow = throttle
    && currentTime.getTime() - new Date(throttle.window_started_at).getTime() < windowMs;
  const attempts = insideWindow ? Number(throttle.failed_attempts) + 1 : 1;
  const windowStartedAt = insideWindow ? throttle.window_started_at : currentTime;
  const lockedUntil = attempts >= MAX_FAILURES
    ? new Date(currentTime.getTime() + LOCK_MINUTES * 60 * 1000)
    : null;
  await transaction.query(
    `INSERT INTO login_throttles
      (key_hash, failed_attempts, window_started_at, locked_until)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (key_hash) DO UPDATE
     SET failed_attempts = EXCLUDED.failed_attempts,
         window_started_at = EXCLUDED.window_started_at,
         locked_until = EXCLUDED.locked_until`,
    [keyHash, attempts, windowStartedAt, lockedUntil]
  );
  return Math.max(0, MAX_FAILURES - attempts);
}

async function audit(transaction, userId, action, targetUserIdValue, outcome, metadata = {}) {
  await transaction.query(
    `INSERT INTO audit_events
      (actor_user_id, provider_id, action, entity_type, entity_id, metadata)
     VALUES ($1, NULL, $2, 'admin_sensitive_action', $3, $4::jsonb)`,
    [
      userId,
      `ADMIN_SENSITIVE_CONFIRMATION_${outcome}`,
      targetUserIdValue ?? userId,
      JSON.stringify({ requestedAction: action, targetUserId: targetUserIdValue, ...metadata })
    ]
  );
}

export function createAdminSensitiveActionService({
  database,
  systemContext,
  loginPepper = process.env.AUTH_LOGIN_PEPPER,
  twoFactorEncryptionKey = process.env.TWO_FACTOR_ENCRYPTION_KEY_BASE64,
  now = () => new Date()
} = {}) {
  if (!database || typeof database.withContext !== "function") {
    throw new TypeError("La confirmación reforzada necesita una base de datos.");
  }
  if (!systemContext || systemContext.role !== "AUTH_SERVICE" || systemContext.providerId) {
    throw new TypeError("La confirmación reforzada necesita AUTH_SERVICE sin taller.");
  }
  if (typeof loginPepper !== "string" || loginPepper.length < 32) {
    throw new TypeError("AUTH_LOGIN_PEPPER debe tener al menos 32 caracteres.");
  }
  const encryptionKey = typeof twoFactorEncryptionKey === "string"
    ? Buffer.from(twoFactorEncryptionKey, "base64")
    : Buffer.alloc(0);
  if (encryptionKey.length !== 32) {
    throw new TypeError("TWO_FACTOR_ENCRYPTION_KEY_BASE64 debe contener 32 bytes.");
  }

  return Object.freeze({
    async confirm(rawContext, input = {}, descriptor = {}) {
      const userId = ownerContext(rawContext);
      const password = rawPassword(input.password);
      const code = rawCode(input.code);
      const action = actionName(descriptor.action);
      const targetUserIdValue = targetId(descriptor.targetUserId);
      const currentTime = now();
      const keyHash = throttleHash(userId, loginPepper);

      const outcome = await database.withContext(systemContext, async (transaction) => {
        const throttle = await throttleState(transaction, keyHash, currentTime);
        const result = await transaction.query(
          `SELECT
             u.id AS user_id, u.status AS user_status, u.email_verified_at,
             u.two_factor_enabled,
             c.password_hash, c.password_salt, c.password_algorithm,
             am.role AS admin_role, am.status AS membership_status,
             t.secret_ciphertext, t.secret_iv, t.secret_auth_tag,
             t.status AS totp_status, t.last_used_step
           FROM users u
           INNER JOIN user_credentials c ON c.user_id = u.id
           INNER JOIN admin_memberships am ON am.user_id = u.id
           INNER JOIN admin_totp_credentials t ON t.user_id = u.id
           WHERE u.id = $1
           FOR UPDATE OF t`,
          [userId]
        );
        const row = result.rows[0];
        const ready = Boolean(
          row
          && row.user_status === "ACTIVE"
          && row.email_verified_at
          && row.two_factor_enabled
          && row.admin_role === "PLATFORM_OWNER"
          && row.membership_status === "ACTIVE"
          && row.totp_status === "ACTIVE"
        );
        const passwordValid = await verifyPassword(password, row);
        let matchedStep = null;
        if (ready) {
          const secret = decryptTotp(row, encryptionKey);
          matchedStep = matchedTotpStep(secret, code, currentTime);
        }
        const codeValid = matchedStep !== null
          && (row.last_used_step === null || matchedStep > Number(row.last_used_step));

        if (!ready || !passwordValid || !codeValid) {
          const attemptsRemaining = await recordFailure(transaction, keyHash, throttle, currentTime);
          await audit(transaction, userId, action, targetUserIdValue, "REJECTED", {
            attemptsRemaining
          });
          return { rejected: true, attemptsRemaining };
        }

        await transaction.query(
          "UPDATE admin_totp_credentials SET last_used_step = $2 WHERE user_id = $1",
          [userId, matchedStep]
        );
        await transaction.query("DELETE FROM login_throttles WHERE key_hash = $1", [keyHash]);
        await audit(transaction, userId, action, targetUserIdValue, "COMPLETED", {
          verifiedAt: currentTime
        });
        return { verified: true, verifiedAt: currentTime };
      });

      if (outcome.rejected) throw invalidConfirmation(outcome.attemptsRemaining);
      return outcome;
    }
  });
}

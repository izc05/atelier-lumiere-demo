import {
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  scrypt,
  timingSafeEqual
} from "node:crypto";
import { promisify } from "node:util";
import { ServiceError } from "./providers-service.mjs";

const scryptAsync = promisify(scrypt);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,180}$/;
const TOTP_PATTERN = /^\d{6}$/;
const RECOVERY_PATTERN = /^[A-Z2-7]{4}(?:-[A-Z2-7]{4}){3}$/;
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const ADMIN_ROLES = new Set([
  "PLATFORM_OWNER",
  "PROVIDER_MANAGER",
  "EDITORIAL_REVIEWER"
]);
const MAX_PASSWORD_FAILURES = 5;
const MAX_CHALLENGE_FAILURES = 5;
const PASSWORD_WINDOW_MINUTES = 15;
const PASSWORD_LOCK_MINUTES = 15;

function normalizeEmail(value) {
  const email = typeof value === "string" ? value.trim().toLocaleLowerCase("es") : "";
  if (!EMAIL_PATTERN.test(email) || email.length > 254) throw invalidCredentials();
  return email;
}

function rawPassword(value) {
  if (typeof value !== "string" || value.length < 1 || value.length > 128) {
    throw invalidCredentials();
  }
  return value;
}

function rawToken(value) {
  const token = typeof value === "string" ? value.trim() : "";
  return TOKEN_PATTERN.test(token) ? token : null;
}

function normalizeRecoveryCode(value) {
  const code = typeof value === "string" ? value.trim().toUpperCase() : "";
  return RECOVERY_PATTERN.test(code) ? code : null;
}

function invalidCredentials() {
  return new ServiceError(
    "INVALID_ADMIN_CREDENTIALS",
    "El correo, la contraseña o el código no son correctos.",
    401
  );
}

function accountNotReady() {
  return new ServiceError(
    "ADMIN_ACCOUNT_NOT_READY",
    "La cuenta administrativa todavía no ha completado su activación de seguridad.",
    403
  );
}

function unavailableChallenge() {
  return new ServiceError(
    "ADMIN_LOGIN_CHALLENGE_UNAVAILABLE",
    "La verificación administrativa ha caducado o ya se ha utilizado.",
    410
  );
}

function hashToken(value) {
  return createHash("sha256").update(value).digest("hex");
}

function hashKey(value, pepper) {
  return createHmac("sha256", pepper).update(value).digest("hex");
}

function secureEquals(left, right) {
  const a = Buffer.from(left ?? "", "utf8");
  const b = Buffer.from(right ?? "", "utf8");
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

async function verifyPassword(password, credential) {
  const salt = credential?.password_salt ?? "AAAAAAAAAAAAAAAAAAAAAA";
  const expected = credential?.password_hash
    ?? "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  const derived = await scryptAsync(password, salt, 64, {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024
  });
  return credential?.password_algorithm === "scrypt-v1"
    && secureEquals(Buffer.from(derived).toString("base64url"), expected);
}

function decodeBase32(value) {
  const normalized = String(value).replace(/=+$/g, "").toUpperCase();
  let bits = 0;
  let accumulator = 0;
  const bytes = [];
  for (const character of normalized) {
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

async function writeAudit(transaction, {
  userId,
  action,
  entityType,
  entityId,
  metadata = {}
}) {
  await transaction.query(
    `INSERT INTO audit_events
      (actor_user_id, provider_id, action, entity_type, entity_id, metadata)
     VALUES ($1, NULL, $2, $3, $4, $5::jsonb)`,
    [userId, action, entityType, entityId, JSON.stringify(metadata)]
  );
}

async function loadAccount(transaction, email) {
  const result = await transaction.query(
    `SELECT
       u.id AS user_id, u.email, u.display_name, u.status AS user_status,
       u.email_verified_at, u.two_factor_enabled,
       c.password_hash, c.password_salt, c.password_algorithm,
       am.role AS admin_role, am.status AS membership_status,
       t.secret_ciphertext, t.secret_iv, t.secret_auth_tag,
       t.status AS totp_status, t.last_used_step
     FROM users u
     LEFT JOIN user_credentials c ON c.user_id = u.id
     LEFT JOIN admin_memberships am ON am.user_id = u.id
     LEFT JOIN admin_totp_credentials t ON t.user_id = u.id
     WHERE u.email = $1
     LIMIT 1`,
    [email]
  );
  return result.rows[0] ?? null;
}

function accountSecurityReady(account) {
  return Boolean(
    account
    && account.user_status === "ACTIVE"
    && account.email_verified_at
    && account.two_factor_enabled
    && account.membership_status === "ACTIVE"
    && ADMIN_ROLES.has(account.admin_role)
    && account.totp_status === "ACTIVE"
  );
}

async function checkThrottle(transaction, keyHash, currentTime) {
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
      "ADMIN_LOGIN_THROTTLED",
      "Demasiados intentos. Espera antes de volver a probar.",
      429,
      { retryAfterSeconds }
    );
  }
  return row;
}

async function recordPasswordFailure(transaction, keyHash, throttle, currentTime) {
  const windowMs = PASSWORD_WINDOW_MINUTES * 60 * 1000;
  const insideWindow = throttle
    && currentTime.getTime() - new Date(throttle.window_started_at).getTime() < windowMs;
  const attempts = insideWindow ? Number(throttle.failed_attempts) + 1 : 1;
  const windowStartedAt = insideWindow ? throttle.window_started_at : currentTime;
  const lockedUntil = attempts >= MAX_PASSWORD_FAILURES
    ? new Date(currentTime.getTime() + PASSWORD_LOCK_MINUTES * 60 * 1000)
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
}

async function findChallenge(transaction, tokenHash, { lock = false } = {}) {
  const result = await transaction.query(
    `SELECT
       alc.id, alc.user_id, alc.status, alc.failed_attempts, alc.expires_at,
       u.email, u.display_name, u.status AS user_status,
       u.email_verified_at, u.two_factor_enabled,
       am.role AS admin_role, am.status AS membership_status,
       t.secret_ciphertext, t.secret_iv, t.secret_auth_tag,
       t.status AS totp_status, t.last_used_step
     FROM admin_login_challenges alc
     INNER JOIN users u ON u.id = alc.user_id
     INNER JOIN admin_memberships am ON am.user_id = alc.user_id
     INNER JOIN admin_totp_credentials t ON t.user_id = alc.user_id
     WHERE alc.token_hash = $1
     ${lock ? "FOR UPDATE OF alc, t" : ""}`,
    [tokenHash]
  );
  return result.rows[0] ?? null;
}

export function createAdminAuthService({
  database,
  systemContext,
  loginPepper = process.env.AUTH_LOGIN_PEPPER,
  twoFactorEncryptionKey = process.env.TWO_FACTOR_ENCRYPTION_KEY_BASE64,
  recoveryPepper = process.env.TWO_FACTOR_RECOVERY_PEPPER,
  challengeTtlMinutes = Number.parseInt(
    process.env.ADMIN_LOGIN_CHALLENGE_TTL_MINUTES ?? "10",
    10
  ),
  sessionTtlHours = Number.parseInt(process.env.ADMIN_SESSION_TTL_HOURS ?? "8", 10),
  now = () => new Date()
} = {}) {
  if (!database || typeof database.withContext !== "function") {
    throw new TypeError("createAdminAuthService necesita una base de datos.");
  }
  if (!systemContext || systemContext.role !== "AUTH_SERVICE") {
    throw new TypeError("La autenticación administrativa necesita el contexto AUTH_SERVICE.");
  }
  if (systemContext.providerId) {
    throw new TypeError("AUTH_SERVICE no puede adoptar un taller.");
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
  if (typeof recoveryPepper !== "string" || recoveryPepper.length < 32) {
    throw new TypeError("TWO_FACTOR_RECOVERY_PEPPER debe tener al menos 32 caracteres.");
  }
  if (!Number.isInteger(challengeTtlMinutes) || challengeTtlMinutes < 5 || challengeTtlMinutes > 30) {
    throw new TypeError("El desafío administrativo debe durar entre 5 y 30 minutos.");
  }
  if (!Number.isInteger(sessionTtlHours) || sessionTtlHours < 1 || sessionTtlHours > 24) {
    throw new TypeError("La sesión administrativa debe durar entre 1 y 24 horas.");
  }

  return Object.freeze({
    async start(input = {}) {
      const email = normalizeEmail(input.email);
      const password = rawPassword(input.password);
      const currentTime = now();
      const throttleKey = hashKey(`admin:${email}`, loginPepper);

      const outcome = await database.withContext(systemContext, async (transaction) => {
        const throttle = await checkThrottle(transaction, throttleKey, currentTime);
        const account = await loadAccount(transaction, email);
        const passwordValid = await verifyPassword(password, account);

        if (!passwordValid) {
          await recordPasswordFailure(transaction, throttleKey, throttle, currentTime);
          if (account?.user_id) {
            await writeAudit(transaction, {
              userId: account.user_id,
              action: "ADMIN_LOGIN_PASSWORD_REJECTED",
              entityType: "user",
              entityId: account.user_id
            });
          }
          return { invalidCredentials: true };
        }

        await transaction.query("DELETE FROM login_throttles WHERE key_hash = $1", [throttleKey]);
        if (!accountSecurityReady(account)) return { notReady: true };

        await transaction.query(
          `UPDATE admin_login_challenges
           SET status = 'REVOKED', revoked_at = $2
           WHERE user_id = $1 AND status = 'PENDING'`,
          [account.user_id, currentTime]
        );

        const challengeToken = randomBytes(32).toString("base64url");
        const expiresAt = new Date(currentTime.getTime() + challengeTtlMinutes * 60 * 1000);
        const challenge = await transaction.query(
          `INSERT INTO admin_login_challenges
            (user_id, token_hash, expires_at, created_at)
           VALUES ($1, $2, $3, $4)
           RETURNING id`,
          [account.user_id, hashToken(challengeToken), expiresAt, currentTime]
        );

        await writeAudit(transaction, {
          userId: account.user_id,
          action: "ADMIN_LOGIN_PASSWORD_VERIFIED",
          entityType: "admin_login_challenge",
          entityId: challenge.rows[0].id,
          metadata: { expiresAt, adminRole: account.admin_role }
        });

        return {
          challengeToken,
          expiresAt,
          methods: ["TOTP", "RECOVERY_CODE"],
          attemptsRemaining: MAX_CHALLENGE_FAILURES,
          account: {
            displayName: account.display_name,
            role: account.admin_role
          }
        };
      });

      if (outcome.invalidCredentials) throw invalidCredentials();
      if (outcome.notReady) throw accountNotReady();
      return outcome;
    },

    async complete(input = {}, metadata = {}) {
      const challengeToken = rawToken(input.challengeToken);
      if (!challengeToken) throw unavailableChallenge();
      const currentTime = now();
      const tokenHash = hashToken(challengeToken);

      const outcome = await database.withContext(systemContext, async (transaction) => {
        const challenge = await findChallenge(transaction, tokenHash, { lock: true });
        if (
          !challenge
          || challenge.status !== "PENDING"
          || Number(challenge.failed_attempts) >= MAX_CHALLENGE_FAILURES
          || new Date(challenge.expires_at).getTime() <= currentTime.getTime()
        ) return { unavailable: true };
        if (!accountSecurityReady(challenge)) return { notReady: true };

        let verified = false;
        let matchedStep = null;
        let recoveryCodeId = null;

        if (typeof input.code === "string" && TOTP_PATTERN.test(input.code.trim())) {
          const secret = decryptTotp(challenge, encryptionKey);
          matchedStep = matchedTotpStep(secret, input.code.trim(), currentTime);
          verified = matchedStep !== null
            && (challenge.last_used_step === null || matchedStep > Number(challenge.last_used_step));
        } else {
          const recoveryCode = normalizeRecoveryCode(input.recoveryCode);
          if (recoveryCode) {
            const recovery = await transaction.query(
              `UPDATE user_recovery_codes
               SET used_at = $3
               WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL
               RETURNING id`,
              [challenge.user_id, hashKey(recoveryCode, recoveryPepper), currentTime]
            );
            recoveryCodeId = recovery.rows[0]?.id ?? null;
            verified = Boolean(recoveryCodeId);
          }
        }

        if (!verified) {
          const attempts = Number(challenge.failed_attempts) + 1;
          const revoke = attempts >= MAX_CHALLENGE_FAILURES;
          await transaction.query(
            `UPDATE admin_login_challenges
             SET failed_attempts = $2,
                 status = CASE WHEN $3 THEN 'REVOKED' ELSE status END,
                 revoked_at = CASE WHEN $3 THEN $4 ELSE revoked_at END
             WHERE id = $1`,
            [challenge.id, attempts, revoke, currentTime]
          );
          await writeAudit(transaction, {
            userId: challenge.user_id,
            action: "ADMIN_LOGIN_SECOND_FACTOR_REJECTED",
            entityType: "admin_login_challenge",
            entityId: challenge.id,
            metadata: { attempts, revoked: revoke }
          });
          return {
            invalidCredentials: true,
            attemptsRemaining: Math.max(0, MAX_CHALLENGE_FAILURES - attempts)
          };
        }

        if (matchedStep !== null) {
          await transaction.query(
            "UPDATE admin_totp_credentials SET last_used_step = $2 WHERE user_id = $1",
            [challenge.user_id, matchedStep]
          );
        }

        await transaction.query(
          `UPDATE admin_login_challenges
           SET status = 'USED', used_at = $2
           WHERE id = $1`,
          [challenge.id, currentTime]
        );
        await transaction.query(
          `UPDATE sessions
           SET revoked_at = $2
           WHERE user_id = $1
             AND role IN ('PLATFORM_OWNER', 'PROVIDER_MANAGER', 'EDITORIAL_REVIEWER')
             AND revoked_at IS NULL`,
          [challenge.user_id, currentTime]
        );

        const sessionToken = randomBytes(32).toString("base64url");
        const expiresAt = new Date(currentTime.getTime() + sessionTtlHours * 60 * 60 * 1000);
        const session = await transaction.query(
          `INSERT INTO sessions
            (user_id, token_hash, provider_id, role, user_agent, expires_at, last_seen_at)
           VALUES ($1, $2, NULL, $3, $4, $5, $6)
           RETURNING id`,
          [
            challenge.user_id,
            hashToken(sessionToken),
            challenge.admin_role,
            typeof metadata.userAgent === "string" ? metadata.userAgent.slice(0, 500) : null,
            expiresAt,
            currentTime
          ]
        );

        await writeAudit(transaction, {
          userId: challenge.user_id,
          action: "ADMIN_LOGIN_COMPLETED",
          entityType: "session",
          entityId: session.rows[0].id,
          metadata: {
            adminRole: challenge.admin_role,
            method: recoveryCodeId ? "RECOVERY_CODE" : "TOTP",
            expiresAt
          }
        });

        return {
          sessionToken,
          expiresAt,
          account: {
            id: challenge.user_id,
            email: challenge.email,
            displayName: challenge.display_name,
            role: challenge.admin_role
          }
        };
      });

      if (outcome.unavailable) throw unavailableChallenge();
      if (outcome.notReady) throw accountNotReady();
      if (outcome.invalidCredentials) {
        const error = invalidCredentials();
        error.details = { attemptsRemaining: outcome.attemptsRemaining };
        throw error;
      }
      return outcome;
    },

    async authenticate(value) {
      const token = rawToken(value);
      if (!token) return null;
      const currentTime = now();
      return database.withContext(systemContext, async (transaction) => {
        const result = await transaction.query(
          `SELECT
             s.id AS session_id, s.user_id, s.role, s.expires_at,
             u.email, u.display_name, u.status AS user_status,
             u.email_verified_at, u.two_factor_enabled,
             am.status AS membership_status
           FROM sessions s
           INNER JOIN users u ON u.id = s.user_id
           INNER JOIN admin_memberships am ON am.user_id = s.user_id AND am.role = s.role
           WHERE s.token_hash = $1
             AND s.provider_id IS NULL
             AND s.role IN ('PLATFORM_OWNER', 'PROVIDER_MANAGER', 'EDITORIAL_REVIEWER')
             AND s.revoked_at IS NULL
             AND s.expires_at > $2
           FOR UPDATE OF s`,
          [hashToken(token), currentTime]
        );
        const row = result.rows[0];
        if (
          !row
          || row.user_status !== "ACTIVE"
          || !row.email_verified_at
          || !row.two_factor_enabled
          || row.membership_status !== "ACTIVE"
        ) return null;

        await transaction.query(
          "UPDATE sessions SET last_seen_at = $2 WHERE id = $1",
          [row.session_id, currentTime]
        );
        return Object.freeze({
          role: "ADMIN",
          userId: row.user_id,
          providerId: null,
          adminRole: row.role,
          email: row.email,
          displayName: row.display_name,
          expiresAt: row.expires_at,
          authenticationMode: "admin-session"
        });
      });
    },

    async logout(value) {
      const token = rawToken(value);
      if (!token) return false;
      const currentTime = now();
      return database.withContext(systemContext, async (transaction) => {
        const result = await transaction.query(
          `UPDATE sessions
           SET revoked_at = $2
           WHERE token_hash = $1
             AND provider_id IS NULL
             AND role IN ('PLATFORM_OWNER', 'PROVIDER_MANAGER', 'EDITORIAL_REVIEWER')
             AND revoked_at IS NULL
           RETURNING id, user_id`,
          [hashToken(token), currentTime]
        );
        const row = result.rows[0];
        if (!row) return false;
        await writeAudit(transaction, {
          userId: row.user_id,
          action: "ADMIN_LOGOUT",
          entityType: "session",
          entityId: row.id
        });
        return true;
      });
    }
  });
}

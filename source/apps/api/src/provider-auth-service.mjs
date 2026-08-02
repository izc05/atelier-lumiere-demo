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
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,180}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOTP_PATTERN = /^\d{6}$/;
const RECOVERY_PATTERN = /^[A-Z2-7]{4}(?:-[A-Z2-7]{4}){3}$/;
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
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

function invalidCredentials() {
  return new ServiceError(
    "INVALID_CREDENTIALS",
    "El correo, la contraseña o el código no son correctos.",
    401
  );
}

function accountNotReady() {
  return new ServiceError(
    "ACCOUNT_NOT_READY",
    "La cuenta todavía no ha completado su activación de seguridad.",
    403
  );
}

function providerPendingApproval() {
  return new ServiceError(
    "PROVIDER_PENDING_APPROVAL",
    "La cuenta está protegida, pero el taller todavía necesita aprobación administrativa.",
    403
  );
}

function unavailableChallenge() {
  return new ServiceError(
    "LOGIN_CHALLENGE_UNAVAILABLE",
    "La verificación de acceso ha caducado o ya se ha utilizado.",
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
  const expected = credential?.password_hash ?? "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
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
  providerId,
  action,
  entityType,
  entityId,
  metadata = {}
}) {
  await transaction.query(
    `INSERT INTO audit_events
      (actor_user_id, provider_id, action, entity_type, entity_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [userId, providerId, action, entityType, entityId, JSON.stringify(metadata)]
  );
}

async function loadAccount(transaction, email) {
  const result = await transaction.query(
    `SELECT
       u.id AS user_id, u.email, u.display_name, u.status AS user_status,
       u.email_verified_at, u.two_factor_enabled,
       c.password_hash, c.password_salt, c.password_algorithm,
       pm.id AS membership_id, pm.role AS membership_role, pm.status AS membership_status,
       p.id AS provider_id, p.display_name AS provider_display_name, p.status AS provider_status,
       t.secret_ciphertext, t.secret_iv, t.secret_auth_tag,
       t.status AS totp_status, t.last_used_step
     FROM users u
     LEFT JOIN user_credentials c ON c.user_id = u.id
     LEFT JOIN provider_members pm ON pm.user_id = u.id
     LEFT JOIN providers p ON p.id = pm.provider_id
     LEFT JOIN user_totp_credentials t ON t.user_id = u.id
     WHERE u.email = $1
     ORDER BY (p.status = 'ACTIVE') DESC, pm.created_at ASC
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
      "LOGIN_THROTTLED",
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
       plc.id, plc.user_id, plc.provider_id, plc.membership_id,
       plc.status, plc.failed_attempts, plc.expires_at,
       u.display_name, u.status AS user_status, u.email_verified_at, u.two_factor_enabled,
       pm.role AS membership_role, pm.status AS membership_status,
       p.display_name AS provider_display_name, p.status AS provider_status,
       t.secret_ciphertext, t.secret_iv, t.secret_auth_tag,
       t.status AS totp_status, t.last_used_step
     FROM provider_login_challenges plc
     INNER JOIN users u ON u.id = plc.user_id
     INNER JOIN provider_members pm ON pm.id = plc.membership_id
     INNER JOIN providers p ON p.id = plc.provider_id
     INNER JOIN user_totp_credentials t ON t.user_id = plc.user_id
     WHERE plc.token_hash = $1
     ${lock ? "FOR UPDATE OF plc, t" : ""}`,
    [tokenHash]
  );
  return result.rows[0] ?? null;
}

export function createProviderAuthService({
  database,
  systemContext,
  loginPepper = process.env.AUTH_LOGIN_PEPPER,
  twoFactorEncryptionKey = process.env.TWO_FACTOR_ENCRYPTION_KEY_BASE64,
  recoveryPepper = process.env.TWO_FACTOR_RECOVERY_PEPPER,
  challengeTtlMinutes = Number.parseInt(process.env.PROVIDER_LOGIN_CHALLENGE_TTL_MINUTES ?? "10", 10),
  sessionTtlHours = Number.parseInt(process.env.PROVIDER_SESSION_TTL_HOURS ?? "12", 10),
  now = () => new Date()
} = {}) {
  if (!database || typeof database.withContext !== "function") {
    throw new TypeError("createProviderAuthService necesita una base de datos.");
  }
  if (!systemContext || systemContext.role !== "ADMIN") {
    throw new TypeError("La autenticación necesita un contexto interno de administración.");
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
    throw new TypeError("El desafío de acceso debe durar entre 5 y 30 minutos.");
  }
  if (!Number.isInteger(sessionTtlHours) || sessionTtlHours < 1 || sessionTtlHours > 24) {
    throw new TypeError("La sesión del proveedor debe durar entre 1 y 24 horas.");
  }

  return Object.freeze({
    async start(input = {}) {
      const email = normalizeEmail(input.email);
      const password = rawPassword(input.password);
      const currentTime = now();
      const throttleKey = hashKey(email, loginPepper);

      return database.withContext(systemContext, async (transaction) => {
        const throttle = await checkThrottle(transaction, throttleKey, currentTime);
        const account = await loadAccount(transaction, email);
        const passwordValid = await verifyPassword(password, account);

        if (!passwordValid) {
          await recordPasswordFailure(transaction, throttleKey, throttle, currentTime);
          if (account?.user_id && account.provider_id) {
            await writeAudit(transaction, {
              userId: account.user_id,
              providerId: account.provider_id,
              action: "PROVIDER_LOGIN_PASSWORD_REJECTED",
              entityType: "user",
              entityId: account.user_id
            });
          }
          throw invalidCredentials();
        }

        await transaction.query("DELETE FROM login_throttles WHERE key_hash = $1", [throttleKey]);
        if (!accountSecurityReady(account)) throw accountNotReady();
        if (account.provider_status !== "ACTIVE") throw providerPendingApproval();

        await transaction.query(
          `UPDATE provider_login_challenges
           SET status = 'REVOKED', revoked_at = $3
           WHERE user_id = $1 AND provider_id = $2 AND status = 'PENDING'`,
          [account.user_id, account.provider_id, currentTime]
        );

        const token = randomBytes(32).toString("base64url");
        const expiresAt = new Date(currentTime.getTime() + challengeTtlMinutes * 60 * 1000);
        const challengeResult = await transaction.query(
          `INSERT INTO provider_login_challenges
            (user_id, provider_id, membership_id, token_hash, expires_at, created_at)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, expires_at`,
          [
            account.user_id,
            account.provider_id,
            account.membership_id,
            hashToken(token),
            expiresAt,
            currentTime
          ]
        );

        await writeAudit(transaction, {
          userId: account.user_id,
          providerId: account.provider_id,
          action: "PROVIDER_LOGIN_PASSWORD_VERIFIED",
          entityType: "provider_login_challenge",
          entityId: challengeResult.rows[0].id,
          metadata: { expiresAt }
        });

        return {
          challengeToken: token,
          expiresAt,
          provider: {
            id: account.provider_id,
            displayName: account.provider_display_name
          },
          methods: ["TOTP", "RECOVERY_CODE"],
          attemptsRemaining: MAX_CHALLENGE_FAILURES
        };
      });
    },

    async complete(input = {}, metadata = {}) {
      const token = rawToken(input.challengeToken);
      if (!token) throw unavailableChallenge();
      const currentTime = now();
      const tokenHash = hashToken(token);

      const outcome = await database.withContext(systemContext, async (transaction) => {
        const challenge = await findChallenge(transaction, tokenHash, { lock: true });
        if (
          !challenge
          || challenge.status !== "PENDING"
          || Number(challenge.failed_attempts) >= MAX_CHALLENGE_FAILURES
          || new Date(challenge.expires_at).getTime() <= currentTime.getTime()
        ) return { unavailable: true };
        if (!accountSecurityReady(challenge)) return { notReady: true };
        if (challenge.provider_status !== "ACTIVE") return { pendingApproval: true };

        let method;
        let matchedStep = null;
        let recoveryId = null;
        const code = typeof input.code === "string" ? input.code.trim().toUpperCase() : "";

        if (TOTP_PATTERN.test(code)) {
          const secret = decryptTotp(challenge, encryptionKey);
          matchedStep = matchedTotpStep(secret, code, currentTime);
          if (
            matchedStep !== null
            && challenge.last_used_step !== null
            && matchedStep <= Number(challenge.last_used_step)
          ) matchedStep = null;
          if (matchedStep !== null) method = "TOTP";
        } else if (RECOVERY_PATTERN.test(code)) {
          const codeHash = hashKey(code.replace(/-/g, ""), recoveryPepper);
          const recoveryResult = await transaction.query(
            `SELECT id
             FROM user_recovery_codes
             WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL
             FOR UPDATE`,
            [challenge.user_id, codeHash]
          );
          if (recoveryResult.rowCount === 1) {
            method = "RECOVERY_CODE";
            recoveryId = recoveryResult.rows[0].id;
          }
        }

        if (!method) {
          const failedAttempts = Number(challenge.failed_attempts) + 1;
          const locked = failedAttempts >= MAX_CHALLENGE_FAILURES;
          await transaction.query(
            `UPDATE provider_login_challenges
             SET failed_attempts = $2,
                 status = CASE WHEN $3 THEN 'REVOKED' ELSE status END,
                 revoked_at = CASE WHEN $3 THEN $4 ELSE revoked_at END
             WHERE id = $1`,
            [challenge.id, failedAttempts, locked, currentTime]
          );
          await writeAudit(transaction, {
            userId: challenge.user_id,
            providerId: challenge.provider_id,
            action: "PROVIDER_LOGIN_SECOND_FACTOR_REJECTED",
            entityType: "provider_login_challenge",
            entityId: challenge.id,
            metadata: { failedAttempts, locked }
          });
          return {
            invalidCode: true,
            attemptsRemaining: Math.max(0, MAX_CHALLENGE_FAILURES - failedAttempts),
            locked
          };
        }

        if (method === "TOTP") {
          await transaction.query(
            "UPDATE user_totp_credentials SET last_used_step = $2 WHERE user_id = $1",
            [challenge.user_id, matchedStep]
          );
        } else {
          await transaction.query(
            "UPDATE user_recovery_codes SET used_at = $2 WHERE id = $1",
            [recoveryId, currentTime]
          );
        }

        await transaction.query(
          `UPDATE sessions
           SET revoked_at = $3
           WHERE user_id = $1 AND provider_id = $2 AND revoked_at IS NULL`,
          [challenge.user_id, challenge.provider_id, currentTime]
        );

        const sessionToken = randomBytes(32).toString("base64url");
        const sessionExpiresAt = new Date(currentTime.getTime() + sessionTtlHours * 60 * 60 * 1000);
        const sessionResult = await transaction.query(
          `INSERT INTO sessions
            (user_id, provider_id, role, token_hash, user_agent, expires_at, last_seen_at, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
           RETURNING id, expires_at`,
          [
            challenge.user_id,
            challenge.provider_id,
            challenge.membership_role,
            hashToken(sessionToken),
            String(metadata.userAgent ?? "").slice(0, 500) || null,
            sessionExpiresAt,
            currentTime
          ]
        );

        await transaction.query(
          `UPDATE provider_login_challenges
           SET status = 'USED', used_at = $2
           WHERE id = $1`,
          [challenge.id, currentTime]
        );

        await writeAudit(transaction, {
          userId: challenge.user_id,
          providerId: challenge.provider_id,
          action: "PROVIDER_LOGIN_SUCCEEDED",
          entityType: "session",
          entityId: sessionResult.rows[0].id,
          metadata: { method, expiresAt: sessionExpiresAt }
        });

        return {
          sessionToken,
          expiresAt: sessionExpiresAt,
          provider: {
            id: challenge.provider_id,
            displayName: challenge.provider_display_name,
            status: challenge.provider_status
          },
          user: {
            id: challenge.user_id,
            displayName: challenge.display_name
          },
          membership: {
            id: challenge.membership_id,
            role: challenge.membership_role,
            status: challenge.membership_status
          }
        };
      });

      if (outcome.unavailable) throw unavailableChallenge();
      if (outcome.notReady) throw accountNotReady();
      if (outcome.pendingApproval) throw providerPendingApproval();
      if (outcome.invalidCode) {
        throw new ServiceError(
          "INVALID_SECOND_FACTOR",
          outcome.locked
            ? "Se han agotado los intentos. Inicia el acceso de nuevo."
            : "El código no es correcto.",
          422,
          {
            attemptsRemaining: outcome.attemptsRemaining,
            locked: outcome.locked
          }
        );
      }
      return outcome;
    },

    async authenticate(sessionToken) {
      const token = rawToken(sessionToken);
      if (!token) return null;
      const currentTime = now();
      return database.withContext(systemContext, async (transaction) => {
        const result = await transaction.query(
          `SELECT
             s.id AS session_id, s.user_id, s.provider_id, s.role, s.expires_at,
             u.display_name, u.email,
             p.display_name AS provider_display_name, p.slug AS provider_slug,
             p.status AS provider_status,
             pm.status AS membership_status
           FROM sessions s
           INNER JOIN users u ON u.id = s.user_id
           INNER JOIN providers p ON p.id = s.provider_id
           INNER JOIN provider_members pm
             ON pm.user_id = s.user_id AND pm.provider_id = s.provider_id
           WHERE s.token_hash = $1
             AND s.revoked_at IS NULL
             AND s.expires_at > $2
             AND u.status = 'ACTIVE'
             AND u.email_verified_at IS NOT NULL
             AND u.two_factor_enabled = true
             AND p.status = 'ACTIVE'
             AND pm.status = 'ACTIVE'
           LIMIT 1`,
          [hashToken(token), currentTime]
        );
        const row = result.rows[0];
        if (!row) return null;

        await transaction.query(
          "UPDATE sessions SET last_seen_at = $2 WHERE id = $1",
          [row.session_id, currentTime]
        );

        return {
          context: {
            userId: row.user_id,
            providerId: row.provider_id,
            role: row.role
          },
          session: {
            id: row.session_id,
            expiresAt: row.expires_at
          },
          user: {
            id: row.user_id,
            displayName: row.display_name,
            email: row.email
          },
          provider: {
            id: row.provider_id,
            displayName: row.provider_display_name,
            slug: row.provider_slug,
            status: row.provider_status
          },
          membership: {
            role: row.role,
            status: row.membership_status
          }
        };
      });
    },

    async logout(sessionToken) {
      const token = rawToken(sessionToken);
      if (!token) return false;
      const currentTime = now();
      return database.withContext(systemContext, async (transaction) => {
        const result = await transaction.query(
          `UPDATE sessions
           SET revoked_at = $2
           WHERE token_hash = $1 AND revoked_at IS NULL
           RETURNING id, user_id, provider_id`,
          [hashToken(token), currentTime]
        );
        const row = result.rows[0];
        if (!row) return false;
        await writeAudit(transaction, {
          userId: row.user_id,
          providerId: row.provider_id,
          action: "PROVIDER_LOGOUT",
          entityType: "session",
          entityId: row.id
        });
        return true;
      });
    }
  });
}

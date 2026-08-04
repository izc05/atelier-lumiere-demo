import {
  createHash,
  createHmac,
  randomBytes,
  scrypt,
  timingSafeEqual
} from "node:crypto";
import { promisify } from "node:util";
import { ServiceError } from "./providers-service.mjs";
import { issueTwoFactorContinuation } from "./two-factor-service.mjs";

const scryptAsync = promisify(scrypt);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,180}$/;
const PURPOSES = Object.freeze({
  PASSWORD: "PASSWORD_RESET",
  TWO_FACTOR: "RESET_2FA"
});
const COMMON_PASSWORDS = new Set([
  "password1234",
  "contraseña1234",
  "atelierlumiere",
  "qwerty123456",
  "123456789012"
]);

function normalizeEmail(value) {
  const normalized = typeof value === "string" ? value.trim().toLocaleLowerCase("es") : "";
  return EMAIL_PATTERN.test(normalized) && normalized.length <= 254 ? normalized : null;
}

function recoveryToken(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!TOKEN_PATTERN.test(normalized)) throw unavailableRecovery();
  return normalized;
}

function validateNewPassword(value, { email, displayName }) {
  if (typeof value !== "string" || value.length < 12 || value.length > 128) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "La contraseña debe tener entre 12 y 128 caracteres.",
      422,
      { field: "password" }
    );
  }

  const lower = value.toLocaleLowerCase("es");
  const compact = lower.replace(/\s+/g, "");
  const emailLocal = String(email).split("@", 1)[0].toLocaleLowerCase("es");
  const compactName = String(displayName).toLocaleLowerCase("es").replace(/\s+/g, "");
  if (
    COMMON_PASSWORDS.has(lower)
    || (emailLocal.length >= 4 && lower.includes(emailLocal))
    || (compactName.length >= 4 && compact.includes(compactName))
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

function unavailableRecovery() {
  return new ServiceError(
    "ACCOUNT_RECOVERY_UNAVAILABLE",
    "El enlace de recuperación no es válido, ha caducado o ya se ha utilizado.",
    410
  );
}

function hashToken(value) {
  return createHash("sha256").update(value).digest("hex");
}

function throttleKey(email, pepper) {
  return createHmac("sha256", pepper).update(email).digest("hex");
}

function secureEquals(left, right) {
  const a = Buffer.from(left ?? "", "utf8");
  const b = Buffer.from(right ?? "", "utf8");
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

async function derivePassword(rawPassword) {
  const salt = randomBytes(16).toString("base64url");
  const derived = await scryptAsync(rawPassword, salt, 64, {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024
  });
  return {
    passwordHash: Buffer.from(derived).toString("base64url"),
    passwordSalt: salt,
    passwordAlgorithm: "scrypt-v1"
  };
}

async function verifyPassword(rawPassword, row) {
  const salt = row?.password_salt ?? "AAAAAAAAAAAAAAAAAAAAAA";
  const expected = row?.password_hash
    ?? "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  const derived = await scryptAsync(
    typeof rawPassword === "string" ? rawPassword : "",
    salt,
    64,
    { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }
  );
  return row?.password_algorithm === "scrypt-v1"
    && secureEquals(Buffer.from(derived).toString("base64url"), expected);
}

async function loadAccount(transaction, email, { lock = false } = {}) {
  const result = await transaction.query(
    `SELECT
       u.id AS user_id, u.email, u.display_name,
       u.status AS user_status, u.email_verified_at, u.two_factor_enabled,
       c.password_hash, c.password_salt, c.password_algorithm,
       p.id AS provider_id, p.display_name AS provider_display_name,
       p.status AS provider_status,
       pm.id AS membership_id, pm.status AS membership_status
     FROM users u
     INNER JOIN user_credentials c ON c.user_id = u.id
     INNER JOIN provider_members pm ON pm.user_id = u.id
     INNER JOIN providers p ON p.id = pm.provider_id
     WHERE u.email = $1
     ORDER BY (p.status = 'ACTIVE') DESC, pm.created_at ASC
     LIMIT 1
     ${lock ? "FOR UPDATE OF u, c, pm" : ""}`,
    [email]
  );
  return result.rows[0] ?? null;
}

function accountEligible(row) {
  return Boolean(
    row
    && row.user_status === "ACTIVE"
    && row.email_verified_at
    && row.membership_status === "ACTIVE"
    && row.provider_status === "ACTIVE"
  );
}

async function writeAudit(transaction, {
  userId,
  providerId,
  action,
  entityId,
  metadata = {}
}) {
  await transaction.query(
    `INSERT INTO audit_events
      (actor_user_id, provider_id, action, entity_type, entity_id, metadata)
     VALUES ($1, $2, $3, 'account_recovery', $4, $5::jsonb)`,
    [userId, providerId, action, entityId, JSON.stringify(metadata)]
  );
}

async function issueRecoveryToken(transaction, {
  account,
  purpose,
  ttlMinutes,
  cooldownSeconds,
  currentTime
}) {
  const pending = await transaction.query(
    `SELECT id, created_at
     FROM account_recovery_tokens
     WHERE user_id = $1 AND purpose = $2 AND status = 'PENDING'
     ORDER BY created_at DESC
     LIMIT 1
     FOR UPDATE`,
    [account.user_id, purpose]
  );

  if (pending.rowCount === 1) {
    const elapsed = currentTime.getTime() - new Date(pending.rows[0].created_at).getTime();
    if (elapsed < cooldownSeconds * 1000) return null;
    await transaction.query(
      `UPDATE account_recovery_tokens
       SET status = 'REVOKED', revoked_at = $2
       WHERE id = $1`,
      [pending.rows[0].id, currentTime]
    );
  }

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(currentTime.getTime() + ttlMinutes * 60 * 1000);
  const result = await transaction.query(
    `INSERT INTO account_recovery_tokens
      (user_id, provider_id, purpose, token_hash, expires_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, expires_at`,
    [
      account.user_id,
      account.provider_id,
      purpose,
      hashToken(token),
      expiresAt,
      currentTime
    ]
  );

  await writeAudit(transaction, {
    userId: account.user_id,
    providerId: account.provider_id,
    action: purpose === PURPOSES.PASSWORD
      ? "PROVIDER_PASSWORD_RESET_REQUESTED"
      : "PROVIDER_2FA_RESET_REQUESTED",
    entityId: result.rows[0].id,
    metadata: { expiresAt }
  });

  return {
    id: result.rows[0].id,
    token,
    expiresAt: result.rows[0].expires_at,
    account
  };
}

async function findRecovery(transaction, rawToken, purpose, { lock = false } = {}) {
  const result = await transaction.query(
    `SELECT
       art.id, art.user_id, art.provider_id, art.purpose,
       art.status, art.expires_at, art.created_at,
       u.email, u.display_name, u.status AS user_status,
       u.email_verified_at, u.two_factor_enabled,
       p.display_name AS provider_display_name, p.status AS provider_status,
       pm.id AS membership_id, pm.status AS membership_status
     FROM account_recovery_tokens art
     INNER JOIN users u ON u.id = art.user_id
     INNER JOIN providers p ON p.id = art.provider_id
     INNER JOIN provider_members pm
       ON pm.user_id = art.user_id AND pm.provider_id = art.provider_id
     WHERE art.token_hash = $1 AND art.purpose = $2
     ${lock ? "FOR UPDATE OF art, u, pm" : ""}`,
    [hashToken(rawToken), purpose]
  );
  return result.rows[0] ?? null;
}

function recoveryAvailable(row, currentTime) {
  return Boolean(
    row
    && row.status === "PENDING"
    && accountEligible(row)
    && new Date(row.expires_at).getTime() > currentTime.getTime()
  );
}

async function revokeAuthentication(transaction, row, currentTime) {
  await transaction.query(
    `UPDATE sessions
     SET revoked_at = COALESCE(revoked_at, $2)
     WHERE user_id = $1 AND revoked_at IS NULL`,
    [row.user_id, currentTime]
  );
  await transaction.query(
    `UPDATE provider_login_challenges
     SET status = 'REVOKED', revoked_at = COALESCE(revoked_at, $2)
     WHERE user_id = $1 AND status = 'PENDING'`,
    [row.user_id, currentTime]
  );
}

function deliveryLabel(delivery, environment) {
  if (delivery?.status === "SENT") return "sent";
  if (delivery?.status === "FAILED") return "failed";
  return environment === "production" ? "disabled" : "manual-development";
}

async function safelySend(operation, logger, context) {
  try {
    return await operation();
  } catch (error) {
    logger.error("No se pudo entregar un correo de recuperación.", {
      purpose: context.purpose,
      providerId: context.providerId,
      entityId: context.entityId,
      errorCode: typeof error?.code === "string" ? error.code : "SMTP_DELIVERY_FAILED"
    });
    return { status: "FAILED", messageId: null, accepted: [], rejected: [] };
  }
}

export function createAccountRecoveryService({
  database,
  systemContext,
  mailService,
  environment = process.env.NODE_ENV ?? "development",
  loginPepper = process.env.AUTH_LOGIN_PEPPER,
  passwordResetTtlMinutes = Number.parseInt(
    process.env.PASSWORD_RESET_TTL_MINUTES ?? "30",
    10
  ),
  twoFactorResetTtlMinutes = Number.parseInt(
    process.env.TWO_FACTOR_RESET_TTL_MINUTES ?? "30",
    10
  ),
  twoFactorSetupTtlMinutes = Number.parseInt(
    process.env.TWO_FACTOR_SETUP_TTL_MINUTES ?? "15",
    10
  ),
  requestCooldownSeconds = Number.parseInt(
    process.env.ACCOUNT_RECOVERY_COOLDOWN_SECONDS ?? "300",
    10
  ),
  now = () => new Date(),
  logger = console
} = {}) {
  if (!database || typeof database.withContext !== "function") {
    throw new TypeError("La recuperación necesita una base de datos.");
  }
  if (!systemContext || !["ADMIN", "AUTH_SERVICE"].includes(systemContext.role) || systemContext.providerId) {
    throw new TypeError("La recuperación necesita un contexto interno de administración.");
  }
  if (typeof loginPepper !== "string" || loginPepper.length < 32) {
    throw new TypeError("AUTH_LOGIN_PEPPER debe tener al menos 32 caracteres.");
  }
  for (const [name, value] of [
    ["PASSWORD_RESET_TTL_MINUTES", passwordResetTtlMinutes],
    ["TWO_FACTOR_RESET_TTL_MINUTES", twoFactorResetTtlMinutes]
  ]) {
    if (!Number.isInteger(value) || value < 10 || value > 120) {
      throw new TypeError(`${name} debe estar entre 10 y 120.`);
    }
  }
  if (!Number.isInteger(requestCooldownSeconds) || requestCooldownSeconds < 60 || requestCooldownSeconds > 3600) {
    throw new TypeError("ACCOUNT_RECOVERY_COOLDOWN_SECONDS debe estar entre 60 y 3600.");
  }

  async function request(emailValue, purpose, passwordValue) {
    const email = normalizeEmail(emailValue);
    const currentTime = now();
    let issued = null;

    if (email) {
      issued = await database.withContext(systemContext, async (transaction) => {
        const account = await loadAccount(transaction, email, { lock: true });
        const eligible = accountEligible(account);
        if (purpose === PURPOSES.TWO_FACTOR) {
          const passwordValid = await verifyPassword(passwordValue, account);
          if (!eligible || !account?.two_factor_enabled || !passwordValid) return null;
        } else if (!eligible) {
          return null;
        }

        return issueRecoveryToken(transaction, {
          account,
          purpose,
          ttlMinutes: purpose === PURPOSES.PASSWORD
            ? passwordResetTtlMinutes
            : twoFactorResetTtlMinutes,
          cooldownSeconds: requestCooldownSeconds,
          currentTime
        });
      });
    } else {
      await verifyPassword(passwordValue, null);
    }

    let delivery = { status: "DISABLED" };
    if (issued && mailService?.enabled) {
      delivery = await safelySend(
        () => purpose === PURPOSES.PASSWORD
          ? mailService.sendPasswordReset({
              to: issued.account.email,
              displayName: issued.account.display_name,
              providerName: issued.account.provider_display_name,
              token: issued.token,
              expiresAt: issued.expiresAt
            })
          : mailService.sendTwoFactorReset({
              to: issued.account.email,
              displayName: issued.account.display_name,
              providerName: issued.account.provider_display_name,
              token: issued.token,
              expiresAt: issued.expiresAt
            }),
        logger,
        {
          purpose,
          providerId: issued.account.provider_id,
          entityId: issued.id
        }
      );
    }

    return {
      accepted: true,
      delivery: deliveryLabel(delivery, environment),
      ...(environment !== "production" && issued
        ? {
            recoveryToken: issued.token,
            recoveryPath: purpose === PURPOSES.PASSWORD
              ? `/proveedor/recuperar-clave/?token=${encodeURIComponent(issued.token)}`
              : `/proveedor/recuperar-2fa/?token=${encodeURIComponent(issued.token)}`
          }
        : {})
    };
  }

  return Object.freeze({
    requestPasswordReset(email) {
      return request(email, PURPOSES.PASSWORD, "");
    },

    requestTwoFactorReset(email, password) {
      return request(email, PURPOSES.TWO_FACTOR, password);
    },

    async confirmPasswordReset(tokenValue, passwordValue) {
      const token = recoveryToken(tokenValue);
      const currentTime = now();

      const preflight = await database.withContext(systemContext, async (transaction) => {
        const row = await findRecovery(transaction, token, PURPOSES.PASSWORD);
        if (!recoveryAvailable(row, currentTime)) return null;
        return { email: row.email, displayName: row.display_name };
      });
      if (!preflight) throw unavailableRecovery();

      const password = validateNewPassword(passwordValue, preflight);
      const credential = await derivePassword(password);
      const outcome = await database.withContext(systemContext, async (transaction) => {
        const row = await findRecovery(transaction, token, PURPOSES.PASSWORD, { lock: true });
        if (!recoveryAvailable(row, currentTime)) return null;

        await transaction.query(
          `UPDATE user_credentials
           SET password_hash = $2, password_salt = $3, password_algorithm = $4
           WHERE user_id = $1`,
          [row.user_id, credential.passwordHash, credential.passwordSalt, credential.passwordAlgorithm]
        );
        await transaction.query(
          `UPDATE account_recovery_tokens
           SET status = 'USED', used_at = $2
           WHERE id = $1`,
          [row.id, currentTime]
        );
        await transaction.query(
          `UPDATE account_recovery_tokens
           SET status = 'REVOKED', revoked_at = $2
           WHERE user_id = $1 AND id <> $3 AND status = 'PENDING'`,
          [row.user_id, currentTime, row.id]
        );
        await revokeAuthentication(transaction, row, currentTime);
        await transaction.query(
          "DELETE FROM login_throttles WHERE key_hash = $1",
          [throttleKey(row.email, loginPepper)]
        );
        await writeAudit(transaction, {
          userId: row.user_id,
          providerId: row.provider_id,
          action: "PROVIDER_PASSWORD_RESET_COMPLETED",
          entityId: row.id,
          metadata: { sessionsRevoked: true }
        });
        return {
          completed: true,
          provider: { id: row.provider_id, displayName: row.provider_display_name },
          nextStep: "LOGIN"
        };
      });
      if (!outcome) throw unavailableRecovery();
      return outcome;
    },

    async confirmTwoFactorReset(tokenValue) {
      const token = recoveryToken(tokenValue);
      const currentTime = now();
      const outcome = await database.withContext(systemContext, async (transaction) => {
        const row = await findRecovery(transaction, token, PURPOSES.TWO_FACTOR, { lock: true });
        if (!recoveryAvailable(row, currentTime) || !row.two_factor_enabled) return null;

        await transaction.query("DELETE FROM user_recovery_codes WHERE user_id = $1", [row.user_id]);
        await transaction.query("DELETE FROM user_totp_credentials WHERE user_id = $1", [row.user_id]);
        await transaction.query(
          "UPDATE users SET two_factor_enabled = false WHERE id = $1",
          [row.user_id]
        );
        await transaction.query(
          `UPDATE account_recovery_tokens
           SET status = 'USED', used_at = $2
           WHERE id = $1`,
          [row.id, currentTime]
        );
        await transaction.query(
          `UPDATE account_recovery_tokens
           SET status = 'REVOKED', revoked_at = $2
           WHERE user_id = $1 AND id <> $3 AND status = 'PENDING'`,
          [row.user_id, currentTime, row.id]
        );
        await revokeAuthentication(transaction, row, currentTime);

        const continuation = await issueTwoFactorContinuation(transaction, {
          userId: row.user_id,
          providerId: row.provider_id,
          currentTime,
          ttlMinutes: twoFactorSetupTtlMinutes
        });
        await writeAudit(transaction, {
          userId: row.user_id,
          providerId: row.provider_id,
          action: "PROVIDER_2FA_RESET_COMPLETED",
          entityId: row.id,
          metadata: {
            sessionsRevoked: true,
            setupExpiresAt: continuation.expiresAt
          }
        });
        return {
          completed: true,
          provider: { id: row.provider_id, displayName: row.provider_display_name },
          twoFactorSetupToken: continuation.token,
          twoFactorSetupExpiresAt: continuation.expiresAt,
          nextStep: "SETUP_2FA"
        };
      });
      if (!outcome) throw unavailableRecovery();
      return outcome;
    }
  });
}

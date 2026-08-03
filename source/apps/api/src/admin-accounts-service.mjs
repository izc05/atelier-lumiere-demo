import { ServiceError } from "./providers-service.mjs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ADMIN_ROLES = new Set([
  "PLATFORM_OWNER",
  "PROVIDER_MANAGER",
  "EDITORIAL_REVIEWER"
]);
const ACCOUNT_STATUSES = new Set(["ACTIVE", "SUSPENDED"]);

function ownerContext(context) {
  if (
    !context
    || context.role !== "ADMIN"
    || context.adminRole !== "PLATFORM_OWNER"
    || !UUID_PATTERN.test(context.userId ?? "")
  ) {
    throw new ServiceError(
      "ADMIN_ROLE_FORBIDDEN",
      "Solo un propietario de plataforma puede gestionar cuentas administrativas.",
      403
    );
  }
  return {
    role: "ADMIN",
    userId: context.userId.toLowerCase(),
    providerId: null
  };
}

function uuid(value, field = "id") {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new ServiceError("VALIDATION_ERROR", `${field} no es válido.`, 422, { field });
  }
  return value.toLowerCase();
}

function normalizeEmail(value) {
  const email = typeof value === "string" ? value.trim().toLocaleLowerCase("es") : "";
  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    throw new ServiceError("VALIDATION_ERROR", "El correo administrativo no es válido.", 422, {
      field: "email"
    });
  }
  return email;
}

function normalizeName(value) {
  const name = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (name.length < 2 || name.length > 120) {
    throw new ServiceError("VALIDATION_ERROR", "El nombre debe tener entre 2 y 120 caracteres.", 422, {
      field: "displayName"
    });
  }
  return name;
}

function normalizeRole(value) {
  const role = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!ADMIN_ROLES.has(role)) {
    throw new ServiceError("VALIDATION_ERROR", "El rol administrativo no es válido.", 422, {
      field: "role"
    });
  }
  return role;
}

function normalizeStatus(value) {
  const status = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!ACCOUNT_STATUSES.has(status)) {
    throw new ServiceError("VALIDATION_ERROR", "El estado administrativo no es válido.", 422, {
      field: "status"
    });
  }
  return status;
}

function serializeAccount(row) {
  return {
    id: row.user_id,
    email: row.email,
    displayName: row.display_name,
    role: row.admin_role,
    status: row.membership_status,
    userStatus: row.user_status,
    securityReady: Boolean(
      row.two_factor_enabled
      && row.totp_status === "ACTIVE"
      && row.has_password
    ),
    activeSessions: Number(row.active_sessions ?? 0),
    lastSeenAt: row.last_seen_at,
    createdAt: row.membership_created_at,
    updatedAt: row.membership_updated_at
  };
}

function serializeSession(row) {
  return {
    id: row.id,
    role: row.role,
    userAgent: row.user_agent,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    expiresAt: row.expires_at,
    current: false
  };
}

async function audit(transaction, context, action, entityType, entityId, metadata = {}) {
  await transaction.query(
    `INSERT INTO audit_events
      (actor_user_id, provider_id, action, entity_type, entity_id, metadata)
     VALUES ($1, NULL, $2, $3, $4, $5::jsonb)`,
    [context.userId, action, entityType, entityId, JSON.stringify(metadata)]
  );
}

async function accountRow(transaction, userId, { lock = false } = {}) {
  const result = await transaction.query(
    `SELECT
       u.id AS user_id, u.email, u.display_name, u.status AS user_status,
       u.two_factor_enabled,
       am.role AS admin_role, am.status AS membership_status,
       am.created_at AS membership_created_at,
       am.updated_at AS membership_updated_at,
       t.status AS totp_status,
       EXISTS(SELECT 1 FROM user_credentials c WHERE c.user_id = u.id) AS has_password,
       COUNT(s.id) FILTER (
         WHERE s.revoked_at IS NULL AND s.expires_at > now()
       )::integer AS active_sessions,
       MAX(s.last_seen_at) FILTER (
         WHERE s.revoked_at IS NULL AND s.expires_at > now()
       ) AS last_seen_at
     FROM users u
     INNER JOIN admin_memberships am ON am.user_id = u.id
     LEFT JOIN admin_totp_credentials t ON t.user_id = u.id
     LEFT JOIN sessions s ON s.user_id = u.id
       AND s.provider_id IS NULL
       AND s.role IN ('PLATFORM_OWNER', 'PROVIDER_MANAGER', 'EDITORIAL_REVIEWER')
     WHERE u.id = $1
     GROUP BY u.id, am.user_id, t.user_id
     ${lock ? "FOR UPDATE OF u, am" : ""}`,
    [userId]
  );
  return result.rows[0] ?? null;
}

async function requireAccount(transaction, userId, options) {
  const row = await accountRow(transaction, userId, options);
  if (!row) {
    throw new ServiceError("ADMIN_ACCOUNT_NOT_FOUND", "No se ha encontrado la cuenta administrativa.", 404);
  }
  return row;
}

function deliveryFailure(error) {
  return {
    accepted: true,
    delivery: "failed",
    error: typeof error?.code === "string" ? error.code : "ADMIN_SETUP_DELIVERY_FAILED"
  };
}

export function createAdminAccountsService({
  database,
  adminRecoveryService,
  now = () => new Date(),
  logger = console
} = {}) {
  if (!database || typeof database.withContext !== "function") {
    throw new TypeError("createAdminAccountsService necesita una base de datos.");
  }
  if (!adminRecoveryService || typeof adminRecoveryService.request !== "function") {
    throw new TypeError("createAdminAccountsService necesita el flujo de activación administrativa.");
  }

  async function sendSetup(email, purpose) {
    try {
      return await adminRecoveryService.request(email, { purpose });
    } catch (error) {
      logger.error("No se pudo preparar el acceso administrativo.", {
        code: typeof error?.code === "string" ? error.code : "ADMIN_SETUP_DELIVERY_FAILED"
      });
      return deliveryFailure(error);
    }
  }

  return Object.freeze({
    async list(rawContext) {
      const context = ownerContext(rawContext);
      return database.withContext(context, async (transaction) => {
        const result = await transaction.query(
          `SELECT
             u.id AS user_id, u.email, u.display_name, u.status AS user_status,
             u.two_factor_enabled,
             am.role AS admin_role, am.status AS membership_status,
             am.created_at AS membership_created_at,
             am.updated_at AS membership_updated_at,
             t.status AS totp_status,
             EXISTS(SELECT 1 FROM user_credentials c WHERE c.user_id = u.id) AS has_password,
             COUNT(s.id) FILTER (
               WHERE s.revoked_at IS NULL AND s.expires_at > now()
             )::integer AS active_sessions,
             MAX(s.last_seen_at) FILTER (
               WHERE s.revoked_at IS NULL AND s.expires_at > now()
             ) AS last_seen_at
           FROM users u
           INNER JOIN admin_memberships am ON am.user_id = u.id
           LEFT JOIN admin_totp_credentials t ON t.user_id = u.id
           LEFT JOIN sessions s ON s.user_id = u.id
             AND s.provider_id IS NULL
             AND s.role IN ('PLATFORM_OWNER', 'PROVIDER_MANAGER', 'EDITORIAL_REVIEWER')
           GROUP BY u.id, am.user_id, t.user_id
           ORDER BY
             CASE am.role WHEN 'PLATFORM_OWNER' THEN 0 WHEN 'PROVIDER_MANAGER' THEN 1 ELSE 2 END,
             u.display_name, u.email`
        );
        return result.rows.map(serializeAccount);
      });
    },

    async create(rawContext, input = {}) {
      const context = ownerContext(rawContext);
      const email = normalizeEmail(input.email);
      const displayName = normalizeName(input.displayName);
      const role = normalizeRole(input.role);
      const currentTime = now();

      const account = await database.withContext(context, async (transaction) => {
        const existing = await transaction.query(
          "SELECT id FROM users WHERE email = $1 LIMIT 1",
          [email]
        );
        if (existing.rowCount > 0) {
          throw new ServiceError(
            "ADMIN_EMAIL_IN_USE",
            "Ya existe una cuenta con ese correo.",
            409,
            { field: "email" }
          );
        }

        const user = await transaction.query(
          `INSERT INTO users
            (email, display_name, status, email_verified_at, two_factor_enabled)
           VALUES ($1, $2, 'ACTIVE', $3, false)
           RETURNING id`,
          [email, displayName, currentTime]
        );
        const userId = user.rows[0].id;
        await transaction.query(
          `INSERT INTO admin_memberships
            (user_id, role, status, created_by, created_at, updated_at)
           VALUES ($1, $2, 'ACTIVE', $3, $4, $4)`,
          [userId, role, context.userId, currentTime]
        );
        await audit(transaction, context, "ADMIN_ACCOUNT_CREATED", "user", userId, {
          email,
          role,
          activationRequired: true
        });
        return requireAccount(transaction, userId);
      });

      const setup = await sendSetup(email, "INVITATION");
      return { account: serializeAccount(account), setup };
    },

    async updateStatus(rawContext, rawUserId, input = {}) {
      const context = ownerContext(rawContext);
      const userId = uuid(rawUserId, "userId");
      const status = normalizeStatus(input.status);
      if (userId === context.userId && status === "SUSPENDED") {
        throw new ServiceError(
          "ADMIN_SELF_SUSPEND_FORBIDDEN",
          "No puedes suspender tu propia cuenta mientras la estás utilizando.",
          409
        );
      }
      const currentTime = now();

      return database.withContext(context, async (transaction) => {
        const target = await requireAccount(transaction, userId, { lock: true });
        if (
          status === "SUSPENDED"
          && target.admin_role === "PLATFORM_OWNER"
          && target.membership_status === "ACTIVE"
        ) {
          const owners = await transaction.query(
            `SELECT count(*)::integer AS total
             FROM admin_memberships
             WHERE role = 'PLATFORM_OWNER' AND status = 'ACTIVE'`
          );
          if (owners.rows[0].total <= 1) {
            throw new ServiceError(
              "LAST_PLATFORM_OWNER_REQUIRED",
              "Debe permanecer al menos un propietario de plataforma activo.",
              409
            );
          }
        }

        await transaction.query(
          "UPDATE admin_memberships SET status = $2, updated_at = $3 WHERE user_id = $1",
          [userId, status, currentTime]
        );
        await transaction.query(
          "UPDATE users SET status = $2, updated_at = $3 WHERE id = $1",
          [userId, status, currentTime]
        );

        let revokedSessions = 0;
        if (status === "SUSPENDED") {
          const sessions = await transaction.query(
            `UPDATE sessions
             SET revoked_at = $2
             WHERE user_id = $1
               AND provider_id IS NULL
               AND role IN ('PLATFORM_OWNER', 'PROVIDER_MANAGER', 'EDITORIAL_REVIEWER')
               AND revoked_at IS NULL
             RETURNING id`,
            [userId, currentTime]
          );
          revokedSessions = sessions.rowCount;
          await transaction.query(
            `UPDATE admin_login_challenges
             SET status = 'REVOKED', revoked_at = $2
             WHERE user_id = $1 AND status = 'PENDING'`,
            [userId, currentTime]
          );
          await transaction.query(
            `UPDATE admin_account_recovery_tokens
             SET status = 'REVOKED', revoked_at = $2
             WHERE user_id = $1 AND status = 'PENDING'`,
            [userId, currentTime]
          );
        }

        await audit(transaction, context, `ADMIN_ACCOUNT_${status}`, "user", userId, {
          role: target.admin_role,
          revokedSessions
        });
        return {
          account: serializeAccount(await requireAccount(transaction, userId)),
          revokedSessions
        };
      });
    },

    async sessions(rawContext, rawUserId) {
      const context = ownerContext(rawContext);
      const userId = uuid(rawUserId, "userId");
      return database.withContext(context, async (transaction) => {
        await requireAccount(transaction, userId);
        const result = await transaction.query(
          `SELECT id, role, user_agent, created_at, last_seen_at, expires_at
           FROM sessions
           WHERE user_id = $1
             AND provider_id IS NULL
             AND role IN ('PLATFORM_OWNER', 'PROVIDER_MANAGER', 'EDITORIAL_REVIEWER')
             AND revoked_at IS NULL
             AND expires_at > $2
           ORDER BY last_seen_at DESC NULLS LAST, created_at DESC`,
          [userId, now()]
        );
        return result.rows.map(serializeSession);
      });
    },

    async revokeSession(rawContext, rawUserId, rawSessionId) {
      const context = ownerContext(rawContext);
      const userId = uuid(rawUserId, "userId");
      const sessionId = uuid(rawSessionId, "sessionId");
      const currentTime = now();
      return database.withContext(context, async (transaction) => {
        await requireAccount(transaction, userId);
        const result = await transaction.query(
          `UPDATE sessions
           SET revoked_at = $3
           WHERE id = $1 AND user_id = $2
             AND provider_id IS NULL
             AND role IN ('PLATFORM_OWNER', 'PROVIDER_MANAGER', 'EDITORIAL_REVIEWER')
             AND revoked_at IS NULL
           RETURNING id`,
          [sessionId, userId, currentTime]
        );
        if (result.rowCount !== 1) {
          throw new ServiceError("ADMIN_SESSION_NOT_FOUND", "La sesión ya no está activa.", 404);
        }
        await audit(transaction, context, "ADMIN_SESSION_REVOKED", "session", sessionId, {
          targetUserId: userId
        });
        return { revoked: true, sessionId };
      });
    },

    async revokeAllSessions(rawContext, rawUserId) {
      const context = ownerContext(rawContext);
      const userId = uuid(rawUserId, "userId");
      const currentTime = now();
      return database.withContext(context, async (transaction) => {
        await requireAccount(transaction, userId);
        const result = await transaction.query(
          `UPDATE sessions
           SET revoked_at = $2
           WHERE user_id = $1
             AND provider_id IS NULL
             AND role IN ('PLATFORM_OWNER', 'PROVIDER_MANAGER', 'EDITORIAL_REVIEWER')
             AND revoked_at IS NULL
           RETURNING id`,
          [userId, currentTime]
        );
        await audit(transaction, context, "ADMIN_SESSIONS_REVOKED", "user", userId, {
          revokedSessions: result.rowCount
        });
        return { revoked: result.rowCount };
      });
    },

    async resendSetup(rawContext, rawUserId) {
      const context = ownerContext(rawContext);
      const userId = uuid(rawUserId, "userId");
      const account = await database.withContext(context, async (transaction) => {
        const target = await requireAccount(transaction, userId);
        if (target.membership_status !== "ACTIVE" || target.user_status !== "ACTIVE") {
          throw new ServiceError(
            "ADMIN_ACCOUNT_SUSPENDED",
            "Reactiva la cuenta antes de enviar un acceso nuevo.",
            409
          );
        }
        await audit(transaction, context, "ADMIN_SETUP_LINK_REQUESTED", "user", userId, {
          securityReady: Boolean(target.two_factor_enabled && target.totp_status === "ACTIVE" && target.has_password)
        });
        return target;
      });
      const setup = await sendSetup(account.email, account.securityReady ? "RECOVERY" : "INVITATION");
      return { account: serializeAccount(account), setup };
    }
  });
}

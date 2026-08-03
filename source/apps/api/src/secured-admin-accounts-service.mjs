import { ServiceError } from "./providers-service.mjs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ADMIN_ROLES = new Set([
  "PLATFORM_OWNER",
  "PROVIDER_MANAGER",
  "EDITORIAL_REVIEWER"
]);

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
    providerId: null,
    adminRole: "PLATFORM_OWNER"
  };
}

function uuid(value, field = "userId") {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new ServiceError("VALIDATION_ERROR", `${field} no es válido.`, 422, { field });
  }
  return value.toLowerCase();
}

function roleValue(value) {
  const role = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!ADMIN_ROLES.has(role)) {
    throw new ServiceError("VALIDATION_ERROR", "El rol administrativo no es válido.", 422, {
      field: "role"
    });
  }
  return role;
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

async function accountRow(transaction, userId, { lock = false } = {}) {
  if (lock) {
    const locked = await transaction.query(
      `SELECT u.id
       FROM users u
       INNER JOIN admin_memberships am ON am.user_id = u.id
       WHERE u.id = $1
       FOR UPDATE OF u, am`,
      [userId]
    );
    if (locked.rowCount !== 1) return null;
  }
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
     GROUP BY u.id, am.user_id, t.user_id`,
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

async function audit(transaction, context, action, entityId, metadata = {}) {
  await transaction.query(
    `INSERT INTO audit_events
      (actor_user_id, provider_id, action, entity_type, entity_id, metadata)
     VALUES ($1, NULL, $2, 'user', $3, $4::jsonb)`,
    [context.userId, action, entityId, JSON.stringify(metadata)]
  );
}

async function revokeAccess(transaction, userId, currentTime, { revokeRecovery = true } = {}) {
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
  await transaction.query(
    `UPDATE admin_login_challenges
     SET status = 'REVOKED', revoked_at = $2
     WHERE user_id = $1 AND status = 'PENDING'`,
    [userId, currentTime]
  );
  if (revokeRecovery) {
    await transaction.query(
      `UPDATE admin_account_recovery_tokens
       SET status = 'REVOKED', revoked_at = $2
       WHERE user_id = $1 AND status = 'PENDING'`,
      [userId, currentTime]
    );
  }
  return sessions.rowCount;
}

function confirmation(input) {
  return input && typeof input.confirmation === "object" && !Array.isArray(input.confirmation)
    ? input.confirmation
    : {};
}

export function createSecuredAdminAccountsService({
  baseService,
  database,
  sensitiveActionService,
  adminRecoveryService,
  now = () => new Date()
} = {}) {
  if (!baseService) throw new TypeError("La gestión protegida necesita el servicio base.");
  if (!database || typeof database.withContext !== "function") {
    throw new TypeError("La gestión protegida necesita una base de datos.");
  }
  if (!sensitiveActionService || typeof sensitiveActionService.confirm !== "function") {
    throw new TypeError("La gestión protegida necesita confirmación reforzada.");
  }
  if (!adminRecoveryService || typeof adminRecoveryService.request !== "function") {
    throw new TypeError("La gestión protegida necesita recuperación administrativa.");
  }

  async function target(rawContext, rawUserId) {
    const context = ownerContext(rawContext);
    const userId = uuid(rawUserId);
    const account = await database.withContext(context, (transaction) => requireAccount(transaction, userId));
    return { context, userId, account };
  }

  return Object.freeze({
    list: (...args) => baseService.list(...args),
    sessions: (...args) => baseService.sessions(...args),
    revokeSession: (...args) => baseService.revokeSession(...args),
    revokeAllSessions: (...args) => baseService.revokeAllSessions(...args),

    async create(rawContext, input = {}) {
      const role = roleValue(input.role);
      if (role === "PLATFORM_OWNER") {
        await sensitiveActionService.confirm(rawContext, confirmation(input), {
          action: "CREATE_PLATFORM_OWNER",
          targetUserId: null
        });
      }
      return baseService.create(rawContext, input);
    },

    async updateStatus(rawContext, rawUserId, input = {}) {
      const { userId, account } = await target(rawContext, rawUserId);
      if (account.admin_role === "PLATFORM_OWNER") {
        const requested = String(input.status ?? "").trim().toUpperCase();
        await sensitiveActionService.confirm(rawContext, confirmation(input), {
          action: requested === "ACTIVE"
            ? "REACTIVATE_PLATFORM_OWNER"
            : "SUSPEND_PLATFORM_OWNER",
          targetUserId: userId
        });
      }
      return baseService.updateStatus(rawContext, userId, input);
    },

    async resendSetup(rawContext, rawUserId) {
      const { userId, account } = await target(rawContext, rawUserId);
      const serialized = serializeAccount(account);
      if (serialized.securityReady) {
        throw new ServiceError(
          "ADMIN_SECURITY_RESET_REQUIRED",
          "Una cuenta ya activada debe restablecerse mediante la operación de seguridad reforzada.",
          409
        );
      }
      return baseService.resendSetup(rawContext, userId);
    },

    async updateRole(rawContext, rawUserId, input = {}) {
      const context = ownerContext(rawContext);
      const userId = uuid(rawUserId);
      const nextRole = roleValue(input.role);
      if (userId === context.userId) {
        throw new ServiceError(
          "ADMIN_SELF_ROLE_CHANGE_FORBIDDEN",
          "No puedes cambiar tu propio rol mientras utilizas esa cuenta.",
          409
        );
      }
      await sensitiveActionService.confirm(rawContext, confirmation(input), {
        action: "CHANGE_ADMIN_ROLE",
        targetUserId: userId
      });
      const currentTime = now();

      const result = await database.withContext(context, async (transaction) => {
        const current = await requireAccount(transaction, userId, { lock: true });
        if (current.admin_role === nextRole) {
          return { account: serializeAccount(current), revokedSessions: 0, unchanged: true };
        }
        if (
          current.admin_role === "PLATFORM_OWNER"
          && nextRole !== "PLATFORM_OWNER"
          && current.membership_status === "ACTIVE"
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
          "UPDATE admin_memberships SET role = $2, updated_at = $3 WHERE user_id = $1",
          [userId, nextRole, currentTime]
        );
        const revokedSessions = await revokeAccess(transaction, userId, currentTime);
        await audit(transaction, context, "ADMIN_ROLE_CHANGED", userId, {
          previousRole: current.admin_role,
          nextRole,
          revokedSessions
        });
        return {
          account: serializeAccount(await requireAccount(transaction, userId)),
          revokedSessions,
          unchanged: false
        };
      });
      return result;
    },

    async resetSecurity(rawContext, rawUserId, input = {}) {
      const { context, userId, account } = await target(rawContext, rawUserId);
      if (userId === context.userId) {
        throw new ServiceError(
          "ADMIN_SELF_SECURITY_RESET_FORBIDDEN",
          "Utiliza la recuperación personal para restablecer tu propia cuenta.",
          409
        );
      }
      if (account.membership_status !== "ACTIVE" || account.user_status !== "ACTIVE") {
        throw new ServiceError(
          "ADMIN_ACCOUNT_SUSPENDED",
          "Reactiva la cuenta antes de restablecer su seguridad.",
          409
        );
      }
      await sensitiveActionService.confirm(rawContext, confirmation(input), {
        action: "RESET_ADMIN_SECURITY",
        targetUserId: userId
      });

      const setup = await adminRecoveryService.request(account.email);
      if (!new Set(["sent", "manual-development"]).has(setup.delivery)) {
        await database.withContext(context, async (transaction) => {
          await transaction.query(
            `UPDATE admin_account_recovery_tokens
             SET status = 'REVOKED', revoked_at = $2
             WHERE user_id = $1 AND status = 'PENDING'`,
            [userId, now()]
          );
          await audit(transaction, context, "ADMIN_SECURITY_RESET_DELIVERY_FAILED", userId, {
            delivery: setup.delivery
          });
        });
        throw new ServiceError(
          "ADMIN_SECURITY_RESET_DELIVERY_REQUIRED",
          "No se ha bloqueado la cuenta porque el enlace de recuperación no pudo entregarse.",
          503,
          { delivery: setup.delivery }
        );
      }

      const currentTime = now();
      const outcome = await database.withContext(context, async (transaction) => {
        const current = await requireAccount(transaction, userId, { lock: true });
        if (current.membership_status !== "ACTIVE" || current.user_status !== "ACTIVE") {
          throw new ServiceError(
            "ADMIN_ACCOUNT_SUSPENDED",
            "La cuenta ha cambiado de estado antes de completar el restablecimiento.",
            409
          );
        }
        const revokedSessions = await revokeAccess(transaction, userId, currentTime, {
          revokeRecovery: false
        });
        await transaction.query(
          `UPDATE admin_totp_credentials
           SET status = 'REVOKED', revoked_at = $2, activated_at = NULL, last_used_step = NULL
           WHERE user_id = $1`,
          [userId, currentTime]
        );
        await transaction.query(
          "UPDATE users SET two_factor_enabled = false, updated_at = $2 WHERE id = $1",
          [userId, currentTime]
        );
        await audit(transaction, context, "ADMIN_SECURITY_RESET_FORCED", userId, {
          role: current.admin_role,
          revokedSessions,
          delivery: setup.delivery
        });
        return {
          account: serializeAccount(await requireAccount(transaction, userId)),
          revokedSessions
        };
      });

      return { ...outcome, setup };
    }
  });
}

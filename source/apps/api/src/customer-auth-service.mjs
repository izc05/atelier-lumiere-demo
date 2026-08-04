import { createHash, randomBytes } from "node:crypto";
import { ServiceError } from "./providers-service.mjs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,180}$/;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
function token() {
  return randomBytes(32).toString("base64url");
}
function uuid(value, field) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new ServiceError("VALIDATION_ERROR", `${field} no es válido.`, 422, { field });
  }
  return value.toLowerCase();
}
function validToken(value) {
  return typeof value === "string" && TOKEN_PATTERN.test(value) ? value : null;
}
function userAgentHash(value) {
  if (typeof value !== "string" || value.trim() === "") return null;
  return sha256(value.trim().slice(0, 500));
}
function requireSystemContext(context) {
  if (!context || !["ADMIN", "AUTH_SERVICE"].includes(context.role) || context.providerId || !UUID_PATTERN.test(context.userId ?? "")) {
    throw new TypeError("El acceso de clientes necesita un contexto interno de Administración.");
  }
  return context;
}

export function createCustomerAuthService({
  database,
  systemContext,
  accessTtlMinutes = 30,
  sessionTtlHours = 24 * 7
} = {}) {
  if (!database || typeof database.withContext !== "function") {
    throw new TypeError("createCustomerAuthService necesita una base de datos.");
  }
  const internalContext = requireSystemContext(systemContext);
  if (!Number.isInteger(accessTtlMinutes) || accessTtlMinutes < 5 || accessTtlMinutes > 1440) {
    throw new TypeError("accessTtlMinutes debe estar entre 5 y 1440.");
  }
  if (!Number.isInteger(sessionTtlHours) || sessionTtlHours < 1 || sessionTtlHours > 24 * 30) {
    throw new TypeError("sessionTtlHours debe estar entre 1 y 720.");
  }

  return Object.freeze({
    async issueAccess({ customerUserId: rawCustomerUserId, checkoutId: rawCheckoutId } = {}) {
      const customerUserId = uuid(rawCustomerUserId, "customerUserId");
      const checkoutId = uuid(rawCheckoutId, "checkoutId");
      const accessToken = token();
      const tokenHash = sha256(accessToken);

      const result = await database.withContext(internalContext, async (transaction) => {
        const checkout = await transaction.query(
          `SELECT checkout.id, checkout.customer_user_id, customer.email,
                  customer.display_name, customer.status
           FROM checkout_batches checkout
           INNER JOIN users customer ON customer.id = checkout.customer_user_id
           WHERE checkout.id = $1 AND checkout.customer_user_id = $2`,
          [checkoutId, customerUserId]
        );
        if (checkout.rowCount !== 1 || checkout.rows[0].status !== "ACTIVE") {
          throw new ServiceError(
            "CUSTOMER_ACCESS_NOT_AVAILABLE",
            "No se puede generar acceso para este pedido.",
            404
          );
        }

        await transaction.query(
          `UPDATE customer_order_access_tokens
           SET revoked_at = now()
           WHERE checkout_id = $1 AND customer_user_id = $2
             AND consumed_at IS NULL AND revoked_at IS NULL`,
          [checkoutId, customerUserId]
        );
        const inserted = await transaction.query(
          `INSERT INTO customer_order_access_tokens (
             customer_user_id, checkout_id, token_hash, expires_at, created_by
           ) VALUES ($1, $2, $3, now() + ($4::integer * interval '1 minute'), $5)
           RETURNING id, expires_at`,
          [customerUserId, checkoutId, tokenHash, accessTtlMinutes, internalContext.userId]
        );
        return {
          accessId: inserted.rows[0].id,
          expiresAt: inserted.rows[0].expires_at,
          email: checkout.rows[0].email,
          displayName: checkout.rows[0].display_name
        };
      });

      return { ...result, accessToken };
    },

    async consumeAccess(rawAccessToken, { userAgent } = {}) {
      const accessToken = validToken(rawAccessToken);
      if (!accessToken) {
        throw new ServiceError(
          "CUSTOMER_ACCESS_INVALID",
          "El enlace no es válido o ha caducado.",
          401
        );
      }
      const sessionToken = token();
      const sessionTokenHash = sha256(sessionToken);
      const accessTokenHash = sha256(accessToken);
      const agentHash = userAgentHash(userAgent);

      const data = await database.withContext(internalContext, async (transaction) => {
        const access = await transaction.query(
          `SELECT access.id, access.customer_user_id, access.checkout_id,
                  customer.email, customer.display_name, customer.status
           FROM customer_order_access_tokens access
           INNER JOIN users customer ON customer.id = access.customer_user_id
           WHERE access.token_hash = $1
             AND access.consumed_at IS NULL
             AND access.revoked_at IS NULL
             AND access.expires_at > now()
           FOR UPDATE OF access`,
          [accessTokenHash]
        );
        if (access.rowCount !== 1 || access.rows[0].status !== "ACTIVE") {
          throw new ServiceError(
            "CUSTOMER_ACCESS_INVALID",
            "El enlace no es válido o ha caducado.",
            401
          );
        }
        const row = access.rows[0];
        await transaction.query(
          "UPDATE customer_order_access_tokens SET consumed_at = now() WHERE id = $1",
          [row.id]
        );
        await transaction.query(
          `UPDATE customer_sessions
           SET revoked_at = now()
           WHERE customer_user_id = $1 AND revoked_at IS NULL`,
          [row.customer_user_id]
        );
        const session = await transaction.query(
          `INSERT INTO customer_sessions (
             customer_user_id, token_hash, expires_at, user_agent_hash
           ) VALUES ($1, $2, now() + ($3::integer * interval '1 hour'), $4)
           RETURNING id, expires_at, created_at`,
          [row.customer_user_id, sessionTokenHash, sessionTtlHours, agentHash]
        );
        return {
          checkoutId: row.checkout_id,
          user: {
            id: row.customer_user_id,
            email: row.email,
            displayName: row.display_name
          },
          session: {
            id: session.rows[0].id,
            expiresAt: session.rows[0].expires_at,
            createdAt: session.rows[0].created_at
          }
        };
      });

      return { ...data, sessionToken };
    },

    async authenticate(rawSessionToken) {
      const sessionToken = validToken(rawSessionToken);
      if (!sessionToken) return null;
      const tokenHash = sha256(sessionToken);

      return database.withContext(internalContext, async (transaction) => {
        const result = await transaction.query(
          `SELECT session.id, session.customer_user_id, session.expires_at,
                  session.created_at, customer.email, customer.display_name
           FROM customer_sessions session
           INNER JOIN users customer ON customer.id = session.customer_user_id
           WHERE session.token_hash = $1
             AND session.revoked_at IS NULL
             AND session.expires_at > now()
             AND customer.status = 'ACTIVE'`,
          [tokenHash]
        );
        if (result.rowCount !== 1) return null;
        const row = result.rows[0];
        await transaction.query(
          "UPDATE customer_sessions SET last_seen_at = now() WHERE id = $1",
          [row.id]
        );
        return {
          context: {
            role: "CUSTOMER",
            userId: row.customer_user_id,
            providerId: null
          },
          user: {
            id: row.customer_user_id,
            email: row.email,
            displayName: row.display_name
          },
          session: {
            id: row.id,
            expiresAt: row.expires_at,
            createdAt: row.created_at
          }
        };
      });
    },

    async revoke(rawSessionToken) {
      const sessionToken = validToken(rawSessionToken);
      if (!sessionToken) return false;
      const result = await database.withContext(internalContext, (transaction) => transaction.query(
        `UPDATE customer_sessions
         SET revoked_at = COALESCE(revoked_at, now())
         WHERE token_hash = $1
         RETURNING id`,
        [sha256(sessionToken)]
      ));
      return result.rowCount === 1;
    }
  });
}

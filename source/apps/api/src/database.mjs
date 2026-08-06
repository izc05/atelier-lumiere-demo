import pg from "pg";

const { Pool } = pg;
const VALID_ROLES = new Set([
  "ADMIN",
  "PROVIDER_OWNER",
  "PROVIDER_MEMBER",
  "CUSTOMER",
  "CATALOG_READER",
  "LEGAL_SERVICE",
  "AUTH_SERVICE",
  "PAYMENT_SERVICE",
  "NOTIFICATION_SERVICE",
  "PILOT_CHECKOUT_SERVICE"
]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertUuid(value, field, { optional = false } = {}) {
  if ((value === null || value === undefined || value === "") && optional) return null;
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new TypeError(`${field} debe ser un UUID válido.`);
  }
  return value.toLowerCase();
}

function normalizeContext(context) {
  if (!context || !VALID_ROLES.has(context.role)) {
    throw new TypeError("La transacción necesita un rol de aplicación válido.");
  }

  const userId = assertUuid(context.userId, "userId");
  const providerId = assertUuid(context.providerId, "providerId", { optional: true });

  if (context.role.startsWith("PROVIDER_") && !providerId) {
    throw new TypeError("Los roles de proveedor necesitan providerId.");
  }
  if (context.role === "CATALOG_READER" && providerId) {
    throw new TypeError("El lector del catálogo no puede adoptar el contexto de un proveedor.");
  }
  if (context.role === "LEGAL_SERVICE" && providerId) {
    throw new TypeError("El servicio legal no puede adoptar el contexto de un proveedor.");
  }
  if (context.role === "AUTH_SERVICE" && providerId) {
    throw new TypeError("El servicio de autenticación no puede adoptar el contexto de un proveedor.");
  }
  if (context.role === "PAYMENT_SERVICE" && providerId) {
    throw new TypeError("El servicio de pagos no puede adoptar el contexto de un proveedor.");
  }
  if (context.role === "NOTIFICATION_SERVICE" && providerId) {
    throw new TypeError("El servicio de notificaciones no puede adoptar el contexto de un proveedor.");
  }
  if (context.role === "PILOT_CHECKOUT_SERVICE" && providerId) {
    throw new TypeError("El servicio de checkout piloto no puede adoptar el contexto de un proveedor.");
  }

  return Object.freeze({
    role: context.role,
    userId,
    providerId
  });
}

export class DatabaseUnavailableError extends Error {
  constructor(message = "La base de datos no está disponible.") {
    super(message);
    this.name = "DatabaseUnavailableError";
    this.code = "DATABASE_UNAVAILABLE";
  }
}

export function createDatabase({
  connectionString = process.env.DATABASE_URL,
  maxConnections = Number.parseInt(process.env.DATABASE_POOL_MAX ?? "10", 10),
  statementTimeoutMs = Number.parseInt(process.env.DATABASE_STATEMENT_TIMEOUT_MS ?? "5000", 10),
  logger = console
} = {}) {
  if (!connectionString) {
    return {
      enabled: false,
      async ping() {
        return false;
      },
      async withContext() {
        throw new DatabaseUnavailableError("DATABASE_URL no está configurada.");
      },
      async close() {}
    };
  }

  if (!Number.isInteger(maxConnections) || maxConnections < 1 || maxConnections > 50) {
    throw new TypeError("DATABASE_POOL_MAX debe estar entre 1 y 50.");
  }

  if (!Number.isInteger(statementTimeoutMs) || statementTimeoutMs < 250 || statementTimeoutMs > 60000) {
    throw new TypeError("DATABASE_STATEMENT_TIMEOUT_MS debe estar entre 250 y 60000.");
  }

  const pool = new Pool({
    connectionString,
    max: maxConnections,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    application_name: "atelier-lumiere-api"
  });

  pool.on("error", (error) => {
    logger.error("Error inesperado en una conexión PostgreSQL inactiva.", error);
  });

  return {
    enabled: true,

    async ping() {
      try {
        const result = await pool.query("SELECT 1 AS ok");
        return result.rows[0]?.ok === 1;
      } catch (error) {
        logger.error("No se pudo verificar PostgreSQL.", error);
        return false;
      }
    },

    async withContext(rawContext, callback) {
      const context = normalizeContext(rawContext);
      if (typeof callback !== "function") {
        throw new TypeError("withContext necesita una función de transacción.");
      }

      const client = await pool.connect();
      let transactionStarted = false;

      try {
        await client.query("BEGIN");
        transactionStarted = true;
        await client.query("SET LOCAL ROLE atelier_app_runtime");
        await client.query(`SET LOCAL statement_timeout = '${statementTimeoutMs}ms'`);
        await client.query(
          "SELECT set_config('app.role', $1, true), set_config('app.user_id', $2, true), set_config('app.provider_id', $3, true)",
          [context.role, context.userId, context.providerId ?? ""]
        );
        if (context.role === "CATALOG_READER") {
          await client.query("SET LOCAL search_path = catalog, public");
        } else {
          await client.query("SET LOCAL search_path = public");
        }

        const transaction = Object.freeze({
          context,
          query(text, values = []) {
            return client.query(text, values);
          }
        });

        const result = await callback(transaction);
        await client.query("COMMIT");
        transactionStarted = false;
        return result;
      } catch (error) {
        if (transactionStarted) {
          try {
            await client.query("ROLLBACK");
          } catch (rollbackError) {
            logger.error("No se pudo revertir una transacción PostgreSQL.", rollbackError);
          }
        }
        throw error;
      } finally {
        client.release();
      }
    },

    async close() {
      await pool.end();
    }
  };
}

import { createHmac } from "node:crypto";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ORDER_PATTERN = /^[A-Z0-9][A-Z0-9-]{4,79}$/;
const GENERIC_MESSAGE = "Si los datos corresponden a un pedido, enviaremos un nuevo enlace privado al correo de compra.";

function normalizeEmail(value) {
  const email = typeof value === "string" ? value.trim().toLocaleLowerCase("es") : "";
  return EMAIL_PATTERN.test(email) && email.length <= 254 ? email : null;
}

function normalizeOrderNumber(value) {
  const orderNumber = typeof value === "string" ? value.trim().toUpperCase() : "";
  return ORDER_PATTERN.test(orderNumber) ? orderNumber : null;
}

function throttleKey(email, orderNumber, pepper) {
  return createHmac("sha256", pepper)
    .update(`customer-order-access:${email}:${orderNumber}`)
    .digest("hex");
}

async function acquireCooldown(transaction, keyHash, currentTime, cooldownSeconds) {
  const existing = await transaction.query(
    `SELECT locked_until
     FROM login_throttles
     WHERE key_hash = $1
     FOR UPDATE`,
    [keyHash]
  );
  const lockedUntil = existing.rows[0]?.locked_until;
  if (lockedUntil && new Date(lockedUntil).getTime() > currentTime.getTime()) return false;

  const nextAllowedAt = new Date(currentTime.getTime() + cooldownSeconds * 1000);
  await transaction.query(
    `INSERT INTO login_throttles
      (key_hash, failed_attempts, window_started_at, locked_until)
     VALUES ($1, 1, $2, $3)
     ON CONFLICT (key_hash) DO UPDATE
     SET failed_attempts = 1,
         window_started_at = EXCLUDED.window_started_at,
         locked_until = EXCLUDED.locked_until`,
    [keyHash, currentTime, nextAllowedAt]
  );
  return true;
}

async function findTarget(transaction, email, orderNumber) {
  const result = await transaction.query(
    `SELECT
       orders.checkout_id,
       orders.customer_user_id,
       checkout.contact_email,
       checkout.customer_name,
       ARRAY(
         SELECT sibling.order_number
         FROM provider_orders sibling
         WHERE sibling.checkout_id = orders.checkout_id
         ORDER BY sibling.created_at, sibling.id
       ) AS order_numbers
     FROM provider_orders orders
     INNER JOIN checkout_batches checkout
       ON checkout.id = orders.checkout_id
      AND checkout.customer_user_id = orders.customer_user_id
     INNER JOIN users customer ON customer.id = orders.customer_user_id
     WHERE lower(checkout.contact_email) = $1
       AND upper(orders.order_number) = $2
       AND customer.status = 'ACTIVE'
     LIMIT 1`,
    [email, orderNumber]
  );
  return result.rows[0] ?? null;
}

async function revokeIssuedAccess(database, context, accessId) {
  await database.withContext(context, (transaction) => transaction.query(
    `UPDATE customer_order_access_tokens
     SET revoked_at = COALESCE(revoked_at, now())
     WHERE id = $1 AND consumed_at IS NULL`,
    [accessId]
  ));
}

export function createCustomerAccessRecoveryService({
  database,
  systemContext,
  customerAuthService,
  mailService,
  loginPepper = process.env.AUTH_LOGIN_PEPPER,
  cooldownSeconds = Number.parseInt(process.env.CUSTOMER_ACCESS_RECOVERY_COOLDOWN_SECONDS ?? "300", 10),
  now = () => new Date(),
  logger = console
} = {}) {
  if (!database || typeof database.withContext !== "function") {
    throw new TypeError("La recuperación de pedidos necesita una base de datos.");
  }
  if (!systemContext || !["ADMIN", "AUTH_SERVICE"].includes(systemContext.role) || systemContext.providerId) {
    throw new TypeError("La recuperación de pedidos necesita un contexto interno de autenticación.");
  }
  if (!customerAuthService || typeof customerAuthService.issueAccess !== "function") {
    throw new TypeError("La recuperación de pedidos necesita el servicio de acceso privado.");
  }
  if (!mailService || typeof mailService.sendCustomerOrderAccess !== "function") {
    throw new TypeError("La recuperación de pedidos necesita correo transaccional.");
  }
  if (typeof loginPepper !== "string" || loginPepper.length < 32) {
    throw new TypeError("AUTH_LOGIN_PEPPER debe tener al menos 32 caracteres.");
  }
  if (!Number.isInteger(cooldownSeconds) || cooldownSeconds < 60 || cooldownSeconds > 3600) {
    throw new TypeError("CUSTOMER_ACCESS_RECOVERY_COOLDOWN_SECONDS debe estar entre 60 y 3600.");
  }

  return Object.freeze({
    async requestAccess({ email: rawEmail, orderNumber: rawOrderNumber } = {}) {
      const email = normalizeEmail(rawEmail);
      const orderNumber = normalizeOrderNumber(rawOrderNumber);
      if (!email || !orderNumber) return { accepted: true, message: GENERIC_MESSAGE };

      const currentTime = now();
      const lookup = await database.withContext(systemContext, async (transaction) => {
        const target = await findTarget(transaction, email, orderNumber);
        if (!target) return null;
        const allowed = await acquireCooldown(
          transaction,
          throttleKey(email, orderNumber, loginPepper),
          currentTime,
          cooldownSeconds
        );
        return allowed ? target : null;
      });

      if (lookup && mailService.enabled) {
        const issued = await customerAuthService.issueAccess({
          customerUserId: lookup.customer_user_id,
          checkoutId: lookup.checkout_id
        });
        try {
          const delivery = await mailService.sendCustomerOrderAccess({
            to: lookup.contact_email,
            displayName: lookup.customer_name,
            token: issued.accessToken,
            expiresAt: issued.expiresAt,
            orderNumbers: Array.isArray(lookup.order_numbers) ? lookup.order_numbers : [orderNumber]
          });
          if (delivery?.status !== "SENT") {
            await revokeIssuedAccess(database, systemContext, issued.accessId);
          }
        } catch (error) {
          await revokeIssuedAccess(database, systemContext, issued.accessId);
          logger.error("No se pudo entregar el nuevo acceso privado del cliente.", {
            checkoutId: lookup.checkout_id,
            errorCode: typeof error?.code === "string" ? error.code : "SMTP_DELIVERY_FAILED"
          });
        }
      }

      return { accepted: true, message: GENERIC_MESSAGE };
    }
  });
}

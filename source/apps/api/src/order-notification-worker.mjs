const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_INTERVAL_MS = 30000;
const DEFAULT_MAX_ATTEMPTS = 5;

function positiveInteger(value, fallback, { min, max, field }) {
  const parsed = Number.parseInt(value ?? String(fallback), 10);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new TypeError(`${field} debe estar entre ${min} y ${max}.`);
  }
  return parsed;
}

function errorCode(error) {
  const value = typeof error?.code === "string" ? error.code.trim() : "SMTP_DELIVERY_FAILED";
  return value.slice(0, 120) || "SMTP_DELIVERY_FAILED";
}

export function createOrderNotificationWorker({
  database,
  systemContext,
  mailService,
  enabled = false,
  intervalMs = process.env.ORDER_EMAIL_INTERVAL_MS,
  batchSize = process.env.ORDER_EMAIL_BATCH_SIZE,
  maxAttempts = process.env.ORDER_EMAIL_MAX_ATTEMPTS,
  logger = console
} = {}) {
  if (!database || typeof database.withContext !== "function") {
    throw new TypeError("createOrderNotificationWorker necesita una base de datos.");
  }
  if (!systemContext || systemContext.role !== "NOTIFICATION_SERVICE") {
    throw new TypeError("El trabajador necesita el contexto NOTIFICATION_SERVICE.");
  }

  const active = Boolean(enabled && mailService?.enabled);
  const pollInterval = positiveInteger(intervalMs, DEFAULT_INTERVAL_MS, {
    min: 5000,
    max: 3600000,
    field: "ORDER_EMAIL_INTERVAL_MS"
  });
  const limit = positiveInteger(batchSize, DEFAULT_BATCH_SIZE, {
    min: 1,
    max: 50,
    field: "ORDER_EMAIL_BATCH_SIZE"
  });
  const attemptsLimit = positiveInteger(maxAttempts, DEFAULT_MAX_ATTEMPTS, {
    min: 1,
    max: 20,
    field: "ORDER_EMAIL_MAX_ATTEMPTS"
  });

  let timer = null;
  let running = false;
  let stopped = false;

  async function claimBatch() {
    return database.withContext(systemContext, async (transaction) => {
      const result = await transaction.query(
        `WITH candidates AS (
           SELECT id
           FROM order_notifications
           WHERE channel = 'EMAIL'
             AND status = 'PENDING'
             AND available_at <= now()
           ORDER BY available_at, id
           FOR UPDATE SKIP LOCKED
           LIMIT $1
         )
         UPDATE order_notifications notification
         SET attempts = notification.attempts + 1,
             available_at = now() + interval '5 minutes'
         FROM candidates
         WHERE notification.id = candidates.id
         RETURNING notification.id, notification.attempts`,
        [limit]
      );
      return result.rows;
    });
  }

  async function loadDelivery(notificationId) {
    return database.withContext(systemContext, async (transaction) => {
      const result = await transaction.query(
        `SELECT
           notification.id,
           notification.attempts,
           notification.event_type,
           notification.template_key,
           notification.recipient_user_id,
           notification.payload,
           order_row.id AS order_id,
           order_row.order_number,
           order_row.customer_user_id,
           provider.display_name AS provider_name,
           COALESCE(direct_recipient.email, provider_owner.email) AS recipient_email,
           COALESCE(direct_recipient.display_name, provider_owner.display_name) AS recipient_name,
           CASE
             WHEN notification.recipient_user_id IS NULL THEN 'PROVIDER'
             ELSE 'CUSTOMER'
           END AS recipient_kind
         FROM order_notifications notification
         INNER JOIN provider_orders order_row ON order_row.id = notification.order_id
         INNER JOIN providers provider ON provider.id = notification.provider_id
         LEFT JOIN users direct_recipient ON direct_recipient.id = notification.recipient_user_id
         LEFT JOIN LATERAL (
           SELECT owner_user.email, owner_user.display_name
           FROM provider_members membership
           INNER JOIN users owner_user ON owner_user.id = membership.user_id
           WHERE membership.provider_id = notification.provider_id
             AND membership.role = 'PROVIDER_OWNER'
             AND membership.status = 'ACTIVE'
             AND owner_user.status = 'ACTIVE'
           ORDER BY membership.created_at, membership.id
           LIMIT 1
         ) provider_owner ON notification.recipient_user_id IS NULL
         WHERE notification.id = $1
           AND notification.channel = 'EMAIL'`,
        [notificationId]
      );
      return result.rows[0] ?? null;
    });
  }

  async function markSent(notificationId, messageId) {
    await database.withContext(systemContext, async (transaction) => {
      await transaction.query(
        `UPDATE order_notifications
         SET status = 'SENT', sent_at = now(), message_id = $2, last_error = NULL
         WHERE id = $1 AND channel = 'EMAIL'`,
        [notificationId, messageId ?? null]
      );
    });
  }

  async function markFailure(notificationId, attempts, code) {
    const exhausted = attempts >= attemptsLimit;
    const delaySeconds = Math.min(3600, 30 * (2 ** Math.max(0, attempts - 1)));
    await database.withContext(systemContext, async (transaction) => {
      await transaction.query(
        `UPDATE order_notifications
         SET status = $2,
             last_error = $3,
             available_at = CASE
               WHEN $2 = 'PENDING' THEN now() + ($4 * interval '1 second')
               ELSE available_at
             END
         WHERE id = $1 AND channel = 'EMAIL'`,
        [notificationId, exhausted ? "FAILED" : "PENDING", code, delaySeconds]
      );
    });
  }

  async function deliverClaim(claim) {
    const delivery = await loadDelivery(claim.id);
    if (!delivery?.recipient_email || !delivery?.recipient_name) {
      await markFailure(claim.id, claim.attempts, "RECIPIENT_NOT_AVAILABLE");
      return { id: claim.id, status: "FAILED", errorCode: "RECIPIENT_NOT_AVAILABLE" };
    }

    try {
      const result = await mailService.sendOrderNotification({
        to: delivery.recipient_email,
        recipientName: delivery.recipient_name,
        recipientKind: delivery.recipient_kind,
        providerName: delivery.provider_name,
        orderNumber: delivery.order_number,
        orderId: delivery.order_id,
        eventType: delivery.event_type,
        notificationId: delivery.id
      });
      if (result.status !== "SENT") {
        throw Object.assign(new Error("El transporte no confirmó el envío."), {
          code: result.status === "DISABLED" ? "SMTP_DISABLED" : "SMTP_DELIVERY_FAILED"
        });
      }
      await markSent(claim.id, result.messageId);
      return { id: claim.id, status: "SENT" };
    } catch (error) {
      const code = errorCode(error);
      await markFailure(claim.id, claim.attempts, code);
      logger.error("No se pudo entregar un aviso de pedido.", {
        notificationId: claim.id,
        orderId: delivery.order_id,
        eventType: delivery.event_type,
        errorCode: code
      });
      return { id: claim.id, status: claim.attempts >= attemptsLimit ? "FAILED" : "PENDING", errorCode: code };
    }
  }

  async function runOnce() {
    if (!active || stopped || running) return [];
    running = true;
    try {
      const claims = await claimBatch();
      const results = [];
      for (const claim of claims) results.push(await deliverClaim(claim));
      return results;
    } finally {
      running = false;
    }
  }

  function start() {
    if (!active || timer || stopped) return false;
    void runOnce().catch((error) => {
      logger.error("Falló el ciclo de avisos de pedido.", { errorCode: errorCode(error) });
    });
    timer = setInterval(() => {
      void runOnce().catch((error) => {
        logger.error("Falló el ciclo de avisos de pedido.", { errorCode: errorCode(error) });
      });
    }, pollInterval);
    if (typeof timer.unref === "function") timer.unref();
    return true;
  }

  async function stop() {
    stopped = true;
    if (timer) clearInterval(timer);
    timer = null;
    while (running) await new Promise((resolve) => setTimeout(resolve, 10));
  }

  return Object.freeze({
    enabled: active,
    runOnce,
    start,
    stop
  });
}

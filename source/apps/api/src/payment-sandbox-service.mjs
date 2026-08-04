import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { ServiceError } from "./providers-service.mjs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,180}$/;
const EVENT_TYPES = new Set([
  "payment.authorized",
  "payment.captured",
  "payment.failed",
  "payment.cancelled",
  "payment.refunded"
]);
const TERMINAL_STATUSES = new Set(["CAPTURED", "FAILED", "CANCELLED", "REFUNDED", "EXPIRED"]);

function uuid(value, field) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new ServiceError("VALIDATION_ERROR", `${field} no es válido.`, 422, { field });
  }
  return value.toLowerCase();
}

function text(value, field, minimum, maximum) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (normalized.length < minimum || normalized.length > maximum) {
    throw new ServiceError("VALIDATION_ERROR", `${field} no es válido.`, 422, { field });
  }
  return normalized;
}

function amount(value) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 100000000) {
    throw new ServiceError("PAYMENT_AMOUNT_INVALID", "El importe del pago no es válido.", 422);
  }
  return parsed;
}

function currency(value) {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new ServiceError("PAYMENT_CURRENCY_INVALID", "La moneda del pago no es válida.", 422);
  }
  return normalized;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function secureEquals(left, right) {
  const a = Buffer.from(left ?? "", "utf8");
  const b = Buffer.from(right ?? "", "utf8");
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

function canonicalEvent(input) {
  return JSON.stringify({
    eventId: input.eventId,
    eventType: input.eventType,
    providerReference: input.providerReference,
    amountCents: input.amountCents,
    currency: input.currency,
    failureCode: input.failureCode ?? null
  });
}

function paymentContext(context) {
  if (
    !context
    || context.role !== "PAYMENT_SERVICE"
    || !UUID_PATTERN.test(context.userId ?? "")
    || context.providerId
  ) {
    throw new TypeError("El sandbox necesita un contexto PAYMENT_SERVICE sin taller.");
  }
  return context;
}

function sessionToken(secret, checkoutId) {
  return createHmac("sha256", secret).update(`sandbox-payment:${checkoutId}`).digest("base64url");
}

function providerReference(paymentId) {
  return `AL-SANDBOX-${paymentId.replaceAll("-", "").slice(0, 16).toUpperCase()}`;
}

function serialize(row) {
  return {
    id: row.id,
    checkoutId: row.checkout_id,
    orderId: row.order_id,
    orderNumber: row.order_number,
    provider: {
      id: row.provider_id,
      displayName: row.provider_display_name
    },
    providerReference: row.provider_reference,
    amountCents: row.amount_cents,
    currency: row.currency,
    status: row.status,
    expiresAt: row.expires_at,
    version: row.version
  };
}

async function paymentByToken(transaction, token, { lock = false } = {}) {
  const result = await transaction.query(
    `SELECT payment.*, orders.order_number,
            provider.display_name AS provider_display_name
     FROM payment_attempts payment
     INNER JOIN provider_orders orders ON orders.id = payment.order_id
     INNER JOIN providers provider ON provider.id = payment.provider_id
     WHERE payment.session_token_hash = $1
     ${lock ? "FOR UPDATE OF payment" : ""}`,
    [sha256(token)]
  );
  return result.rows[0] ?? null;
}

function transition(status, eventType) {
  if (eventType === "payment.authorized") {
    return ["CREATED", "PENDING"].includes(status) ? "AUTHORIZED" : null;
  }
  if (eventType === "payment.captured") {
    return ["CREATED", "PENDING", "AUTHORIZED"].includes(status) ? "CAPTURED" : null;
  }
  if (eventType === "payment.failed") {
    return ["CREATED", "PENDING", "AUTHORIZED"].includes(status) ? "FAILED" : null;
  }
  if (eventType === "payment.cancelled") {
    return ["CREATED", "PENDING", "AUTHORIZED"].includes(status) ? "CANCELLED" : null;
  }
  if (eventType === "payment.refunded") return status === "CAPTURED" ? "REFUNDED" : null;
  return null;
}

function eventName(status) {
  return `PAYMENT_${status}`;
}

async function recordBusinessEvent(transaction, context, payment, status, eventId) {
  await transaction.query(
    `INSERT INTO order_events (
       order_id, provider_id, customer_user_id,
       actor_user_id, actor_role, event_type, message, metadata
     ) VALUES ($1,$2,$3,$4,'SYSTEM',$5,$6,$7::jsonb)`,
    [
      payment.order_id,
      payment.provider_id,
      payment.customer_user_id,
      context.userId,
      eventName(status),
      status === "CAPTURED"
        ? "Pago sandbox confirmado. No representa un cobro real."
        : `El pago sandbox cambió a ${status}.`,
      JSON.stringify({
        paymentId: payment.id,
        providerReference: payment.provider_reference,
        eventId,
        sandbox: true
      })
    ]
  );
  await transaction.query(
    `INSERT INTO audit_events (
       actor_user_id, provider_id, action, entity_type, entity_id, metadata
     ) VALUES ($1,$2,$3,'payment_attempt',$4,$5::jsonb)`,
    [
      context.userId,
      payment.provider_id,
      eventName(status),
      payment.id,
      JSON.stringify({
        checkoutId: payment.checkout_id,
        orderId: payment.order_id,
        providerReference: payment.provider_reference,
        eventId,
        amountCents: payment.amount_cents,
        currency: payment.currency,
        sandbox: true
      })
    ]
  );
}

export function createPaymentSandboxService({
  database,
  systemContext,
  enabled = process.env.PAYMENT_SANDBOX_ENABLED === "true",
  environment = process.env.NODE_ENV ?? "development",
  pilotModeEnabled = process.env.PILOT_MODE_ENABLED === "true",
  sessionSecret = process.env.PAYMENT_SANDBOX_SESSION_SECRET,
  ttlMinutes = Number.parseInt(process.env.PAYMENT_SANDBOX_TTL_MINUTES ?? "30", 10),
  now = () => new Date()
} = {}) {
  if (!database || typeof database.withContext !== "function") {
    throw new TypeError("createPaymentSandboxService necesita una base de datos.");
  }
  const context = paymentContext(systemContext);
  if (typeof sessionSecret !== "string" || sessionSecret.length < 32) {
    throw new TypeError("PAYMENT_SANDBOX_SESSION_SECRET debe tener al menos 32 caracteres.");
  }
  if (!Number.isInteger(ttlMinutes) || ttlMinutes < 5 || ttlMinutes > 120) {
    throw new TypeError("PAYMENT_SANDBOX_TTL_MINUTES debe estar entre 5 y 120.");
  }
  const active = Boolean(enabled)
    && (environment !== "production" || Boolean(pilotModeEnabled));

  async function processWebhook(rawInput = {}) {
    if (!active) {
      throw new ServiceError(
        "PAYMENT_SANDBOX_DISABLED",
        "El pago sandbox no está activado.",
        503
      );
    }
    const input = {
      eventId: text(rawInput.eventId, "eventId", 8, 180),
      eventType: text(rawInput.eventType, "eventType", 8, 80),
      providerReference: text(rawInput.providerReference, "providerReference", 10, 80),
      amountCents: amount(rawInput.amountCents),
      currency: currency(rawInput.currency),
      failureCode: rawInput.failureCode
        ? text(rawInput.failureCode, "failureCode", 2, 120)
        : null
    };
    if (!EVENT_TYPES.has(input.eventType)) {
      throw new ServiceError("PAYMENT_EVENT_INVALID", "El tipo de evento no es válido.", 422);
    }
    const payloadHash = sha256(canonicalEvent(input));

    const result = await database.withContext(context, async (transaction) => {
      const inserted = await transaction.query(
        `INSERT INTO payment_webhook_events (
           payment_provider, event_id, event_type, payload_hash
         ) VALUES ('SANDBOX',$1,$2,$3)
         ON CONFLICT (payment_provider, event_id) DO NOTHING
         RETURNING id`,
        [input.eventId, input.eventType, payloadHash]
      );
      if (inserted.rowCount !== 1) {
        const existing = await transaction.query(
          `SELECT payload_hash, status, payment_id
           FROM payment_webhook_events
           WHERE payment_provider='SANDBOX' AND event_id=$1`,
          [input.eventId]
        );
        if (existing.rowCount !== 1 || existing.rows[0].payload_hash !== payloadHash) {
          return { conflict: true };
        }
        return {
          reused: true,
          eventStatus: existing.rows[0].status,
          paymentId: existing.rows[0].payment_id
        };
      }

      const paymentResult = await transaction.query(
        `SELECT * FROM payment_attempts
         WHERE payment_provider='SANDBOX' AND provider_reference=$1
         FOR UPDATE`,
        [input.providerReference]
      );
      if (paymentResult.rowCount !== 1) {
        await transaction.query(
          `UPDATE payment_webhook_events
           SET status='REJECTED', failure_reason='PAYMENT_NOT_FOUND', processed_at=$2
           WHERE id=$1`,
          [inserted.rows[0].id, now()]
        );
        return { rejected: true, code: "PAYMENT_NOT_FOUND" };
      }
      const payment = paymentResult.rows[0];
      if (payment.amount_cents !== input.amountCents || payment.currency !== input.currency) {
        await transaction.query(
          `UPDATE payment_webhook_events
           SET payment_id=$2, status='REJECTED',
               failure_reason='PAYMENT_AMOUNT_MISMATCH', processed_at=$3
           WHERE id=$1`,
          [inserted.rows[0].id, payment.id, now()]
        );
        return { rejected: true, code: "PAYMENT_AMOUNT_MISMATCH" };
      }

      const nextStatus = transition(payment.status, input.eventType);
      if (!nextStatus) {
        await transaction.query(
          `UPDATE payment_webhook_events
           SET payment_id=$2, status='IGNORED', processed_at=$3
           WHERE id=$1`,
          [inserted.rows[0].id, payment.id, now()]
        );
        return { ignored: true, paymentId: payment.id, paymentStatus: payment.status };
      }

      const currentTime = now();
      const updated = await transaction.query(
        `UPDATE payment_attempts
         SET status=$2,
             last_event_id=$3,
             failure_code=CASE WHEN $2='FAILED' THEN $4 ELSE NULL END,
             failure_message=CASE WHEN $2='FAILED' THEN 'Pago sandbox rechazado de forma simulada.' ELSE NULL END,
             authorized_at=CASE WHEN $2='AUTHORIZED' THEN $5 ELSE authorized_at END,
             captured_at=CASE WHEN $2='CAPTURED' THEN $5 ELSE captured_at END,
             failed_at=CASE WHEN $2='FAILED' THEN $5 ELSE failed_at END,
             cancelled_at=CASE WHEN $2='CANCELLED' THEN $5 ELSE cancelled_at END,
             refunded_at=CASE WHEN $2='REFUNDED' THEN $5 ELSE refunded_at END,
             version=version+1
         WHERE id=$1
         RETURNING *`,
        [payment.id, nextStatus, input.eventId, input.failureCode ?? "SANDBOX_DECLINED", currentTime]
      );
      await transaction.query(
        `UPDATE payment_webhook_events
         SET payment_id=$2, status='PROCESSED', processed_at=$3
         WHERE id=$1`,
        [inserted.rows[0].id, payment.id, currentTime]
      );
      await recordBusinessEvent(transaction, context, updated.rows[0], nextStatus, input.eventId);
      return {
        processed: true,
        paymentId: payment.id,
        paymentStatus: nextStatus,
        eventStatus: "PROCESSED"
      };
    });

    if (result.conflict) {
      throw new ServiceError(
        "PAYMENT_WEBHOOK_IDEMPOTENCY_CONFLICT",
        "El identificador del evento ya se utilizó con otro contenido.",
        409
      );
    }
    if (result.rejected) {
      throw new ServiceError(result.code, "El evento de pago no coincide con el intento registrado.", 409);
    }
    return result;
  }

  return Object.freeze({
    enabled: active,

    async createForCheckout(checkoutIdValue) {
      if (!active) return null;
      const checkoutId = uuid(checkoutIdValue, "checkoutId");
      const token = sessionToken(sessionSecret, checkoutId);
      const currentTime = now();
      const expiresAt = new Date(currentTime.getTime() + ttlMinutes * 60 * 1000);

      const row = await database.withContext(context, async (transaction) => {
        const checkout = await transaction.query(
          `SELECT checkout.id, checkout.customer_user_id, checkout.status AS checkout_status,
                  orders.id AS order_id, orders.provider_id, orders.total_cents,
                  orders.currency, orders.order_number,
                  provider.display_name AS provider_display_name
           FROM checkout_batches checkout
           INNER JOIN provider_orders orders ON orders.checkout_id=checkout.id
           INNER JOIN providers provider ON provider.id=orders.provider_id
           WHERE checkout.id=$1`,
          [checkoutId]
        );
        if (checkout.rowCount !== 1 || checkout.rows[0].checkout_status !== "SUBMITTED") {
          throw new ServiceError(
            "PAYMENT_CHECKOUT_UNAVAILABLE",
            "El pedido no está preparado para iniciar el pago sandbox.",
            409
          );
        }
        const source = checkout.rows[0];
        const paymentId = randomUUID();
        await transaction.query(
          `INSERT INTO payment_attempts (
             id, checkout_id, order_id, provider_id, customer_user_id,
             provider_reference, session_token_hash, idempotency_key,
             status, amount_cents, currency, expires_at, created_at
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$2,'CREATED',$8,$9,$10,$11)
           ON CONFLICT (checkout_id) DO NOTHING`,
          [
            paymentId,
            checkoutId,
            source.order_id,
            source.provider_id,
            source.customer_user_id,
            providerReference(paymentId),
            sha256(token),
            source.total_cents,
            source.currency,
            expiresAt,
            currentTime
          ]
        );
        const payment = await transaction.query(
          `SELECT payment.*, orders.order_number,
                  provider.display_name AS provider_display_name
           FROM payment_attempts payment
           INNER JOIN provider_orders orders ON orders.id=payment.order_id
           INNER JOIN providers provider ON provider.id=payment.provider_id
           WHERE payment.checkout_id=$1`,
          [checkoutId]
        );
        if (payment.rowCount !== 1) {
          throw new ServiceError("PAYMENT_INCONSISTENT", "No se pudo preparar el pago sandbox.", 500);
        }
        return payment.rows[0];
      });

      return {
        ...serialize(row),
        mode: "SANDBOX",
        sessionPath: `/pago/sandbox/?token=${encodeURIComponent(token)}`
      };
    },

    async begin(tokenValue) {
      if (!active) {
        throw new ServiceError("PAYMENT_SANDBOX_DISABLED", "El pago sandbox no está activado.", 503);
      }
      const token = typeof tokenValue === "string" ? tokenValue.trim() : "";
      if (!TOKEN_PATTERN.test(token)) {
        throw new ServiceError("PAYMENT_SESSION_UNAVAILABLE", "La sesión de pago no es válida.", 410);
      }
      const currentTime = now();
      const row = await database.withContext(context, async (transaction) => {
        const payment = await paymentByToken(transaction, token, { lock: true });
        if (!payment) return null;
        if (
          new Date(payment.expires_at).getTime() <= currentTime.getTime()
          && ["CREATED", "PENDING", "AUTHORIZED"].includes(payment.status)
        ) {
          await transaction.query(
            `UPDATE payment_attempts
             SET status='EXPIRED', version=version+1
             WHERE id=$1`,
            [payment.id]
          );
          payment.status = "EXPIRED";
          payment.version += 1;
        }
        return payment;
      });
      if (!row) {
        throw new ServiceError("PAYMENT_SESSION_UNAVAILABLE", "La sesión de pago no es válida.", 410);
      }
      return { ...serialize(row), mode: "SANDBOX", paymentCollected: false };
    },

    async simulate(tokenValue, outcomeValue) {
      const payment = await this.begin(tokenValue);
      if (TERMINAL_STATUSES.has(payment.status)) {
        return { ...payment, reused: true };
      }
      const outcome = outcomeValue === "success" ? "success" : outcomeValue === "failure" ? "failure" : null;
      if (!outcome) {
        throw new ServiceError("PAYMENT_OUTCOME_INVALID", "El resultado simulado no es válido.", 422);
      }
      const result = await processWebhook({
        eventId: `sandbox-${outcome}-${randomUUID()}`,
        eventType: outcome === "success" ? "payment.captured" : "payment.failed",
        providerReference: payment.providerReference,
        amountCents: payment.amountCents,
        currency: payment.currency,
        ...(outcome === "failure" ? { failureCode: "SANDBOX_DECLINED" } : {})
      });
      const current = await this.begin(tokenValue);
      return { ...current, event: result, paymentCollected: false };
    },

    processWebhook
  });
}

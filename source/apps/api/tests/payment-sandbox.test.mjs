import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createDatabase } from "../src/database.mjs";
import { createPaymentSandboxService } from "../src/payment-sandbox-service.mjs";

const connectionString = process.env.DATABASE_URL;
const ADMIN = {
  role: "ADMIN",
  userId: "00000000-0000-4000-8000-000000000001",
  providerId: null
};
const PAYMENT = {
  role: "PAYMENT_SERVICE",
  userId: "00000000-0000-4000-8000-000000000009",
  providerId: null
};
const PROVIDER_ID = "00000000-0000-4000-8000-000000000201";
const SESSION_SECRET = "payment-sandbox-session-secret-with-more-than-32-characters";
const FIXED_TIME = new Date(Date.now() + 60 * 60 * 1000);

function address() {
  return {
    line1: "Calle Sandbox 9",
    city: "Granada",
    postalCode: "18001",
    country: "ES"
  };
}

async function createOrder(database, suffix, totalCents = 5500) {
  const customerId = randomUUID();
  const checkoutId = randomUUID();
  const orderId = randomUUID();
  const email = `sandbox-${suffix.toLowerCase()}@example.test`;
  await database.withContext(ADMIN, async (transaction) => {
    await transaction.query(
      `INSERT INTO users
        (id,email,display_name,status,email_verified_at,two_factor_enabled)
       VALUES ($1,$2,'Cliente Sandbox','ACTIVE',now(),false)`,
      [customerId, email]
    );
    await transaction.query(
      `INSERT INTO checkout_batches (
         id,customer_user_id,checkout_reference,currency,customer_name,
         contact_email,shipping_address,status,submitted_at
       ) VALUES ($1,$2,$3,'EUR','Cliente Sandbox',$4,$5::jsonb,'SUBMITTED',now())`,
      [checkoutId, customerId, `AL-SANDBOX-CHECKOUT-${suffix}`, email, JSON.stringify(address())]
    );
    await transaction.query(
      `INSERT INTO provider_orders (
         id,checkout_id,provider_id,customer_user_id,order_number,status,
         currency,subtotal_cents,shipping_cents,total_cents,
         preparation_min_days,preparation_max_days,customer_name,
         contact_email,shipping_address
       ) VALUES (
         $1,$2,$3,$4,$5,'PENDING_CONFIRMATION','EUR',$6,500,$7,
         3,8,'Cliente Sandbox',$8,$9::jsonb
       )`,
      [
        orderId,
        checkoutId,
        PROVIDER_ID,
        customerId,
        `AL-SANDBOX-ORDER-${suffix}`,
        totalCents - 500,
        totalCents,
        email,
        JSON.stringify(address())
      ]
    );
  });
  return { customerId, checkoutId, orderId, email, totalCents };
}

test("el sandbox registra un único cobro lógico y webhooks idempotentes", { skip: !connectionString }, async (t) => {
  const database = createDatabase({
    connectionString,
    maxConnections: 5,
    statementTimeoutMs: 5000,
    logger: { error() {} }
  });
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
  const order = await createOrder(database, suffix);
  const service = createPaymentSandboxService({
    database,
    systemContext: PAYMENT,
    enabled: true,
    environment: "development",
    sessionSecret: SESSION_SECRET,
    ttlMinutes: 30,
    now: () => new Date(FIXED_TIME)
  });

  t.after(async () => {
    await database.withContext(ADMIN, async (transaction) => {
      await transaction.query("DELETE FROM audit_events WHERE entity_id IN (SELECT id FROM payment_attempts WHERE checkout_id=$1)", [order.checkoutId]);
      await transaction.query("DELETE FROM users WHERE id=$1", [order.customerId]);
    });
    await database.close();
  });

  const created = await service.createForCheckout(order.checkoutId);
  assert.equal(created.mode, "SANDBOX");
  assert.equal(created.status, "CREATED");
  assert.equal(created.amountCents, order.totalCents);
  assert.equal(created.currency, "EUR");
  assert.match(created.providerReference, /^AL-SANDBOX-[A-Z0-9]{16}$/);
  assert.match(created.sessionPath, /^\/pago\/sandbox\/\?token=/);

  const repeatedCreation = await service.createForCheckout(order.checkoutId);
  assert.equal(repeatedCreation.id, created.id);
  assert.equal(repeatedCreation.sessionPath, created.sessionPath);

  const token = new URL(created.sessionPath, "http://localhost").searchParams.get("token");
  assert.match(token, /^[A-Za-z0-9_-]{32,180}$/);
  const opened = await service.begin(token);
  assert.equal(opened.orderId, order.orderId);
  assert.equal(opened.paymentCollected, false);

  const event = {
    eventId: `evt-${suffix}`,
    eventType: "payment.captured",
    providerReference: created.providerReference,
    amountCents: order.totalCents,
    currency: "EUR"
  };
  const first = await service.processWebhook(event);
  assert.equal(first.processed, true);
  assert.equal(first.paymentStatus, "CAPTURED");

  const duplicate = await service.processWebhook(event);
  assert.equal(duplicate.reused, true);
  assert.equal(duplicate.eventStatus, "PROCESSED");

  await assert.rejects(
    () => service.processWebhook({ ...event, amountCents: order.totalCents + 1 }),
    (error) => error?.code === "PAYMENT_WEBHOOK_IDEMPOTENCY_CONFLICT" && error?.statusCode === 409
  );

  const completed = await service.begin(token);
  assert.equal(completed.status, "CAPTURED");
  const terminal = await service.simulate(token, "success");
  assert.equal(terminal.status, "CAPTURED");
  assert.equal(terminal.reused, true);

  await database.withContext(ADMIN, async (transaction) => {
    const state = await transaction.query(
      `SELECT
         payment.status, payment.session_token_hash,
         (SELECT count(*)::integer FROM payment_webhook_events WHERE payment_id=payment.id) AS events,
         (SELECT count(*)::integer FROM order_events WHERE order_id=payment.order_id AND event_type='PAYMENT_CAPTURED') AS order_events,
         (SELECT count(*)::integer FROM audit_events WHERE entity_id=payment.id AND action='PAYMENT_CAPTURED') AS audits
       FROM payment_attempts payment
       WHERE payment.checkout_id=$1`,
      [order.checkoutId]
    );
    assert.equal(state.rows[0].status, "CAPTURED");
    assert.match(state.rows[0].session_token_hash, /^[a-f0-9]{64}$/);
    assert.notEqual(state.rows[0].session_token_hash, token);
    assert.equal(state.rows[0].events, 1);
    assert.equal(state.rows[0].order_events, 1);
    assert.equal(state.rows[0].audits, 1);

    const serialized = JSON.stringify(await transaction.query(
      "SELECT metadata::text FROM audit_events WHERE entity_id=(SELECT id FROM payment_attempts WHERE checkout_id=$1)",
      [order.checkoutId]
    ));
    assert.equal(serialized.includes(token), false);
    assert.equal(serialized.toLowerCase().includes("card"), false);
  });
});

test("el sandbox puede simular un rechazo sin afectar a otro checkout", { skip: !connectionString }, async (t) => {
  const database = createDatabase({
    connectionString,
    maxConnections: 4,
    statementTimeoutMs: 5000,
    logger: { error() {} }
  });
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
  const order = await createOrder(database, suffix, 3600);
  const service = createPaymentSandboxService({
    database,
    systemContext: PAYMENT,
    enabled: true,
    environment: "development",
    sessionSecret: SESSION_SECRET,
    now: () => new Date(FIXED_TIME)
  });

  t.after(async () => {
    await database.withContext(ADMIN, async (transaction) => {
      await transaction.query("DELETE FROM audit_events WHERE entity_id IN (SELECT id FROM payment_attempts WHERE checkout_id=$1)", [order.checkoutId]);
      await transaction.query("DELETE FROM users WHERE id=$1", [order.customerId]);
    });
    await database.close();
  });

  const created = await service.createForCheckout(order.checkoutId);
  const token = new URL(created.sessionPath, "http://localhost").searchParams.get("token");
  const failed = await service.simulate(token, "failure");
  assert.equal(failed.status, "FAILED");
  assert.equal(failed.paymentCollected, false);

  const production = createPaymentSandboxService({
    database,
    systemContext: PAYMENT,
    enabled: true,
    environment: "production",
    sessionSecret: SESSION_SECRET
  });
  assert.equal(production.enabled, false);
  await assert.rejects(
    () => production.begin(token),
    (error) => error?.code === "PAYMENT_SANDBOX_DISABLED"
  );
});

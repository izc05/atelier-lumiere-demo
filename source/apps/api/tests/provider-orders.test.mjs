import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createDatabase } from "../src/database.mjs";
import { createProviderOrdersService } from "../src/provider-orders-service.mjs";

const connectionString = process.env.DATABASE_URL;
const ADMIN = {
  role: "ADMIN",
  userId: "00000000-0000-4000-8000-000000000001",
  providerId: null
};
const PROVIDER_A = "00000000-0000-4000-8000-000000000201";
const PROVIDER_B = "00000000-0000-4000-8000-000000000202";
const PROVIDER_A_CONTEXT = {
  role: "PROVIDER_OWNER",
  userId: "00000000-0000-4000-8000-000000000101",
  providerId: PROVIDER_A
};
const PROVIDER_B_CONTEXT = {
  role: "PROVIDER_OWNER",
  userId: "00000000-0000-4000-8000-000000000102",
  providerId: PROVIDER_B
};

function address() {
  return {
    line1: "Calle de integración 7",
    city: "Granada",
    postalCode: "18001",
    country: "ES"
  };
}

test("cada taller gestiona únicamente sus pedidos y encargos", { skip: !connectionString }, async (t) => {
  const database = createDatabase({
    connectionString,
    maxConnections: 5,
    statementTimeoutMs: 5000,
    logger: { error() {} }
  });
  t.after(() => database.close());

  const suffix = randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
  const customerId = randomUUID();
  const customerEmail = `cliente-${suffix.toLowerCase()}@example.test`;
  const checkoutAId = randomUUID();
  const checkoutBId = randomUUID();
  const orderAId = randomUUID();
  const orderBId = randomUUID();
  const itemAId = randomUUID();
  const itemBId = randomUUID();
  const requestAId = randomUUID();

  await database.withContext(ADMIN, async (transaction) => {
    await transaction.query(
      `INSERT INTO users (
         id, email, display_name, status, email_verified_at, two_factor_enabled
       ) VALUES ($1, $2, 'Cliente integración', 'ACTIVE', now(), false)`,
      [customerId, customerEmail]
    );

    const insertCheckout = `INSERT INTO checkout_batches (
      id, customer_user_id, checkout_reference, currency,
      customer_name, contact_email, contact_phone, shipping_address,
      status, submitted_at
    ) VALUES ($1, $2, $3, 'EUR', $4, $5, $6, $7::jsonb, 'SUBMITTED', now())`;

    await transaction.query(insertCheckout, [
      checkoutAId,
      customerId,
      `AL-CHECKOUT-A-${suffix}`,
      "Cliente integración",
      customerEmail,
      "+34000000000",
      JSON.stringify(address())
    ]);
    await transaction.query(insertCheckout, [
      checkoutBId,
      customerId,
      `AL-CHECKOUT-B-${suffix}`,
      "Cliente integración",
      customerEmail,
      "+34000000000",
      JSON.stringify(address())
    ]);

    const insertOrder = `INSERT INTO provider_orders (
      id, checkout_id, provider_id, customer_user_id, order_number,
      status, currency, subtotal_cents, shipping_cents, total_cents,
      preparation_min_days, preparation_max_days, customer_note,
      customer_name, contact_email, contact_phone, shipping_address
    ) VALUES (
      $1, $2, $3, $4, $5,
      'PENDING_CONFIRMATION', 'EUR', $6, $7, $8,
      $9, $10, $11,
      $12, $13, $14, $15::jsonb
    )`;

    await transaction.query(insertOrder, [
      orderAId,
      checkoutAId,
      PROVIDER_A,
      customerId,
      `AL-ORDER-A-${suffix}`,
      5400,
      600,
      6000,
      3,
      8,
      "Entregar envuelto para regalo.",
      "Cliente integración",
      customerEmail,
      "+34000000000",
      JSON.stringify(address())
    ]);
    await transaction.query(insertOrder, [
      orderBId,
      checkoutBId,
      PROVIDER_B,
      customerId,
      `AL-ORDER-B-${suffix}`,
      3100,
      400,
      3500,
      5,
      12,
      "",
      "Cliente integración",
      customerEmail,
      "+34000000000",
      JSON.stringify(address())
    ]);

    await transaction.query(
      `INSERT INTO order_items (
         id, order_id, provider_id, customer_user_id, item_type,
         product_name, quantity, unit_price_cents, line_total_cents,
         currency, personalization
       ) VALUES
       ($1, $2, $3, $4, 'CUSTOM', 'Bordado de integración', 1, 5400, 5400, 'EUR', $5::jsonb),
       ($6, $7, $8, $4, 'CUSTOM', 'Lámina de integración', 1, 3100, 3100, 'EUR', $9::jsonb)`,
      [
        itemAId,
        orderAId,
        PROVIDER_A,
        customerId,
        JSON.stringify({ name: "Adriana", color: "rosa" }),
        itemBId,
        orderBId,
        PROVIDER_B,
        JSON.stringify({ text: "Familia" })
      ]
    );

    await transaction.query(
      `INSERT INTO custom_requests (
         id, order_id, order_item_id, provider_id, customer_user_id,
         title, brief, desired_date
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, current_date + 21)`,
      [
        requestAId,
        orderAId,
        itemAId,
        PROVIDER_A,
        customerId,
        "Bordado con nombre",
        "El nombre debe quedar centrado y mantener el estilo delicado indicado por el cliente."
      ]
    );
  });

  const service = createProviderOrdersService({ database });

  const listA = await service.list(PROVIDER_A_CONTEXT, { query: suffix });
  assert.equal(listA.length, 1);
  assert.equal(listA[0].id, orderAId);
  assert.equal(listA[0].checkoutId, checkoutAId);
  assert.equal(listA[0].itemCount, 1);
  assert.equal(listA[0].openCustomRequests, 1);
  assert.equal(listA[0].customer.name, "Cliente integración");

  const listB = await service.list(PROVIDER_B_CONTEXT, { query: suffix });
  assert.equal(listB.length, 1);
  assert.equal(listB[0].id, orderBId);
  assert.equal(listB[0].checkoutId, checkoutBId);

  await assert.rejects(
    () => service.get(PROVIDER_B_CONTEXT, orderAId),
    (error) => error?.code === "ORDER_NOT_FOUND" && error?.statusCode === 404
  );

  const detail = await service.get(PROVIDER_A_CONTEXT, orderAId);
  assert.equal(detail.items.length, 1);
  assert.equal(detail.customRequests.length, 1);
  assert.equal(detail.customRequests[0].id, requestAId);
  assert.equal(detail.events.some((event) => event.type === "ORDER_CREATED"), true);

  const accepted = await service.transition(PROVIDER_A_CONTEXT, orderAId, {
    status: "ACCEPTED",
    expectedVersion: detail.order.version,
    note: "Pedido revisado y aceptado por el taller."
  });
  assert.equal(accepted.status, "ACCEPTED");
  assert.equal(accepted.version, detail.order.version + 1);
  assert.ok(accepted.acceptedAt);

  const message = await service.addCustomMessage(PROVIDER_A_CONTEXT, requestAId, {
    body: "Podemos realizar el bordado. Confirma que el hilo rosa debe ser mate."
  });
  assert.equal(message.authorRole, "PROVIDER_OWNER");

  const requestDetail = await service.getCustomRequest(PROVIDER_A_CONTEXT, requestAId);
  assert.equal(requestDetail.messages.length, 1);
  assert.match(requestDetail.messages[0].body, /hilo rosa/i);

  const transitionedRequest = await service.transitionCustomRequest(
    PROVIDER_A_CONTEXT,
    requestAId,
    {
      status: "NEEDS_INFO",
      expectedVersion: requestDetail.request.version,
      note: "Falta confirmar el acabado del hilo."
    }
  );
  assert.equal(transitionedRequest.status, "NEEDS_INFO");

  await database.withContext(ADMIN, async (transaction) => {
    const eventResult = await transaction.query(
      `SELECT event_type, message
       FROM order_events
       WHERE order_id = $1
       ORDER BY created_at, id`,
      [orderAId]
    );
    assert.equal(
      eventResult.rows.some((event) => event.event_type === "ORDER_STATUS_ACCEPTED"),
      true
    );
    assert.equal(
      eventResult.rows.some((event) => event.event_type === "PROVIDER_NOTE"),
      true
    );
    assert.equal(
      eventResult.rows.some((event) => event.event_type === "CUSTOM_REQUEST_STATUS_NEEDS_INFO"),
      true
    );

    const notificationResult = await transaction.query(
      "SELECT count(*)::integer AS total FROM order_notifications WHERE order_id = $1",
      [orderAId]
    );
    assert.ok(notificationResult.rows[0].total >= 4);
  });
});

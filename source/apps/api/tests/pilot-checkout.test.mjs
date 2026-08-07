import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createDatabase } from "../src/database.mjs";
import { createCustomerAuthService } from "../src/customer-auth-service.mjs";
import { createPilotCheckoutService } from "../src/pilot-checkout-service.mjs";

const connectionString = process.env.DATABASE_URL;
const ADMIN = { role: "ADMIN", userId: "00000000-0000-4000-8000-000000000001", providerId: null };
const PROVIDER_A = "00000000-0000-4000-8000-000000000201";
const PROVIDER_B = "00000000-0000-4000-8000-000000000202";

function address() {
  return {
    line1: "Calle Artesanía 14",
    line2: "2º B",
    postalCode: "18001",
    city: "Granada",
    province: "Granada",
    country: "ES"
  };
}

test("el checkout recalcula precios, mantiene un solo taller y es idempotente", { skip: !connectionString }, async (t) => {
  const database = createDatabase({
    connectionString,
    maxConnections: 5,
    statementTimeoutMs: 5000,
    logger: { error() {} }
  });
  t.after(() => database.close());

  const suffix = randomUUID().replaceAll("-", "").slice(0, 12).toLowerCase();
  const productA = randomUUID();
  const productB = randomUUID();
  const optionA = randomUUID();
  const customerEmail = `checkout-${suffix}@example.test`;

  await database.withContext(ADMIN, async (tx) => {
    await tx.query(
      `INSERT INTO products (
         id, provider_id, slug, name, short_description, story, category,
         status, price_cents, currency, stock_mode, stock_quantity,
         preparation_min_days, preparation_max_days, customizable,
         personalization_notes, shipping_notes, created_by, updated_by,
         approved_by, published_by, approved_at, published_at
       ) VALUES (
         $1,$2,$3,'Álbum bordado','Álbum artesanal con bordado personalizado.',
         'Pieza artesanal elaborada a mano para conservar recuerdos y celebraciones familiares durante muchos años.',
         'Papelería','PUBLISHED',3200,'EUR','FINITE',5,3,6,true,
         'Elige el color del bordado.','Envío protegido.',$4,$4,$4,$4,now(),now()
       )`,
      [productA, PROVIDER_A, `album-${suffix}`, ADMIN.userId]
    );
    await tx.query(
      `INSERT INTO products (
         id, provider_id, slug, name, short_description, story, category,
         status, price_cents, currency, stock_mode, stock_quantity,
         preparation_min_days, preparation_max_days, customizable,
         personalization_notes, shipping_notes, created_by, updated_by,
         approved_by, published_by, approved_at, published_at
       ) VALUES (
         $1,$2,$3,'Lámpara de madera','Lámpara artesanal realizada bajo pedido.',
         'Cada lámpara se corta, lija y termina a mano para crear una pieza cálida adaptada al espacio de la persona que la recibe.',
         'Decoración','PUBLISHED',5800,'EUR','MADE_TO_ORDER',null,7,12,true,
         'Admite diseño propio.','Se enviará desmontada y protegida.',$4,$4,$4,$4,now(),now()
       )`,
      [productB, PROVIDER_B, `lampara-${suffix}`, ADMIN.userId]
    );
    await tx.query(
      `INSERT INTO product_personalization_options (
         id, provider_id, product_id, name, option_type, required,
         choices, price_delta_cents, sort_order, active
       ) VALUES ($1,$2,$3,'Color del bordado','COLOR',true,$4::jsonb,250,1,true)`,
      [optionA, PROVIDER_A, productA, JSON.stringify(["Burdeos", "Dorado"])]
    );
    await tx.query(
      `INSERT INTO product_publications (
         product_id, provider_id, revision, snapshot, visible,
         published_by, published_at
       )
       SELECT product.id,
              product.provider_id,
              1,
              app.build_product_publication_snapshot(product.id),
              true,
              product.published_by,
              product.published_at
       FROM products product
       WHERE product.id = ANY($1::uuid[])`,
      [[productA, productB]]
    );
  });

  const customerAuthService = createCustomerAuthService({
    database,
    systemContext: ADMIN,
    accessTtlMinutes: 30,
    sessionTtlHours: 24
  });
  const deliveries = [];
  const mailService = {
    enabled: false,
    async sendCustomerOrderAccess(input) {
      deliveries.push(input);
      return { status: "DISABLED", messageId: null, accepted: [] };
    }
  };
  const service = createPilotCheckoutService({
    database,
    systemContext: ADMIN,
    customerAuthService,
    mailService,
    enabled: true,
    shippingCents: 500,
    appUrl: "http://localhost:3000",
    environment: "development",
    logger: { error() {} }
  });

  const customer = {
    name: "Cliente del piloto",
    email: customerEmail,
    phone: "+34 600 123 123",
    shippingAddress: address()
  };

  await assert.rejects(
    () => service.submit({
      idempotencyKey: randomUUID(),
      customer,
      customerNote: "Intento de mezclar talleres.",
      items: [
        {
          productId: productA,
          quantity: 1,
          personalization: { [optionA]: "Burdeos" }
        },
        {
          productId: productB,
          quantity: 1,
          personalization: {}
        }
      ]
    }),
    (error) => error?.code === "23514"
      && error?.constraint === "provider_orders_single_provider_checkout"
  );

  const idempotencyKey = randomUUID();
  const payload = {
    idempotencyKey,
    customer,
    customerNote: "Entregar preferentemente por la tarde.",
    items: [
      {
        productId: productA,
        quantity: 2,
        priceCents: 1,
        personalization: { [optionA]: "Burdeos" },
        customRequest: {
          title: "Diseño con iniciales",
          brief: "Quiero una versión con dos iniciales bordadas y un acabado natural claro.",
          desiredDate: "2026-12-20"
        }
      }
    ]
  };

  const first = await service.submit(payload);
  assert.equal(first.status, "SUBMITTED");
  assert.equal(first.paymentCollected, false);
  assert.equal(first.reused, false);
  assert.equal(first.orders.length, 1);
  assert.equal(Object.hasOwn(first.access, "accessToken"), false);
  assert.match(first.access.manualAccessUrl, /^http:\/\/localhost:3000\/pedido\/acceso\/#token=/);
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].to, customerEmail);
  assert.match(deliveries[0].token, /^[A-Za-z0-9_-]{32,180}$/);

  const orderA = first.orders[0];
  assert.equal(orderA.provider.id, PROVIDER_A);
  assert.equal(orderA.subtotalCents, (3200 + 250) * 2);
  assert.equal(orderA.shippingCents, 500);
  assert.equal(orderA.totalCents, 7400);

  const repeated = await service.submit(payload);
  assert.equal(repeated.reused, true);
  assert.equal(repeated.checkoutId, first.checkoutId);
  assert.equal(repeated.orders.length, 1);
  assert.equal(deliveries.length, 2);

  await assert.rejects(
    () => service.submit({
      ...payload,
      customerNote: "Datos distintos con la misma clave."
    }),
    (error) => error?.code === "CHECKOUT_IDEMPOTENCY_CONFLICT"
  );

  await assert.rejects(
    () => service.submit({
      ...payload,
      idempotencyKey: randomUUID(),
      items: [{ productId: productA, quantity: 1, personalization: {} }]
    }),
    (error) => error?.code === "CHECKOUT_PERSONALIZATION_REQUIRED"
  );

  await database.withContext(ADMIN, async (tx) => {
    const orders = await tx.query(
      "SELECT provider_id, subtotal_cents, shipping_cents, total_cents FROM provider_orders WHERE checkout_id=$1 ORDER BY provider_id",
      [first.checkoutId]
    );
    assert.equal(orders.rowCount, 1);
    assert.equal(orders.rows[0].provider_id, PROVIDER_A);
    const items = await tx.query(
      "SELECT product_id, unit_price_cents, quantity, personalization FROM order_items WHERE order_id=$1",
      [orderA.id]
    );
    assert.equal(items.rowCount, 1);
    assert.equal(items.rows[0].product_id, productA);
    assert.equal(items.rows[0].unit_price_cents, 3450);
    assert.equal(items.rows[0].quantity, 2);
    const stock = await tx.query("SELECT stock_quantity FROM products WHERE id=$1", [productA]);
    assert.equal(stock.rows[0].stock_quantity, 3);
    const requests = await tx.query(
      "SELECT title, status FROM custom_requests WHERE order_id=$1",
      [orderA.id]
    );
    assert.equal(requests.rowCount, 1);
    assert.equal(requests.rows[0].status, "OPEN");
    const submissions = await tx.query(
      "SELECT status, checkout_id FROM pilot_checkout_submissions WHERE idempotency_key=$1",
      [idempotencyKey]
    );
    assert.equal(submissions.rows[0].status, "COMPLETED");
    assert.equal(submissions.rows[0].checkout_id, first.checkoutId);
    const access = await tx.query(
      "SELECT token_hash FROM customer_order_access_tokens WHERE checkout_id=$1 ORDER BY created_at DESC LIMIT 1",
      [first.checkoutId]
    );
    assert.equal(access.rows[0].token_hash.length, 64);
    assert.notEqual(access.rows[0].token_hash, deliveries.at(-1).token);

    const mixedOrders = await tx.query(
      `SELECT count(*)::int AS count
       FROM provider_orders
       WHERE contact_email=$1 AND checkout_id<>$2`,
      [customerEmail, first.checkoutId]
    );
    assert.equal(mixedOrders.rows[0].count, 0);
  });
});
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createDatabase } from "../src/database.mjs";

const connectionString = process.env.DATABASE_URL;
const ADMIN = Object.freeze({
  role: "ADMIN",
  userId: "00000000-0000-4000-8000-000000000001",
  providerId: null
});
const NOTIFICATIONS = Object.freeze({
  role: "NOTIFICATION_SERVICE",
  userId: "00000000-0000-4000-8000-000000000010",
  providerId: null
});
const PROVIDER_ID = "00000000-0000-4000-8000-000000000201";
const PROVIDER_OWNER_ID = "00000000-0000-4000-8000-000000000101";

function address() {
  return { line1: "Calle aviso 12", city: "Granada", postalCode: "18001", country: "ES" };
}

test("los eventos crean avisos únicos para cliente y taller", { skip: !connectionString }, async (t) => {
  const database = createDatabase({
    connectionString,
    maxConnections: 4,
    statementTimeoutMs: 5000,
    logger: { error() {} }
  });
  t.after(() => database.close());

  const suffix = randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
  const customerId = randomUUID();
  const checkoutId = randomUUID();
  const orderId = randomUUID();
  const requestId = randomUUID();
  const email = `notify-${suffix.toLowerCase()}@example.test`;

  await database.withContext(ADMIN, async (tx) => {
    await tx.query(
      `INSERT INTO users(id,email,display_name,status,email_verified_at,two_factor_enabled)
       VALUES($1,$2,'Cliente Avisos','ACTIVE',now(),false)`,
      [customerId, email]
    );
    await tx.query(
      `INSERT INTO checkout_batches(
         id,customer_user_id,checkout_reference,currency,customer_name,
         contact_email,shipping_address,status,submitted_at
       ) VALUES($1,$2,$3,'EUR','Cliente Avisos',$4,$5::jsonb,'SUBMITTED',now())`,
      [checkoutId, customerId, `AL-CHECKOUT-NOTIFY-${suffix}`, email, JSON.stringify(address())]
    );
    await tx.query(
      `INSERT INTO provider_orders(
         id,checkout_id,provider_id,customer_user_id,order_number,status,
         currency,subtotal_cents,shipping_cents,total_cents,
         preparation_min_days,preparation_max_days,customer_name,
         contact_email,shipping_address
       ) VALUES($1,$2,$3,$4,$5,'PENDING_CONFIRMATION','EUR',4500,500,5000,
         3,8,'Cliente Avisos',$6,$7::jsonb)`,
      [orderId, checkoutId, PROVIDER_ID, customerId, `AL-NOTIFY-${suffix}`, email, JSON.stringify(address())]
    );
    await tx.query(
      `INSERT INTO order_events(
         order_id,provider_id,customer_user_id,actor_user_id,actor_role,event_type
       ) VALUES($1,$2,$3,$4,'ADMIN','ORDER_CREATED')`,
      [orderId, PROVIDER_ID, customerId, ADMIN.userId]
    );
    await tx.query(
      `INSERT INTO custom_requests(
         id,order_id,provider_id,customer_user_id,title,brief,status,currency
       ) VALUES($1,$2,$3,$4,'Diseño personalizado',
         'Necesito confirmar colores y medidas antes de comenzar el trabajo.',
         'OPEN','EUR')`,
      [requestId, orderId, PROVIDER_ID, customerId]
    );
    await tx.query(
      `INSERT INTO custom_request_messages(
         request_id,order_id,provider_id,customer_user_id,
         author_user_id,author_role,body
       ) VALUES($1,$2,$3,$4,$4,'CUSTOMER','Confirmo las medidas indicadas.')`,
      [requestId, orderId, PROVIDER_ID, customerId]
    );
    await tx.query(
      `INSERT INTO custom_request_messages(
         request_id,order_id,provider_id,customer_user_id,
         author_user_id,author_role,body
       ) VALUES($1,$2,$3,$4,$5,'PROVIDER_OWNER','Gracias, prepararemos el presupuesto.')`,
      [requestId, orderId, PROVIDER_ID, customerId, PROVIDER_OWNER_ID]
    );
  });

  const notifications = await database.withContext(ADMIN, async (tx) => {
    const result = await tx.query(
      `SELECT id,recipient_user_id,event_type,template_key,dedupe_key,
              payload->>'recipientKind' AS recipient_kind
       FROM order_notifications
       WHERE order_id=$1 AND channel='EMAIL'
       ORDER BY id`,
      [orderId]
    );
    return result.rows;
  });

  assert.equal(notifications.length, 4);
  assert.equal(new Set(notifications.map((row) => row.dedupe_key)).size, 4);
  assert.deepEqual(
    notifications.map((row) => row.event_type).sort(),
    ["CUSTOM_REQUEST_MESSAGE", "CUSTOM_REQUEST_MESSAGE", "ORDER_CREATED", "ORDER_CREATED"]
  );
  assert.equal(
    notifications.some((row) => row.event_type === "ORDER_CREATED" && row.recipient_kind === "CUSTOMER"),
    true
  );
  assert.equal(
    notifications.some((row) => row.event_type === "ORDER_CREATED" && row.recipient_kind === "PROVIDER"),
    true
  );

  for (const notification of notifications) {
    const projected = await database.withContext(NOTIFICATIONS, async (tx) => {
      const result = await tx.query("SELECT * FROM app.notification_delivery($1)", [notification.id]);
      return result.rows[0];
    });
    assert.equal(projected.order_id, orderId);
    assert.equal(projected.order_number, `AL-NOTIFY-${suffix}`);
    assert.equal(projected.provider_name.length > 1, true);
    assert.match(String(projected.recipient_email), /@/);
    assert.equal(projected.recipient_kind, notification.recipient_kind);
  }

  const directPrivateRows = await database.withContext(NOTIFICATIONS, async (tx) => {
    const [users, providers, members] = await Promise.all([
      tx.query("SELECT count(*)::integer AS total FROM users"),
      tx.query("SELECT count(*)::integer AS total FROM providers"),
      tx.query("SELECT count(*)::integer AS total FROM provider_members")
    ]);
    return {
      users: users.rows[0].total,
      providers: providers.rows[0].total,
      members: members.rows[0].total
    };
  });
  assert.deepEqual(directPrivateRows, { users: 1, providers: 0, members: 0 });
});

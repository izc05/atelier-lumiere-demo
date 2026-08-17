import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { createDatabase } from "../src/database.mjs";
import { createCustomerAuthService } from "../src/customer-auth-service.mjs";
import { createCustomerAccessRecoveryService } from "../src/customer-access-recovery-service.mjs";

const connectionString = process.env.DATABASE_URL;
const ADMIN = { role: "ADMIN", userId: "00000000-0000-4000-8000-000000000001", providerId: null };
const PROVIDER = "00000000-0000-4000-8000-000000000201";
const RECOVERY_PEPPER = "atelier-recovery-test-pepper-0123456789abcdef";
const GENERIC = {
  accepted: true,
  message: "Si los datos corresponden a un pedido, enviaremos un nuevo enlace privado al correo de compra."
};

function address() {
  return { line1: "Calle privada 8", city: "Granada", postalCode: "18001", country: "ES" };
}

function recoveryThrottleKey(email, orderNumber) {
  return createHmac("sha256", RECOVERY_PEPPER)
    .update(`customer-order-access:${email}:${orderNumber}`)
    .digest("hex");
}

test("la recuperación de pedidos no enumera clientes, aplica cooldown e invalida enlaces anteriores", { skip: !connectionString }, async (t) => {
  const database = createDatabase({
    connectionString,
    maxConnections: 5,
    statementTimeoutMs: 5000,
    logger: { error() {} }
  });
  t.after(() => database.close());

  const suffix = randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
  const customerId = randomUUID();
  const checkoutId = randomUUID();
  const orderId = randomUUID();
  const email = `recuperacion-${suffix.toLowerCase()}@example.test`;
  const orderNumber = `AL-REC-${suffix}`;
  const throttleKey = recoveryThrottleKey(email, orderNumber);

  await database.withContext(ADMIN, async (tx) => {
    await tx.query(
      `INSERT INTO users(id,email,display_name,status,email_verified_at,two_factor_enabled)
       VALUES($1,$2,'Cliente recuperación','ACTIVE',now(),false)`,
      [customerId, email]
    );
    await tx.query(
      `INSERT INTO checkout_batches(
        id,customer_user_id,checkout_reference,currency,customer_name,
        contact_email,shipping_address,status,submitted_at
      ) VALUES($1,$2,$3,'EUR','Cliente recuperación',$4,$5::jsonb,'SUBMITTED',now())`,
      [checkoutId, customerId, `AL-CHECKOUT-${suffix}`, email, JSON.stringify(address())]
    );
    await tx.query(
      `INSERT INTO provider_orders(
        id,checkout_id,provider_id,customer_user_id,order_number,status,currency,
        subtotal_cents,shipping_cents,total_cents,preparation_min_days,
        preparation_max_days,customer_name,contact_email,shipping_address
      ) VALUES($1,$2,$3,$4,$5,'PENDING_CONFIRMATION','EUR',4800,500,5300,3,7,
        'Cliente recuperación',$6,$7::jsonb)`,
      [orderId, checkoutId, PROVIDER, customerId, orderNumber, email, JSON.stringify(address())]
    );
  });

  const auth = createCustomerAuthService({
    database,
    systemContext: ADMIN,
    accessTtlMinutes: 30,
    sessionTtlHours: 24
  });
  const original = await auth.issueAccess({ customerUserId: customerId, checkoutId });

  const deliveries = [];
  const mailService = {
    enabled: true,
    async sendCustomerOrderAccess(input) {
      deliveries.push(input);
      return { status: "SENT", messageId: `test-${deliveries.length}`, accepted: [input.to] };
    }
  };
  let currentTime = new Date("2026-08-17T12:00:00.000Z");
  const recovery = createCustomerAccessRecoveryService({
    database,
    systemContext: ADMIN,
    customerAuthService: auth,
    mailService,
    loginPepper: RECOVERY_PEPPER,
    cooldownSeconds: 300,
    now: () => currentTime,
    logger: { error() {} }
  });

  const valid = await recovery.requestAccess({ email, orderNumber });
  const missing = await recovery.requestAccess({
    email: `missing-${suffix.toLowerCase()}@example.test`,
    orderNumber: `AL-NOT-${suffix}`
  });
  assert.deepEqual(valid, GENERIC);
  assert.deepEqual(missing, GENERIC);
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].to, email);
  assert.deepEqual(deliveries[0].orderNumbers, [orderNumber]);
  assert.match(deliveries[0].token, /^[A-Za-z0-9_-]{32,180}$/);

  await database.withContext(ADMIN, async (tx) => {
    const previous = await tx.query(
      "SELECT revoked_at FROM customer_order_access_tokens WHERE id=$1",
      [original.accessId]
    );
    assert.ok(previous.rows[0].revoked_at);
    const recoveryThrottles = await tx.query(
      "SELECT COUNT(*)::int AS total FROM login_throttles WHERE key_hash=$1",
      [throttleKey]
    );
    assert.equal(recoveryThrottles.rows[0].total, 1);
  });

  const repeated = await recovery.requestAccess({ email, orderNumber });
  assert.deepEqual(repeated, GENERIC);
  assert.equal(deliveries.length, 1);

  currentTime = new Date(currentTime.getTime() + 301_000);
  const renewed = await recovery.requestAccess({ email, orderNumber });
  assert.deepEqual(renewed, GENERIC);
  assert.equal(deliveries.length, 2);
  assert.notEqual(deliveries[0].token, deliveries[1].token);

  await assert.rejects(
    () => auth.consumeAccess(deliveries[0].token),
    (error) => error?.code === "CUSTOMER_ACCESS_INVALID"
  );
  const consumed = await auth.consumeAccess(deliveries[1].token);
  assert.equal(consumed.user.id, customerId);

  await database.withContext(ADMIN, (tx) => tx.query(
    "DELETE FROM login_throttles WHERE key_hash=$1",
    [throttleKey]
  ));
});

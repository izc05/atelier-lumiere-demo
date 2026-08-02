import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createDatabase } from "../src/database.mjs";
import { createOrderLogisticsService } from "../src/order-logistics-service.mjs";

const connectionString = process.env.DATABASE_URL;
const ADMIN = { role: "ADMIN", userId: "00000000-0000-4000-8000-000000000001", providerId: null };
const PROVIDER_A = "00000000-0000-4000-8000-000000000201";
const PROVIDER_B = "00000000-0000-4000-8000-000000000202";
const OWNER_A = "00000000-0000-4000-8000-000000000101";
const OWNER_B = "00000000-0000-4000-8000-000000000102";

function address() {
  return { line1: "Calle seguimiento 12", city: "Granada", postalCode: "18001", country: "ES" };
}

test("cliente y taller gestionan seguimiento e incidencias sin cruces", { skip: !connectionString }, async (t) => {
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
  const email = `logistics-${suffix.toLowerCase()}@example.test`;
  const customer = { role: "CUSTOMER", userId: customerId, providerId: null };
  const providerA = { role: "PROVIDER_OWNER", userId: OWNER_A, providerId: PROVIDER_A };
  const providerB = { role: "PROVIDER_OWNER", userId: OWNER_B, providerId: PROVIDER_B };

  await database.withContext(ADMIN, async (tx) => {
    await tx.query(
      "INSERT INTO users(id,email,display_name,status,email_verified_at,two_factor_enabled) VALUES($1,$2,'Cliente logística','ACTIVE',now(),false)",
      [customerId, email]
    );
    await tx.query(
      `INSERT INTO checkout_batches(
         id,customer_user_id,checkout_reference,currency,customer_name,
         contact_email,shipping_address,status,submitted_at
       ) VALUES($1,$2,$3,'EUR','Cliente logística',$4,$5::jsonb,'SUBMITTED',now())`,
      [checkoutId, customerId, `AL-CHECKOUT-LOG-${suffix}`, email, JSON.stringify(address())]
    );
    await tx.query(
      `INSERT INTO provider_orders(
         id,checkout_id,provider_id,customer_user_id,order_number,status,
         currency,subtotal_cents,shipping_cents,total_cents,
         preparation_min_days,preparation_max_days,customer_name,
         contact_email,shipping_address,ready_to_ship_at
       ) VALUES(
         $1,$2,$3,$4,$5,'READY_TO_SHIP','EUR',5200,600,5800,
         3,7,'Cliente logística',$6,$7::jsonb,now()
       )`,
      [
        orderId,
        checkoutId,
        PROVIDER_A,
        customerId,
        `AL-LOG-${suffix}`,
        email,
        JSON.stringify(address())
      ]
    );
  });

  const service = createOrderLogisticsService({ database });
  const shipment = await service.createShipment(providerA, orderId, {
    status: "LABEL_CREATED",
    carrier: "Correos Express",
    trackingCode: `TRACK-${suffix}`,
    trackingUrl: `https://tracking.example.test/${suffix}`
  });
  assert.equal(shipment.status, "LABEL_CREATED");
  assert.equal(shipment.version, 1);
  assert.equal((await service.listShipments(customer, orderId))[0].version, 1);

  const inTransit = await service.updateShipment(providerA, orderId, shipment.id, {
    status: "IN_TRANSIT",
    carrier: shipment.carrier,
    trackingCode: shipment.trackingCode,
    trackingUrl: shipment.trackingUrl,
    expectedVersion: shipment.version
  });
  assert.equal(inTransit.status, "IN_TRANSIT");
  assert.equal(inTransit.version, 2);
  assert.ok(inTransit.shippedAt);

  await assert.rejects(
    () => service.updateShipment(providerA, orderId, shipment.id, {
      status: "EXCEPTION",
      carrier: shipment.carrier,
      trackingCode: shipment.trackingCode,
      trackingUrl: shipment.trackingUrl,
      expectedVersion: shipment.version
    }),
    (error) => error?.code === "SHIPMENT_VERSION_CONFLICT"
  );

  const incident = await service.createIncident(customer, orderId, {
    type: "DELIVERY",
    description: "El seguimiento indica una dirección incorrecta y necesito revisarla con el taller."
  });
  assert.equal(incident.status, "OPEN");
  assert.equal(incident.openedBy, customerId);
  assert.equal((await service.listIncidents(providerA, orderId))[0].version, 1);

  await assert.rejects(
    () => service.createShipment(providerB, orderId, { status: "PENDING" }),
    (error) => error?.code === "ORDER_NOT_FOUND"
  );
  await assert.rejects(
    () => service.updateIncident(customer, orderId, incident.id, {
      status: "RESOLVED",
      resolution: "El transporte ha corregido la dirección.",
      expectedVersion: incident.version
    }),
    (error) => error?.code === "FORBIDDEN"
  );

  const investigating = await service.updateIncident(providerA, orderId, incident.id, {
    status: "INVESTIGATING",
    expectedVersion: incident.version
  });
  assert.equal(investigating.status, "INVESTIGATING");
  assert.equal(investigating.version, 2);

  await assert.rejects(
    () => service.updateIncident(providerA, orderId, incident.id, {
      status: "RESOLVED",
      resolution: "El transportista ha corregido la dirección.",
      expectedVersion: incident.version
    }),
    (error) => error?.code === "INCIDENT_VERSION_CONFLICT"
  );

  const resolved = await service.updateIncident(providerA, orderId, incident.id, {
    status: "RESOLVED",
    resolution: "El transportista ha corregido la dirección y confirma la entrega prevista.",
    expectedVersion: investigating.version
  });
  assert.equal(resolved.status, "RESOLVED");
  assert.equal(resolved.version, 3);
  assert.ok(resolved.resolvedAt);

  const delivered = await service.updateShipment(providerA, orderId, shipment.id, {
    status: "DELIVERED",
    carrier: shipment.carrier,
    trackingCode: shipment.trackingCode,
    trackingUrl: shipment.trackingUrl,
    expectedVersion: inTransit.version
  });
  assert.equal(delivered.status, "DELIVERED");
  assert.equal(delivered.version, 3);
  assert.ok(delivered.deliveredAt);

  await database.withContext(ADMIN, async (tx) => {
    const order = await tx.query("SELECT status FROM provider_orders WHERE id=$1", [orderId]);
    assert.equal(order.rows[0].status, "DELIVERED");
    const events = await tx.query("SELECT event_type FROM order_events WHERE order_id=$1", [orderId]);
    const eventTypes = new Set(events.rows.map((row) => row.event_type));
    assert.equal(eventTypes.has("SHIPMENT_CREATED"), true);
    assert.equal(eventTypes.has("SHIPMENT_STATUS_IN_TRANSIT"), true);
    assert.equal(eventTypes.has("INCIDENT_OPENED"), true);
    assert.equal(eventTypes.has("INCIDENT_STATUS_RESOLVED"), true);
    const notifications = await tx.query(
      "SELECT count(*)::integer AS total FROM order_notifications WHERE order_id=$1",
      [orderId]
    );
    assert.ok(notifications.rows[0].total >= 5);
  });
});

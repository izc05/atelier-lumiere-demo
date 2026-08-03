import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const paths = [
  "packages/database/migrations/0035_order_email_notifications.sql",
  "packages/database/tests/tenant_isolation.sql",
  "apps/api/src/database.mjs",
  "apps/api/src/mail-service.mjs",
  "apps/api/src/order-notification-email-templates.mjs",
  "apps/api/src/order-notification-worker.mjs",
  "apps/api/src/server.mjs",
  "apps/api/tests/order-notification-worker.test.mjs",
  "apps/api/tests/order-email-notifications.test.mjs",
  ".env.example",
  "infra/docker/docker-compose.yml"
];

const files = Object.fromEntries(await Promise.all(paths.map(async (path) => [
  path,
  await readFile(new URL(`../${path}`, import.meta.url), "utf8")
])));

const migration = files[paths[0]];
for (const expected of [
  "NOTIFICATION_SERVICE",
  "notification-service@atelier.invalid",
  "order_notifications_email_dedupe_idx",
  "app.notification_delivery",
  "SECURITY DEFINER",
  "REVOKE ALL ON FUNCTION app.notification_delivery",
  "order_events_enqueue_email",
  "custom_request_messages_enqueue_email",
  "PURCHASE_CONFIRMATION",
  "CUSTOM_REQUEST_MESSAGE",
  "ON CONFLICT DO NOTHING"
]) assert.match(migration, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
for (const forbidden of [
  "users_notification_service_select",
  "providers_notification_service_select",
  "provider_members_notification_service_select"
]) assert.doesNotMatch(migration, new RegExp(forbidden));

const database = files[paths[2]];
assert.match(database, /"NOTIFICATION_SERVICE"/);
assert.match(database, /servicio de notificaciones no puede adoptar/);

const mail = files[paths[3]];
for (const expected of [
  "createOrderNotificationEmail",
  "sendOrderNotification",
  "X-Atelier-Lumiere-Notification",
  "order-notification-",
  "/mis-pedidos/detalle/",
  "/proveedor/pedidos/detalle/"
]) assert.match(mail, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

const template = files[paths[4]];
for (const expected of [
  "escapeHtml",
  "Presupuesto disponible",
  "Incidencia en el transporte",
  "nunca solicita datos de tarjeta por email",
  "Por seguridad, este correo no incluye conversaciones, direcciones ni archivos"
]) assert.match(template, new RegExp(expected));
assert.doesNotMatch(template, /innerHTML|shipping_address|contact_phone|CVV|IBAN/);

const worker = files[paths[5]];
for (const expected of [
  "FOR UPDATE SKIP LOCKED",
  "app.notification_delivery",
  "ORDER_EMAIL_MAX_ATTEMPTS",
  "RECIPIENT_NOT_AVAILABLE",
  "SET status = 'SENT'",
  "2 ** Math.max",
  "await orderNotificationWorker?.stop"
]) {
  const source = expected.includes("await orderNotificationWorker") ? files[paths[6]] : worker;
  assert.match(source, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}
for (const forbidden of [
  "INNER JOIN users",
  "INNER JOIN providers",
  "INNER JOIN provider_members",
  "recipient_email:",
  "console.log"
]) assert.doesNotMatch(worker, new RegExp(forbidden));

const server = files[paths[6]];
for (const expected of [
  "createOrderNotificationWorker",
  "notificationSystemContext",
  "ORDER_EMAIL_NOTIFICATIONS_ENABLED",
  "Avisos automáticos de pedidos activados"
]) assert.match(server, new RegExp(expected));

const env = files[paths[9]];
const compose = files[paths[10]];
for (const expected of [
  "ORDER_EMAIL_NOTIFICATIONS_ENABLED",
  "NOTIFICATION_SERVICE_USER_ID",
  "ORDER_EMAIL_INTERVAL_MS",
  "ORDER_EMAIL_BATCH_SIZE",
  "ORDER_EMAIL_MAX_ATTEMPTS"
]) {
  assert.match(env, new RegExp(expected));
  assert.match(compose, new RegExp(expected));
}
assert.match(env, /ORDER_EMAIL_NOTIFICATIONS_ENABLED=false/);
assert.match(compose, /ORDER_EMAIL_NOTIFICATIONS_ENABLED:-false/);

const tests = `${files[paths[7]]}\n${files[paths[8]]}`;
for (const expected of [
  "marca la cola como enviada",
  "fallo final se registra",
  "eventos crean avisos únicos",
  "recipient_kind",
  "directPrivateRows"
]) assert.match(tests, new RegExp(expected));
assert.match(files[paths[1]], /visible_technical_users <> 4/);
assert.match(files[paths[1]], /El servicio de notificaciones no está aislado/);

console.log("Cola, plantillas, reintentos y aislamiento de avisos de pedido validados.");

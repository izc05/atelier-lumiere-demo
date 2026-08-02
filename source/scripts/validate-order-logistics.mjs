import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const paths = [
  "packages/database/migrations/0027_order_logistics_guards.sql",
  "apps/api/src/order-logistics-service.mjs",
  "apps/api/src/order-logistics-api.mjs",
  "apps/api/src/server.mjs",
  "apps/api/tests/order-logistics.test.mjs",
  "apps/web/src/order-logistics-proxy.mjs",
  "apps/web/src/server.mjs",
  "apps/web/public/shared/order-logistics.css",
  "apps/web/public/proveedor/pedidos/detalle/index.html",
  "apps/web/public/proveedor/pedidos/detalle/order-detail.js",
  "apps/web/public/mis-pedidos/detalle/index.html",
  "apps/web/public/mis-pedidos/detalle/order-detail.js",
  "apps/web/tests/order-logistics-proxy.test.mjs"
];

const files = Object.fromEntries(await Promise.all(paths.map(async (path) => [
  path,
  await readFile(new URL(`../${path}`, import.meta.url), "utf8")
])));

const migration = files[paths[0]];
const service = files[paths[1]];
const api = files[paths[2]];
const apiServer = files[paths[3]];
const apiTest = files[paths[4]];
const proxy = files[paths[5]];
const webServer = files[paths[6]];
const css = files[paths[7]];
const providerHtml = files[paths[8]];
const providerJs = files[paths[9]];
const customerHtml = files[paths[10]];
const customerJs = files[paths[11]];
const proxyTest = files[paths[12]];

assert.match(migration, /ADD COLUMN version integer NOT NULL DEFAULT 1/);
assert.match(migration, /order_shipments_tracking_url_https/);
assert.match(migration, /ORDER_SHIPMENT_STATUS_TRANSITION_NOT_ALLOWED/);
assert.match(migration, /ORDER_INCIDENT_UPDATE_NOT_ALLOWED/);
assert.match(migration, /ORDER_INCIDENT_RESOLUTION_REQUIRED/);
assert.match(migration, /SHIPMENT_STATUS_' \|\| NEW\.status/);
assert.match(migration, /INCIDENT_STATUS_' \|\| NEW\.status/);
assert.match(migration, /order_shipments_guard/);
assert.match(migration, /order_incidents_guard/);

assert.match(service, /listShipments/);
assert.match(service, /listIncidents/);
assert.match(service, /createShipment/);
assert.match(service, /updateShipment/);
assert.match(service, /createIncident/);
assert.match(service, /updateIncident/);
assert.match(service, /expectedVersion/);
assert.match(service, /AND version = \$8/);
assert.match(service, /AND version = \$6/);
assert.match(service, /currentVersion/);
assert.doesNotMatch(service, /updated_at = \$[0-9]+::timestamptz/);
assert.match(service, /parsed\.protocol !== "https:"/);
assert.match(service, /role === "CUSTOMER"/);
assert.match(service, /Esta operación está reservada al taller/);
assert.doesNotMatch(service, /stripe|paypal|card_number|payment_intent/i);

assert.match(api, /\/api\\\/\(provider\|customer\)\\\/orders/);
assert.match(api, /actor === "provider" \? providerAuthService : customerAuthService/);
assert.match(api, /authService\.authenticate\(token\)/);
assert.match(api, /listShipments/);
assert.match(api, /listIncidents/);
assert.match(apiServer, /createOrderLogisticsApiHandler/);
assert.match(apiServer, /createOrderLogisticsService/);

assert.match(proxy, /atelier_provider_session/);
assert.match(proxy, /atelier_customer_session/);
assert.match(proxy, /methodAllowed/);
assert.match(proxy, /!resourceId && method === "GET"/);
assert.match(proxy, /Authorization: `Bearer \$\{token\}`/);
assert.doesNotMatch(providerJs + customerJs, /Authorization|Bearer|localStorage|sessionStorage|innerHTML/);
assert.match(webServer, /createOrderLogisticsWebHandler/);

for (const html of [providerHtml, customerHtml]) {
  assert.match(html, /\/shared\/order-logistics\.css/);
  assert.match(html, /id="incidents-list"/);
  assert.doesNotMatch(html, /\sstyle=/i);
}
assert.match(providerHtml, /id="shipment-form"/);
assert.match(providerHtml, /id="incident-form"/);
assert.match(customerHtml, /id="incident-form"/);
assert.match(providerJs, /SHIPMENT_TRANSITIONS/);
assert.match(providerJs, /INCIDENT_TRANSITIONS/);
assert.match(providerJs, /expectedVersion: shipment\.version/);
assert.match(providerJs, /expectedVersion: incident\.version/);
assert.match(providerJs, /\/shipments`\)/);
assert.match(providerJs, /\/incidents`\)/);
assert.match(customerJs, /\/internal\/customer\/orders\/\$\{encodeURIComponent\(orderId\)\}\/incidents/);
assert.match(providerJs + customerJs, /url\.protocol === "https:"/);
assert.match(css, /\.logistics-grid/);
assert.match(css, /\.incident-resolution/);
assert.match(apiTest, /SHIPMENT_VERSION_CONFLICT/);
assert.match(apiTest, /INCIDENT_VERSION_CONFLICT/);
assert.match(proxyTest, /solo su cookie HttpOnly/);

console.log("Seguimiento e incidencias de pedidos validados.");

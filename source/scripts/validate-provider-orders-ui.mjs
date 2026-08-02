import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const paths = [
  "packages/database/migrations/0023_custom_quote_customer_approval.sql",
  "apps/api/src/provider-orders-api.mjs",
  "apps/web/src/provider-orders-proxy.mjs",
  "apps/web/src/server.mjs",
  "apps/web/public/proveedor/panel/index.html",
  "apps/web/public/proveedor/panel.js",
  "apps/web/public/proveedor/pedidos/index.html",
  "apps/web/public/proveedor/pedidos/orders.js",
  "apps/web/public/proveedor/pedidos/detalle/index.html",
  "apps/web/public/proveedor/pedidos/detalle/order-detail.js",
  "apps/web/public/proveedor/encargos/index.html",
  "apps/web/public/proveedor/encargos/custom-requests.js",
  "apps/web/public/proveedor/encargos/detalle/index.html",
  "apps/web/public/proveedor/encargos/detalle/custom-detail.js",
  "apps/web/public/proveedor/pedidos/common.js"
];

const files = Object.fromEntries(await Promise.all(paths.map(async (path) => [
  path,
  await readFile(new URL(`../${path}`, import.meta.url), "utf8")
])));

const migration = files[paths[0]];
const api = files[paths[1]];
const proxy = files[paths[2]];
const server = files[paths[3]];
const panel = files[paths[4]];
const panelJs = files[paths[5]];
const orderList = files[paths[6]];
const orderListJs = files[paths[7]];
const orderDetail = files[paths[8]];
const orderDetailJs = files[paths[9]];
const requestList = files[paths[10]];
const requestListJs = files[paths[11]];
const requestDetail = files[paths[12]];
const requestDetailJs = files[paths[13]];
const commonJs = files[paths[14]];

assert.match(migration, /OLD\.status = 'QUOTED' AND NEW\.status = 'APPROVED'/);
assert.match(migration, /CUSTOM_REQUEST_PROVIDER_UPDATE_NOT_ALLOWED/);
assert.match(migration, /app\.is_customer_actor/);
assert.match(api, /CUSTOM_REQUEST_APPROVAL_CUSTOMER_ONLY/);
assert.match(api, /readProviderCustomTransition/);

for (const route of [
  "/proveedor/pedidos/",
  "/proveedor/pedidos/detalle/",
  "/proveedor/encargos/",
  "/proveedor/encargos/detalle/"
]) {
  assert.match(proxy, new RegExp(route.replaceAll("/", "\\/")));
}
assert.match(proxy, /atelier_provider_session/);
assert.match(proxy, /Authorization: `Bearer \$\{token\}`/);
assert.match(proxy, /Readable\.fromWeb/);
assert.match(server, /createProviderOrdersWebHandler/);

assert.match(panel, /\/proveedor\/pedidos\//);
assert.match(panel, /\/proveedor\/encargos\//);
assert.match(panel, /orders-count/);
assert.match(panelJs, /\/internal\/provider\/orders/);
assert.match(panelJs, /\/internal\/provider\/custom-requests/);

for (const html of [orderList, orderDetail, requestList, requestDetail]) {
  assert.match(html, /noindex,nofollow,noarchive/);
  assert.doesNotMatch(html, /\sstyle=/i);
  assert.doesNotMatch(html, /<script[^>]*>[^<]/i);
}

for (const client of [orderListJs, orderDetailJs, requestListJs, requestDetailJs, commonJs, panelJs]) {
  assert.doesNotMatch(client, /innerHTML/);
  assert.doesNotMatch(client, /Authorization|Bearer/);
  assert.match(client, /textContent|replaceChildren/);
}

assert.match(orderListJs, /\/internal\/provider\/orders/);
assert.match(orderDetailJs, /expectedVersion: detail\.order\.version/);
assert.match(orderDetailJs, /\/transitions/);
assert.match(requestListJs, /\/internal\/provider\/custom-requests/);
assert.match(requestDetailJs, /QUOTED: \["NEEDS_INFO", "CANCELLED"\]/);
assert.doesNotMatch(requestDetailJs, /QUOTED: \[[^\]]*"APPROVED"/);
assert.match(requestDetailJs, /expectedVersion: detail\.request\.version/);
assert.match(requestDetailJs, /quotedPriceCents: Math\.round/);
assert.match(requestDetailJs, /\/messages/);
assert.match(commonJs, /window\.AtelierOrders/);

console.log("Interfaz privada de pedidos y encargos validada.");

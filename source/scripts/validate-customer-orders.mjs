import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const paths = [
  "packages/database/migrations/0024_customer_order_access.sql",
  "apps/api/src/customer-auth-service.mjs",
  "apps/api/src/customer-orders-service.mjs",
  "apps/api/src/customer-orders-api.mjs",
  "apps/api/src/server.mjs",
  "apps/web/src/customer-orders-proxy.mjs",
  "apps/web/src/server.mjs",
  "apps/web/public/pedido/acceso/index.html",
  "apps/web/public/pedido/acceso/access.js",
  "apps/web/public/mis-pedidos/index.html",
  "apps/web/public/mis-pedidos/orders.js",
  "apps/web/public/mis-pedidos/detalle/index.html",
  "apps/web/public/mis-pedidos/detalle/order-detail.js",
  "apps/web/public/mis-pedidos/encargo/index.html",
  "apps/web/public/mis-pedidos/encargo/request-detail.js",
  "apps/web/public/mis-pedidos/common.js",
  "apps/web/public/mis-pedidos/customer-area-premium.css"
];
const files = Object.fromEntries(await Promise.all(paths.map(async (path) => [
  path,
  await readFile(new URL(`../${path}`, import.meta.url), "utf8")
])));

const migration = files[paths[0]];
const auth = files[paths[1]];
const service = files[paths[2]];
const api = files[paths[3]];
const apiServer = files[paths[4]];
const proxy = files[paths[5]];
const webServer = files[paths[6]];
const access = files[paths[8]];
const ordersHtml = files[paths[9]];
const ordersJs = files[paths[10]];
const detailHtml = files[paths[11]];
const detailJs = files[paths[12]];
const commonJs = files[paths[15]];
const premiumCss = files[paths[16]];

assert.match(migration, /customer_order_access_tokens/);
assert.match(migration, /customer_sessions/);
assert.match(migration, /token_hash text NOT NULL UNIQUE/);
assert.match(migration, /consumed_at/);
assert.match(migration, /revoked_at/);
assert.match(migration, /FORCE ROW LEVEL SECURITY/);
assert.doesNotMatch(migration, /access_token text|session_token text/i);

assert.match(auth, /randomBytes\(32\)\.toString\("base64url"\)/);
assert.match(auth, /sha256\(accessToken\)/);
assert.match(auth, /FOR UPDATE OF access/);
assert.match(auth, /consumed_at = now/);
assert.match(auth, /UPDATE customer_sessions[\s\S]*revoked_at = now/);

assert.match(service, /role !== "CUSTOMER"/);
assert.match(service, /customer_user_id = \$2/);
assert.match(service, /status = 'QUOTED' AND version = \$3/);
assert.match(service, /CUSTOM_REQUEST_VERSION_CONFLICT/);
assert.match(service, /status = 'PENDING_CONFIRMATION'/);

assert.match(api, /\/api\/customer\/access\/consume/);
assert.match(api, /customerAuthService\.authenticate/);
assert.match(api, /action === "approve"/);
assert.match(apiServer, /createCustomerOrdersApiHandler/);
assert.match(proxy, /atelier_customer_session/);
assert.match(proxy, /HttpOnly/);
assert.match(proxy, /SameSite=Strict/);
assert.match(proxy, /payload\.sessionToken/);
assert.doesNotMatch(proxy, /sessionToken: payload\.sessionToken/);
assert.match(webServer, /createCustomerOrdersWebHandler/);

assert.match(access, /window\.location\.hash/);
assert.match(access, /history\.replaceState/);
assert.match(access, /\/internal\/customer\/access/);
assert.doesNotMatch(access, /console\.|localStorage|sessionStorage|Authorization|Bearer/);

for (const path of paths.slice(7, 16)) {
  const content = files[path];
  if (path.endsWith(".html")) {
    assert.match(content, /noindex,nofollow,noarchive/);
    assert.doesNotMatch(content, /\sstyle=/i);
    assert.doesNotMatch(content, /<script[^>]*>[^<]/i);
  } else {
    assert.doesNotMatch(content, /innerHTML|Authorization|Bearer|localStorage|sessionStorage/);
    assert.match(content, /textContent|replaceChildren|history\.replaceState/);
  }
}

assert.match(ordersHtml, /id="orders-search"/);
assert.match(ordersHtml, /data-filter="attention"/);
assert.match(ordersHtml, /id="orders-result-count"/);
assert.match(ordersJs, /function visibleOrders/);
assert.match(ordersJs, /order-progress/);
assert.match(ordersJs, /nextAction/);
assert.match(ordersJs, /aria-pressed/);

assert.match(detailHtml, /id="order-journey"/);
assert.match(detailHtml, /id="next-step-card"/);
assert.match(detailHtml, /id="print-button"/);
assert.match(detailHtml, /id="provider-link"/);
assert.match(detailJs, /function renderJourney/);
assert.match(detailJs, /function nextStep/);
assert.match(detailJs, /window\.print\(\)/);
assert.match(detailJs, /\/taller\/\?slug=/);
assert.match(detailJs, /expectedVersion\s*:\s*detail\.order\.version/);
assert.match(files[paths[14]], /expectedVersion\s*:\s*detail\.request\.version/);
assert.match(files[paths[14]], /\/approve/);

assert.match(commonJs, /customer-area-premium\.css/);
assert.match(premiumCss, /\.orders-toolbar/);
assert.match(premiumCss, /\.journey-stages/);
assert.match(premiumCss, /\.next-step-card/);
assert.match(premiumCss, /@media print/);
assert.doesNotMatch(premiumCss, /javascript:|expression\s*\(/i);

console.log("Acceso privado y experiencia premium del cliente validados.");

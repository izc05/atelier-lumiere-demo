import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const paths = [
  "packages/database/migrations/0028_pilot_checkout_submissions.sql",
  "packages/database/migrations/0032_single_provider_checkout.sql",
  "apps/api/src/customer-order-email-templates.mjs",
  "apps/api/src/mail-service.mjs",
  "apps/api/src/pilot-checkout-service.mjs",
  "apps/api/src/pilot-checkout-api.mjs",
  "apps/api/src/server.mjs",
  "apps/api/tests/pilot-checkout.test.mjs",
  "apps/web/src/pilot-checkout-proxy.mjs",
  "apps/web/src/server.mjs",
  "apps/web/public/tienda/cart-store.js",
  "apps/web/public/tienda/articulo/index.html",
  "apps/web/public/tienda/product.js",
  "apps/web/public/tienda/index.html",
  "apps/web/public/tienda/store.js",
  "apps/web/public/tienda/cart.css",
  "apps/web/public/carrito/index.html",
  "apps/web/public/carrito/cart.js",
  "apps/web/tests/pilot-checkout-proxy.test.mjs",
  "infra/docker/docker-compose.yml",
  ".env.example"
];

const files = Object.fromEntries(await Promise.all(paths.map(async (path) => [
  path,
  await readFile(new URL(`../${path}`, import.meta.url), "utf8")
])));

const migration = files["packages/database/migrations/0028_pilot_checkout_submissions.sql"];
const singleProviderMigration = files["packages/database/migrations/0032_single_provider_checkout.sql"];
const emailTemplate = files["apps/api/src/customer-order-email-templates.mjs"];
const mailService = files["apps/api/src/mail-service.mjs"];
const service = files["apps/api/src/pilot-checkout-service.mjs"];
const api = files["apps/api/src/pilot-checkout-api.mjs"];
const apiServer = files["apps/api/src/server.mjs"];
const apiTest = files["apps/api/tests/pilot-checkout.test.mjs"];
const proxy = files["apps/web/src/pilot-checkout-proxy.mjs"];
const webServer = files["apps/web/src/server.mjs"];
const cartStore = files["apps/web/public/tienda/cart-store.js"];
const productHtml = files["apps/web/public/tienda/articulo/index.html"];
const productJs = files["apps/web/public/tienda/product.js"];
const storeHtml = files["apps/web/public/tienda/index.html"];
const storeJs = files["apps/web/public/tienda/store.js"];
const cartCss = files["apps/web/public/tienda/cart.css"];
const cartHtml = files["apps/web/public/carrito/index.html"];
const cartJs = files["apps/web/public/carrito/cart.js"];
const proxyTest = files["apps/web/tests/pilot-checkout-proxy.test.mjs"];
const compose = files["infra/docker/docker-compose.yml"];
const envExample = files[".env.example"];

assert.match(migration, /CREATE TABLE pilot_checkout_submissions/);
assert.match(migration, /idempotency_key uuid NOT NULL UNIQUE/);
assert.match(migration, /payload_hash char\(64\)/);
assert.match(migration, /FORCE ROW LEVEL SECURITY/);
assert.match(migration, /pilot_checkout_submissions_admin_insert/);

assert.match(singleProviderMigration, /enforce_single_provider_checkout/);
assert.match(singleProviderMigration, /provider_orders_single_provider_checkout/);
assert.match(singleProviderMigration, /BEFORE INSERT OR UPDATE OF checkout_id, provider_id/);
assert.match(singleProviderMigration, /existing_order\.provider_id <> NEW\.provider_id/);
assert.match(singleProviderMigration, /ERRCODE = '23514'/);

assert.match(service, /PILOT_CHECKOUT_ENABLED/);
assert.match(service, /PILOT_SHIPPING_CENTS/);
assert.match(service, /ON CONFLICT \(idempotency_key\) DO NOTHING/);
assert.match(service, /FOR UPDATE OF product/);
assert.match(service, /product\.status !== "PUBLISHED"/);
assert.match(service, /product\.provider_status !== "ACTIVE"/);
assert.match(service, /stock_quantity = stock_quantity - \$2/);
assert.match(service, /const groups = new Map\(\)/);
assert.match(service, /INSERT INTO provider_orders/);
assert.match(service, /INSERT INTO order_items/);
assert.match(service, /INSERT INTO custom_requests/);
assert.match(service, /paymentCollected: false/);
assert.match(service, /customerAuthService\.issueAccess/);
assert.match(service, /mailService\.sendCustomerOrderAccess/);
assert.match(service, /environment === "production"/);
assert.doesNotMatch(service, /input\.(price|subtotal|shipping|total)|item\.(price|subtotal|total)/i);
assert.doesNotMatch(service, /stripe|paypal|payment_intent|card_number|cardholder|cvv|iban/i);

assert.match(emailTemplate, /Acceso privado a tus pedidos/);
assert.match(emailTemplate, /nunca te pedirá datos de tarjeta/);
assert.match(mailService, /sendCustomerOrderAccess/);
assert.match(mailService, /\/pedido\/acceso\//);
assert.match(mailService, /url\.hash = `token=/);

assert.match(api, /\/api\/pilot-checkout\/submit/);
assert.match(api, /MAX_BODY_BYTES = 256 \* 1024/);
assert.match(api, /result\.reused \? 200 : 201/);
assert.match(api, /provider_orders_single_provider_checkout/);
assert.match(api, /CHECKOUT_PROVIDER_MISMATCH/);
assert.match(apiServer, /createPilotCheckoutApiHandler/);
assert.match(apiServer, /createPilotCheckoutService/);
assert.match(apiServer, /developmentAdminContext && customerAuthService/);

assert.match(proxy, /\/internal\/checkout\/submit/);
assert.match(proxy, /MAX_ATTEMPTS = 10/);
assert.match(proxy, /CHECKOUT_RATE_LIMITED/);
assert.match(proxy, /payment=\(\)/);
assert.doesNotMatch(proxy, /Authorization|Bearer|DEV_ADMIN_TOKEN/);
assert.match(webServer, /createPilotCheckoutWebHandler/);

assert.match(cartStore, /atelier_lumiere_pilot_cart_v2/);
assert.match(cartStore, /MAX_LINES = 20/);
assert.match(cartStore, /MAX_QUANTITY = 10/);
assert.match(cartStore, /currentProvider\.providerSlug !== cleaned\.providerSlug/);
assert.match(cartStore, /Finaliza o vacía ese pedido/);
assert.match(cartStore, /localStorage/);
assert.doesNotMatch(cartStore, /customer-name|customer-email|shippingAddress|address-line|phone/i);

for (const html of [productHtml, storeHtml, cartHtml]) {
  assert.match(html, /noindex,nofollow,noarchive/);
  assert.doesNotMatch(html, /\sstyle=/i);
  assert.doesNotMatch(html, /<script[^>]*>[^<]/i);
}
assert.match(productHtml, /id="purchase-form"/);
assert.match(productHtml, /id="custom-request-toggle"/);
assert.match(productHtml, /Checkout piloto sin cobro real/);
assert.match(storeHtml, /href="\/carrito\//);
assert.match(cartHtml, /id="checkout-form"/);
assert.match(cartHtml, /Registrar pedido sin pagar/);
assert.match(cartHtml, /Un pedido, un proveedor y un único envío/);
assert.match(cartHtml, /varias piezas del mismo taller/);
assert.match(cartHtml, /No introduzcas datos bancarios/);
assert.doesNotMatch(cartHtml, /type="password"/i);
assert.doesNotMatch(
  cartHtml,
  /<(?:input|select|textarea)\b[^>]*(?:id|name|autocomplete)=["'][^"']*(?:card|tarjeta|iban|cvv|payment|pago)[^"']*["']/i
);

assert.match(productJs, /window\.AtelierCart\.add/);
assert.match(productJs, /selectedPersonalization/);
assert.match(productJs, /selectedCustomRequest/);
assert.match(storeJs, /AtelierCart\.wireCount/);
assert.match(cartJs, /idempotencyKey = crypto\.randomUUID\(\)/);
assert.match(cartJs, /\/internal\/checkout\/submit/);
assert.match(cartJs, /items: lines\.map/);
assert.match(cartJs, /pedido único/);
assert.match(cartJs, /CHECKOUT_PROVIDER_MISMATCH/);
assert.match(cartJs, /cart\.clear\(\)/);
assert.doesNotMatch(productJs + storeJs + cartJs, /Authorization|Bearer|innerHTML|sessionStorage/);
assert.doesNotMatch(cartJs, /localStorage/);
assert.match(cartCss, /\.cart-layout/);
assert.match(cartCss, /\.pilot-warning/);

assert.match(apiTest, /priceCents: 1/);
assert.match(apiTest, /orders\.length, 1/);
assert.match(apiTest, /provider_orders_single_provider_checkout/);
assert.match(apiTest, /CHECKOUT_IDEMPOTENCY_CONFLICT/);
assert.match(apiTest, /stock_quantity/);
assert.match(proxyTest, /sin añadir credenciales/);
assert.match(proxyTest, /limita intentos/);

assert.match(compose, /PILOT_CHECKOUT_ENABLED: \$\{PILOT_CHECKOUT_ENABLED:-false\}/);
assert.match(compose, /PILOT_SHIPPING_CENTS: \$\{PILOT_SHIPPING_CENTS:-0\}/);
assert.match(envExample, /PILOT_CHECKOUT_ENABLED=false/);
assert.match(envExample, /nunca recibe datos de tarjeta/);

console.log("Checkout piloto de un solo taller validado.");

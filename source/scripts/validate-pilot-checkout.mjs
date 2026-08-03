import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const paths = [
  "packages/database/migrations/0028_pilot_checkout_submissions.sql",
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

const migration = files[paths[0]];
const emailTemplate = files[paths[1]];
const mailService = files[paths[2]];
const service = files[paths[3]];
const api = files[paths[4]];
const apiServer = files[paths[5]];
const apiTest = files[paths[6]];
const proxy = files[paths[7]];
const webServer = files[paths[8]];
const cartStore = files[paths[9]];
const productHtml = files[paths[10]];
const productJs = files[paths[11]];
const storeHtml = files[paths[12]];
const storeJs = files[paths[13]];
const cartCss = files[paths[14]];
const cartHtml = files[paths[15]];
const cartJs = files[paths[16]];
const proxyTest = files[paths[17]];
const compose = files[paths[18]];
const envExample = files[paths[19]];

assert.match(migration, /CREATE TABLE pilot_checkout_submissions/);
assert.match(migration, /idempotency_key uuid NOT NULL UNIQUE/);
assert.match(migration, /payload_hash char\(64\)/);
assert.match(migration, /FORCE ROW LEVEL SECURITY/);
assert.match(migration, /pilot_checkout_submissions_admin_insert/);

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
assert.match(apiServer, /createPilotCheckoutApiHandler/);
assert.match(apiServer, /createPilotCheckoutService/);
assert.match(apiServer, /developmentAdminContext && customerAuthService/);

assert.match(proxy, /\/internal\/checkout\/submit/);
assert.match(proxy, /MAX_ATTEMPTS = 10/);
assert.match(proxy, /CHECKOUT_RATE_LIMITED/);
assert.match(proxy, /payment=\(\)/);
assert.doesNotMatch(proxy, /Authorization|Bearer|DEV_ADMIN_TOKEN/);
assert.match(webServer, /createPilotCheckoutWebHandler/);

assert.match(cartStore, /atelier_lumiere_pilot_cart_v1/);
assert.match(cartStore, /MAX_LINES = 20/);
assert.match(cartStore, /MAX_QUANTITY = 10/);
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
assert.match(cartHtml, /Registrar pedidos sin pagar/);
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
assert.match(cartJs, /cart\.clear\(\)/);
assert.doesNotMatch(productJs + storeJs + cartJs, /Authorization|Bearer|innerHTML|sessionStorage/);
assert.doesNotMatch(cartJs, /localStorage/);
assert.match(cartCss, /\.cart-layout/);
assert.match(cartCss, /\.pilot-warning/);

assert.match(apiTest, /priceCents: 1/);
assert.match(apiTest, /orders\.length, 2/);
assert.match(apiTest, /CHECKOUT_IDEMPOTENCY_CONFLICT/);
assert.match(apiTest, /stock_quantity/);
assert.match(proxyTest, /sin añadir credenciales/);
assert.match(proxyTest, /limita intentos/);

assert.match(compose, /PILOT_CHECKOUT_ENABLED: \$\{PILOT_CHECKOUT_ENABLED:-false\}/);
assert.match(compose, /PILOT_SHIPPING_CENTS: \$\{PILOT_SHIPPING_CENTS:-0\}/);
assert.match(envExample, /PILOT_CHECKOUT_ENABLED=false/);
assert.match(envExample, /nunca recibe datos de tarjeta/);

console.log("Checkout piloto multi-taller validado.");

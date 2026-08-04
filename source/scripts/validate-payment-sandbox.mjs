import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const paths = [
  "packages/database/migrations/0034_payment_sandbox.sql",
  "apps/api/src/database.mjs",
  "apps/api/src/payment-sandbox-service.mjs",
  "apps/api/src/payment-sandbox-api.mjs",
  "apps/api/src/payment-checkout-integration.mjs",
  "apps/api/src/server.mjs",
  "apps/api/tests/payment-sandbox.test.mjs",
  "apps/api/tests/payment-sandbox-api.test.mjs",
  "apps/api/tests/payment-checkout-integration.test.mjs",
  "apps/web/src/payment-sandbox-proxy.mjs",
  "apps/web/src/server.mjs",
  "apps/web/public/pago/sandbox/index.html",
  "apps/web/public/pago/sandbox/payment.js",
  "apps/web/public/pago/sandbox/payment.css",
  "apps/web/public/carrito/index.html",
  "apps/web/public/carrito/cart.js",
  "apps/web/tests/payment-sandbox-proxy.test.mjs",
  "docs/PAYMENT_SANDBOX.md",
  "infra/docker/docker-compose.yml",
  ".env.example"
];

const files = Object.fromEntries(await Promise.all(paths.map(async (path) => [
  path,
  await readFile(new URL(`../${path}`, import.meta.url), "utf8")
])));

const migration = files[paths[0]];
const database = files[paths[1]];
const service = files[paths[2]];
const api = files[paths[3]];
const integration = files[paths[4]];
const apiServer = files[paths[5]];
const serviceTest = files[paths[6]];
const apiTest = files[paths[7]];
const integrationTest = files[paths[8]];
const proxy = files[paths[9]];
const webServer = files[paths[10]];
const html = files[paths[11]];
const browser = files[paths[12]];
const css = files[paths[13]];
const cartHtml = files[paths[14]];
const cartJs = files[paths[15]];
const proxyTest = files[paths[16]];
const docs = files[paths[17]];
const compose = files[paths[18]];
const env = files[paths[19]];

assert.match(migration, /CREATE TABLE payment_attempts/);
assert.match(migration, /CREATE TABLE payment_webhook_events/);
assert.match(migration, /UNIQUE \(payment_provider, event_id\)/);
assert.match(migration, /payload_hash char\(64\)/);
assert.match(migration, /payment_attempts_service_all/);
assert.match(migration, /payment_webhook_events_service_all/);
assert.match(migration, /checkout_batches_payment_service_select/);
assert.match(migration, /order_events_payment_service_insert/);
assert.match(migration, /audit_events_payment_service_insert/);
assert.match(migration, /FORCE ROW LEVEL SECURITY/);

assert.match(database, /"PAYMENT_SERVICE"/);
assert.match(database, /context\.role === "PAYMENT_SERVICE" && providerId/);
assert.match(database, /El servicio de pagos no puede adoptar el contexto de un proveedor/);

assert.match(service, /createPaymentSandboxService/);
assert.match(service, /pilotModeEnabled/);
assert.match(service, /environment !== "production" \|\| Boolean\(pilotModeEnabled\)/);
assert.match(service, /createHmac\("sha256", secret\)/);
assert.match(service, /ON CONFLICT \(payment_provider, event_id\) DO NOTHING/);
assert.match(service, /PAYMENT_WEBHOOK_IDEMPOTENCY_CONFLICT/);
assert.match(service, /PAYMENT_AMOUNT_MISMATCH/);
assert.match(service, /return `PAYMENT_\$\{status\}`/);
assert.match(service, /paymentCollected: false/);
assert.doesNotMatch(service, /card_number|cardholder|cvv|iban|payment_intent|stripe|paypal/i);

assert.match(api, /X-Atelier-Payment-Signature/i);
assert.match(api, /createHmac\("sha256", secret\)/);
assert.match(api, /\/api\/payment-sandbox\/webhook/);
assert.match(api, /PAYMENT_WEBHOOK_SIGNATURE_INVALID/);
assert.match(api, /MAX_BODY_BYTES = 32 \* 1024/);

assert.match(integration, /withSandboxPayment/);
assert.match(integration, /createForCheckout\(result\.checkoutId\)/);
assert.match(integration, /status: "UNAVAILABLE"/);
assert.match(apiServer, /createPaymentSandboxService/);
assert.match(apiServer, /createPaymentSandboxApiHandler/);
assert.match(apiServer, /withSandboxPayment/);
assert.match(apiServer, /PAYMENT_SANDBOX_ENABLED === "true"/);
assert.doesNotMatch(apiServer, /environment !== "production"\s*&&\s*process\.env\.PAYMENT_SANDBOX_ENABLED/);

assert.match(serviceTest, /webhooks idempotentes/);
assert.match(serviceTest, /duplicate\.reused, true/);
assert.match(serviceTest, /events, 1/);
assert.match(serviceTest, /paymentCollected, false/);
assert.match(serviceTest, /environment: "production"/);
assert.match(apiTest, /exige firma HMAC/);
assert.match(apiTest, /unsigned\.status, 401/);
assert.match(apiTest, /invalid\.status, 401/);
assert.match(integrationTest, /adjunta la sesión sandbox/);
assert.match(integrationTest, /sigue siendo válido si el sandbox está apagado o falla/);

assert.match(proxy, /\/internal\/payment-sandbox\/begin/);
assert.match(proxy, /\/internal\/payment-sandbox\/simulate/);
assert.match(proxy, /CROSS_SITE_REQUEST/);
assert.doesNotMatch(proxy, /Authorization|Bearer|X-Atelier-Payment-Signature|webhook/);
assert.match(webServer, /createPaymentSandboxWebHandler/);

assert.match(html, /noindex,nofollow,noarchive/);
assert.match(html, /No solicita ni acepta datos bancarios/);
assert.match(html, /id="approve-button"/);
assert.match(html, /id="decline-button"/);
assert.doesNotMatch(html, /<(?:input|select|textarea)\b[^>]*(?:card|tarjeta|iban|cvv|cc-)/i);
assert.doesNotMatch(html, /type="(?:password|tel)"/i);
assert.doesNotMatch(html, /\sstyle=/i);
assert.doesNotMatch(html, /<script[^>]*>[^<]/i);
assert.match(browser, /history\.replaceState/);
assert.match(browser, /\/internal\/payment-sandbox\/begin/);
assert.match(browser, /\/internal\/payment-sandbox\/simulate/);
assert.doesNotMatch(browser, /innerHTML|localStorage|sessionStorage|Authorization|Bearer/);
assert.match(css, /\.payment-layout/);
assert.match(css, /@media \(max-width: 620px\)/);

assert.match(cartHtml, /id="sandbox-payment-link"/);
assert.match(cartHtml, /Probar pago sandbox/);
assert.match(cartJs, /result\.payment\?\.mode === "SANDBOX"/);
assert.match(cartJs, /payment\.href = result\.payment\.sessionPath/);
assert.match(proxyTest, /no añade credenciales ni expone el webhook/);
assert.match(proxyTest, /crossSite\.status, 403/);

assert.match(docs, /No conserva el cuerpo bruto/);
assert.match(docs, /un proveedor por checkout/i);
assert.match(compose, /PAYMENT_SANDBOX_ENABLED/);
assert.match(compose, /PAYMENT_SANDBOX_SESSION_SECRET/);
assert.match(compose, /PAYMENT_SANDBOX_WEBHOOK_SECRET/);
assert.match(env, /PAYMENT_SANDBOX_ENABLED=false/);
assert.match(env, /PILOT_MODE_ENABLED=false/);
assert.match(env, /PAYMENT_SERVICE_USER_ID=00000000-0000-4000-8000-000000000009/);

console.log("Pago sandbox y webhooks idempotentes validados.");

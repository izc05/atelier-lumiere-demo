import { readFile } from "node:fs/promises";

const files = new Map();
const required = [
  "apps/web/public/proveedor/onboarding.css",
  "apps/web/public/proveedor/onboarding.js",
  "apps/web/public/proveedor/activar/index.html",
  "apps/web/public/proveedor/verificar-correo/index.html",
  "apps/web/public/proveedor/configurar-2fa/index.html",
  "apps/web/public/proveedor/codigos-recuperacion/index.html",
  "apps/web/src/app.mjs",
  "apps/web/tests/provider-onboarding-ui.test.mjs",
  "apps/api/src/app.mjs",
  "apps/api/package.json"
];
const failures = [];

for (const path of required) {
  try {
    files.set(path, await readFile(path, "utf8"));
  } catch {
    failures.push(`Falta el archivo de incorporación: ${path}`);
  }
}

const pages = [
  ["apps/web/public/proveedor/activar/index.html", "data-page=\"activation\"", "Paso 1 de 4"],
  ["apps/web/public/proveedor/verificar-correo/index.html", "data-page=\"email-verification\"", "Paso 2 de 4"],
  ["apps/web/public/proveedor/configurar-2fa/index.html", "data-page=\"two-factor\"", "Paso 3 de 4"],
  ["apps/web/public/proveedor/codigos-recuperacion/index.html", "data-page=\"recovery\"", "Paso 4 de 4"]
];

for (const [path, pageMarker, stepMarker] of pages) {
  const html = files.get(path) ?? "";
  for (const expected of [
    "Atelier Lumière",
    "noindex,nofollow,noarchive",
    "/proveedor/onboarding.css",
    "/proveedor/onboarding.js",
    pageMarker,
    stepMarker
  ]) {
    if (!html.includes(expected)) failures.push(`${path} no contiene: ${expected}`);
  }
  if (/<script[^>]*>[^<]/i.test(html)) failures.push(`${path} contiene JavaScript inline.`);
}

const browser = files.get("apps/web/public/proveedor/onboarding.js") ?? "";
for (const endpoint of [
  "/internal/provider/invitation-preview",
  "/internal/provider/invitation-accept",
  "/internal/provider/email-verify",
  "/internal/provider/email-resend",
  "/internal/provider/two-factor-setup",
  "/internal/provider/two-factor-confirm"
]) {
  if (!browser.includes(endpoint)) failures.push(`El flujo visible no usa ${endpoint}`);
}
for (const expected of [
  "sessionStorage",
  "RECOVERY_SESSION_KEY",
  "URL.createObjectURL",
  "window.print()",
  "navigator.clipboard",
  "recoveryCodes.length !== 10"
]) {
  if (!browser.includes(expected)) failures.push(`Falta una función visible: ${expected}`);
}
for (const forbidden of [
  "localStorage",
  "DEV_ADMIN_TOKEN",
  "WEB_ADMIN_ACCESS_KEY",
  "Authorization",
  "document.cookie",
  "innerHTML"
]) {
  if (browser.includes(forbidden)) failures.push(`El JavaScript del proveedor no puede contener: ${forbidden}`);
}

const webApp = files.get("apps/web/src/app.mjs") ?? "";
for (const expected of [
  "PROVIDER_PROXY_ROUTES",
  "proxyProvider",
  "request.method !== \"POST\"",
  "AbortSignal.timeout(10000)",
  "Cross-Origin-Resource-Policy",
  "form-action 'self'",
  "/api/provider-invitations/preview",
  "/api/email-verifications/verify",
  "/api/two-factor/confirm"
]) {
  if (!webApp.includes(expected)) failures.push(`Falta una protección del proxy del proveedor: ${expected}`);
}

const webTest = files.get("apps/web/tests/provider-onboarding-ui.test.mjs") ?? "";
for (const expected of [
  "authorization === null",
  "forbiddenMethod.status, 405",
  "unknownRoute.response.status, 404",
  "includes(\"localStorage\"), false",
  "noindex,nofollow,noarchive"
]) {
  if (!webTest.includes(expected)) failures.push(`Falta una prueba visible: ${expected}`);
}

const apiPackage = files.get("apps/api/package.json") ?? "";
if (!apiPackage.includes('"qrcode": "1.5.4"')) {
  failures.push("La API no fija la versión revisada de qrcode.");
}
const api = files.get("apps/api/src/app.mjs") ?? "";
for (const expected of [
  "import QRCode from \"qrcode\"",
  "QRCode.toDataURL(setup.otpauthUri",
  "errorCorrectionLevel: \"M\"",
  "width: 320",
  "qrDataUrl"
]) {
  if (!api.includes(expected)) failures.push(`Falta la generación de QR: ${expected}`);
}

const css = files.get("apps/web/public/proveedor/onboarding.css") ?? "";
for (const expected of [
  "@media (max-width: 820px)",
  "@media (prefers-reduced-motion: reduce)",
  ".qr-box",
  ".codes-grid",
  ".progress"
]) {
  if (!css.includes(expected)) failures.push(`Falta una regla visual: ${expected}`);
}

if (failures.length) {
  console.error("Validación de incorporación visual fallida:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("Pantallas de incorporación y proxy seguro validados.");

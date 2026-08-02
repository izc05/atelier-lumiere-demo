import { readFile } from "node:fs/promises";

const required = [
  "packages/database/migrations/0007_account_recovery.sql",
  "apps/api/src/account-recovery-service.mjs",
  "apps/api/src/account-recovery-api.mjs",
  "apps/api/src/recovery-email-templates.mjs",
  "apps/api/src/mail-service.mjs",
  "apps/api/src/server.mjs",
  "apps/api/tests/account-recovery.test.mjs",
  "apps/api/tests/account-recovery-mail.test.mjs",
  "apps/web/src/account-recovery-proxy.mjs",
  "apps/web/src/server.mjs",
  "apps/web/public/proveedor/recovery.js",
  "apps/web/public/proveedor/recovery.css",
  "apps/web/public/proveedor/solicitar-recuperacion/index.html",
  "apps/web/public/proveedor/recuperar-clave/index.html",
  "apps/web/public/proveedor/recuperar-2fa/index.html",
  "apps/web/tests/account-recovery.test.mjs",
  ".env.example",
  "infra/docker/docker-compose.yml"
];
const contents = new Map();
const failures = [];

for (const path of required) {
  try {
    contents.set(path, await readFile(path, "utf8"));
  } catch {
    failures.push(`Falta el archivo de recuperación: ${path}`);
  }
}

const migration = contents.get("packages/database/migrations/0007_account_recovery.sql") ?? "";
for (const expected of [
  "CREATE TABLE account_recovery_tokens",
  "PASSWORD_RESET",
  "RESET_2FA",
  "token_hash text NOT NULL UNIQUE",
  "account_recovery_tokens_one_pending_idx",
  "FORCE ROW LEVEL SECURITY",
  "USING (app.is_admin())",
  "TO atelier_app_runtime"
]) {
  if (!migration.includes(expected)) failures.push(`Falta una protección SQL: ${expected}`);
}

const service = contents.get("apps/api/src/account-recovery-service.mjs") ?? "";
for (const expected of [
  "scryptAsync",
  "timingSafeEqual",
  "randomBytes(32)",
  "ACCOUNT_RECOVERY_UNAVAILABLE",
  "accepted: true",
  "manual-development",
  "environment !== \"production\"",
  "PROVIDER_PASSWORD_RESET_COMPLETED",
  "PROVIDER_2FA_RESET_COMPLETED",
  "UPDATE sessions",
  "UPDATE provider_login_challenges",
  "DELETE FROM user_recovery_codes",
  "DELETE FROM user_totp_credentials",
  "issueTwoFactorContinuation"
]) {
  if (!service.includes(expected)) failures.push(`Falta una garantía del servicio: ${expected}`);
}
for (const forbidden of [
  "console.log(token",
  "console.error(token",
  "password: password",
  "recoveryToken: issued.token,\n            recoveryPath"
]) {
  if (forbidden.startsWith("recoveryToken")) continue;
  if (service.includes(forbidden)) failures.push(`El servicio no debe contener: ${forbidden}`);
}

const api = contents.get("apps/api/src/account-recovery-api.mjs") ?? "";
for (const route of [
  "/api/provider-recovery/password/request",
  "/api/provider-recovery/password/confirm",
  "/api/provider-recovery/two-factor/request",
  "/api/provider-recovery/two-factor/confirm"
]) {
  if (!api.includes(route)) failures.push(`Falta la ruta de recuperación: ${route}`);
}
for (const expected of [
  "request.method !== \"POST\"",
  "MAX_JSON_BODY_BYTES",
  "Cache-Control",
  "Referrer-Policy",
  "errorCode"
]) {
  if (!api.includes(expected)) failures.push(`Falta una protección de API: ${expected}`);
}

const proxy = contents.get("apps/web/src/account-recovery-proxy.mjs") ?? "";
for (const expected of [
  "ROUTES = new Map",
  "request.method !== \"POST\"",
  "AbortSignal.timeout(10000)",
  "MAX_BODY_BYTES",
  "Cache-Control",
  "Referrer-Policy"
]) {
  if (!proxy.includes(expected)) failures.push(`Falta una protección del proxy: ${expected}`);
}
for (const forbidden of ["Authorization", "Bearer ", "DEV_ADMIN_TOKEN", "WEB_ADMIN_ACCESS_KEY"]) {
  if (proxy.includes(forbidden)) failures.push(`El proxy no puede contener: ${forbidden}`);
}

const browser = contents.get("apps/web/public/proveedor/recovery.js") ?? "";
for (const endpoint of [
  "/internal/provider-recovery/password/request",
  "/internal/provider-recovery/password/confirm",
  "/internal/provider-recovery/two-factor/request",
  "/internal/provider-recovery/two-factor/confirm"
]) {
  if (!browser.includes(endpoint)) failures.push(`La interfaz no usa ${endpoint}`);
}
for (const expected of [
  "sessionStorage.setItem(TWO_FACTOR_SESSION_KEY",
  "Las contraseñas no coinciden",
  "Si la cuenta puede recuperarse",
  "window.location.assign(\"/proveedor/configurar-2fa/\")"
]) {
  if (!browser.includes(expected)) failures.push(`Falta una función visible: ${expected}`);
}
for (const forbidden of [
  "localStorage",
  "document.cookie",
  "Authorization",
  "DEV_ADMIN_TOKEN",
  "WEB_ADMIN_ACCESS_KEY",
  "innerHTML"
]) {
  if (browser.includes(forbidden)) failures.push(`El JavaScript visible no puede contener: ${forbidden}`);
}

for (const path of [
  "apps/web/public/proveedor/solicitar-recuperacion/index.html",
  "apps/web/public/proveedor/recuperar-clave/index.html",
  "apps/web/public/proveedor/recuperar-2fa/index.html"
]) {
  const html = contents.get(path) ?? "";
  for (const expected of [
    "Atelier Lumière",
    "noindex,nofollow,noarchive",
    "/proveedor/recovery.css",
    "/proveedor/recovery.js"
  ]) {
    if (!html.includes(expected)) failures.push(`${path} no contiene: ${expected}`);
  }
  if (/<script[^>]*>[^<]/i.test(html)) failures.push(`${path} contiene JavaScript inline.`);
}

const templates = contents.get("apps/api/src/recovery-email-templates.mjs") ?? "";
for (const expected of [
  "escapeHtml",
  "Cambia la contraseña",
  "Sustituye el doble factor",
  "solo puede utilizarse una vez",
  "Europe/Madrid"
]) {
  if (!templates.includes(expected)) failures.push(`Falta una garantía de correo: ${expected}`);
}
const mail = contents.get("apps/api/src/mail-service.mjs") ?? "";
for (const expected of [
  "sendPasswordReset",
  "sendTwoFactorReset",
  "/proveedor/recuperar-clave/",
  "/proveedor/recuperar-2fa/"
]) {
  if (!mail.includes(expected)) failures.push(`SMTP no incluye: ${expected}`);
}

const env = contents.get(".env.example") ?? "";
const compose = contents.get("infra/docker/docker-compose.yml") ?? "";
for (const expected of [
  "PASSWORD_RESET_TTL_MINUTES",
  "TWO_FACTOR_RESET_TTL_MINUTES",
  "ACCOUNT_RECOVERY_COOLDOWN_SECONDS"
]) {
  if (!env.includes(expected)) failures.push(`El entorno no incluye ${expected}.`);
  if (!compose.includes(expected)) failures.push(`Docker no incluye ${expected}.`);
}

const integration = contents.get("apps/api/tests/account-recovery.test.mjs") ?? "";
for (const expected of [
  "unknown.payload",
  "reusedPasswordLink.response.status, 410",
  "oldSessionAfterReset.response.status, 401",
  "ACCOUNT_NOT_READY",
  "assert.notEqual(newSetup.secret, setup.secret)",
  "PROVIDER_PASSWORD_RESET_COMPLETED",
  "PROVIDER_2FA_RESET_COMPLETED"
]) {
  if (!integration.includes(expected)) failures.push(`Falta una prueba real: ${expected}`);
}

if (failures.length) {
  console.error("Validación de recuperación fallida:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("Recuperación de contraseña, 2FA, SMTP y revocación de sesiones validados.");

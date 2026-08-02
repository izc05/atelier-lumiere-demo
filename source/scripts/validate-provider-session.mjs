import { readFile } from "node:fs/promises";

const paths = [
  "apps/api/src/provider-auth-service.mjs",
  "apps/api/src/app.mjs",
  "apps/api/src/server.mjs",
  "apps/api/tests/provider-auth.test.mjs",
  "apps/web/src/app.mjs",
  "apps/web/public/proveedor/acceso/index.html",
  "apps/web/public/proveedor/access.js",
  "apps/web/public/proveedor/panel/index.html",
  "apps/web/public/proveedor/panel.css",
  "apps/web/public/proveedor/panel.js",
  "apps/web/tests/provider-session.test.mjs",
  "packages/database/migrations/0006_provider_login_sessions.sql",
  "infra/docker/docker-compose.yml",
  ".env.example"
];
const contents = new Map();
const failures = [];

for (const path of paths) {
  try {
    contents.set(path, await readFile(path, "utf8"));
  } catch {
    failures.push(`Falta el archivo de sesión del proveedor: ${path}`);
  }
}

const migration = contents.get("packages/database/migrations/0006_provider_login_sessions.sql") ?? "";
for (const expected of [
  "ADD COLUMN provider_id",
  "CREATE TABLE login_throttles",
  "CREATE TABLE provider_login_challenges",
  "failed_attempts integer",
  "ALTER TABLE login_throttles FORCE ROW LEVEL SECURITY",
  "ALTER TABLE provider_login_challenges FORCE ROW LEVEL SECURITY",
  "USING (app.is_admin())"
]) {
  if (!migration.includes(expected)) failures.push(`Falta una protección SQL de acceso: ${expected}`);
}

const service = contents.get("apps/api/src/provider-auth-service.mjs") ?? "";
for (const expected of [
  "scryptAsync",
  "timingSafeEqual",
  "MAX_PASSWORD_FAILURES = 5",
  "MAX_CHALLENGE_FAILURES = 5",
  "LOGIN_THROTTLED",
  "PROVIDER_PENDING_APPROVAL",
  "PROVIDER_LOGIN_PASSWORD_REJECTED",
  "PROVIDER_LOGIN_SECOND_FACTOR_REJECTED",
  "PROVIDER_LOGIN_SUCCEEDED",
  "RECOVERY_CODE",
  "randomBytes(32)",
  "hashToken(sessionToken)",
  "sessions",
  "return { invalidCredentials: true }",
  "if (outcome.invalidCredentials) throw invalidCredentials()"
]) {
  if (!service.includes(expected)) failures.push(`Falta una protección del servicio de acceso: ${expected}`);
}
for (const forbidden of [
  "token_hash: sessionToken",
  "password: password",
  "recoveryCode: code"
]) {
  if (service.includes(forbidden)) failures.push(`El servicio no debe serializar: ${forbidden}`);
}

const api = contents.get("apps/api/src/app.mjs") ?? "";
for (const route of [
  "/api/provider-auth/password",
  "/api/provider-auth/second-factor",
  "/api/provider/me",
  "/api/provider-auth/logout"
]) {
  if (!api.includes(route)) failures.push(`Falta una ruta de autenticación: ${route}`);
}
for (const expected of [
  "providerAuthentication: Boolean(providerAuthService)",
  "providerAuthService.complete",
  "providerAuthService.authenticate(bearerToken(request))",
  "providerAuthService.logout(bearerToken(request))"
]) {
  if (!api.includes(expected)) failures.push(`Falta una protección de API: ${expected}`);
}

const web = contents.get("apps/web/src/app.mjs") ?? "";
for (const expected of [
  "PROVIDER_SESSION_COOKIE",
  "atelier_provider_session",
  "HttpOnly",
  "SameSite=Strict",
  "providerCookieSecure",
  "const { sessionToken, ...safePayload }",
  "Set-Cookie",
  "/api/provider/me",
  "/api/provider-auth/logout",
  "url.pathname === \"/proveedor/panel\"",
  "redirect(response, \"/proveedor/acceso/\""
]) {
  if (!web.includes(expected)) failures.push(`Falta una protección de la cookie o panel: ${expected}`);
}

const accessHtml = contents.get("apps/web/public/proveedor/acceso/index.html") ?? "";
const panelHtml = contents.get("apps/web/public/proveedor/panel/index.html") ?? "";
for (const [name, html] of [["acceso", accessHtml], ["panel", panelHtml]]) {
  for (const expected of ["Atelier Lumière", "noindex,nofollow,noarchive"]) {
    if (!html.includes(expected)) failures.push(`La pantalla ${name} no contiene: ${expected}`);
  }
  if (/<script[^>]*>[^<]/i.test(html)) failures.push(`La pantalla ${name} contiene JavaScript inline.`);
}

const accessJs = contents.get("apps/web/public/proveedor/access.js") ?? "";
for (const expected of [
  "/internal/provider-auth/password",
  "/internal/provider-auth/second-factor",
  "sessionStorage",
  "PROVIDER_PENDING_APPROVAL",
  "INVALID_SECOND_FACTOR",
  "window.location.assign(\"/proveedor/panel/\")"
]) {
  if (!accessJs.includes(expected)) failures.push(`Falta una función en el acceso visible: ${expected}`);
}

const panelJs = contents.get("apps/web/public/proveedor/panel.js") ?? "";
for (const expected of [
  "/internal/provider/session",
  "method: \"DELETE\"",
  "window.location.replace(\"/proveedor/acceso/\")"
]) {
  if (!panelJs.includes(expected)) failures.push(`Falta una función en el panel: ${expected}`);
}

for (const [name, source] of [["acceso", accessJs], ["panel", panelJs]]) {
  for (const forbidden of [
    "localStorage",
    "document.cookie",
    "Authorization",
    "sessionToken",
    "innerHTML"
  ]) {
    if (source.includes(forbidden)) {
      if (name === "acceso" && forbidden === "sessionToken") continue;
      failures.push(`El JavaScript de ${name} no puede contener: ${forbidden}`);
    }
  }
}

const apiTest = contents.get("apps/api/tests/provider-auth.test.mjs") ?? "";
for (const expected of [
  "PROVIDER_PENDING_APPROVAL",
  "LOGIN_THROTTLED",
  "INVALID_SECOND_FACTOR",
  "PROVIDER_OWNER",
  "recoveryCodes[0]",
  "afterLogout.response.status, 401",
  "token_hash.length === 64"
]) {
  if (!apiTest.includes(expected)) failures.push(`Falta una prueba de API: ${expected}`);
}

const webTest = contents.get("apps/web/tests/provider-session.test.mjs") ?? "";
for (const expected of [
  "atelier_provider_session=",
  "HttpOnly",
  "SameSite=Strict",
  "includes(sessionToken), false",
  "protectedWithoutCookie.response.status, 302",
  "Max-Age=0"
]) {
  if (!webTest.includes(expected)) failures.push(`Falta una prueba de cookie: ${expected}`);
}

const compose = contents.get("infra/docker/docker-compose.yml") ?? "";
const env = contents.get(".env.example") ?? "";
for (const expected of [
  "AUTH_LOGIN_PEPPER",
  "PROVIDER_LOGIN_CHALLENGE_TTL_MINUTES",
  "PROVIDER_SESSION_TTL_HOURS",
  "PROVIDER_COOKIE_SECURE"
]) {
  if (!compose.includes(expected)) failures.push(`Docker no incluye: ${expected}`);
  if (!env.includes(expected)) failures.push(`El ejemplo de entorno no incluye: ${expected}`);
}

if (failures.length) {
  console.error("Validación de sesión del proveedor fallida:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("Autenticación, cookie HttpOnly y panel privado validados.");

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const paths = [
  "apps/web/src/admin-auth-proxy.mjs",
  "apps/web/src/server.mjs",
  "apps/web/public/admin/proveedores/index.html",
  "apps/web/public/admin/proveedores/admin-login.js",
  "apps/web/tests/admin-auth-proxy.test.mjs",
  ".env.example",
  "infra/docker/docker-compose.yml"
];
const files = Object.fromEntries(await Promise.all(paths.map(async (path) => [
  path,
  await readFile(new URL(`../${path}`, import.meta.url), "utf8")
])));

const proxy = files[paths[0]];
const server = files[paths[1]];
const html = files[paths[2]];
const login = files[paths[3]];
const test = files[paths[4]];
const env = files[paths[5]];
const compose = files[paths[6]];
const webService = compose.split("\n  api:\n", 1)[0];

assert.match(proxy, /atelier_admin_session/);
assert.match(proxy, /HttpOnly/);
assert.match(proxy, /SameSite=Strict/);
assert.match(proxy, /sessionToken: privateToken/);
assert.match(proxy, /CROSS_SITE_REQUEST/);
assert.match(proxy, /\/api\/admin-auth\/password/);
assert.match(proxy, /\/api\/admin-auth\/second-factor/);
assert.match(proxy, /\/api\/admin-auth\/me/);
assert.match(proxy, /\/api\/admin-auth\/logout/);
assert.doesNotMatch(proxy, /WEB_ADMIN_ACCESS_KEY|DEV_ADMIN_TOKEN|localStorage|sessionStorage/);

assert.match(server, /createAdminAuthenticationWebHandler/);
assert.doesNotMatch(server, /process\.env\.DEV_ADMIN_TOKEN|process\.env\.WEB_ADMIN_ACCESS_KEY/);
assert.doesNotMatch(
  webService,
  /^\s+(?:DEV_ADMIN_TOKEN|WEB_ADMIN_ACCESS_KEY|WEB_ADMIN_SESSION_TTL_MINUTES):/m
);
assert.doesNotMatch(env, /WEB_ADMIN_ACCESS_KEY|WEB_ADMIN_SESSION_TTL/);

assert.match(html, /id="admin-email"/);
assert.match(html, /id="admin-password"/);
assert.match(html, /id="admin-factor-form"/);
assert.match(html, /Aplicación autenticadora/);
assert.match(html, /Código de recuperación/);
assert.match(html, /cookie técnica <code>HttpOnly<\/code>/);
assert.doesNotMatch(html, /Clave privada del servidor/);

assert.match(login, /\/internal\/admin-auth\/password/);
assert.match(login, /\/internal\/admin-auth\/second-factor/);
assert.match(login, /window\.location\.reload\(\)/);
assert.doesNotMatch(login, /Authorization|Bearer|DEV_ADMIN_TOKEN|WEB_ADMIN_ACCESS_KEY|localStorage|sessionStorage/);

assert.match(test, /JSON\.stringify\(factorPayload\)\.includes\(SESSION_TOKEN\), false/);
assert.match(test, /HttpOnly/);
assert.match(test, /Sec-Fetch-Site/);
assert.match(test, /content-range/);

console.log("Acceso administrativo web real validado.");

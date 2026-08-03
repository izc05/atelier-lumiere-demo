import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const paths = [
  "packages/database/migrations/0033_admin_account_recovery.sql",
  "apps/api/src/admin-recovery-service.mjs",
  "apps/api/src/admin-recovery-api.mjs",
  "apps/api/src/mail-service.mjs",
  "apps/api/src/server.mjs",
  "apps/api/tests/admin-recovery.test.mjs",
  "apps/web/src/admin-recovery-proxy.mjs",
  "apps/web/src/server.mjs",
  "apps/web/public/admin/recuperar/index.html",
  "apps/web/public/admin/recuperar/recovery.js",
  "apps/web/public/admin/recuperar/recovery.css",
  "apps/web/public/admin/proveedores/admin-login.js",
  "apps/web/tests/admin-recovery-proxy.test.mjs",
  "infra/docker/docker-compose.yml",
  ".env.example"
];

const files = Object.fromEntries(await Promise.all(paths.map(async (path) => [
  path,
  await readFile(new URL(`../${path}`, import.meta.url), "utf8")
])));

const migration = files[paths[0]];
const service = files[paths[1]];
const api = files[paths[2]];
const mail = files[paths[3]];
const apiServer = files[paths[4]];
const apiTest = files[paths[5]];
const proxy = files[paths[6]];
const webServer = files[paths[7]];
const html = files[paths[8]];
const browser = files[paths[9]];
const css = files[paths[10]];
const login = files[paths[11]];
const proxyTest = files[paths[12]];
const compose = files[paths[13]];
const env = files[paths[14]];

assert.match(migration, /CREATE TABLE admin_account_recovery_tokens/);
assert.match(migration, /failed_attempts integer NOT NULL DEFAULT 0/);
assert.match(migration, /secret_ciphertext text NOT NULL/);
assert.match(migration, /FORCE ROW LEVEL SECURITY/);
assert.match(migration, /admin_account_recovery_auth_service_all/);
assert.match(migration, /user_credentials_auth_service_update/);
assert.match(migration, /user_recovery_codes_auth_service_insert/);
assert.match(migration, /user_recovery_codes_auth_service_delete/);

assert.match(service, /createAdminRecoveryService/);
assert.match(service, /randomBytes\(32\)\.toString\("base64url"\)/);
assert.match(service, /createCipheriv\("aes-256-gcm"/);
assert.match(service, /scryptAsync/);
assert.match(service, /MAX_ATTEMPTS = 5/);
assert.match(service, /generateRecoveryCodes/);
assert.match(service, /DELETE FROM user_recovery_codes/);
assert.match(service, /UPDATE sessions/);
assert.match(service, /UPDATE admin_login_challenges/);
assert.match(service, /ADMIN_RECOVERY_COMPLETED/);
assert.match(service, /environment !== "production"/);
assert.doesNotMatch(service, /password: password|metadata:.*password|secret: secret/);

for (const route of [
  "/api/admin-recovery/request",
  "/api/admin-recovery/begin",
  "/api/admin-recovery/confirm"
]) assert.match(api, new RegExp(route.replaceAll("/", "\\/")));
assert.match(api, /MAX_JSON_BODY_BYTES = 20 \* 1024/);
assert.match(api, /Content-Security-Policy/);
assert.match(apiServer, /createAdminRecoveryService/);
assert.match(apiServer, /createAdminRecoveryApiHandler/);
assert.match(mail, /sendAdminRecovery/);
assert.match(mail, /\/admin\/recuperar\//);

for (const route of [
  "/internal/admin-recovery/request",
  "/internal/admin-recovery/begin",
  "/internal/admin-recovery/confirm"
]) assert.match(proxy, new RegExp(route.replaceAll("/", "\\/")));
assert.match(proxy, /CROSS_SITE_REQUEST/);
assert.doesNotMatch(proxy, /Authorization|Bearer|DEV_ADMIN_TOKEN|WEB_ADMIN_ACCESS_KEY/);
assert.match(webServer, /createAdminRecoveryWebHandler/);

assert.match(html, /noindex,nofollow,noarchive/);
assert.match(html, /id="recovery-qr"/);
assert.match(html, /id="recovery-codes"/);
assert.match(html, /Sustituir acceso y cerrar sesiones/);
assert.doesNotMatch(html, /\sstyle=/i);
assert.doesNotMatch(html, /<script[^>]*>[^<]/i);
assert.match(browser, /history\.replaceState/);
assert.match(browser, /navigator\.clipboard\.writeText/);
assert.match(browser, /replaceChildren/);
assert.doesNotMatch(browser, /innerHTML|localStorage|sessionStorage|Authorization|Bearer/);
assert.match(css, /\.recovery-layout/);
assert.match(css, /@media \(max-width: 620px\)/);
assert.match(login, /\/admin\/recuperar\//);

assert.match(apiTest, /revoca sesiones/);
assert.match(apiTest, /recoveryCodes\.length, 10/);
assert.match(apiTest, /active_sessions, 0/);
assert.match(apiTest, /INVALID_ADMIN_CREDENTIALS/);
assert.match(proxyTest, /headers\.authorization, undefined/);
assert.match(proxyTest, /crossSite\.status, 403/);

assert.match(compose, /ADMIN_RECOVERY_TTL_MINUTES/);
assert.match(compose, /ADMIN_RECOVERY_COOLDOWN_SECONDS/);
assert.match(env, /ADMIN_RECOVERY_TTL_MINUTES=30/);
assert.match(env, /ADMIN_RECOVERY_COOLDOWN_SECONDS=300/);

console.log("Recuperación administrativa validada.");

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const paths = [
  "packages/database/migrations/0051_provider_editorial_profiles.sql",
  "apps/api/src/provider-profile-service.mjs",
  "apps/api/src/provider-profile-api.mjs",
  "apps/api/src/public-catalog-service.mjs",
  "apps/api/src/server.mjs",
  "apps/web/src/provider-profile-proxy.mjs",
  "apps/web/src/admin-provider-profiles-proxy.mjs",
  "apps/web/src/server.mjs",
  "apps/web/public/proveedor/panel/index.html",
  "apps/web/public/proveedor/perfil/index.html",
  "apps/web/public/proveedor/perfil/profile.js",
  "apps/web/public/admin/talleres/index.html",
  "apps/web/public/admin/talleres/profiles.js",
  "apps/web/public/admin/admin-role-navigation.js",
  "apps/web/public/taller/index.html",
  "apps/web/public/taller/provider.js"
];

const files = Object.fromEntries(await Promise.all(paths.map(async (path) => [
  path,
  await readFile(new URL(`../${path}`, import.meta.url), "utf8")
])));

const migration = files["packages/database/migrations/0051_provider_editorial_profiles.sql"];
const service = files["apps/api/src/provider-profile-service.mjs"];
const api = files["apps/api/src/provider-profile-api.mjs"];
const catalog = files["apps/api/src/public-catalog-service.mjs"];
const apiServer = files["apps/api/src/server.mjs"];
const providerProxy = files["apps/web/src/provider-profile-proxy.mjs"];
const adminProxy = files["apps/web/src/admin-provider-profiles-proxy.mjs"];
const webServer = files["apps/web/src/server.mjs"];
const panelHtml = files["apps/web/public/proveedor/panel/index.html"];
const editorHtml = files["apps/web/public/proveedor/perfil/index.html"];
const editorJs = files["apps/web/public/proveedor/perfil/profile.js"];
const adminHtml = files["apps/web/public/admin/talleres/index.html"];
const adminJs = files["apps/web/public/admin/talleres/profiles.js"];
const roleNavigation = files["apps/web/public/admin/admin-role-navigation.js"];
const publicHtml = files["apps/web/public/taller/index.html"];
const publicJs = files["apps/web/public/taller/provider.js"];

for (const expected of [
  "CREATE TABLE provider_profiles",
  "CREATE TABLE provider_profile_publications",
  "app.build_provider_profile_snapshot",
  "provider_profiles_00_guard_write",
  "provider_profiles_90_refresh_publication",
  "ALTER TABLE provider_profiles ENABLE ROW LEVEL SECURITY",
  "ALTER TABLE provider_profile_publications ENABLE ROW LEVEL SECURITY",
  "app.current_role() = 'CATALOG_READER'",
  "app.is_provider_actor(provider_id)",
  "'DRAFT','IN_REVIEW','CHANGES_REQUESTED','APPROVED','PUBLISHED'"
]) assert.match(migration, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
assert.match(migration, /provider\.status = 'ACTIVE'/);
assert.match(migration, /revision = provider_profile_publications\.revision \+ 1/);
assert.doesNotMatch(migration, /contact_email|legal_name|contact_name/);

for (const expected of [
  "async get(context)",
  "async update(context, input = {})",
  "async submit(context)",
  "async listAdmin(context",
  "async decide(context",
  "async publish(context",
  "PROVIDER_PROFILE_SUBMITTED",
  "PROVIDER_PROFILE_PUBLISHED"
]) assert.match(service, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
assert.match(service, /current\.status === "PUBLISHED"/);
assert.match(service, /status = 'DRAFT'/);

for (const expected of [
  "/api/provider/profile",
  "/api/provider/profile/submit",
  "/api/admin/provider-profiles",
  "providerAuthService.authenticate",
  "authenticateRequest"
]) assert.match(api, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

assert.match(catalog, /provider_profile_publications profile_publication/);
assert.match(catalog, /provider_profile_snapshot/);
assert.match(catalog, /profile\.displayName \|\| row\.provider_display_name/);
assert.doesNotMatch(catalog, /contact_email AS|contact_name AS|legal_name AS/);

assert.match(apiServer, /createProviderProfileApiHandler/);
assert.match(apiServer, /createProviderProfileService/);
assert.match(webServer, /createProviderProfileWebHandler/);
assert.match(webServer, /createAdminProviderProfilesWebHandler/);

assert.match(providerProxy, /const PROFILE_PATTERN/);
assert.match(providerProxy, /url\.pathname\.match\(PROFILE_PATTERN\)/);
assert.match(providerProxy, /atelier_provider_session/);
assert.match(providerProxy, /Authorization: `Bearer \$\{token\}`/);
assert.match(adminProxy, /const PROFILE_PATTERN/);
assert.match(adminProxy, /url\.pathname\.match\(PROFILE_PATTERN\)/);
assert.match(adminProxy, /DEV_ADMIN_TOKEN/);

assert.match(panelHtml, /href="\/proveedor\/perfil\/"/);
assert.doesNotMatch(panelHtml, />Próximamente</);
for (const html of [editorHtml, adminHtml, publicHtml]) {
  assert.match(html, /noindex,nofollow,noarchive/);
  assert.doesNotMatch(html, /\sstyle=/i);
  assert.doesNotMatch(html, /<script[^>]*>[^<]/i);
}

assert.match(editorHtml, /id="profile-form"/);
assert.match(editorHtml, /id="submit-button"/);
assert.match(editorHtml, /Vista previa privada/);
assert.match(editorJs, /\/internal\/provider\/profile/);
assert.match(editorJs, /\/internal\/provider\/profile\/submit/);
assert.match(editorJs, /Crear revisión y guardar/);
assert.doesNotMatch(editorJs, /innerHTML|localStorage|sessionStorage|document\.cookie|Authorization|Bearer/);

assert.match(adminHtml, /Perfiles\s*<br>editoriales/);
assert.match(adminJs, /\/internal\/admin\/provider-profiles/);
assert.match(adminJs, /REQUEST_CHANGES/);
assert.match(adminJs, /APPROVE/);
assert.match(adminJs, /\/publish/);
assert.doesNotMatch(adminJs, /innerHTML|localStorage|sessionStorage|document\.cookie|Authorization|Bearer/);

assert.match(roleNavigation, /\/admin\/talleres\//);
assert.match(publicHtml, /id="provider-story"/);
assert.match(publicHtml, /Compra directa por taller/);
assert.match(publicHtml, /Envío compartido/);
assert.match(publicJs, /provider\.tagline/);
assert.match(publicJs, /provider\.craftDescription/);
assert.match(publicJs, /provider\.materials/);
assert.match(publicJs, /provider\.techniques/);
assert.doesNotMatch(publicJs, /innerHTML|localStorage|sessionStorage|document\.cookie|Authorization|Bearer/);

for (const [name, script] of [["editor proveedor", editorJs], ["revisión admin", adminJs], ["taller público", publicJs]]) {
  assert.doesNotThrow(() => new Function(script), `${name} debe tener sintaxis JavaScript válida`);
}

console.log("Perfil editorial de taller validado: borrador privado, revisión, publicación y snapshot público aislados.");

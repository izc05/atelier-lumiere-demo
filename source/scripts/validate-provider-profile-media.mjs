import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const paths = [
  "packages/database/migrations/0052_provider_profile_media.sql",
  "apps/api/src/provider-profile-media-service.mjs",
  "apps/api/src/provider-profile-media-api.mjs",
  "apps/api/src/public-catalog-service.mjs",
  "apps/api/src/public-catalog-api.mjs",
  "apps/api/src/server.mjs",
  "apps/web/src/provider-profile-proxy.mjs",
  "apps/web/src/admin-provider-profiles-proxy.mjs",
  "apps/web/src/public-catalog-proxy.mjs",
  "apps/web/public/proveedor/perfil/index.html",
  "apps/web/public/proveedor/perfil/profile.js",
  "apps/web/public/admin/talleres/profiles.js",
  "apps/web/public/taller/index.html",
  "apps/web/public/taller/provider.js",
  "apps/web/public/taller/provider-media.css"
];

const files = Object.fromEntries(await Promise.all(paths.map(async (path) => [
  path,
  await readFile(new URL(`../${path}`, import.meta.url), "utf8")
])));

const migration = files["packages/database/migrations/0052_provider_profile_media.sql"];
const mediaService = files["apps/api/src/provider-profile-media-service.mjs"];
const mediaApi = files["apps/api/src/provider-profile-media-api.mjs"];
const catalogService = files["apps/api/src/public-catalog-service.mjs"];
const catalogApi = files["apps/api/src/public-catalog-api.mjs"];
const apiServer = files["apps/api/src/server.mjs"];
const providerProxy = files["apps/web/src/provider-profile-proxy.mjs"];
const adminProxy = files["apps/web/src/admin-provider-profiles-proxy.mjs"];
const publicProxy = files["apps/web/src/public-catalog-proxy.mjs"];
const editorHtml = files["apps/web/public/proveedor/perfil/index.html"];
const editorJs = files["apps/web/public/proveedor/perfil/profile.js"];
const adminJs = files["apps/web/public/admin/talleres/profiles.js"];
const publicHtml = files["apps/web/public/taller/index.html"];
const publicJs = files["apps/web/public/taller/provider.js"];
const publicMediaCss = files["apps/web/public/taller/provider-media.css"];

for (const expected of [
  "CREATE TABLE provider_profile_media",
  "kind IN ('LOGO','COVER','GALLERY')",
  "provider_profile_media_00_guard_write",
  "provider_profiles_01_require_cover",
  "PROVIDER_PROFILE_COVER_REQUIRED",
  "ALTER TABLE provider_profile_media ENABLE ROW LEVEL SECURITY",
  "ALTER TABLE provider_profile_media FORCE ROW LEVEL SECURITY",
  "app.is_provider_actor(provider_id)",
  "FOR UPDATE",
  "'media', COALESCE(("
]) {
  assert.match(migration, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}
assert.match(migration, /maximum := CASE NEW\.kind WHEN 'LOGO' THEN 1 WHEN 'COVER' THEN 1 ELSE 6 END/);
assert.match(migration, /media\.kind = 'COVER'[\s\S]*media\.status = 'READY'/);
assert.match(migration, /previewStorageKey/);
assert.doesNotMatch(migration, /CATALOG_READER/);
assert.doesNotMatch(migration, /FOR DELETE/);

for (const expected of [
  "createProviderProfileMediaService",
  "async upload",
  "async updateMetadata",
  "async remove",
  "async openAdmin",
  "provider_profile_publications",
  "published_reference",
  "retainedForPublishedRevision",
  "MEDIA_LIMIT_REACHED",
  "MAX_IMAGE_BYTES"
]) {
  assert.match(mediaService, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}
assert.match(mediaService, /image\/jpeg/);
assert.match(mediaService, /image\/png/);
assert.match(mediaService, /image\/webp/);
assert.match(mediaService, /await storage\.remove\(key\)/);
assert.doesNotMatch(mediaService, /video\/mp4/);

for (const expected of [
  "PROVIDER_MEDIA",
  "ADMIN_MEDIA",
  "x-media-kind",
  "profileMediaService.upload",
  "profileMediaService.openAdmin",
  "Content-Security-Policy"
]) {
  assert.match(mediaApi, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}
assert.match(mediaApi, /api\\\/provider\\\/profile\\\/media/);
assert.match(mediaApi, /api\\\/admin\\\/provider-profiles/);

assert.match(apiServer, /createProviderProfileMediaService/);
assert.match(apiServer, /createProviderProfileMediaApiHandler/);
assert.match(apiServer, /storage: mediaStorage/);

assert.match(providerProxy, /x-media-kind/);
assert.match(providerProxy, /atelier_provider_session/);
assert.match(providerProxy, /Authorization: `Bearer \$\{token\}`/);
assert.match(providerProxy, /pipeline\(Readable\.fromWeb/);
assert.match(adminProxy, /action === "media"/);
assert.match(adminProxy, /preview === "preview"/);
assert.match(adminProxy, /DEV_ADMIN_TOKEN/);
assert.match(adminProxy, /pipeline\(Readable\.fromWeb/);

assert.match(catalogService, /profile\.media/);
assert.match(catalogService, /async openProviderMedia/);
assert.match(catalogService, /provider_profile_publications publication/);
assert.match(catalogService, /jsonb_array_elements\(COALESCE\(publication\.snapshot -> 'media'/);
assert.doesNotMatch(catalogService, /provider_profile_media/);
assert.match(catalogApi, /PROVIDER_MEDIA_PATTERN/);
assert.match(catalogApi, /openProviderMedia/);
assert.match(publicProxy, /providers/);
assert.match(publicProxy, /media/);
assert.doesNotMatch(publicProxy, /Authorization|DEV_ADMIN_TOKEN|atelier_provider_session/);

for (const expected of [
  "logo-file",
  "cover-file",
  "gallery-file",
  "ready-cover",
  "preview-cover",
  "preview-logo"
]) assert.match(editorHtml, new RegExp(expected));
assert.match(editorJs, /X-Media-Kind/);
assert.match(editorJs, /MAX_IMAGE_BYTES/);
assert.match(editorJs, /mediaFor\("GALLERY"\)/);
assert.match(editorJs, /remaining = 6/);
assert.match(editorJs, /\/internal\/provider\/profile\/media/);
assert.doesNotMatch(editorJs, /innerHTML|localStorage|sessionStorage|document\.cookie|Authorization|Bearer/);

assert.match(adminJs, /\/media/);
assert.match(adminJs, /Imagen del taller/);
assert.match(adminJs, /Aprobar perfil/);
assert.match(adminJs, /hasCover/);
assert.doesNotMatch(adminJs, /innerHTML|localStorage|sessionStorage|document\.cookie|Authorization|Bearer/);

assert.match(publicHtml, /provider-media\.css/);
assert.match(publicHtml, /id="provider-cover"/);
assert.match(publicHtml, /id="provider-logo"/);
assert.match(publicHtml, /id="provider-gallery"/);
assert.match(publicJs, /provider\.cover/);
assert.match(publicJs, /provider\.logo/);
assert.match(publicJs, /provider\.gallery/);
assert.match(publicJs, /AtelierImages\.configure/);
assert.doesNotMatch(publicJs, /innerHTML|localStorage|sessionStorage|document\.cookie|Authorization|Bearer/);
assert.match(publicMediaCss, /provider-cover/);
assert.match(publicMediaCss, /provider-gallery/);

for (const [name, script] of [
  ["editor multimedia", editorJs],
  ["revisión multimedia", adminJs],
  ["escaparate multimedia", publicJs]
]) {
  assert.doesNotThrow(() => new Function(script), `${name} debe tener sintaxis JavaScript válida`);
}

console.log("Multimedia del perfil validada: límites, aislamiento, revisión, retención y publicación por snapshot.");

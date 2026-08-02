import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const paths = [
  "packages/database/migrations/0013_public_catalog_access.sql",
  "apps/api/src/public-catalog-service.mjs",
  "apps/api/src/public-catalog-api.mjs",
  "apps/api/src/server.mjs",
  "apps/web/src/public-catalog-proxy.mjs",
  "apps/web/src/server.mjs",
  "apps/web/public/tienda/index.html",
  "apps/web/public/tienda/store.js",
  "apps/web/public/tienda/store.css",
  "apps/web/public/tienda/articulo/index.html",
  "apps/web/public/tienda/product.js"
];
const files = Object.fromEntries(await Promise.all(paths.map(async (path) => [
  path,
  await readFile(new URL(`../${path}`, import.meta.url), "utf8")
])));

const migration = files["packages/database/migrations/0013_public_catalog_access.sql"];
const service = files["apps/api/src/public-catalog-service.mjs"];
const api = files["apps/api/src/public-catalog-api.mjs"];
const proxy = files["apps/web/src/public-catalog-proxy.mjs"];
const listHtml = files["apps/web/public/tienda/index.html"];
const listJs = files["apps/web/public/tienda/store.js"];
const detailHtml = files["apps/web/public/tienda/articulo/index.html"];
const detailJs = files["apps/web/public/tienda/product.js"];

assert.match(migration, /providers_catalog_select_policy/);
assert.match(migration, /products_catalog_select_policy/);
assert.match(migration, /status = 'PUBLISHED'/);
assert.match(migration, /status = 'ACTIVE'/);
assert.match(migration, /status = 'READY'/);
assert.doesNotMatch(migration, /FOR INSERT|FOR UPDATE|FOR DELETE/);

assert.match(service, /role: "CUSTOMER"/);
assert.match(service, /product\.status = 'PUBLISHED'/);
assert.match(service, /provider\.status = 'ACTIVE'/);
assert.match(service, /row\.kind !== "VIDEO"/);
assert.match(service, /preview_storage_key/);
assert.doesNotMatch(service, /contact_email AS|contact_name AS|legal_name AS/);
assert.match(api, /public, max-age=60/);
assert.match(api, /Content-Security-Policy/);
assert.match(api, /request\.method !== "GET"/);

assert.match(proxy, /Readable\.fromWeb/);
assert.match(proxy, /request\.method !== "GET"/);
assert.doesNotMatch(proxy, /Authorization|Cookie|DEV_ADMIN_TOKEN|atelier_provider_session/);

for (const html of [listHtml, detailHtml]) {
  assert.match(html, /noindex,nofollow,noarchive/);
  assert.doesNotMatch(html, /\sstyle=/i);
  assert.doesNotMatch(html, /<script[^>]*>[^<]/i);
}
assert.match(listHtml, /La tienda de los talleres invitados/);
assert.match(listJs, /\/internal\/catalog\/products/);
assert.match(detailJs, /\/internal\/catalog\/products/);
assert.match(detailJs, /item\.kind === "VIDEO"/);
assert.doesNotMatch(listJs, /Authorization|Bearer|localStorage|sessionStorage|document\.cookie/);
assert.doesNotMatch(detailJs, /Authorization|Bearer|localStorage|sessionStorage|document\.cookie/);
assert.doesNotMatch(listJs, /\.innerHTML\s*=/);
assert.doesNotMatch(detailJs, /\.innerHTML\s*=/);

console.log("Catálogo público publicado validado.");

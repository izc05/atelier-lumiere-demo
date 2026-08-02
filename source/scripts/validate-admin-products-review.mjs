import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const paths = [
  "apps/api/src/admin-products-api.mjs",
  "apps/api/src/admin-products-service.mjs",
  "apps/api/src/server.mjs",
  "apps/web/src/admin-products-proxy.mjs",
  "apps/web/src/server.mjs",
  "apps/web/public/admin/proveedores/index.html",
  "apps/web/public/admin/articulos/index.html",
  "apps/web/public/admin/articulos/review.js",
  "apps/web/public/admin/articulos/review.css",
  "apps/web/public/admin/articulos/detail-extra.css",
  "apps/web/public/admin/articulos/revisar/index.html",
  "apps/web/public/admin/articulos/detail.js"
];
const files = Object.fromEntries(await Promise.all(paths.map(async (path) => [
  path,
  await readFile(new URL(`../${path}`, import.meta.url), "utf8")
])));

const api = files["apps/api/src/admin-products-api.mjs"];
const service = files["apps/api/src/admin-products-service.mjs"];
const proxy = files["apps/web/src/admin-products-proxy.mjs"];
const providersHtml = files["apps/web/public/admin/proveedores/index.html"];
const listHtml = files["apps/web/public/admin/articulos/index.html"];
const listJs = files["apps/web/public/admin/articulos/review.js"];
const detailHtml = files["apps/web/public/admin/articulos/revisar/index.html"];
const detailJs = files["apps/web/public/admin/articulos/detail.js"];

assert.match(api, /\/api\/admin\/products/);
assert.match(api, /review\|publish/);
assert.match(api, /authenticateRequest/);
assert.match(api, /Content-Security-Policy/);
assert.match(service, /PRODUCT_NOT_IN_REVIEW/);
assert.match(service, /PRODUCT_NOT_APPROVED/);
assert.match(service, /PRODUCT_REVIEW_APPROVED/);
assert.match(service, /PRODUCT_CHANGES_REQUESTED/);
assert.match(service, /PRODUCT_PUBLISHED/);
assert.match(service, /reviewerNote/);
assert.match(service, /openPreview/);
assert.doesNotMatch(service, /preview_storage_key[^\n]*metadata/);

assert.match(proxy, /adminSessionIsActive/);
assert.match(proxy, /DEV_ADMIN_TOKEN/);
assert.match(proxy, /body: request, duplex: "half"/);
assert.match(proxy, /Readable\.fromWeb/);
assert.match(proxy, /ENABLE_ADMIN_UI/);
assert.match(proxy, /\/admin\/articulos\/revisar/);
assert.doesNotMatch(proxy, /localStorage|sessionStorage/);

for (const html of [listHtml, detailHtml]) {
  assert.match(html, /noindex,nofollow,noarchive/);
  assert.match(html, /no-referrer/);
  assert.doesNotMatch(html, /\sstyle=/i);
  assert.doesNotMatch(html, /<script[^>]*>[^<]/i);
}
assert.match(providersHtml, /href="\/admin\/articulos\/"/);
assert.match(listHtml, /Revisión de artículos/);
assert.match(listJs, /\/internal\/admin\/products/);
assert.match(listJs, /IN_REVIEW/);
assert.match(detailHtml, /Solicitar cambios/);
assert.match(detailHtml, /Aprobar artículo/);
assert.match(detailHtml, /Publicar artículo/);
assert.match(detailJs, /CHANGES_REQUESTED/);
assert.match(detailJs, /APPROVED/);
assert.match(detailJs, /\/publish/);
assert.match(detailJs, /\/review/);
assert.match(detailJs, /\/media\/\$\{item\.id\}\/preview/);
assert.doesNotMatch(listJs, /Authorization|Bearer|DEV_ADMIN_TOKEN|atelier_admin_session/);
assert.doesNotMatch(detailJs, /Authorization|Bearer|DEV_ADMIN_TOKEN|atelier_admin_session/);
assert.doesNotMatch(listJs, /\.innerHTML\s*=/);
assert.doesNotMatch(detailJs, /\.innerHTML\s*=/);

console.log("Revisión administrativa de artículos validada.");

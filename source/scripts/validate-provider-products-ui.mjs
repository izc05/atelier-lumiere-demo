import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = Object.fromEntries(await Promise.all([
  "apps/web/src/provider-products-proxy.mjs",
  "apps/web/src/server.mjs",
  "apps/web/public/proveedor/panel/index.html",
  "apps/web/public/proveedor/panel.js",
  "apps/web/public/proveedor/articulos/index.html",
  "apps/web/public/proveedor/articulos/products.js",
  "apps/web/public/proveedor/articulos/products.css",
  "apps/web/public/proveedor/articulos/editor-extra.css",
  "apps/web/public/proveedor/articulos/editar/index.html",
  "apps/web/public/proveedor/articulos/editor.js"
].map(async (path) => [path, await readFile(new URL(`../${path}`, import.meta.url), "utf8")])));

const proxy = files["apps/web/src/provider-products-proxy.mjs"];
const server = files["apps/web/src/server.mjs"];
const listHtml = files["apps/web/public/proveedor/articulos/index.html"];
const listJs = files["apps/web/public/proveedor/articulos/products.js"];
const editorHtml = files["apps/web/public/proveedor/articulos/editar/index.html"];
const editorJs = files["apps/web/public/proveedor/articulos/editor.js"];
const panelHtml = files["apps/web/public/proveedor/panel/index.html"];
const panelJs = files["apps/web/public/proveedor/panel.js"];

assert.match(proxy, /atelier_provider_session/);
assert.match(proxy, /HttpOnly/);
assert.match(proxy, /SameSite=Strict/);
assert.match(proxy, /Authorization: `Bearer \$\{token\}`/);
assert.match(proxy, /body: request, duplex: "half"/);
assert.match(proxy, /Readable\.fromWeb/);
assert.match(proxy, /\/proveedor\/articulos\/editar/);
assert.match(proxy, /content\|preview/);
assert.doesNotMatch(proxy, /apiAdminToken|DEV_ADMIN_TOKEN/);
assert.match(server, /createProviderProductsWebHandler/);

for (const html of [listHtml, editorHtml]) {
  assert.match(html, /noindex,nofollow,noarchive/);
  assert.match(html, /no-referrer/);
  assert.doesNotMatch(html, /\sstyle=/i);
  assert.doesNotMatch(html, /<script[^>]*>[^<]/i);
}

assert.match(listHtml, /Mis artículos/);
assert.match(listHtml, /Crear artículo/);
assert.match(listJs, /\/internal\/provider\/products/);
assert.match(listJs, /CHANGES_REQUESTED/);
assert.doesNotMatch(listJs, /Authorization|Bearer|atelier_provider_session/);

assert.match(editorHtml, /Hasta ocho JPEG, PNG o WebP de 12 MB y un MP4 de 50 MB/);
assert.match(editorHtml, /Enviar a revisión/);
assert.match(editorHtml, /editor-extra\.css/);
assert.match(editorJs, /MAX_IMAGE_BYTES = 12 \* 1024 \* 1024/);
assert.match(editorJs, /MAX_VIDEO_BYTES = 50 \* 1024 \* 1024/);
assert.match(editorJs, /\/media\/\$\{item\.id\}\/preview/);
assert.match(editorJs, /\/submit/);
assert.match(editorJs, /expectedVersion/);
assert.match(editorJs, /progress\.value/);
assert.doesNotMatch(editorJs, /Authorization|Bearer|atelier_provider_session/);
assert.doesNotMatch(editorJs, /\.innerHTML\s*=/);
assert.doesNotMatch(listJs, /\.innerHTML\s*=/);

assert.match(panelHtml, /href="\/proveedor\/articulos\/"/);
assert.match(panelHtml, /id="articles-count"/);
assert.match(panelJs, /\/internal\/provider\/products/);
assert.doesNotMatch(panelJs, /Authorization|Bearer|atelier_provider_session/);

console.log("Interfaz privada de artículos validada.");

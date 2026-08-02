import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const paths = [
  "apps/web/src/provider-blog-proxy.mjs",
  "apps/web/src/server.mjs",
  "apps/web/public/proveedor/panel/index.html",
  "apps/web/public/proveedor/panel.js",
  "apps/web/public/proveedor/publicaciones/index.html",
  "apps/web/public/proveedor/publicaciones/posts.js",
  "apps/web/public/proveedor/publicaciones/blog.css",
  "apps/web/public/proveedor/publicaciones/media.css",
  "apps/web/public/proveedor/publicaciones/editar/index.html",
  "apps/web/public/proveedor/publicaciones/editor.js"
];
const files = Object.fromEntries(await Promise.all(paths.map(async (path) => [
  path,
  await readFile(new URL(`../${path}`, import.meta.url), "utf8")
])));

const proxy = files["apps/web/src/provider-blog-proxy.mjs"];
const server = files["apps/web/src/server.mjs"];
const panelHtml = files["apps/web/public/proveedor/panel/index.html"];
const panelJs = files["apps/web/public/proveedor/panel.js"];
const listHtml = files["apps/web/public/proveedor/publicaciones/index.html"];
const listJs = files["apps/web/public/proveedor/publicaciones/posts.js"];
const editorHtml = files["apps/web/public/proveedor/publicaciones/editar/index.html"];
const editorJs = files["apps/web/public/proveedor/publicaciones/editor.js"];

assert.match(proxy, /atelier_provider_session/);
assert.match(proxy, /HttpOnly/);
assert.match(proxy, /SameSite=Strict/);
assert.match(proxy, /Authorization: `Bearer \$\{token\}`/);
assert.match(proxy, /body: request, duplex: "half"/);
assert.match(proxy, /Readable\.fromWeb/);
assert.match(proxy, /\/proveedor\/publicaciones\/editar/);
assert.match(proxy, /tags\|products\|submit\|media/);
assert.match(proxy, /x-media-placement/);
assert.match(proxy, /content\|preview/);
assert.doesNotMatch(proxy, /DEV_ADMIN_TOKEN|WEB_ADMIN_ACCESS_KEY/);
assert.match(server, /createProviderBlogWebHandler/);

for (const html of [listHtml, editorHtml]) {
  assert.match(html, /noindex,nofollow,noarchive/);
  assert.match(html, /no-referrer/);
  assert.doesNotMatch(html, /\sstyle=/i);
  assert.doesNotMatch(html, /<script[^>]*>[^<]/i);
}

assert.match(listHtml, /Mis publicaciones/);
assert.match(listHtml, /Crear publicación/);
assert.match(listJs, /\/internal\/provider\/blog-posts/);
assert.match(listJs, /CHANGES_REQUESTED/);
assert.doesNotMatch(listJs, /Authorization|Bearer|atelier_provider_session/);
assert.doesNotMatch(listJs, /\.innerHTML\s*=/);

assert.match(editorHtml, /Contenido en Markdown/);
assert.match(editorHtml, /mínimo 40 caracteres/);
assert.match(editorHtml, /mínimo 200 caracteres/);
assert.match(editorHtml, /hasta ocho piezas/i);
assert.match(editorHtml, /Hasta doce fotografías JPEG, PNG o WebP de 12 MB/);
assert.match(editorHtml, /id="cover-input"/);
assert.match(editorHtml, /id="inline-input"/);
assert.match(editorHtml, /media\.css/);
assert.match(editorJs, /state\.selectedProductIds\.size >= 8/);
assert.match(editorJs, /\.slice\(0, 12\)/);
assert.match(editorJs, /MAX_IMAGE_BYTES = 12 \* 1024 \* 1024/);
assert.match(editorJs, /MAX_IMAGES = 12/);
assert.match(editorJs, /X-Media-Placement/);
assert.match(editorJs, /\/media\/\$\{item\.id\}\/\$\{variant\}/);
assert.match(editorJs, /placement: selectedPlacement\.value/);
assert.match(editorJs, /expectedVersion/);
assert.match(editorJs, /\/tags/);
assert.match(editorJs, /\/products/);
assert.match(editorJs, /\/submit/);
assert.match(editorJs, /textContent = text/);
assert.doesNotMatch(editorJs, /Authorization|Bearer|atelier_provider_session/);
assert.doesNotMatch(editorJs, /\.innerHTML\s*=/);
assert.doesNotMatch(editorJs, /insertAdjacentHTML/);

assert.match(panelHtml, /href="\/proveedor\/publicaciones\/"/);
assert.match(panelHtml, /id="posts-count"/);
assert.match(panelJs, /\/internal\/provider\/blog-posts/);
assert.doesNotMatch(panelJs, /Authorization|Bearer|atelier_provider_session/);

console.log("Interfaz privada y gestor multimedia del blog validados.");

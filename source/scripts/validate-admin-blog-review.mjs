import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const paths = [
  "packages/database/migrations/0017_blog_publish_cover_guard.sql",
  "apps/api/src/admin-blog-service.mjs",
  "apps/api/src/admin-blog-api.mjs",
  "apps/api/src/server.mjs",
  "apps/api/tests/admin-blog-api.test.mjs",
  "apps/web/src/admin-blog-proxy.mjs",
  "apps/web/src/server.mjs",
  "apps/web/tests/admin-blog-proxy.test.mjs",
  "apps/web/public/admin/publicaciones/index.html",
  "apps/web/public/admin/publicaciones/review.js",
  "apps/web/public/admin/publicaciones/revisar/index.html",
  "apps/web/public/admin/publicaciones/detail.js",
  "apps/web/public/admin/publicaciones/blog-review.css",
  "apps/web/public/admin/articulos/index.html"
];
const files = Object.fromEntries(await Promise.all(paths.map(async (path) => [
  path,
  await readFile(new URL(`../${path}`, import.meta.url), "utf8")
])));

const migration = files["packages/database/migrations/0017_blog_publish_cover_guard.sql"];
const service = files["apps/api/src/admin-blog-service.mjs"];
const api = files["apps/api/src/admin-blog-api.mjs"];
const apiServer = files["apps/api/src/server.mjs"];
const apiTest = files["apps/api/tests/admin-blog-api.test.mjs"];
const proxy = files["apps/web/src/admin-blog-proxy.mjs"];
const webServer = files["apps/web/src/server.mjs"];
const proxyTest = files["apps/web/tests/admin-blog-proxy.test.mjs"];
const listHtml = files["apps/web/public/admin/publicaciones/index.html"];
const listJs = files["apps/web/public/admin/publicaciones/review.js"];
const detailHtml = files["apps/web/public/admin/publicaciones/revisar/index.html"];
const detailJs = files["apps/web/public/admin/publicaciones/detail.js"];
const articlesHtml = files["apps/web/public/admin/articulos/index.html"];

assert.match(migration, /BLOG_POST_COVER_REQUIRED/);
assert.match(migration, /placement = 'COVER'/);
assert.match(migration, /status = 'READY'/);
assert.match(migration, /preview_mime_type = 'image\/webp'/);

assert.match(service, /createAdminBlogService/);
assert.match(service, /BLOG_REVIEW_APPROVED/);
assert.match(service, /BLOG_CHANGES_REQUESTED/);
assert.match(service, /BLOG_POST_PUBLISHED/);
assert.match(service, /BLOG_POST_COVER_REQUIRED/);
assert.match(service, /blog_post_reviews/);
assert.match(service, /openPreview/);
assert.doesNotMatch(service, /storage_key[^\n]*metadata/);

assert.match(api, /\/api\/admin\/blog-posts/);
assert.match(api, /review\|publish/);
assert.match(api, /Content-Security-Policy/);
assert.match(api, /private, no-store/);
assert.match(apiServer, /createAdminBlogService/);
assert.match(apiServer, /createAdminBlogApiHandler/);
assert.match(apiTest, /BLOG_POST_COVER_REQUIRED/);
assert.match(apiTest, /BLOG_CHANGES_REQUESTED/);
assert.match(apiTest, /BLOG_POST_PUBLISHED/);

assert.match(proxy, /\/internal\/admin\/blog-posts/);
assert.match(proxy, /\/internal\/admin\/session/);
assert.match(proxy, /Authorization: `Bearer \$\{token\}`/);
assert.match(proxy, /Readable\.fromWeb/);
assert.match(proxy, /ENABLE_ADMIN_UI/);
assert.match(webServer, /createAdminBlogWebHandler/);
assert.match(proxyTest, /admin-blog-proxy-token/);

for (const html of [listHtml, detailHtml]) {
  assert.match(html, /noindex,nofollow,noarchive/);
  assert.match(html, /no-referrer/);
  assert.doesNotMatch(html, /\sstyle=/i);
  assert.doesNotMatch(html, /<script[^>]*>[^<]/i);
}
assert.match(listHtml, /Revisión del blog/);
assert.match(listJs, /\/internal\/admin\/blog-posts/);
assert.match(detailHtml, /Contenido completo/);
assert.match(detailHtml, /Portada y galería/);
assert.match(detailJs, /textContent = text/);
assert.match(detailJs, /CHANGES_REQUESTED/);
assert.match(detailJs, /\/publish/);
assert.match(detailJs, /\/media\/\$\{item\.id\}\/preview/);
assert.doesNotMatch(listJs, /Authorization|Bearer|DEV_ADMIN_TOKEN/);
assert.doesNotMatch(detailJs, /Authorization|Bearer|DEV_ADMIN_TOKEN/);
assert.doesNotMatch(listJs, /\.innerHTML\s*=/);
assert.doesNotMatch(detailJs, /\.innerHTML\s*=/);
assert.doesNotMatch(detailJs, /insertAdjacentHTML/);
assert.match(articlesHtml, /href="\/admin\/publicaciones\/"/);

console.log("Revisión administrativa del blog validada.");

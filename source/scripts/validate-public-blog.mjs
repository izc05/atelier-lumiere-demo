import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const paths = [
  "packages/database/migrations/0017_blog_publish_cover_guard.sql",
  "packages/database/migrations/0019_public_blog_reader.sql",
  "apps/api/src/public-blog-service.mjs",
  "apps/api/src/public-blog-api.mjs",
  "apps/api/src/server.mjs",
  "apps/web/src/public-blog-proxy.mjs",
  "apps/web/src/server.mjs",
  "apps/web/public/blog/index.html",
  "apps/web/public/blog/blog.js",
  "apps/web/public/blog/blog.css",
  "apps/web/public/blog/historia/index.html",
  "apps/web/public/blog/detail.js"
];

const files = Object.fromEntries(await Promise.all(paths.map(async (path) => [
  path,
  await readFile(new URL(`../${path}`, import.meta.url), "utf8")
])));

const coverGuard = files[paths[0]];
const migration = files[paths[1]];
const service = files[paths[2]];
const api = files[paths[3]];
const proxy = files[paths[5]];
const list = files[paths[7]];
const listJs = files[paths[8]];
const detail = files[paths[10]];
const detailJs = files[paths[11]];

assert.match(coverGuard, /placement = 'COVER'/);
assert.match(coverGuard, /preview_mime_type = 'image\/webp'/);
assert.match(migration, /CATALOG_READER/);
assert.match(migration, /status = 'PUBLISHED'/);
assert.match(migration, /preview_mime_type = 'image\/webp'/);
assert.doesNotMatch(migration, /blog_posts_catalog_reader_select[\s\S]*FROM blog_post_media/);
assert.match(service, /provider\.status = 'ACTIVE'/);
assert.match(service, /post\.status = 'PUBLISHED'/);
assert.match(service, /product\.status = 'PUBLISHED'/);
assert.doesNotMatch(service, /contact_email|legal_name|reviewer_note/);
assert.match(api, /\/api\/blog\/posts/);
assert.match(api, /public, max-age=60/);
assert.match(api, /Content-Security-Policy/);
assert.match(api, /max-age=31536000, immutable/);
assert.match(proxy, /\/internal\\\/blog/);
assert.match(proxy, /Readable\.fromWeb/);
assert.doesNotMatch(proxy, /Authorization|Bearer/);

for (const html of [list, detail]) {
  assert.match(html, /noindex,nofollow,noarchive/);
  assert.doesNotMatch(html, /\sstyle=/i);
  assert.doesNotMatch(html, /<script[^>]*>[^<]/i);
}
assert.match(listJs, /\/internal\/blog\/posts/);
assert.match(listJs, /AtelierImages\.configure/);
assert.match(detailJs, /AtelierImages\.configure/);
assert.match(detailJs, /defaultWidth: 960/);
assert.doesNotMatch(listJs, /innerHTML|Authorization|Bearer/);
assert.doesNotMatch(detailJs, /innerHTML|Authorization|Bearer/);
assert.match(detailJs, /textContent/);
assert.match(detailJs, /noopener noreferrer/);

console.log("Blog público validado.");

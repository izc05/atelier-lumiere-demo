import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const paths = [
  "packages/database/migrations/0014_blog_editorial.sql",
  "packages/database/migrations/0015_blog_media_upload_guards.sql",
  "packages/database/migrations/0016_blog_media_active_limits.sql",
  "apps/api/src/blog-media-service.mjs",
  "apps/api/src/blog-media-api.mjs",
  "apps/api/src/server.mjs",
  "apps/api/tests/blog-media-api.test.mjs",
  "apps/web/src/provider-blog-proxy.mjs",
  "apps/web/tests/provider-blog-media-proxy.test.mjs"
];
const files = Object.fromEntries(await Promise.all(paths.map(async (path) => [
  path,
  await readFile(new URL(`../${path}`, import.meta.url), "utf8")
])));

const schema = files["packages/database/migrations/0014_blog_editorial.sql"];
const guards = files["packages/database/migrations/0015_blog_media_upload_guards.sql"];
const limits = files["packages/database/migrations/0016_blog_media_active_limits.sql"];
const service = files["apps/api/src/blog-media-service.mjs"];
const api = files["apps/api/src/blog-media-api.mjs"];
const server = files["apps/api/src/server.mjs"];
const apiTest = files["apps/api/tests/blog-media-api.test.mjs"];
const proxy = files["apps/web/src/provider-blog-proxy.mjs"];
const proxyTest = files["apps/web/tests/provider-blog-media-proxy.test.mjs"];

assert.match(schema, /placement IN \('COVER', 'INLINE'\)/);
assert.match(schema, /size_bytes BETWEEN 1 AND 12582912/);
assert.match(schema, /preview_mime_type = 'image\/webp'/);
assert.match(guards, /upload_expires_at/);
assert.match(guards, /app\.blog_media_upload_id/);
assert.match(guards, /BLOG_MEDIA_INTERNAL_FIELDS_IMMUTABLE/);
assert.match(guards, /BLOG_MEDIA_READY_INVALID/);
assert.match(guards, /status = 'READY'/);
assert.match(limits, /status IN \('PENDING_UPLOAD', 'READY'\)/);
assert.match(limits, /BLOG_IMAGE_LIMIT_EXCEEDED/);

assert.match(service, /MAX_IMAGE_BYTES = 12 \* 1024 \* 1024/);
assert.match(service, /BLOG_MEDIA_LIMIT_REACHED/);
assert.match(service, /BLOG_COVER_ALREADY_EXISTS/);
assert.match(service, /providers\/\$\{providerId\}\/blog\/\$\{postId\}/);
assert.match(service, /previewStorageKey/);
assert.match(service, /BLOG_MEDIA_UPLOADED/);
assert.match(service, /BLOG_MEDIA_DELETED/);
assert.doesNotMatch(service, /video\/mp4/);

assert.match(api, /X-Media-Placement|x-media-placement/i);
assert.match(api, /Content-Security-Policy/);
assert.match(api, /private, no-store/);
assert.match(api, /pipeline\(opened\.stream, response\)/);
assert.match(server, /createBlogMediaService/);
assert.match(server, /createBlogMediaApiHandler/);

assert.match(apiTest, /BLOG_COVER_ALREADY_EXISTS/);
assert.match(apiTest, /BLOG_MEDIA_LIMIT_REACHED/);
assert.match(apiTest, /toString\("ascii", 8, 12\), "WEBP"/);
assert.match(apiTest, /BLOG_POST_LOCKED/);
assert.match(apiTest, /storage_key/);
assert.match(proxy, /x-media-placement/);
assert.match(proxy, /Readable\.fromWeb/);
assert.match(proxyTest, /binary-blog-cover-content/);
assert.match(proxyTest, /Bearer \$\{TOKEN\}/);

console.log("Contratos multimedia privados del blog validados.");

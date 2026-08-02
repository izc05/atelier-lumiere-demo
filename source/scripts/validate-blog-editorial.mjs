import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const paths = [
  "packages/database/migrations/0014_blog_editorial.sql",
  "packages/database/migrations/0015_blog_review_guards.sql",
  "packages/database/tests/blog_editorial.sql",
  "apps/api/src/blog-posts-service.mjs",
  "apps/api/src/blog-posts-api.mjs",
  "apps/api/src/server.mjs",
  "apps/api/tests/blog-posts-api.test.mjs"
];

const files = Object.fromEntries(await Promise.all(paths.map(async (path) => [
  path,
  await readFile(new URL(`../${path}`, import.meta.url), "utf8")
])));

const schema = files["packages/database/migrations/0014_blog_editorial.sql"];
const guards = files["packages/database/migrations/0015_blog_review_guards.sql"];
const sqlTest = files["packages/database/tests/blog_editorial.sql"];
const service = files["apps/api/src/blog-posts-service.mjs"];
const api = files["apps/api/src/blog-posts-api.mjs"];
const server = files["apps/api/src/server.mjs"];
const integration = files["apps/api/tests/blog-posts-api.test.mjs"];

for (const table of [
  "blog_posts",
  "blog_post_tags",
  "blog_post_products",
  "blog_post_media",
  "blog_post_reviews"
]) {
  assert.match(schema, new RegExp(`CREATE TABLE ${table}`));
  assert.match(schema, new RegExp(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`));
}

assert.match(schema, /DRAFT.*IN_REVIEW.*CHANGES_REQUESTED.*APPROVED.*PUBLISHED.*ARCHIVED/s);
assert.match(schema, /body_markdown text/);
assert.match(schema, /char_length\(body_markdown\) <= 50000/);
assert.match(schema, /size_bytes BETWEEN 1 AND 12582912/);
assert.match(schema, /active_count >= 12/);
assert.match(schema, /blog_post_one_cover_idx/);
assert.match(schema, /BLOG_POST_NOT_READY_FOR_REVIEW/);
assert.match(schema, /BLOG_POST_PROVIDER_WRITE_NOT_ALLOWED/);
assert.match(schema, /BLOG_REVIEW_UPDATE_NOT_ALLOWED/);
assert.match(guards, /BLOG_REVIEW_APPROVAL_REQUIRED/);

assert.match(service, /createBlogPostsService/);
assert.match(service, /BLOG_POST_VERSION_CONFLICT/);
assert.match(service, /RELATED_PRODUCT_NOT_ALLOWED/);
assert.match(service, /BLOG_POST_SUBMITTED/);
assert.match(service, /status <> 'ARCHIVED'/);
assert.doesNotMatch(service, /storage_key:/);
assert.doesNotMatch(service, /contact_email|legal_name/);

assert.match(api, /\/api\/provider\/blog-posts/);
assert.match(api, /providerAuthService\.authenticate/);
assert.match(api, /MAX_BODY_BYTES = 2 \* 1024 \* 1024/);
assert.match(api, /Cache-Control": "no-store/);
assert.doesNotMatch(api, /DEV_ADMIN_TOKEN|apiAdminToken/);
assert.match(server, /createBlogPostsApiHandler/);
assert.match(server, /createBlogPostsService/);

assert.match(sqlTest, /Taller B puede leer las historias del Taller A/);
assert.match(sqlTest, /El Taller A ha relacionado un producto del Taller B/);
assert.match(sqlTest, /BLOG_REVIEW_APPROVAL_REQUIRED/);
assert.match(integration, /BLOG_POST_VERSION_CONFLICT/);
assert.match(integration, /RELATED_PRODUCT_NOT_ALLOWED/);
assert.match(integration, /BLOG_POST_LOCKED/);
assert.doesNotMatch(integration, /storage_key"\s*:/);

console.log("Base editorial multi-proveedor validada.");

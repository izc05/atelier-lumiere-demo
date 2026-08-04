import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const paths = [
  "apps/api/src/media-preview-storage.mjs",
  "apps/api/src/public-catalog-api.mjs",
  "apps/api/src/public-blog-api.mjs",
  "apps/web/public/public-shell.js",
  "apps/web/public/home.js",
  "apps/web/public/tienda/store.js",
  "apps/web/public/tienda/product.js",
  "apps/web/public/taller/provider.js",
  "apps/web/public/blog/blog.js",
  "apps/web/public/blog/detail.js",
  "apps/api/tests/public-image-variants.test.mjs"
];

const files = Object.fromEntries(await Promise.all(paths.map(async (path) => [
  path,
  await readFile(new URL(`../${path}`, import.meta.url), "utf8")
])));

const storage = files[paths[0]];
const catalogApi = files[paths[1]];
const blogApi = files[paths[2]];
const shell = files[paths[3]];
const pageScripts = paths.slice(4, 10).map((path) => files[path]);
const product = files[paths[6]];
const detail = files[paths[9]];
const test = files[paths[10]];

assert.match(storage, /DEFAULT_VARIANT_WIDTHS[^\n]*320[^\n]*640[^\n]*960/);
assert.match(storage, /preview-\$\{width\}\.webp/);
assert.match(storage, /withoutEnlargement: true/);
assert.match(storage, /MEDIA_PREVIEW_WIDTH_INVALID/);
assert.match(storage, /MEDIA_FILE_NOT_FOUND/);
assert.match(storage, /return baseStorage\.openRead\(previewStorageKey/);

for (const api of [catalogApi, blogApi]) {
  assert.match(api, /PREVIEW_WIDTHS = new Set\(\[320, 640, 960\]\)/);
  assert.match(api, /max-age=31536000, immutable/);
  assert.match(api, /MEDIA_PREVIEW_WIDTH_INVALID/);
  assert.match(api, /\{ range: request\.headers\.range, width \}/);
}

assert.match(shell, /PUBLIC_IMAGE_WIDTHS = Object\.freeze\(\[320, 640, 960\]\)/);
assert.match(shell, /image\.srcset/);
assert.match(shell, /image\.sizes/);
assert.match(shell, /image\.loading/);
assert.match(shell, /image\.decoding = "async"/);
assert.match(shell, /fetchpriority/);
assert.match(shell, /window\.AtelierImages = Object\.freeze/);
assert.doesNotMatch(shell, /localStorage|sessionStorage|Authorization|Bearer|document\.cookie/);

for (const script of pageScripts) {
  assert.match(script, /AtelierImages\.configure/);
  assert.doesNotMatch(script, /localStorage|sessionStorage|Authorization|Bearer|document\.cookie/);
}
assert.match(product, /loading: "eager"/);
assert.match(product, /priority: "high"/);
assert.match(product, /defaultWidth: 960/);
assert.match(detail, /loading: "eager"/);
assert.match(detail, /priority: "high"/);
assert.match(detail, /defaultWidth: 960/);

assert.match(test, /preview-960\.webp/);
assert.match(test, /MEDIA_PREVIEW_WIDTH_INVALID/);
assert.match(test, /fallbackMetadata\.width <= 640/);

console.log("Rendimiento de imágenes públicas validado.");

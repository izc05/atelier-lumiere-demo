import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const paths = [
  "apps/api/src/admin-permissions.mjs",
  "apps/api/src/auth-context.mjs",
  "apps/api/tests/admin-permissions.test.mjs",
  "apps/web/public/admin/proveedores/admin-login.js",
  "apps/web/public/admin/admin-role-navigation.js",
  "apps/web/public/admin/articulos/index.html",
  "apps/web/public/admin/articulos/revisar/index.html",
  "apps/web/public/admin/publicaciones/index.html",
  "apps/web/public/admin/publicaciones/revisar/index.html"
];

const files = Object.fromEntries(await Promise.all(paths.map(async (path) => [
  path,
  await readFile(new URL(`../${path}`, import.meta.url), "utf8")
])));

const permissions = files[paths[0]];
const auth = files[paths[1]];
const tests = files[paths[2]];
const providerLogin = files[paths[3]];
const navigation = files[paths[4]];
const editorialPages = paths.slice(5).map((path) => files[path]);

for (const capability of [
  "MANAGE_PROVIDERS",
  "REVIEW_PRODUCTS",
  "REVIEW_BLOG",
  "PLATFORM_CONTROL"
]) assert.match(permissions, new RegExp(capability));

for (const role of ["PLATFORM_OWNER", "PROVIDER_MANAGER", "EDITORIAL_REVIEWER"]) {
  assert.match(permissions, new RegExp(role));
  assert.match(tests, new RegExp(role));
}

assert.match(permissions, /\/api\/admin\/providers/);
assert.match(permissions, /\/api\/admin\/products/);
assert.match(permissions, /\/api\/admin\/blog-posts/);
assert.match(permissions, /ADMIN_ROLE_FORBIDDEN/);
assert.match(permissions, /statusCode = 403|403,/);
assert.match(permissions, /authenticationMode === "development-admin-token"/);
assert.match(auth, /authorizeAdminRequest\(authenticated, request\)/);
assert.match(auth, /authorizeAdminRequest\(developmentContext, request\)/);

assert.match(tests, /solo gestiona talleres/);
assert.match(tests, /revisa catálogo y blog/);
assert.match(tests, /ADMIN_ROLE_FORBIDDEN/);
assert.match(tests, /environment: "production"/);
assert.match(tests, /environment: "development"/);

assert.match(providerLogin, /function applyRoleInterface/);
assert.match(providerLogin, /role === "PROVIDER_MANAGER"/);
assert.match(providerLogin, /role === "EDITORIAL_REVIEWER"/);
assert.match(providerLogin, /window\.location\.replace\("\/admin\/articulos\/"\)/);
assert.match(providerLogin, /productLink\.hidden = true/);
assert.match(providerLogin, /blogLink\.hidden = true/);

assert.match(navigation, /\/internal\/admin\/session/);
assert.match(navigation, /role === "PLATFORM_OWNER"/);
assert.match(navigation, /role === "EDITORIAL_REVIEWER"/);
assert.match(navigation, /role === "PROVIDER_MANAGER"/);
assert.match(navigation, /window\.location\.replace/);
assert.doesNotMatch(navigation, /innerHTML|localStorage|sessionStorage|Authorization|Bearer/);

for (const html of editorialPages) {
  assert.match(html, /\/admin\/admin-role-navigation\.js/);
  assert.match(html, /noindex,nofollow,noarchive/);
  assert.doesNotMatch(html, /\sstyle=/i);
  assert.doesNotMatch(html, /<script[^>]*>[^<]/i);
}

console.log("Permisos administrativos por rol validados.");

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const paths = [
  "apps/web/public/404/index.html",
  "apps/web/public/500/index.html",
  "apps/web/public/error-pages.css",
  "apps/web/src/public-error-pages-handler.mjs",
  "apps/web/src/server.mjs",
  "apps/web/tests/public-error-pages.test.mjs"
];
const files = Object.fromEntries(await Promise.all(paths.map(async (path) => [
  path,
  await readFile(new URL(`../${path}`, import.meta.url), "utf8")
])));

const notFound = files[paths[0]];
const internalError = files[paths[1]];
const css = files[paths[2]];
const handler = files[paths[3]];
const server = files[paths[4]];
const tests = files[paths[5]];

for (const html of [notFound, internalError]) {
  assert.match(html, /<html lang="es" class="no-js">/);
  assert.match(html, /noindex,nofollow,noarchive/);
  assert.match(html, /class="skip-link" href="#main-content"/);
  assert.match(html, /id="main-content"[^>]*tabindex="-1"/);
  assert.match(html, /data-public-header/);
  assert.match(html, /data-public-navigation/);
  assert.match(html, /data-public-menu-toggle/);
  assert.match(html, /\/public-shell\.css/);
  assert.match(html, /\/public-shell\.js/);
  assert.match(html, /\/error-pages\.css/);
  assert.doesNotMatch(html, /\sstyle=/i);
  assert.doesNotMatch(html, /\son[a-z]+=/i);
  assert.doesNotMatch(html, /<script[^>]*>[^<]/i);
  assert.doesNotMatch(html, /postgres|database|stack|exception|bearer|token|\/srv\//i);
}

assert.match(notFound, /Esta pieza no está aquí/);
assert.match(notFound, /Explorar la tienda/);
assert.match(internalError, /Algo no ha salido bien/);
assert.match(internalError, /Volver a intentarlo/);
assert.doesNotMatch(internalError, /código de error|identificador interno|detalles técnicos/i);

assert.match(css, /@media\(max-width:760px\)/);
assert.match(css, /prefers-reduced-motion/);
assert.match(css, /forced-colors/);
assert.match(css, /min-height:44px/);

assert.match(handler, /url\.pathname\.startsWith\("\/internal\/"\)/);
assert.match(handler, /captured\.statusCode === 404/);
assert.match(handler, /captured\.statusCode >= 500/);
assert.match(handler, /response\.writeHead\(statusCode, errorHeaders\(\)\)/);
assert.match(handler, /request\.method === "HEAD"/);
assert.match(handler, /"Cache-Control": "no-store"/);
assert.match(handler, /Content-Security-Policy/);
assert.doesNotMatch(handler, /error\.message|error\.stack/);

assert.match(server, /createPublicErrorPagesWebHandler/);
assert.match(server, /baseHandler: adminAuthenticationHandler/);
assert.match(server, /createLegacyRouteRedirectWebHandler/);
assert.match(server, /baseHandler: publicErrorPagesHandler/);
assert.match(server, /createServer\(legacyRouteRedirectHandler\)/);

assert.match(tests, /postgres:\/\/usuario:secreto/);
assert.match(tests, /\/internal\/desconocido/);
assert.match(tests, /archivo-ausente\.css/);
assert.match(tests, /method: "HEAD"/);
assert.match(tests, /assert\.doesNotMatch/);

console.log("Páginas públicas 404 y 500 validadas.");

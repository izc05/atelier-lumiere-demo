import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const paths = [
  "apps/web/src/request-files-proxy.mjs",
  "apps/web/src/server.mjs",
  "apps/web/public/shared/request-files.css",
  "apps/web/public/proveedor/encargos/detalle/index.html",
  "apps/web/public/proveedor/encargos/detalle/custom-detail.js",
  "apps/web/public/mis-pedidos/encargo/index.html",
  "apps/web/public/mis-pedidos/encargo/request-detail.js",
  "apps/web/tests/request-files-proxy.test.mjs"
];

const files = Object.fromEntries(await Promise.all(paths.map(async (path) => [
  path,
  await readFile(new URL(`../${path}`, import.meta.url), "utf8")
])));

const proxy = files[paths[0]];
const server = files[paths[1]];
const css = files[paths[2]];
const providerHtml = files[paths[3]];
const providerJs = files[paths[4]];
const customerHtml = files[paths[5]];
const customerJs = files[paths[6]];
const proxyTest = files[paths[7]];

assert.match(proxy, /atelier_provider_session/);
assert.match(proxy, /atelier_customer_session/);
assert.match(proxy, /custom-requests\\\/\(\[0-9a-f-\]/);
assert.match(proxy, /request-files\\\/\(\[0-9a-f-\]/);
assert.match(proxy, /x-file-name/);
assert.match(proxy, /x-message-id/);
assert.match(proxy, /content-disposition/);
assert.match(proxy, /content-range/);
assert.match(proxy, /Readable\.fromWeb/);
assert.match(proxy, /duplex: "half"/);
assert.match(proxy, /AbortSignal\.timeout\(hasBody \? 90000 : 30000\)/);
assert.doesNotMatch(proxy, /localStorage|sessionStorage/);

assert.match(server, /createRequestFilesWebHandler/);
assert.match(server, /requestFilesHandler/);

for (const html of [providerHtml, customerHtml]) {
  assert.match(html, /\/shared\/request-files\.css/);
  assert.match(html, /id="file-form"/);
  assert.match(html, /id="file-input"/);
  assert.match(html, /accept="image\/jpeg,image\/png,image\/webp,application\/pdf"/);
  assert.match(html, /id="file-progress"/);
  assert.match(html, /máximo 12 MB/);
  assert.match(html, /0 de 20 archivos/);
}

for (const script of [providerJs, customerJs]) {
  assert.match(script, /12 \* 1024 \* 1024/);
  assert.match(script, /const MAX_FILES = 20/);
  assert.match(script, /new XMLHttpRequest\(\)/);
  assert.match(script, /X-File-Name/);
  assert.match(script, /xhr\.upload\.addEventListener\("progress"/);
  assert.match(script, /request-files\/\$\{encodeURIComponent\(file\.id\)\}\/content/);
  assert.match(script, /method: "DELETE"/);
  assert.match(script, /file\.uploadedBy === currentUserId/);
  assert.doesNotMatch(script, /Authorization|Bearer|localStorage|sessionStorage|innerHTML/);
}

assert.match(providerJs, /\/internal\/provider\/session/);
assert.match(customerJs, /\/internal\/customer\/session/);
assert.match(css, /\.file-progress/);
assert.match(css, /\.file-action\.remove/);
assert.match(proxyTest, /conservando cabeceras privadas/);
assert.match(proxyTest, /sin exponer su token/);

console.log("Interfaz privada de archivos de encargos validada.");

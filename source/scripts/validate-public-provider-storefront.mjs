import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const paths = [
  "apps/web/public/taller/index.html",
  "apps/web/public/taller/provider.css",
  "apps/web/public/taller/provider.js",
  "apps/web/public/tienda/store.js"
];

const [html, css, providerJs, storeJs] = await Promise.all(paths.map((path) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8")
));

assert.match(html, /id="provider-name"/);
assert.match(html, /id="provider-specialty"/);
assert.match(html, /id="products-view"/);
assert.match(html, /Compra directa por taller/);
assert.match(html, /Envío compartido/);
assert.match(html, /noindex,nofollow,noarchive/);
assert.doesNotMatch(html, /\sstyle=/i);
assert.doesNotMatch(html, /<script[^>]*>[^<]/i);

assert.match(providerJs, /\/internal\/catalog\/products/);
assert.match(providerJs, /product\.provider\?\.slug === slug/);
assert.match(providerJs, /replaceChildren/);
assert.match(providerJs, /textContent/);
assert.match(providerJs, /AtelierCart\.wireCount/);
assert.doesNotMatch(providerJs, /innerHTML|localStorage|sessionStorage|Authorization|Bearer/);

assert.match(storeJs, /\/taller\/\?slug=/);
assert.match(storeJs, /provider-link/);
assert.doesNotMatch(storeJs, /innerHTML/);

assert.match(css, /\.provider-hero/);
assert.match(css, /@media\(max-width:760px\)/);

console.log("Escaparate público del taller validado.");

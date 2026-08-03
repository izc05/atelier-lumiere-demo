import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const paths = [
  "apps/web/public/index.html",
  "apps/web/public/styles.css",
  "apps/web/public/home.js",
  "apps/web/public/estado/index.html",
  "apps/web/public/tienda/index.html",
  "apps/web/public/tienda/articulo/index.html",
  "apps/web/public/carrito/index.html"
];

const files = Object.fromEntries(await Promise.all(paths.map(async (path) => [
  path,
  await readFile(new URL(`../${path}`, import.meta.url), "utf8")
])));

const home = files[paths[0]];
const css = files[paths[1]];
const script = files[paths[2]];
const technical = files[paths[3]];
const store = files[paths[4]];
const product = files[paths[5]];
const cart = files[paths[6]];

for (const html of [home, technical, store, product, cart]) {
  assert.match(html, /noindex,nofollow/);
  assert.doesNotMatch(html, /\sstyle=/i);
  assert.doesNotMatch(html, /<script[^>]*>[^<]/i);
}

assert.match(home, /Artesanía para celebrar/);
assert.match(home, /Cada pieza guarda un instante/);
assert.match(home, /id="featured-products"/);
assert.match(home, /id="mobile-nav"/);
assert.match(home, /id="cart-count"/);
assert.match(home, /\/tienda\/cart-store\.js/);
assert.match(home, /\/home\.js/);
assert.match(home, /checkout piloto no realiza cobros reales/i);
assert.doesNotMatch(home, /Entorno privado de desarrollo|Inicio técnico/);

assert.match(script, /\/internal\/catalog\/products/);
assert.match(script, /window\.AtelierCart\?\.wireCount/);
assert.match(script, /replaceChildren/);
assert.match(script, /event\.key === "Escape"/);
assert.doesNotMatch(script, /innerHTML|localStorage|sessionStorage|Authorization|Bearer/);

assert.match(css, /prefers-reduced-motion/);
assert.match(css, /@media \(max-width: 780px\)/);
assert.match(css, /\.mobile-nav/);
assert.match(css, /\.featured-grid/);
assert.match(css, /:focus-visible/);

assert.match(technical, /Estado de Atelier Lumière/);
assert.match(technical, /id="api-status"/);
assert.match(technical, /\/internal\/api-health/);

assert.match(store, />Inicio</);
assert.match(store, /\/blog\//);
assert.doesNotMatch(store, /Inicio técnico/);
assert.match(product, /El carrito puede reunir varias piezas de este mismo taller/);
assert.doesNotMatch(product, /Cada taller recibirá su pedido por separado/);
assert.match(cart, /Un pedido, un proveedor y un único envío/);

console.log("Portada pública premium validada.");

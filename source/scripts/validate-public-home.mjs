import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const paths = [
  "apps/web/public/index.html",
  "apps/web/public/styles.css",
  "apps/web/public/home.js",
  "apps/web/public/estado/index.html",
  "apps/web/public/tienda/index.html",
  "apps/web/public/tienda/articulo/index.html",
  "apps/web/public/carrito/index.html",
  "apps/web/public/public-shell.css",
  "apps/web/public/public-shell.js",
  "apps/web/public/unete/index.html",
  "apps/web/public/public-brand-nav.css",
  "apps/web/public/public-brand-nav.js",
  "apps/web/public/brand-entry.css",
  "apps/web/public/brand-entry.js"
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
const publicShellCss = files[paths[7]];
const publicShellScript = files[paths[8]];
const join = files[paths[9]];
const brandNavCss = files[paths[10]];
const brandNavScript = files[paths[11]];
const brandEntryCss = files[paths[12]];
const brandEntryScript = files[paths[13]];

for (const html of [home, technical, store, product, cart]) {
  assert.match(html, /noindex,nofollow/);
  assert.doesNotMatch(html, /\sstyle=/i);
  assert.doesNotMatch(html, /<script[^>]*>[^<]/i);
}

assert.match(home, /Artesanía para celebrar/);
assert.match(home, /Cada pieza guarda un instante/);
assert.match(home, /id="featured-products"/);
assert.match(home, /id="hero-workshop-controls"/);
assert.match(home, /id="hero-workshop-logo"/);
assert.match(home, /data-atelier-brand-tone="light"/);
assert.doesNotMatch(home, /hero-photo-detail|hero-detail-image/);
assert.match(home, /id="atelier-quote-text"/);
assert.match(home, /data-public-navigation/);
assert.match(home, /data-public-menu-toggle/);
assert.match(home, /id="cart-count"/);
assert.match(home, /\/tienda\/cart-store\.js/);
assert.match(home, /\/public-shell\.js/);
assert.match(home, /\/home\.js/);
assert.match(home, /checkout piloto no realiza cobros reales/i);
assert.doesNotMatch(home, /Entorno privado de desarrollo|Inicio técnico/);
assert.doesNotMatch(home, /id="mobile-nav"|id="menu-toggle"/);

assert.match(script, /\/internal\/catalog\/products/);
assert.match(script, /window\.AtelierCart\?\.wireCount/);
assert.match(script, /replaceChildren/);
assert.match(script, /ROTATION_INTERVAL = 8000/);
assert.match(script, /setupQuoteRotation/);
assert.match(script, /pointermove/);
assert.match(script, /setupCommissionParallax/);
assert.match(script, /provider\.logo/);
assert.doesNotMatch(script, /hero-detail-image|workshopDetailMedia/);
assert.match(script, /collectWorkshops\(products\)\.slice\(0, 3\)/);
assert.doesNotMatch(script, /innerHTML|localStorage|sessionStorage|Authorization|Bearer/);

assert.match(css, /prefers-reduced-motion/);
assert.match(css, /@media \(max-width: 780px\)/);
assert.match(css, /\.featured-grid/);
assert.match(css, /:focus-visible/);
assert.match(publicShellCss, /\.public-menu-toggle/);
assert.match(publicShellCss, /prefers-reduced-motion/);
assert.match(publicShellScript, /event\.key === "Escape"/);
assert.match(publicShellScript, /aria-expanded/);
assert.match(join, /data-atelier-brand-tone="dark"/);
assert.match(brandNavCss, /data-atelier-brand-tone="light"/);
assert.match(brandNavCss, /background-image: none !important/);
assert.match(brandNavScript, /requestedTone/);
assert.match(brandEntryCss, /atelierBackdropLetters/);
assert.match(brandEntryCss, /atelierEntryGlow/);
assert.match(brandEntryCss, /prefers-reduced-motion/);
assert.match(brandEntryScript, /--entry-light-x/);
assert.match(brandEntryScript, /pointermove/);

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

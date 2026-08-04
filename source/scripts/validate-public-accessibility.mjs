import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const htmlPaths = [
  "apps/web/public/index.html",
  "apps/web/public/tienda/index.html",
  "apps/web/public/tienda/articulo/index.html",
  "apps/web/public/taller/index.html",
  "apps/web/public/carrito/index.html",
  "apps/web/public/blog/index.html",
  "apps/web/public/blog/historia/index.html"
];
const assetPaths = [
  "apps/web/public/public-shell.css",
  "apps/web/public/public-shell.js"
];
const files = Object.fromEntries(await Promise.all(
  [...htmlPaths, ...assetPaths].map(async (path) => [
    path,
    await readFile(new URL(`../${path}`, import.meta.url), "utf8")
  ])
));

for (const path of htmlPaths) {
  const html = files[path];
  assert.match(html, /<html[^>]*class="no-js"/i, `${path}: falta fallback sin JavaScript`);
  assert.match(html, /class="skip-link"[^>]*href="#main-content"/i, `${path}: falta salto al contenido`);
  assert.match(html, /href="\/public-shell\.css"/i, `${path}: falta CSS común`);
  assert.match(html, /src="\/public-shell\.js"/i, `${path}: falta JS común`);
  assert.match(html, /data-public-header/i, `${path}: falta cabecera pública`);
  assert.match(html, /data-public-navigation/i, `${path}: falta navegación pública`);
  assert.match(html, /id="public-navigation"/i, `${path}: falta id de navegación`);
  assert.match(html, /data-public-menu-toggle/i, `${path}: falta botón de menú`);
  assert.match(html, /aria-controls="public-navigation"/i, `${path}: el botón no controla el menú`);
  assert.match(html, /aria-expanded="false"/i, `${path}: falta estado inicial del menú`);
  assert.match(html, /<main[^>]*id="main-content"[^>]*tabindex="-1"/i, `${path}: el contenido no recibe el salto`);
  assert.match(html, /aria-label="Navegación principal"/i, `${path}: falta nombre de navegación`);
  assert.doesNotMatch(html, /tabindex=["'][1-9]\d*["']/i, `${path}: contiene tabindex positivo`);
  assert.doesNotMatch(html, /\sonclick=/i, `${path}: contiene eventos inline`);
  assert.doesNotMatch(html, /\sstyle=/i, `${path}: contiene estilos inline`);
  assert.doesNotMatch(html, /<script[^>]*>[^<]/i, `${path}: contiene scripts inline`);
}

const css = files[assetPaths[0]];
assert.match(css, /:focus-visible/);
assert.match(css, /prefers-reduced-motion:\s*reduce/);
assert.match(css, /forced-colors:\s*active/);
assert.match(css, /min-width:\s*44px/);
assert.match(css, /min-height:\s*44px/);
assert.match(css, /\[data-public-reveal\]/);
assert.match(css, /\.no-js \[data-public-navigation\]/);
assert.match(css, /\.js \[data-public-navigation\]\[hidden\]/);

const script = files[assetPaths[1]];
assert.match(script, /event\.key === "Escape"/);
assert.match(script, /event\.key !== "Tab"/);
assert.match(script, /setAttribute\("inert"/);
assert.match(script, /aria-expanded/);
assert.match(script, /aria-current/);
assert.match(script, /prefers-reduced-motion/);
assert.match(script, /IntersectionObserver/);
assert.match(script, /document\.documentElement/);
assert.doesNotMatch(script, /innerHTML|localStorage|sessionStorage|Authorization|Bearer|document\.cookie/);

console.log("Navegación, teclado y movimiento público validados.");

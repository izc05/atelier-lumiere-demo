import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(HERE, "..", "apps", "web", "public");

async function text(...parts) {
  return readFile(join(PUBLIC, ...parts), "utf8");
}

function includesInOrder(source, values, label) {
  let cursor = -1;
  for (const value of values) {
    const next = source.indexOf(value, cursor + 1);
    assert.notEqual(next, -1, `${label}: falta ${value}`);
    assert.ok(next > cursor, `${label}: ${value} no está en el orden esperado`);
    cursor = next;
  }
}

test("la Home activa toda la cadena visual V2 en orden y deja responsive al final", async () => {
  const home = await text("index.html");
  const bootstrap = await text("home-product-framing.js");

  assert.match(home, /visual-v2-tokens\.css/);
  assert.match(home, /visual-v2-home-header\.css/);
  assert.match(home, /home-product-framing\.js/);

  includesInOrder(bootstrap, [
    "/visual-v2-home-hero.css",
    "/visual-v2-home-workshops.css",
    "/visual-v2-home-featured.css",
    "/visual-v2-home-commissions.css",
    "/visual-v2-home-stories.css",
    "/visual-v2-home-showcase.css",
    "/visual-v2-home-responsive.css"
  ], "Home V2");
  assert.match(bootstrap, /visual-v2-home-workshops\.js/);
  assert.match(bootstrap, /visual-v2-home-showcase\.js/);
  assert.match(bootstrap, /visual-v2-page-showcase\.js/);
});

test("Tienda, Talleres, Historias, ficha, taller y carrito mantienen sus capas V2", async () => {
  const pages = [
    ["tienda/index.html", ["visual-v2-tokens.css", "visual-v2-tienda.css", "visual-v2-page-showcase.js"]],
    ["talleres/index.html", ["visual-v2-tokens.css", "visual-v2-talleres.css", "visual-v2-page-showcase.js"]],
    ["taller/index.html", ["visual-v2-tokens.css", "visual-v2-taller.css"]],
    ["blog/index.html", ["visual-v2-tokens.css", "visual-v2-blog.css", "visual-v2-page-showcase.js"]],
    ["blog/historia/index.html", ["visual-v2-tokens.css", "visual-v2-blog-article.css"]],
    ["tienda/articulo/index.html", ["visual-v2-tokens.css", "visual-v2-product.css"]],
    ["carrito/index.html", ["visual-v2-tokens.css", "visual-v2-cart.css"]]
  ];

  for (const [relativePath, assets] of pages) {
    const source = await text(...relativePath.split("/"));
    for (const asset of assets) {
      assert.ok(source.includes(asset), `${relativePath}: falta ${asset}`);
    }
  }
});

test("los breakpoints V2 cubren portátil, tablet y móvil", async () => {
  const responsiveFiles = [
    "visual-v2-home-responsive.css",
    "visual-v2-tienda.css",
    "visual-v2-talleres.css",
    "visual-v2-taller.css",
    "visual-v2-blog.css",
    "visual-v2-blog-article.css",
    "visual-v2-product.css",
    "visual-v2-cart.css",
    "visual-v2-page-showcase.css"
  ];

  for (const filename of responsiveFiles) {
    const css = await text(filename);
    assert.match(css, /max-width:\s*(?:700|720|760)px/, `${filename}: falta breakpoint móvil`);
    assert.match(css, /(?:1024|1080|1120|1180|1200|1365)px/, `${filename}: falta adaptación intermedia`);
  }

  const publicShell = await text("public-shell.css");
  assert.match(publicShell, /prefers-reduced-motion:\s*reduce/);
});

test("el movimiento V2 elimina efectos heredados y conserva reducción de movimiento", async () => {
  const css = await text("visual-v2-motion.css");
  for (const selector of [".atelier-opening", ".atelier-pointer-aura", ".atelier-progress"]) {
    assert.ok(css.includes(selector), `falta neutralizar ${selector}`);
  }
  assert.match(css, /display:\s*none\s*!important/);
  assert.match(css, /translate3d\(0,\s*16px,\s*0\)/);
  assert.match(css, /560ms/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

test("el Escaparate conserva diez slots, admin propietario y fallbacks públicos", async () => {
  const adminHtml = await text("admin", "escaparate", "index.html");
  const adminJs = await text("admin", "escaparate", "showcase.js");
  const homeShowcase = await text("visual-v2-home-showcase.js");
  const pageShowcase = await text("visual-v2-page-showcase.js");

  assert.match(adminHtml, /Escaparate visual/);
  assert.match(adminJs, /PLATFORM_OWNER/);
  assert.match(adminJs, /Usando imagen de respaldo/);
  assert.match(adminJs, /X-Focal-X/);
  assert.match(adminJs, /X-Focal-Y/);
  assert.match(homeShowcase, /HOME_HERO_DESKTOP/);
  assert.match(homeShowcase, /HOME_HERO_MOBILE/);

  for (const slot of [
    "STORE_HERO_DESKTOP", "STORE_HERO_MOBILE",
    "WORKSHOPS_HERO_DESKTOP", "WORKSHOPS_HERO_MOBILE",
    "STORIES_HERO_DESKTOP", "STORIES_HERO_MOBILE",
    "COMMISSIONS_HERO_DESKTOP", "COMMISSIONS_HERO_MOBILE"
  ]) {
    assert.ok(pageShowcase.includes(slot), `falta el slot ${slot}`);
  }

  assert.match(homeShowcase, /if \(!response\?\.ok\) return/);
  assert.match(pageShowcase, /if \(!response\?\.ok\) return/);
});

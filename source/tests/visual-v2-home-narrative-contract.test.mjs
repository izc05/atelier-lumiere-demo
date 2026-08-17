import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(HERE, "..", "apps", "web", "public");

async function text(file) {
  return readFile(join(PUBLIC, file), "utf8");
}

test("B2 conserva la narrativa Home en cinco actos y densidad editorial contenida", async () => {
  const home = await text("index.html");
  const homeLogic = await text("home.js");
  const storiesLogic = await text("home-stories.js");

  for (const id of [
    "talleres",
    "atelier-grid",
    "featured-products",
    "home-stories-grid"
  ]) {
    assert.ok(home.includes(`id="${id}"`), `Home conserva #${id}`);
  }

  assert.match(home, /Talleres seleccionados/);
  assert.match(home, /Piezas recién salidas del taller/);
  assert.match(home, /Una idea también puede convertirse en pieza/);
  assert.match(home, /Historias desde los talleres/);
  assert.match(home, /Encuentra una pieza que ya se sienta tuya/);

  // La Home enseña una selección, no un catálogo infinito.
  assert.match(homeLogic, /collectWorkshops\(products\)\.slice\(0, 3\)/);
  assert.match(homeLogic, /const featured = products\.slice\(0, 3\)/);
  assert.match(storiesLogic, /await requestStories\(\)\)\.slice\(0, 3\)/);

  // Datos y destinos siguen siendo reales/dinámicos.
  assert.match(homeLogic, /fetch\("\/internal\/catalog\/products"/);
  assert.match(storiesLogic, /fetch\("\/internal\/blog\/posts"/);
  assert.match(homeLogic, /\/tienda\/articulo\/\?taller=/);
  assert.match(homeLogic, /\/taller\/\?slug=/);
  assert.match(storiesLogic, /\/blog\/historia\/\?taller=/);
});

test("B2 mantiene diferencias editoriales entre piezas e historias", async () => {
  const featured = await text("visual-v2-home-featured.css");
  const stories = await text("visual-v2-home-stories.css");

  // Piezas: galería horizontal de tres productos con metadatos debajo.
  assert.match(featured, /\.featured-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3,minmax\(0,1fr\)\)\s*!important/);
  assert.match(featured, /\.featured-grid \.product-card[\s\S]*?background:\s*transparent\s*!important;[\s\S]*?box-shadow:\s*none\s*!important;/);
  assert.match(featured, /\.featured-grid \.product-meta[\s\S]*?justify-content:\s*space-between\s*!important/);

  // Historias: una pieza editorial principal y dos secundarias, no tres tarjetas iguales.
  assert.match(stories, /\.home-stories-grid\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,1\.35fr\) minmax\(320px,\.65fr\)\s*!important/);
  assert.match(stories, /\.home-story-card:first-child \.home-story-link[\s\S]*?minmax\(500px,1fr\)/);
  assert.match(stories, /\.home-story-card:not\(:first-child\) \.home-story-link[\s\S]*?grid-template-columns:/);

  // En móvil ambas narrativas se vuelven legibles en una sola columna.
  assert.match(featured, /@media \(max-width:680px\)[\s\S]*?\.featured-grid \{ grid-template-columns:\s*1fr\s*!important/);
  assert.match(stories, /@media \(max-width:780px\)[\s\S]*?\.home-stories-grid \{ grid-template-columns:\s*1fr\s*!important/);
  assert.match(stories, /prefers-reduced-motion:reduce/);
});

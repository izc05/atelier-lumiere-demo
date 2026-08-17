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

test("B1 eleva la Home sin sustituir su contenido dinámico ni sus rutas", async () => {
  const home = await text("index.html");
  const premium = await text("visual-v2-home-premium.css");
  const components = await text("visual-v2-global-components.css");

  assert.match(components, /@import url\("\/visual-v2-home-premium\.css"\);/);

  for (const id of [
    "home-hero",
    "hero-main-image",
    "hero-workshop-note",
    "hero-workshop-name",
    "hero-workshop-link",
    "hero-workshop-controls",
    "hero-workshop-logo",
    "atelier-grid",
    "featured-products",
    "home-stories-grid"
  ]) {
    assert.ok(home.includes(`id="${id}"`), `Home conserva #${id}`);
  }

  assert.match(home, /href="\/tienda\/"/);
  assert.match(home, /href="\/talleres\/"/);
  assert.match(home, /Cada pieza guarda un instante\./);

  assert.match(premium, /#home-hero\.hero-editorial/);
  assert.match(premium, /grid-template-columns:\s*minmax\(330px, \.70fr\) minmax\(560px, 1\.30fr\)/);
  assert.match(premium, /min-height:\s*clamp\(720px, 84svh, 920px\)/);
  assert.match(premium, /#home-hero \.hero-editorial-visual[\s\S]*?min-height:\s*650px/);
  assert.match(premium, /#home-hero \.hero-workshop-note[\s\S]*?left:\s*-48px/);
  assert.match(premium, /#home-hero \.hero-facts div \+ div[\s\S]*?border-left:/);
  assert.match(premium, /#talleres\.manifesto-section[\s\S]*?padding-top:/);
  assert.match(premium, /@media \(min-width: 761px\) and \(max-width: 1024px\)/);
  assert.match(premium, /@media \(max-width: 760px\)[\s\S]*?#home-hero\.hero-editorial\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)\s*!important;/);
  assert.match(premium, /@media \(max-width: 760px\)[\s\S]*?#home-hero \.hero-editorial-visual\s*\{[\s\S]*?width:\s*100%\s*!important;[\s\S]*?min-width:\s*0\s*!important;/);
  assert.match(premium, /prefers-reduced-motion:\s*reduce/);
});

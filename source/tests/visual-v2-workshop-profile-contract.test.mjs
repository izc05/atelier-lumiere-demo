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

test("FASE C mantiene Talleres como perfiles reales de artesanos sin inventar reservas", async () => {
  const directory = await text("talleres", "talleres.js");
  const detail = await text("taller", "provider.js");
  const html = await text("taller", "index.html");

  assert.match(directory, /fetch\("\/internal\/catalog\/providers"/);
  assert.match(detail, /fetch\("\/internal\/catalog\/providers"/);
  assert.match(detail, /fetch\(`\/internal\/catalog\/products\?\$\{params\}`/);

  for (const field of [
    "provider.story",
    "provider.craftDescription",
    "provider.materials",
    "provider.techniques",
    "provider.locationLabel",
    "provider.preparationNote",
    "provider.shippingNote",
    "provider.acceptsCustomRequests"
  ]) {
    assert.ok(detail.includes(field), `la ficha conserva ${field}`);
  }

  assert.doesNotMatch(detail, /duration|availablePlaces|capacity|workshopDate|startDate|booking|reservation/i);
  assert.doesNotMatch(html, /Duración|Plazas|Nivel|Reservar plaza/);
});

test("un taller publicado sigue teniendo perfil aunque todavía no tenga piezas", async () => {
  const detail = await text("taller", "provider.js");
  const html = await text("taller", "index.html");

  assert.match(detail, /const \[listedProvider, products\] = await Promise\.all/);
  assert.match(detail, /const provider = listedProvider \?\? products\[0\]\?\.provider \?\? null/);
  assert.match(detail, /revealProviderSections\(\{ hasProducts: providerProducts\.length > 0 \}\)/);
  assert.match(detail, /if \(providerProducts\.length > 0\)[\s\S]*?renderProducts\(\);[\s\S]*?else[\s\S]*?empty-view/);
  assert.match(detail, /primaryAction\.href = "#provider-editorial"/);
  assert.match(detail, /primaryAction\.textContent = "Conocer el taller"/);

  assert.match(html, /Este taller está preparando su primera colección/);
  assert.match(html, /Mientras tanto puedes conocer su historia, materiales y forma de trabajar/);
  assert.match(html, /href="\/talleres\/">Volver a todos los talleres/);
  assert.match(html, /href="\/talleres\/">Descubrir otros talleres/);
});

test("la colección se oculta cuando no existe pero la identidad editorial permanece", async () => {
  const detail = await text("taller", "provider.js");

  assert.match(detail, /for \(const id of \["provider-hero", "provider-editorial", "provider-footer-note"\]\)/);
  assert.match(detail, /byId\("collection"\)\.hidden = !hasProducts/);
  assert.match(detail, /byId\("provider-bespoke"\)\.hidden = !hasProducts/);
  assert.match(detail, /provider-category-count"\)\.textContent = String\(categories\.size\)/);
});

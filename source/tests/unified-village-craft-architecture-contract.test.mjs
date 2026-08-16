import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(HERE, "..");
const read = (...parts) => readFile(join(SOURCE, ...parts), "utf8");

test("U3.4 carga la taxonomía antes del modelo de zonas y la arquitectura después de calidad", async () => {
  const bootstrap = await read("apps", "web", "public", "entrada", "webgl", "bootstrap.js");
  const taxonomy = bootstrap.indexOf("/village-craft-taxonomy.js");
  const zones = bootstrap.indexOf("/entrada/webgl/village-zones.js");
  const providers = bootstrap.indexOf("/entrada/webgl/providers.js");
  const quality = bootstrap.indexOf("/entrada/webgl/quality.js");
  const architecture = bootstrap.indexOf("/entrada/webgl/craft-architecture.js");
  assert.ok(taxonomy >= 0 && zones > taxonomy && providers > zones && architecture > quality);
});

test("U3.4 reconoce oficios principales pero conserva fallback neutro", async () => {
  const taxonomy = await read("apps", "web", "public", "village-craft-taxonomy.js");
  for (const key of ["CERAMICS", "TEXTILE", "JEWELRY", "WOOD", "FLORAL", "PAPER", "CANDLE", "LEATHER", "FAN", "GLASS"]) {
    assert.match(taxonomy, new RegExp(`key: '${key}'`));
  }
  assert.match(taxonomy, /key: 'NEUTRAL'/);
  assert.match(taxonomy, /Atelier neutro/);
  assert.match(taxonomy, /normalize\('NFD'\)/);
});

test("U3.4 cambia accesorios arquitectónicos sin mover la parcela", async () => {
  const architecture = await read("apps", "web", "public", "entrada", "webgl", "craft-architecture.js");
  assert.match(architecture, /function ceramics\(zone\)/);
  assert.match(architecture, /function textileStudio\(zone\)/);
  assert.match(architecture, /function jewelryAtelier\(zone\)/);
  assert.match(architecture, /function woodYard\(zone\)/);
  assert.match(architecture, /function floralStudio\(zone\)/);
  assert.match(architecture, /function paperArcade\(zone\)/);
  assert.match(architecture, /function fanPavilion\(zone\)/);
  assert.match(architecture, /function neutralAtelier\(zone\)/);
  assert.match(architecture, /const \{ x, z, scale: s \} = zone/);
  assert.doesNotMatch(architecture, /zone\.x\s*=/);
  assert.doesNotMatch(architecture, /zone\.z\s*=/);
  assert.match(architecture, /craftArchitectureDetail/);
  assert.match(architecture, /architectureFamily/);
});

test("U3.4 mantiene el tipo libre y muestra la arquitectura derivada en admin", async () => {
  const html = await read("apps", "web", "public", "admin", "pueblo", "index.html");
  const js = await read("apps", "web", "public", "admin", "pueblo", "pueblo.js");
  const css = await read("apps", "web", "public", "admin", "pueblo", "pueblo.css");

  assert.match(html, /village-craft-taxonomy\.js/);
  assert.match(html, /tipos de taller siguen siendo libres/i);
  assert.match(js, /village-craft-types/);
  assert.match(js, /Tipo de taller/);
  assert.match(js, /architectureFor/);
  assert.match(js, /Arquitectura ·/);
  assert.match(js, /dataArchitecture|architecturePreview|data\.architecturePreview/);
  assert.match(css, /village-zone-architecture/);
});

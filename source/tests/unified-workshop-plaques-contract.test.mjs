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

test("U3.2 carga las placas después de la atmósfera cálida", async () => {
  const bootstrap = await text("entrada", "webgl", "bootstrap.js");
  const warm = bootstrap.indexOf("/entrada/webgl/warm-village.js");
  const plaques = bootstrap.indexOf("/entrada/webgl/workshop-plaques.js");
  const arrival = bootstrap.indexOf("/entrada/webgl/arrival-transition.js");

  assert.ok(warm >= 0 && plaques > warm, "las placas deben cargar después de warm-village");
  assert.ok(arrival > plaques, "arrival-transition debe conservarse después de las placas");
});

test("las placas usan posición 3D, catálogo real y foco de cámara", async () => {
  const source = await text("entrada", "webgl", "workshop-plaques.js");

  assert.match(source, /webglProjectPoint/);
  assert.match(source, /webglProviderByPlace/);
  assert.match(source, /webglDynamicProviderPlaces/);
  assert.match(source, /webglProviderMediaUrl/);
  assert.match(source, /webglFocusPlace/);
  assert.match(source, /webglQualityMode/);
  assert.match(source, /requestAnimationFrame\(positionPlaques\)/);
  assert.match(source, /href = '\/\?intro=0'/);
});

test("las placas conservan responsive y reducción de movimiento", async () => {
  const css = await text("entrada", "webgl", "workshop-plaques.css");

  assert.match(css, /webgl-workshop-plaque-logo/);
  assert.match(css, /webgl-enter-atelier/);
  assert.match(css, /max-width:\s*980px/);
  assert.match(css, /max-width:\s*760px/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

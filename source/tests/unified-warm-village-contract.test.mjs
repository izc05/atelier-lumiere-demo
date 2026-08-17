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

test("U3.1 carga la dirección cálida después de calidad y profundidad", async () => {
  const bootstrap = await text("entrada", "webgl", "bootstrap.js");
  const depth = bootstrap.indexOf("/entrada/webgl/distant-depth.js");
  const warm = bootstrap.indexOf("/entrada/webgl/warm-village.js");
  const arrival = bootstrap.indexOf("/entrada/webgl/arrival-transition.js");

  assert.ok(depth >= 0 && warm > depth, "warm-village debe cargar después de distant-depth");
  assert.ok(arrival > warm, "arrival-transition debe conservarse después de warm-village");
});

test("U3.1 adapta luces y densidad a la calidad del dispositivo", async () => {
  const source = await text("entrada", "webgl", "warm-village.js");

  assert.match(source, /webglQualityMode/);
  assert.match(source, /quality === 'high'/);
  assert.match(source, /quality === 'balanced'/);
  assert.match(source, /houses\.slice/);
  assert.match(source, /lampLimit/);
  assert.match(source, /annexLimit/);
  assert.match(source, /atelier-logo-official-light\.svg/);
});

test("U3.1 mantiene responsive y reducción de movimiento", async () => {
  const css = await text("entrada", "webgl", "warm-village.css");

  assert.match(css, /data-webgl-warm-life="true"/);
  assert.match(css, /max-width:\s*980px/);
  assert.match(css, /max-width:\s*760px/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /webgl-village-legend/);
});

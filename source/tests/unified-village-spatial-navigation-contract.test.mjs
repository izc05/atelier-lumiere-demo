import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(HERE, "..");
const read = (...parts) => readFile(join(SOURCE, ...parts), "utf8");

test("U3.3A carga una navegación espacial posterior a las placas", async () => {
  const bootstrap = await read("apps", "web", "public", "entrada", "webgl", "bootstrap.js");
  const plaques = bootstrap.indexOf("/entrada/webgl/workshop-plaques.js");
  const spatial = bootstrap.indexOf("/entrada/webgl/spatial-navigation.js");
  const arrival = bootstrap.indexOf("/entrada/webgl/arrival-transition.js");
  assert.ok(plaques >= 0 && spatial > plaques && arrival > spatial);
});

test("U3.3A conserva historial, vuelta por terreno y cámara multieje", async () => {
  const navigation = await read("apps", "web", "public", "entrada", "webgl", "spatial-navigation.js");
  const css = await read("apps", "web", "public", "entrada", "webgl", "spatial-navigation.css");

  assert.match(navigation, /const history = \[\]/);
  assert.match(navigation, /function pushState/);
  assert.match(navigation, /function goBack/);
  assert.match(navigation, /currentSelected\(\) !== 'overview'/);
  assert.match(navigation, /goBack\('background'\)/);
  assert.match(navigation, /event\.button === 2/);
  assert.match(navigation, /event\.shiftKey/);
  assert.match(navigation, /camera\.yaw/);
  assert.match(navigation, /camera\.pitch/);
  assert.match(navigation, /AtelierVillageNavigation/);
  assert.match(css, /data-spatial-action="back"/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

test("U3.3A extiende el gesto táctil con giro y vuelta desde terreno", async () => {
  const quality = await read("apps", "web", "public", "entrada", "webgl", "quality.js");
  assert.match(quality, /function webglTouchAngle/);
  assert.match(quality, /webglTouchAngleDelta/);
  assert.match(quality, /camera\.yaw -= rotation/);
  assert.match(quality, /AtelierVillageNavigation\?\.back/);
  assert.match(quality, /camera\.desiredDistance = clamp\(camera\.desiredDistance \* factor, 8\.5, 52\)/);
});

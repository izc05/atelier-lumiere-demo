import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (file) => fs.readFileSync(new URL(`../public/${file}`, import.meta.url), 'utf8');
const bootstrap = read('entrada/webgl/bootstrap.js');
const mesh = read('entrada/webgl/mesh-integrity.js');
const plaques = read('entrada/webgl/plaque-stability.js');
const css = read('entrada/webgl/plaque-stability.css');

const modelingIndex = bootstrap.indexOf('/entrada/webgl/cinematic-modeling.js');
const meshIndex = bootstrap.indexOf('/entrada/webgl/mesh-integrity.js');
const vegetationIndex = bootstrap.indexOf('/entrada/webgl/premium-vegetation.js');
const polishIndex = bootstrap.indexOf('/entrada/webgl/plaque-polish.js');
const stabilityIndex = bootstrap.indexOf('/entrada/webgl/plaque-stability.js');
const spatialIndex = bootstrap.indexOf('/entrada/webgl/spatial-navigation.js');

assert.ok(modelingIndex >= 0 && meshIndex > modelingIndex, 'U3.19 debe registrar meshes después de P9');
assert.ok(vegetationIndex > meshIndex, 'U3.19 debe reparar cone antes de la vegetación premium');
assert.ok(polishIndex >= 0 && stabilityIndex > polishIndex, 'U3.19 debe estabilizar placas después de su pulido');
assert.ok(spatialIndex > stabilityIndex, 'U3.19 debe fijar las placas antes de la navegación espacial');
assert.ok(bootstrap.includes("stabilityCheckpoint = 'u3.19'"));

for (const token of ['p9Meshes.cone = meshes.cone','meshIntegrity','meshIntegrityCone','AtelierVillageMeshIntegrity']) {
  assert.ok(mesh.includes(token), `U3.19 mesh integrity debe conservar ${token}`);
}

for (const token of [
  'plaqueStability',
  'u319-logo-fallback',
  'has-loaded-logo',
  'image.addEventListener(\'error\'',
  "quality === 'high' ? 8 : quality === 'balanced' ? 6 : 4",
  "quality === 'high' ? 4 : quality === 'balanced' ? 3 : 1",
  'is-edge-clamped',
  'sticky',
  'AtelierVillagePlaqueStability'
]) {
  assert.ok(plaques.includes(token), `U3.19 plaque stability debe conservar ${token}`);
}

for (const token of ['u319-logo-fallback','has-loaded-logo','is-edge-clamped','data-plaque-stability="u3.19"']) {
  assert.ok(css.includes(token), `U3.19 CSS debe conservar ${token}`);
}

assert.equal(/https?:\/\//.test(mesh), false, 'U3.19 mesh integrity no debe depender de recursos remotos');
assert.equal(/https?:\/\//.test(plaques), false, 'U3.19 plaque stability no debe depender de recursos remotos');
assert.equal(/https?:\/\//.test(css), false, 'U3.19 CSS no debe depender de recursos remotos');

console.log('U3.19 plaque + mesh stability contract: OK');

import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (file) => fs.readFileSync(new URL(`../public/${file}`, import.meta.url), 'utf8');
const bootstrap = read('entrada/webgl/bootstrap.js');
const navigation = read('entrada/webgl/navigation-stability.js');

const spatialIndex = bootstrap.indexOf('/entrada/webgl/spatial-navigation.js');
const stableIndex = bootstrap.indexOf('/entrada/webgl/navigation-stability.js');
const artIndex = bootstrap.indexOf('/entrada/webgl/final-art-direction.js');
const arrivalIndex = bootstrap.indexOf('/entrada/webgl/arrival-transition.js');

assert.ok(spatialIndex >= 0 && stableIndex > spatialIndex, 'U3.17N debe estabilizar después del historial espacial');
assert.ok(artIndex > stableIndex, 'U3.17N debe quedar antes de dirección artística');
assert.ok(arrivalIndex > stableIndex, 'U3.17N debe quedar antes de la llegada cinematográfica');
assert.ok(bootstrap.includes("graphicsCheckpoint = 'u3.16'"), 'U3.17N no debe alterar el checkpoint gráfico');
assert.ok(bootstrap.includes("navigationCheckpoint = 'u3.17n'"));

for (const token of [
  'canonicalState',
  'normalizePendingDestination',
  'focusSettled',
  'manualSinceFocus',
  'atelier:village-focus',
  'atelier:village-back',
  'dataset.spatialAction',
  "home.textContent = '⌂'",
  'webglNearestPlaceStable',
  'webglFocusPlaceStable',
  'webglFocusOverviewStable',
  "navigationStability = 'u3.17n'"
]) {
  assert.ok(navigation.includes(token), `U3.17N debe conservar ${token}`);
}

for (const threshold of ['? 42', '? 48', ': 54']) {
  assert.ok(navigation.includes(threshold), `U3.17N debe conservar el umbral ${threshold}`);
}

assert.ok(navigation.includes("selected !== 'overview'"));
assert.ok(navigation.includes('focusSettled || manualSinceFocus'));
assert.ok(navigation.includes("event.key !== 'Home'"));
assert.equal(/https?:\/\//.test(navigation), false, 'U3.17N no debe depender de recursos remotos');

console.log('U3.17N navigation stability contract: OK');

import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (file) => fs.readFileSync(new URL(`../public/${file}`, import.meta.url), 'utf8');
const bootstrap = read('entrada/webgl/bootstrap.js');
const index = read('entrada/webgl/index.html');
const night = read('entrada/webgl/reference-night-direction.js');
const css = read('entrada/webgl/reference-night-direction.css');

const tuningIndex = bootstrap.indexOf('/entrada/webgl/capture-tuning.js');
const nightIndex = bootstrap.indexOf('/entrada/webgl/reference-night-direction.js');
const arrivalIndex = bootstrap.indexOf('/entrada/webgl/arrival-transition.js');

assert.ok(tuningIndex >= 0 && nightIndex > tuningIndex, 'U3.18 debe refinar el ajuste U3.16');
assert.ok(arrivalIndex > nightIndex, 'U3.18 debe fijar tono y cámara antes de la transición de llegada');
assert.ok(bootstrap.includes("graphicsCheckpoint = 'u3.16'"), 'U3.18 no debe invalidar el checkpoint gráfico técnico U3.16');
assert.ok(bootstrap.includes("referenceArtCheckpoint = 'u3.18'"), 'U3.18 debe registrar su checkpoint de dirección visual');
assert.ok(index.includes('/entrada/webgl/reference-night-direction.css'));

for (const token of [
  'referenceNightDirection',
  "hex('#171113')",
  'toneColor',
  'isWarmLight',
  'object.color = toneColor',
  '28.4',
  '22.9',
  '27.2',
  'p9CameraProfile',
  'Pueblo Atelier · noche cálida preparada'
]) {
  assert.ok(night.includes(token), `U3.18 JS debe conservar ${token}`);
}

for (const token of [
  'data-reference-night-direction="u3.18"',
  'saturate(1.18)',
  'contrast(1.13)',
  '.webgl-enter-atelier',
  '.webgl-workshop-plaque',
  '.webgl-village-legend',
  '.webgl-spatial-controls',
  'data-ui-settled="true"'
]) {
  assert.ok(css.includes(token), `U3.18 CSS debe conservar ${token}`);
}

assert.equal(/https?:\/\//.test(night), false, 'U3.18 JS no debe depender de recursos remotos');
assert.equal(/https?:\/\//.test(css), false, 'U3.18 CSS no debe depender de recursos remotos');

console.log('U3.18 reference night direction contract: OK');

import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (file) => fs.readFileSync(new URL(`../public/${file}`, import.meta.url), 'utf8');
const bootstrap = read('entrada/webgl/bootstrap.js');
const index = read('entrada/webgl/index.html');
const tuning = read('entrada/webgl/capture-tuning.js');
const css = read('entrada/webgl/capture-tuning.css');
const plaques = read('entrada/webgl/workshop-plaques.js');

const artIndex = bootstrap.indexOf('/entrada/webgl/final-art-direction.js');
const tuningIndex = bootstrap.indexOf('/entrada/webgl/capture-tuning.js');
const arrivalIndex = bootstrap.indexOf('/entrada/webgl/arrival-transition.js');

assert.ok(artIndex >= 0 && tuningIndex > artIndex, 'U3.16 debe refinar U3.15');
assert.ok(arrivalIndex > tuningIndex, 'U3.16 debe fijar la cámara antes de la llegada');
assert.ok(bootstrap.includes("graphicsCheckpoint = 'u3.16'"));
assert.ok(index.includes('/entrada/webgl/capture-tuning.css'));

for (const token of ['captureTuning','30.8','23.8','28.8','MutationObserver','p9CameraProfile','Pueblo Atelier · listo para explorar']) {
  assert.ok(tuning.includes(token), `U3.16 debe conservar ${token}`);
}
for (const token of ['data-capture-tuning="u3.16"','saturate(1.10)','contrast(1.095)','webgl-quality-badge','webgl-spatial-help']) {
  assert.ok(css.includes(token), `U3.16 CSS debe conservar ${token}`);
}
assert.ok(plaques.includes("quality === 'high' ? 6 : quality === 'balanced' ? 5 : 3"));
assert.ok(plaques.includes('pickOverviewPlaques'));
assert.ok(plaques.includes('focused'));
assert.ok(plaques.includes('collides'));
assert.equal(/https?:\/\//.test(tuning), false, 'U3.16 JS no debe depender de recursos remotos');
assert.equal(/https?:\/\//.test(css), false, 'U3.16 CSS no debe depender de recursos remotos');

console.log('U3.16 capture tuning contract: OK');

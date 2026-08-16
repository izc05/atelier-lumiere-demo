import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (file) => fs.readFileSync(new URL(`../public/${file}`, import.meta.url), 'utf8');
const bootstrap = read('entrada/webgl/bootstrap.js');
const lod = read('entrada/webgl/distance-lod.js');

const focusIndex = bootstrap.indexOf('/entrada/webgl/focus-atmosphere.js');
const lodIndex = bootstrap.indexOf('/entrada/webgl/distance-lod.js');
const plaqueIndex = bootstrap.indexOf('/entrada/webgl/workshop-plaques.js');

assert.ok(focusIndex >= 0 && lodIndex > focusIndex, 'U3.12 debe cargar después del foco atmosférico');
assert.ok(plaqueIndex > lodIndex, 'U3.12 debe cargar antes de placas/UI');
assert.ok(bootstrap.includes('/entrada/webgl/distance-lod.js'));

for (const token of ['distanceLod','micro','small','medium','focusPoint','objectSize','shouldDraw','webglSelectedPlace']) {
  assert.ok(lod.includes(token), `U3.12 debe conservar ${token}`);
}
for (const quality of ['high','balanced','lite']) assert.ok(lod.includes(quality));
assert.ok(lod.includes('Array.isArray(config.point)'));
assert.ok(lod.includes('base * 1.48'));
assert.ok(lod.includes('base * 1.18'));
assert.ok(lod.includes('previousDraw(object, vp, cameraPositionValue)'));
assert.equal(/https?:\/\//.test(lod), false, 'U3.12 no debe depender de recursos remotos');

console.log('U3.12 distance LOD contract: OK');

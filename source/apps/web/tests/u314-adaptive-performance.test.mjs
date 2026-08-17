import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (file) => fs.readFileSync(new URL(`../public/${file}`, import.meta.url), 'utf8');
const bootstrap = read('entrada/webgl/bootstrap.js');
const governor = read('entrada/webgl/adaptive-performance.js');
const lod = read('entrada/webgl/distance-lod.js');

const focusIndex = bootstrap.indexOf('/entrada/webgl/focus-atmosphere.js');
const governorIndex = bootstrap.indexOf('/entrada/webgl/adaptive-performance.js');
const lodIndex = bootstrap.indexOf('/entrada/webgl/distance-lod.js');
const plaquesIndex = bootstrap.indexOf('/entrada/webgl/workshop-plaques.js');

assert.ok(focusIndex >= 0 && governorIndex > focusIndex, 'U3.14 debe cargar después del foco atmosférico');
assert.ok(lodIndex > governorIndex, 'U3.14 debe preparar la escala antes del LOD');
assert.ok(plaquesIndex > lodIndex, 'U3.14/U3.12 deben mantenerse antes de UI');
const checkpoint = bootstrap.match(/graphicsCheckpoint = 'u3\.(\d+)'/);
assert.ok(checkpoint && Number(checkpoint[1]) >= 14, 'U3.14 debe seguir incluida en checkpoints posteriores');

for (const token of ['AtelierVillageDynamicDetailScale','performanceGovernor','requestAnimationFrame','saveData','ema','protect','enhance']) {
  assert.ok(governor.includes(token), `U3.14 debe conservar ${token}`);
}
for (const quality of ['high','balanced','lite']) assert.ok(governor.includes(quality));
assert.ok(governor.includes("frames < 42"));
assert.ok(governor.includes("now - lastAdjust < 1500"));
assert.ok(governor.includes('visibilitychange'));
assert.ok(lod.includes('AtelierVillageDynamicDetailScale'));
assert.ok(lod.includes('runtimeScale()'));
assert.equal(/https?:\/\//.test(governor), false, 'U3.14 no debe depender de recursos remotos');

console.log('U3.14 adaptive performance contract: OK');

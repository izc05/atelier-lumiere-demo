import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (file) => fs.readFileSync(new URL(`../public/${file}`, import.meta.url), 'utf8');
const bootstrap = read('entrada/webgl/bootstrap.js');
const drag = read('entrada/webgl/map-drag-navigation.js');

const stabilityIndex = bootstrap.indexOf('/entrada/webgl/navigation-stability.js');
const dragIndex = bootstrap.indexOf('/entrada/webgl/map-drag-navigation.js');
const artIndex = bootstrap.indexOf('/entrada/webgl/final-art-direction.js');

assert.ok(stabilityIndex >= 0 && dragIndex > stabilityIndex, 'U3.17N.1 debe cargar después de estabilidad');
assert.ok(artIndex > dragIndex, 'U3.17N.1 debe cargar antes de dirección artística');
assert.ok(bootstrap.includes("navigationCheckpoint = 'u3.17n.1'"));

for (const token of [
  'DRAG_THRESHOLD = 5',
  'isPlaque',
  'stopLegacyDrag',
  'queueMicrotask',
  'camera.target = [...next]',
  'camera.desired = [...next]',
  'event.stopImmediatePropagation()',
  'suppressClickUntil',
  "mapDragNavigation = 'u3.17n.1'",
  "navigationCheckpoint = 'u3.17n.1'"
]) {
  assert.ok(drag.includes(token), `U3.17N.1 debe conservar ${token}`);
}

assert.ok(drag.includes("root.addEventListener('pointerdown'"), 'el gesto debe empezar sobre todo el Pueblo');
assert.ok(drag.includes("window.addEventListener('pointermove'"), 'el drag debe continuar aunque el puntero salga de una placa');
assert.ok(drag.includes("pointerType === 'touch'"), 'el ratón no debe interferir con la navegación táctil existente');
assert.equal(/https?:\/\//.test(drag), false, 'U3.17N.1 no debe depender de recursos externos');

console.log('U3.17N.1 map drag navigation contract: OK');
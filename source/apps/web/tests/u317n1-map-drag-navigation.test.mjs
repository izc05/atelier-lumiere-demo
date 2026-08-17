import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (file) => fs.readFileSync(new URL(`../public/${file}`, import.meta.url), 'utf8');
const bootstrap = read('entrada/webgl/bootstrap.js');
const drag = read('entrada/webgl/map-drag-navigation.js');

const stabilityIndex = bootstrap.indexOf('/entrada/webgl/navigation-stability.js');
const artIndex = bootstrap.indexOf('/entrada/webgl/final-art-direction.js');
const arrivalIndex = bootstrap.indexOf('/entrada/webgl/arrival-transition.js');
const dragIndex = bootstrap.indexOf('/entrada/webgl/map-drag-navigation.js');
const watchdogIndex = bootstrap.indexOf('/entrada/webgl/renderer-watchdog.js');

assert.ok(stabilityIndex >= 0 && artIndex > stabilityIndex, 'la estabilidad base debe mantenerse antes de la dirección artística');
assert.ok(arrivalIndex > artIndex, 'la llegada debe seguir cargando después de la dirección artística');
assert.ok(dragIndex > arrivalIndex, 'U3.17N.2 debe seguir siendo la autoridad del ratón después de la llegada');
assert.ok(watchdogIndex > dragIndex, 'el watchdog puede cargar después del drag sin sustituir sus eventos');
assert.ok(bootstrap.includes("navigationCheckpoint = 'u3.17n."), 'el checkpoint debe conservar U3.17N o una microversión posterior');

for (const token of [
  'DRAG_THRESHOLD = 5',
  'plaquePlace',
  'clearLegacyPointerState',
  'cancelCinema',
  "root.addEventListener('pointerdown'",
  "root.addEventListener('pointermove'",
  "root.addEventListener('pointerup'",
  'event.stopPropagation()',
  'camera.target[0] = next[0]',
  'camera.target[2] = next[2]',
  'camera.desired[0] = next[0]',
  'camera.desired[2] = next[2]',
  'suppressClickUntil',
  'nearestPlaceAt',
  'AtelierVillageNavigation?.back',
  'dataset.localNavigationDebug',
  "mapDragNavigation = 'u3.17n.2'",
  "navigationCheckpoint = 'u3.17n.2'"
]) {
  assert.ok(drag.includes(token), `U3.17N.2 debe conservar ${token}`);
}

assert.ok(drag.includes("event.pointerType === 'touch'"), 'el ratón no debe interferir con la navegación táctil existente');
assert.ok(drag.includes("['127.0.0.1', 'localhost']"), 'la marca diagnóstica debe existir solo en local');
assert.ok(drag.includes('NAV U3.17N.2'), 'la preview local debe identificar la versión del controlador de ratón');
assert.equal(/https?:\/\//.test(drag), false, 'U3.17N.2 no debe depender de recursos externos');

console.log('U3.17N.2 direct map drag contract: OK');
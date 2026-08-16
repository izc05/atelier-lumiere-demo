import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (file) => fs.readFileSync(new URL(`../public/${file}`, import.meta.url), 'utf8');
const bootstrap = read('entrada/webgl/bootstrap.js');
const watchdog = read('entrada/webgl/renderer-watchdog.js');

const dragIndex = bootstrap.indexOf('/entrada/webgl/map-drag-navigation.js');
const watchdogIndex = bootstrap.indexOf('/entrada/webgl/renderer-watchdog.js');
assert.ok(dragIndex >= 0 && watchdogIndex > dragIndex, 'el watchdog debe cargar después del controlador directo del ratón');
assert.ok(bootstrap.includes("navigationCheckpoint = 'u3.17n.4'"));

for (const token of [
  'safeBaseDraw',
  'isRenderableObject',
  'pruneInvalidObjects',
  'invalidObjects',
  'objects.splice(index, 1)',
  'frame = function u317n4SafeFrame',
  'requestAnimationFrame(frame)',
  'finally',
  'drawObject(object, vp, eye)',
  'safeBaseDraw(object, vp, eye)',
  'rendererLastError',
  'rendererFrames',
  'rendererFps',
  'rendererFallbackDraws',
  'rendererInvalidObjects',
  'RENDER LIVE',
  'INVALID',
  "rendererWatchdog = 'u3.17n.4'",
  "navigationCheckpoint = 'u3.17n.4'"
]) {
  assert.ok(watchdog.includes(token), `U3.17N.4 debe conservar ${token}`);
}

assert.ok(watchdog.includes("['127.0.0.1', 'localhost']"), 'el diagnóstico visible debe limitarse a localhost');
assert.ok(watchdog.includes('duplicateStamp'), 'debe evitar doble dibujo al sustituir el frame existente');
assert.equal(/https?:\/\//.test(watchdog), false, 'el watchdog no debe depender de recursos externos');

console.log('U3.17N.4 renderer watchdog contract: OK');

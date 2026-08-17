import fs from 'node:fs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const read = (file) => fs.readFileSync(new URL(`../public/${file}`, import.meta.url), 'utf8');
const html = read('entrada/webgl/index.html');
const css = read('entrada/webgl/boot-gate.css');
const boot = read('entrada/webgl/boot-gate.js');
const bootstrap = read('entrada/webgl/bootstrap.js');
const arrival = read('entrada/webgl/arrival-transition.js');

const bootMarkupIndex = html.indexOf('data-webgl-boot');
const canvasIndex = html.indexOf('data-webgl-canvas');
const bootScriptIndex = html.indexOf('/entrada/webgl/boot-gate.js');
const bootstrapScriptIndex = html.indexOf('/entrada/webgl/bootstrap.js');

assert.ok(html.includes('data-boot-state="loading"'), 'El documento debe nacer protegido por el boot gate');
assert.ok(bootMarkupIndex >= 0 && bootMarkupIndex < canvasIndex, 'La pantalla de carga debe existir antes del canvas');
assert.ok(bootScriptIndex >= 0 && bootScriptIndex < bootstrapScriptIndex, 'El coordinador de carga debe iniciar antes del bootstrap WebGL');
assert.ok(html.includes('Cargando la experiencia del pueblo…'));
assert.ok(html.includes('El pueblo de los oficios'));
assert.ok(html.includes('/assets/brand/atelier-logo-official-light.svg'));

for (const token of [
  '.webgl-village[data-boot-state="loading"] > *:not(.webgl-boot)',
  'z-index: 10000',
  '.webgl-village[data-boot-state="revealing"] .webgl-boot',
  '@media (prefers-reduced-motion: reduce)'
]) {
  assert.ok(css.includes(token), `U3.28 CSS debe conservar ${token}`);
}

for (const token of [
  "atelier_arrival_from_entry",
  "bootCheckpoint = 'u3.28'",
  "bootState = 'loading'",
  "bootState = 'revealing'",
  "bootState = 'complete'",
  'afterTwoFrames',
  'document.fonts?.ready',
  "atelier:village-boot-reveal",
  "atelier:village-boot-complete",
  'AtelierVillageBoot'
]) {
  assert.ok(boot.includes(token), `U3.28 gate debe conservar ${token}`);
}

for (const token of [
  'boot?.progress?.(0, scripts.length)',
  'boot?.progress?.(index + 1, scripts.length)',
  'if (boot?.complete) await boot.complete()',
  "root.dataset.bootCheckpoint = 'u3.28'",
  "root.dataset.graphicsFidelityCheckpoint = 'u3.27'",
  "root.dataset.workshopContinuityCheckpoint = 'u3.27'"
]) {
  assert.ok(bootstrap.includes(token), `Bootstrap U3.28 debe conservar ${token}`);
}

assert.equal(arrival.includes("document.createElement('div')"), false, 'La llegada ya no debe crear un overlay tardío');
assert.equal(arrival.includes('webgl-arrival-inner'), false, 'La llegada antigua no debe poder reaparecer después del pueblo');
assert.ok(arrival.includes("window.addEventListener('atelier:village-boot-complete'"));

for (const source of [css, boot, arrival]) {
  assert.equal(/https?:\/\//.test(source), false, 'U3.28 no debe añadir recursos remotos');
}

for (const file of [
  '../public/entrada/webgl/boot-gate.js',
  '../public/entrada/webgl/bootstrap.js',
  '../public/entrada/webgl/arrival-transition.js'
]) {
  execFileSync(process.execPath, ['--check', fileURLToPath(new URL(file, import.meta.url))], { stdio: 'pipe' });
}

console.log('U3.28 village boot gate contract: OK');

import fs from 'node:fs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const read = (file) => fs.readFileSync(new URL(`../public/${file}`, import.meta.url), 'utf8');
const bootstrap = read('entrada/webgl/bootstrap.js');
const narrative = read('entrada/webgl/narrative-entry-transition.js');
const css = read('entrada/webgl/narrative-entry-transition.css');

const depthIndex = bootstrap.indexOf('/entrada/webgl/cinematic-depth-composition.js');
const narrativeIndex = bootstrap.indexOf('/entrada/webgl/narrative-entry-transition.js');
const arrivalIndex = bootstrap.indexOf('/entrada/webgl/arrival-transition.js');

assert.ok(depthIndex >= 0 && narrativeIndex > depthIndex, 'U3.26 debe partir del encuadre U3.25 ya calculado');
assert.ok(arrivalIndex > narrativeIndex, 'U3.26 debe quedar preparada antes de la transición de llegada');
assert.ok(bootstrap.includes("narrativeEntryCheckpoint = 'u3.26'"));

for (const token of [
  "narrativeEntry === 'u3.26'",
  'narrative-entry-transition.css',
  "atelier:village-focus",
  "atelier:village-back",
  "atelier:narrative-entry-stage",
  "data-cinematic-camera",
  "setStage('travel'",
  "setStage('approach'",
  "setStage('ready'",
  "setStage('manual'",
  "setStage('exit'",
  'setEntryInteractive(false)',
  "card.setAttribute('aria-live', enabled ? 'polite' : 'off')",
  "anchor.setAttribute('tabindex', '-1')",
  "a.webgl-provider-enter, a[data-atelier-enter]",
  'AtelierVillageCinematicDepth?.state?.(name)',
  'AtelierVillageNarrativeEntry',
  'MutationObserver',
  'requestAnimationFrame',
  'visibilitychange'
]) {
  assert.ok(narrative.includes(token), `U3.26 debe conservar ${token}`);
}

for (const token of [
  '.u326-narrative-entry',
  'z-index: 9',
  'pointer-events: none',
  '[data-narrative-stage="travel"]',
  '[data-narrative-stage="approach"]',
  '[data-narrative-stage="ready"]',
  '[data-narrative-kind="atelier"]',
  '[data-narrative-kind="provider"]',
  '[data-narrative-stage="manual"]',
  '[data-narrative-stage="exit"]',
  '@media (prefers-reduced-motion: reduce)'
]) {
  assert.ok(css.includes(token), `U3.26 CSS debe conservar ${token}`);
}

assert.equal(/https?:\/\//.test(narrative), false, 'U3.26 no debe depender de recursos remotos');
assert.equal(/https?:\/\//.test(css), false, 'U3.26 CSS no debe depender de recursos remotos');

const narrativePath = fileURLToPath(new URL('../public/entrada/webgl/narrative-entry-transition.js', import.meta.url));
execFileSync(process.execPath, ['--check', narrativePath], { stdio: 'pipe' });

console.log('U3.26 narrative entry transition contract: OK');
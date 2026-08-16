import fs from 'node:fs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const read = (file) => fs.readFileSync(new URL(`../public/${file}`, import.meta.url), 'utf8');
const bootstrap = read('entrada/webgl/bootstrap.js');
const depth = read('entrada/webgl/cinematic-depth-composition.js');
const css = read('entrada/webgl/cinematic-depth-composition.css');

const lifeIndex = bootstrap.indexOf('/entrada/webgl/ambient-village-life.js');
const depthIndex = bootstrap.indexOf('/entrada/webgl/cinematic-depth-composition.js');
const arrivalIndex = bootstrap.indexOf('/entrada/webgl/arrival-transition.js');

assert.ok(lifeIndex >= 0 && depthIndex > lifeIndex, 'U3.25 debe partir de U3.24 ya cargada');
assert.ok(arrivalIndex > depthIndex, 'U3.25 debe preparar el encuadre antes de la transición de llegada');
assert.ok(bootstrap.includes("cinematicDepthCheckpoint = 'u3.25'"));

for (const token of [
  "cinematicDepthComposition === 'u3.25'",
  'cinematic-depth-composition.css',
  'function landmarkState',
  'function dynamicState',
  'function familyBias',
  'function rebuildHeroStates',
  'p9CameraProfile = function u325CameraProfile',
  'place.target = [...state.target]',
  'place.distance = state.distance',
  "mode === 'mobile' ? 13.20 : mode === 'tablet' ? 12.45 : 11.85",
  "atelier:{target:[-.30,.46,.62],distance:13.55",
  "izc:{target:[-10.72,.40,7.38],distance:11.55",
  "stitch:{target:[11.72,.38,-6.58],distance:11.65",
  'u325Skyline',
  'requestAnimationFrame',
  'visibilitychange',
  'AtelierVillageCinematicDepth',
  'cinematicDepthHeroCount',
  'cinematicDepthSkyline'
]) {
  assert.ok(depth.includes(token), `U3.25 debe conservar ${token}`);
}

for (const token of [
  '.u325-cinematic-depth',
  'z-index: 8',
  'pointer-events: none',
  '.u325-cinematic-depth.is-focused',
  '@media (prefers-reduced-motion: reduce)'
]) {
  assert.ok(css.includes(token), `U3.25 CSS debe conservar ${token}`);
}

assert.equal(/https?:\/\//.test(depth), false, 'U3.25 no debe depender de recursos remotos');
assert.equal(/https?:\/\//.test(css), false, 'U3.25 CSS no debe depender de recursos remotos');

const depthPath = fileURLToPath(new URL('../public/entrada/webgl/cinematic-depth-composition.js', import.meta.url));
execFileSync(process.execPath, ['--check', depthPath], { stdio: 'pipe' });

console.log('U3.25 cinematic depth composition contract: OK');
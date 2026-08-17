import fs from 'node:fs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const read = (file) => fs.readFileSync(new URL(`../public/${file}`, import.meta.url), 'utf8');
const bootstrap = read('entrada/webgl/bootstrap.js');
const life = read('entrada/webgl/ambient-village-life.js');

const frontagesIndex = bootstrap.indexOf('/entrada/webgl/workshop-frontages.js');
const nightIndex = bootstrap.indexOf('/entrada/webgl/reference-night-direction.js');
const lifeIndex = bootstrap.indexOf('/entrada/webgl/ambient-village-life.js');
const arrivalIndex = bootstrap.indexOf('/entrada/webgl/arrival-transition.js');

assert.ok(frontagesIndex >= 0 && lifeIndex > frontagesIndex, 'U3.24 debe partir de las fachadas U3.23 ya creadas');
assert.ok(nightIndex >= 0 && lifeIndex > nightIndex, 'U3.24 debe ejecutarse después de la dirección nocturna final');
assert.ok(arrivalIndex > lifeIndex, 'U3.24 debe quedar preparado antes de la transición de llegada');
assert.ok(bootstrap.includes("ambientLifeCheckpoint = 'u3.24'"));

for (const token of [
  "ambientVillageLife === 'u3.24'",
  "quality === 'high' ? 10 : quality === 'balanced' ? 6 : 3",
  "quality === 'high' ? 5 : quality === 'balanced' ? 3 : 0",
  'varyWindowLight',
  'decorateWorkshop',
  'familyVegetation',
  'outdoorTable',
  'tablePieces',
  "prefers-reduced-motion: reduce",
  'saveData',
  'AtelierVillageDynamicDetailScale',
  "mode === 'protect' || mode === 'reduce'",
  'requestAnimationFrame',
  'AtelierVillageAmbientLife',
  'ambientLifeAnimations',
  "familyKey === 'CERAMICS'",
  "familyKey === 'TEXTILE'",
  "familyKey === 'CANDLE'",
  "familyKey === 'GLASS'"
]) {
  assert.ok(life.includes(token), `U3.24 debe conservar ${token}`);
}

assert.equal(/https?:\/\//.test(life), false, 'U3.24 no debe depender de recursos remotos');

const lifePath = fileURLToPath(new URL('../public/entrada/webgl/ambient-village-life.js', import.meta.url));
execFileSync(process.execPath, ['--check', lifePath], { stdio: 'pipe' });

console.log('U3.24 ambient village life contract: OK');
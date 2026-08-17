import fs from 'node:fs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const read = (file) => fs.readFileSync(new URL(`../public/${file}`, import.meta.url), 'utf8');
const bootstrap = read('entrada/webgl/bootstrap.js');
const horizon = read('entrada/webgl/horizon-continuity.js');
const horizonCss = read('entrada/webgl/horizon-continuity.css');
const scene = read('entrada/webgl/scene.js');

const vegetationIndex = bootstrap.indexOf('/entrada/webgl/premium-vegetation.js');
const horizonIndex = bootstrap.indexOf('/entrada/webgl/horizon-continuity.js');
const boundariesIndex = bootstrap.indexOf('/entrada/webgl/stone-boundaries.js');
const referenceIndex = bootstrap.indexOf('/entrada/webgl/reference-night-direction.js');

assert.ok(vegetationIndex >= 0 && horizonIndex > vegetationIndex, 'U3.30 debe partir de la vegetación ya existente');
assert.ok(boundariesIndex > horizonIndex, 'U3.30 debe integrarse antes de límites/urbanismo final');
assert.ok(referenceIndex > horizonIndex, 'U3.30 debe recibir el tono nocturno U3.18');

assert.ok(bootstrap.includes("horizonCheckpoint = 'u3.30'"));
assert.ok(bootstrap.includes("vegetationVarietyCheckpoint = 'u3.30'"));
assert.ok(bootstrap.includes("pathwaysCheckpoint = 'u3.29'"));
assert.ok(bootstrap.includes("materialDepthCheckpoint = 'u3.29'"));
assert.ok(bootstrap.includes("bootCheckpoint = 'u3.28'"));

for (const token of [
  "horizonContinuity === 'u3.30'",
  'apronMesh(',
  '[31, 1, 23]',
  '[36, .12, 28]',
  "quality === 'high' ? 14 : quality === 'balanced' ? 9 : 4",
  "variant === 0",
  "variant === 1",
  "vegetationVariant = shape === 0 ? 'cypress' : shape === 1 ? 'pine' : 'olive'",
  "root.dataset.horizonContinuity = 'u3.30'",
  "root.dataset.vegetationVariety = 'u3.30'",
  'AtelierVillageHorizon'
]) {
  assert.ok(horizon.includes(token), `U3.30 debe conservar ${token}`);
}

assert.ok(scene.includes("[22,.25,16]"), 'El contrato debe conocer el terreno base exterior');
assert.ok(scene.includes("[20.8,.04,14.8]"), 'El contrato debe conocer la plataforma superior base');

for (const token of [
  '.u330-horizon-veil',
  '[data-horizon-continuity="u3.30"] .p10-atmosphere-wash',
  'opacity: .11',
  '@media (max-width: 760px)'
]) {
  assert.ok(horizonCss.includes(token), `U3.30 CSS debe conservar ${token}`);
}

assert.equal(/https?:\/\//.test(horizon), false, 'U3.30 no debe añadir recursos remotos');
assert.equal(/https?:\/\//.test(horizonCss), false, 'U3.30 CSS no debe añadir recursos remotos');

for (const file of [
  '../public/entrada/webgl/horizon-continuity.js',
  '../public/entrada/webgl/bootstrap.js'
]) {
  execFileSync(process.execPath, ['--check', fileURLToPath(new URL(file, import.meta.url))], { stdio: 'pipe' });
}

console.log('U3.30 horizon continuity contract: OK');

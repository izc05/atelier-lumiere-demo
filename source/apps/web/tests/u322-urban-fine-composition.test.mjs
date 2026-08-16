import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (file) => fs.readFileSync(new URL(`../public/${file}`, import.meta.url), 'utf8');
const bootstrap = read('entrada/webgl/bootstrap.js');
const fine = read('entrada/webgl/urban-fine-composition.js');

const lightingIndex = bootstrap.indexOf('/entrada/webgl/night-life-lighting.js');
const fineIndex = bootstrap.indexOf('/entrada/webgl/urban-fine-composition.js');
const shadowsIndex = bootstrap.indexOf('/entrada/webgl/contact-shadows.js');
const nightIndex = bootstrap.indexOf('/entrada/webgl/reference-night-direction.js');

assert.ok(lightingIndex >= 0 && fineIndex > lightingIndex, 'U3.22 debe partir del casco y la jerarquía nocturna ya creados');
assert.ok(shadowsIndex > fineIndex, 'U3.22 debe existir antes de sombras de contacto');
assert.ok(nightIndex > fineIndex, 'U3.18 debe seguir aplicando el acabado nocturno final a U3.22');
assert.ok(bootstrap.includes("urbanFineCheckpoint = 'u3.22'"));

for (const token of [
  "urbanFineComposition === 'u3.22'",
  "quality === 'high' ? 12 : quality === 'balanced' ? 8 : 4",
  "quality === 'high' ? 10 : quality === 'balanced' ? 6 : 3",
  'nearestStreet',
  'patio',
  'pergola',
  'plazaFurniture',
  'transitionCorners',
  'gapWalls',
  'ornamentalTree',
  'AtelierVillageUrbanFineComposition',
  'urbanFineRole'
]) {
  assert.ok(fine.includes(token), `U3.22 debe conservar ${token}`);
}

assert.ok(fine.includes("root.dataset.urbanFineComposition = 'u3.22'"));
assert.ok(fine.includes('p9Meshes?.cone'));
assert.ok(fine.includes('p9Meshes?.cylinder'));
assert.equal(/https?:\/\//.test(fine), false, 'U3.22 no debe depender de recursos remotos');

console.log('U3.22 urban fine composition contract: OK');
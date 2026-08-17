import fs from 'node:fs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const read = (file) => fs.readFileSync(new URL(`../public/${file}`, import.meta.url), 'utf8');
const bootstrap = read('entrada/webgl/bootstrap.js');
const pathways = read('entrada/webgl/village-pathways.js');
const materials = read('entrada/webgl/material-depth.js');

const alignmentIndex = bootstrap.indexOf('/entrada/webgl/workshop-frontage-alignment.js');
const pathwaysIndex = bootstrap.indexOf('/entrada/webgl/village-pathways.js');
const shadowsIndex = bootstrap.indexOf('/entrada/webgl/contact-shadows.js');
const referenceIndex = bootstrap.indexOf('/entrada/webgl/reference-night-direction.js');
const ambientIndex = bootstrap.indexOf('/entrada/webgl/ambient-village-life.js');
const materialsIndex = bootstrap.indexOf('/entrada/webgl/material-depth.js');
const cinematicIndex = bootstrap.indexOf('/entrada/webgl/cinematic-depth-composition.js');

assert.ok(alignmentIndex >= 0 && pathwaysIndex > alignmentIndex, 'U3.29 caminos debe partir de fachadas ya alineadas');
assert.ok(shadowsIndex > pathwaysIndex, 'Las sombras deben procesar los caminos U3.29');
assert.ok(referenceIndex >= 0 && ambientIndex > referenceIndex && materialsIndex > ambientIndex, 'U3.29 materiales debe clasificar tras noche + vida ambiental');
assert.ok(cinematicIndex > materialsIndex, 'La profundidad cinematográfica debe conservarse después de U3.29 materiales');
assert.ok(bootstrap.includes("pathwaysCheckpoint = 'u3.29'"));
assert.ok(bootstrap.includes("materialDepthCheckpoint = 'u3.29'"));
assert.ok(bootstrap.includes("bootCheckpoint = 'u3.28'"), 'U3.28 carga protegida debe preservarse');
assert.ok(bootstrap.includes("graphicsFidelityCheckpoint = 'u3.27'"), 'U3.27 fidelidad debe preservarse');

for (const token of [
  "quality === 'high' ? 14 : quality === 'balanced' ? 9 : 4",
  "quality === 'high' ? 1 : quality === 'balanced' ? .66 : .36",
  "object.materialKind = 3",
  "promenade-atelier",
  "promenade-izc",
  "promenade-stitch",
  "plaza-ring",
  "branchTarget",
  "zone-${zone.zoneKey.toLowerCase()}",
  "villagePathways = 'u3.29'",
  'AtelierVillagePathways'
]) {
  assert.ok(pathways.includes(token), `U3.29A debe conservar ${token}`);
}

for (const token of [
  'STUCCO:1', 'ROOF:2', 'STONE:3', 'WOOD:4', 'GLASS:5', 'METAL:6',
  "['house','annex']",
  "['roof','annex-roof']",
  "role === 'shop-window'",
  "object.u329PathRole",
  "quality === 'high' ? 16 : 9",
  "materialDepth = 'u3.29'",
  'AtelierVillageMaterialDepth'
]) {
  assert.ok(materials.includes(token), `U3.29B debe conservar ${token}`);
}

for (const source of [pathways, materials]) {
  assert.equal(/https?:\/\//.test(source), false, 'U3.29 no debe añadir recursos remotos');
}

for (const file of [
  '../public/entrada/webgl/village-pathways.js',
  '../public/entrada/webgl/material-depth.js',
  '../public/entrada/webgl/bootstrap.js'
]) {
  execFileSync(process.execPath, ['--check', fileURLToPath(new URL(file, import.meta.url))], { stdio: 'pipe' });
}

console.log('U3.29 pathways + material depth contract: OK');

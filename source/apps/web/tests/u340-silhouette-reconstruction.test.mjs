import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, '..');
const WEBGL = join(WEB, 'public', 'entrada', 'webgl');
const text = (...parts) => readFile(join(...parts), 'utf8');

test('U3.40 carga inmediatamente después del casco U3.20 y antes de iluminación', async () => {
  const bootstrap = await text(WEBGL, 'bootstrap.js');
  const urban = bootstrap.indexOf('/entrada/webgl/urban-density.js');
  const silhouette = bootstrap.indexOf('/entrada/webgl/silhouette-reconstruction.js');
  const lighting = bootstrap.indexOf('/entrada/webgl/night-life-lighting.js');

  assert.ok(urban >= 0, 'falta U3.20');
  assert.ok(silhouette > urban, 'U3.40 debe partir del casco ya creado');
  assert.ok(lighting > silhouette, 'iluminación y detalle deben trabajar sobre la silueta reconstruida');
  assert.match(bootstrap, /urbanCheckpoint = 'u3\.20'/);
  assert.match(bootstrap, /silhouetteReconstructionCheckpoint = 'u3\.40'/);
  assert.match(bootstrap, /takeDirectedCleanupCheckpoint = 'u3\.39'/);
});

test('U3.40 reconstruye solo casas decorativas y conserva los sitios originales', async () => {
  const module = await text(WEBGL, 'silhouette-reconstruction.js');

  assert.match(module, /AtelierVillageUrbanDensity\.oldQuarter/);
  assert.match(module, /siteBudget = quality === 'high' \? 12 : quality === 'balanced' \? 8 : 4/);
  assert.match(module, /detailBudget = quality === 'high' \? 190 : quality === 'balanced' \? 116 : 56/);
  assert.match(module, /removeOriginal\(site\)/);
  assert.match(module, /removableRoles = new Set/);
  assert.match(module, /objects\.splice\(index, 1\)/);
  assert.doesNotMatch(module, /AtelierVillageZones\.registry/);
  assert.doesNotMatch(module, /zone\.x\s*=/);
  assert.doesNotMatch(module, /zone\.z\s*=/);
});

test('U3.40 ofrece cuatro tipologías arquitectónicas con huecos y cubiertas coherentes', async () => {
  const module = await text(WEBGL, 'silhouette-reconstruction.js');

  assert.match(module, /function cottageWithWing\(/);
  assert.match(module, /function steppedTownhouse\(/);
  assert.match(module, /function twinGable\(/);
  assert.match(module, /function cornerWorkshop\(/);
  assert.match(module, /doorLocal\(/);
  assert.match(module, /windowLocal\(/);
  assert.match(module, /chimneyLocal\(/);
  assert.match(module, /roofLocal\(/);
  assert.match(module, /'house'/);
  assert.match(module, /'annex'/);
  assert.match(module, /'roof'/);
  assert.match(module, /'annex-roof'/);
});

test('U3.40 usa materiales explícitos y determinismo sin convertirse en otra cámara', async () => {
  const module = await text(WEBGL, 'silhouette-reconstruction.js');

  assert.match(module, /materialKind = material/);
  assert.match(module, /u329MaterialExplicit = true/);
  assert.match(module, /function hash\(value\)/);
  assert.doesNotMatch(module, /Math\.random/);
  assert.doesNotMatch(module, /camera\.desired\s*=/);
  assert.doesNotMatch(module, /camera\.target\s*=/);
  assert.doesNotMatch(module, /camera\.yaw\s*[+\-]?=/);
  assert.doesNotMatch(module, /camera\.pitch\s*[+\-]?=/);
});

test('U3.40 publica diagnóstico y API reversible de inspección', async () => {
  const module = await text(WEBGL, 'silhouette-reconstruction.js');

  assert.match(module, /silhouetteReconstruction = 'u3\.40'/);
  assert.match(module, /silhouetteReconstructionSites/);
  assert.match(module, /silhouetteReconstructionRemoved/);
  assert.match(module, /silhouetteReconstructionCreated/);
  assert.match(module, /AtelierVillageSilhouetteReconstruction/);
});

test('los JavaScript U3.40 y bootstrap compilan', () => {
  execFileSync(process.execPath, ['--check', join(WEBGL, 'silhouette-reconstruction.js')], { stdio: 'pipe' });
  execFileSync(process.execPath, ['--check', join(WEBGL, 'bootstrap.js')], { stdio: 'pipe' });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, '..');
const PUBLIC = join(WEB, 'public');
const WEBGL = join(PUBLIC, 'entrada', 'webgl');

const text = (...parts) => readFile(join(...parts), 'utf8');

test('U3.33 se carga después de caminos y antes de sombras', async () => {
  const bootstrap = await text(WEBGL, 'bootstrap.js');
  const pathways = bootstrap.indexOf('/entrada/webgl/village-pathways.js');
  const fidelity = bootstrap.indexOf('/entrada/webgl/path-surface-fidelity.js');
  const shadows = bootstrap.indexOf('/entrada/webgl/contact-shadows.js');

  assert.ok(pathways >= 0, 'falta U3.29 village-pathways');
  assert.ok(fidelity > pathways, 'U3.33 debe ejecutarse después de village-pathways');
  assert.ok(shadows > fidelity, 'U3.33 debe ejecutarse antes de contact-shadows');
  assert.match(bootstrap, /pathSurfaceCheckpoint = 'u3\.33'/);
  assert.match(bootstrap, /plazaWaterCheckpoint = 'u3\.32'/);
  assert.match(bootstrap, /closeRangeFidelityCheckpoint = 'u3\.31'/);
  assert.match(bootstrap, /bootCheckpoint = 'u3\.28'/);
});

test('U3.33 mantiene detalle adaptativo y prioridad de caminos firma', async () => {
  const fidelity = await text(WEBGL, 'path-surface-fidelity.js');

  assert.match(fidelity, /surfaceBudget = quality === 'high' \? 78 : quality === 'balanced' \? 48 : 24/);
  assert.match(fidelity, /edgeBudget = quality === 'high' \? 36 : quality === 'balanced' \? 22 : 10/);
  assert.match(fidelity, /jointBudget = quality === 'high' \? 30 : quality === 'balanced' \? 16 : 6/);
  assert.match(fidelity, /promenade-atelier/);
  assert.match(fidelity, /promenade-izc/);
  assert.match(fidelity, /promenade-stitch/);
  assert.match(fidelity, /plaza-ring/);
  assert.match(fidelity, /routePriority\(a\.name\) - routePriority\(b\.name\)/);
});

test('U3.33 integra piedra, tierra, juntas y bordes irregulares', async () => {
  const fidelity = await text(WEBGL, 'path-surface-fidelity.js');

  assert.match(fidelity, /MATERIAL\.STONE/);
  assert.match(fidelity, /MATERIAL\.EARTH/);
  assert.match(fidelity, /'settled-stone'/);
  assert.match(fidelity, /'joint'/);
  assert.match(fidelity, /'edge-chip'/);
  assert.match(fidelity, /'earth-verge'/);
  assert.match(fidelity, /u333PathRole/);
  assert.match(fidelity, /pathSurfaceFidelity = 'u3\.33'/);
});

test('los JavaScript U3.33 y bootstrap compilan', () => {
  execFileSync(process.execPath, ['--check', join(WEBGL, 'path-surface-fidelity.js')], { stdio: 'pipe' });
  execFileSync(process.execPath, ['--check', join(WEBGL, 'bootstrap.js')], { stdio: 'pipe' });
});

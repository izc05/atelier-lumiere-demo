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

test('U3.34 se carga después de caminos y antes de sombras', async () => {
  const bootstrap = await text(WEBGL, 'bootstrap.js');
  const pathSurface = bootstrap.indexOf('/entrada/webgl/path-surface-fidelity.js');
  const realism = bootstrap.indexOf('/entrada/webgl/architectural-realism.js');
  const shadows = bootstrap.indexOf('/entrada/webgl/contact-shadows.js');

  assert.ok(pathSurface >= 0, 'falta U3.33 path-surface-fidelity');
  assert.ok(realism > pathSurface, 'U3.34 debe ejecutarse después de los caminos');
  assert.ok(shadows > realism, 'U3.34 debe ejecutarse antes de contact-shadows');
  assert.match(bootstrap, /architecturalRealismCheckpoint = 'u3\.34'/);
  assert.match(bootstrap, /pathSurfaceCheckpoint = 'u3\.33'/);
  assert.match(bootstrap, /plazaWaterCheckpoint = 'u3\.32'/);
});

test('U3.34 añade lectura arquitectónica sin mover parcelas', async () => {
  const realism = await text(WEBGL, 'architectural-realism.js');

  assert.match(realism, /houseBudget = quality === 'high' \? 16 : quality === 'balanced' \? 10 : 5/);
  assert.match(realism, /detailBudget = quality === 'high' \? 150 : quality === 'balanced' \? 82 : 34/);
  assert.match(realism, /'stone-plinth'/);
  assert.match(realism, /'quoin'/);
  assert.match(realism, /'ridge-cap'/);
  assert.match(realism, /'eave'/);
  assert.match(realism, /'stucco-wear'/);
  assert.match(realism, /'door-step'/);
  assert.match(realism, /objects\.filter\(\(object\) => object\?\.urbanRole === 'house'\)/);
  assert.doesNotMatch(realism, /AtelierVillageZones\.[A-Za-z]+\s*=/);
  assert.doesNotMatch(realism, /Math\.random/);
});

test('U3.34 reutiliza materiales premium y deja sus detalles listos para U3.31', async () => {
  const realism = await text(WEBGL, 'architectural-realism.js');

  assert.match(realism, /AtelierMaterialTextures\?\.MATERIAL/);
  assert.match(realism, /MATERIAL\.STONE/);
  assert.match(realism, /MATERIAL\.ROOF/);
  assert.match(realism, /MATERIAL\.WOOD/);
  assert.match(realism, /MATERIAL\.STUCCO/);
  assert.match(realism, /u329MaterialExplicit = true/);
  assert.match(realism, /architecturalRealism = 'u3\.34'/);
  assert.match(realism, /AtelierVillageArchitecturalRealism/);
});

test('los JavaScript U3.34 y bootstrap compilan', () => {
  execFileSync(process.execPath, ['--check', join(WEBGL, 'architectural-realism.js')], { stdio: 'pipe' });
  execFileSync(process.execPath, ['--check', join(WEBGL, 'bootstrap.js')], { stdio: 'pipe' });
});

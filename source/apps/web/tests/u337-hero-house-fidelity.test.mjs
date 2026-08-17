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

test('U3.37 se carga después de limpieza formal y antes de sombras', async () => {
  const bootstrap = await text(WEBGL, 'bootstrap.js');
  const cleanup = bootstrap.indexOf('/entrada/webgl/reference-shape-cleanup.js');
  const hero = bootstrap.indexOf('/entrada/webgl/hero-house-fidelity.js');
  const shadows = bootstrap.indexOf('/entrada/webgl/contact-shadows.js');

  assert.ok(cleanup >= 0, 'falta U3.35');
  assert.ok(hero > cleanup, 'U3.37 debe partir de la geometría ya limpiada');
  assert.ok(shadows > hero, 'las casas hero deben recibir sombras posteriores');
  assert.match(bootstrap, /gameGradeInteractionCheckpoint = 'u3\.36'/);
  assert.match(bootstrap, /heroHouseFidelityCheckpoint = 'u3\.37'/);
});

test('U3.37 concentra presupuesto en casas visibles y degrada por calidad', async () => {
  const hero = await text(WEBGL, 'hero-house-fidelity.js');

  assert.match(hero, /generatedBudget = quality === 'high' \? 20 : quality === 'balanced' \? 14 : 7/);
  assert.match(hero, /houseBudget = quality === 'high' \? 14 : quality === 'balanced' \? 9 : 4/);
  assert.match(hero, /detailBudget = quality === 'high' \? 290 : quality === 'balanced' \? 158 : 62/);
  assert.match(hero, /roofRows = quality === 'high' \? 5 : quality === 'balanced' \? 3 : 1/);
  assert.match(hero, /Math\.hypot\(site\.x \* \.88, site\.z \* \.76\)/);
  assert.doesNotMatch(hero, /Math\.random/);
});

test('U3.37 da profundidad física a puertas, ventanas, tejados y relación con calle', async () => {
  const hero = await text(WEBGL, 'hero-house-fidelity.js');

  for (const token of [
    'door-recess', 'door-jamb', 'door-lintel', 'door-threshold',
    'window-recess', 'window-lintel', 'window-sill', 'window-jamb',
    'window-mullion-v', 'window-mullion-h',
    'roof-fascia', 'roof-tile-course', 'roof-ridge-tile',
    'balcony-slab', 'balcony-rail', 'entry-paver'
  ]) assert.match(hero, new RegExp(token));

  assert.match(hero, /MATERIAL\.GLASS/);
  assert.match(hero, /MATERIAL\.STONE/);
  assert.match(hero, /MATERIAL\.WOOD/);
  assert.match(hero, /MATERIAL\.ROOF/);
  assert.match(hero, /MATERIAL\.VEGETATION/);
});

test('U3.37 trabaja sobre casas existentes y no mueve las 26 parcelas', async () => {
  const hero = await text(WEBGL, 'hero-house-fidelity.js');
  const zones = await text(WEBGL, 'village-zones.js');

  assert.match(hero, /urbanRole === 'house'/);
  assert.match(hero, /urbanRole === 'roof'/);
  assert.match(hero, /urbanRole === 'door'/);
  assert.match(hero, /urbanRole === 'window'/);
  assert.doesNotMatch(hero, /AtelierVillageZones\.registry\s*=/);
  assert.match(zones, /ZONE_26/);
  assert.match(zones, /ZONE_01/);
});

test('los JavaScript U3.37 y bootstrap compilan', () => {
  execFileSync(process.execPath, ['--check', join(WEBGL, 'hero-house-fidelity.js')], { stdio: 'pipe' });
  execFileSync(process.execPath, ['--check', join(WEBGL, 'bootstrap.js')], { stdio: 'pipe' });
});

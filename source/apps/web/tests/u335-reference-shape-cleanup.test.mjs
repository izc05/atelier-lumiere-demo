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

test('U3.35 se carga después del realismo y antes de sombras', async () => {
  const bootstrap = await text(WEBGL, 'bootstrap.js');
  const realism = bootstrap.indexOf('/entrada/webgl/architectural-realism.js');
  const cleanup = bootstrap.indexOf('/entrada/webgl/reference-shape-cleanup.js');
  const shadows = bootstrap.indexOf('/entrada/webgl/contact-shadows.js');
  assert.ok(realism >= 0);
  assert.ok(cleanup > realism);
  assert.ok(shadows > cleanup);
  assert.match(bootstrap, /referenceShapeCleanupCheckpoint = 'u3\.35'/);
  assert.match(bootstrap, /architecturalRealismCheckpoint = 'u3\.34'/);
  assert.match(bootstrap, /pathSurfaceCheckpoint = 'u3\.33'/);
});

test('U3.35 sustituye paneles macizos por bastidores abiertos', async () => {
  const cleanup = await text(WEBGL, 'reference-shape-cleanup.js');
  assert.match(cleanup, /family === 'TEXTILE'/);
  assert.match(cleanup, /family === 'PAPER'/);
  assert.match(cleanup, /family === 'LEATHER'/);
  assert.match(cleanup, /family === 'WOOD'/);
  assert.match(cleanup, /removeMatching/);
  assert.match(cleanup, /'frame-post'/);
  assert.match(cleanup, /'frame-bar'/);
  assert.match(cleanup, /'textile-strip'/);
  assert.match(cleanup, /'paper-sheet'/);
  assert.match(cleanup, /'leather-piece'/);
  assert.match(cleanup, /'board-stack'/);
  assert.doesNotMatch(cleanup, /Math\.random/);
});

test('The Gentle Stitch se recompone como casa-taller legible', async () => {
  const cleanup = await text(WEBGL, 'reference-shape-cleanup.js');
  for (const token of [
    "'stitch-house'",
    "'stitch-upper'",
    "'stitch-roof'",
    "'stitch-upper-roof'",
    "'stitch-door'",
    "'stitch-window'",
    "'porch-post'",
    "'porch-beam'",
    "'porch-roof'",
    "'stitch-threshold'"
  ]) assert.ok(cleanup.includes(token), `falta ${token}`);
  assert.match(cleanup, /gx = 12/);
  assert.match(cleanup, /gz = -7/);
  assert.match(cleanup, /referenceShapeCleanup = 'u3\.35'/);
});

test('U3.35 no cambia el registro estable de 26 zonas', async () => {
  const zones = await text(WEBGL, 'village-zones.js');
  const matches = zones.match(/zoneKey:\s*'ZONE_\d{2}'/g) || [];
  assert.equal(matches.length, 26);
  assert.match(zones, /ZONE_01', x: -11, z: 7/);
  assert.match(zones, /ZONE_02', x: 12, z: -7/);
  assert.match(zones, /ZONE_26', x: 17, z: 6/);
});

test('los JavaScript U3.35 y bootstrap compilan', () => {
  execFileSync(process.execPath, ['--check', join(WEBGL, 'reference-shape-cleanup.js')], { stdio: 'pipe' });
  execFileSync(process.execPath, ['--check', join(WEBGL, 'bootstrap.js')], { stdio: 'pipe' });
});

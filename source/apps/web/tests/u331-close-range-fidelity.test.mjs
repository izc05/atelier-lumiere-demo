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

test('U3.31 se carga después de materiales y antes de profundidad cinematográfica', async () => {
  const bootstrap = await text(WEBGL, 'bootstrap.js');
  const material = bootstrap.indexOf('/entrada/webgl/material-depth.js');
  const fidelity = bootstrap.indexOf('/entrada/webgl/close-range-fidelity.js');
  const depth = bootstrap.indexOf('/entrada/webgl/cinematic-depth-composition.js');

  assert.ok(material >= 0, 'falta U3.29 material-depth');
  assert.ok(fidelity > material, 'U3.31 debe ejecutarse después de material-depth');
  assert.ok(depth > fidelity, 'U3.31 debe ejecutarse antes de cinematic-depth');
  assert.match(bootstrap, /closeRangeFidelityCheckpoint = 'u3\.31'/);
  assert.match(bootstrap, /horizonCheckpoint = 'u3\.30'/);
  assert.match(bootstrap, /pathwaysCheckpoint = 'u3\.29'/);
  assert.match(bootstrap, /bootCheckpoint = 'u3\.28'/);
});

test('U3.31 conserva calidad adaptativa y detalle por materiales', async () => {
  const fidelity = await text(WEBGL, 'close-range-fidelity.js');

  assert.match(fidelity, /materialBudget = quality === 'high' \? 84 : quality === 'balanced' \? 52 : 28/);
  assert.match(fidelity, /thresholdShadowBudget = quality === 'high' \? 14 : quality === 'balanced' \? 8 : 4/);
  assert.match(fidelity, /glowBudget = quality === 'high' \? 12 : quality === 'balanced' \? 7 : 3/);
  assert.match(fidelity, /MATERIAL\.ROOF/);
  assert.match(fidelity, /MATERIAL\.STONE/);
  assert.match(fidelity, /MATERIAL\.WOOD/);
  assert.match(fidelity, /MATERIAL\.GLASS/);
  assert.match(fidelity, /MATERIAL\.METAL/);
  assert.match(fidelity, /MATERIAL\.STUCCO/);
  assert.match(fidelity, /p9AddContactShadow/);
  assert.match(fidelity, /u35ContactShadow/);
  assert.match(fidelity, /workshopFrontageRole === 'shop-threshold'/);
  assert.match(fidelity, /webglProjectPoint/);
  assert.match(fidelity, /performanceMode === 'protect'/);
  assert.match(fidelity, /performanceMode === 'reduce'/);
  assert.match(fidelity, /closeRangeFidelity = 'u3\.31'/);
});

test('U3.31 mantiene la luz local bajo UI y responsive', async () => {
  const css = await text(WEBGL, 'close-range-fidelity.css');
  assert.match(css, /z-index:\s*4/);
  assert.match(css, /mix-blend-mode:\s*screen/);
  assert.match(css, /data-kind="landmark"/);
  assert.match(css, /data-place="atelier"/);
  assert.match(css, /data-performance-mode="protect"/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

test('los JavaScript U3.31 y bootstrap compilan', () => {
  execFileSync(process.execPath, ['--check', join(WEBGL, 'close-range-fidelity.js')], { stdio: 'pipe' });
  execFileSync(process.execPath, ['--check', join(WEBGL, 'bootstrap.js')], { stdio: 'pipe' });
});

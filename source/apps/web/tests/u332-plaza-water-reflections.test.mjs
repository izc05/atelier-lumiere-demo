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

test('U3.32 se carga entre fidelidad cercana y profundidad cinematográfica', async () => {
  const bootstrap = await text(WEBGL, 'bootstrap.js');
  const fidelity = bootstrap.indexOf('/entrada/webgl/close-range-fidelity.js');
  const plaza = bootstrap.indexOf('/entrada/webgl/plaza-water-reflections.js');
  const depth = bootstrap.indexOf('/entrada/webgl/cinematic-depth-composition.js');

  assert.ok(fidelity >= 0, 'falta U3.31 close-range-fidelity');
  assert.ok(plaza > fidelity, 'U3.32 debe ejecutarse después de U3.31');
  assert.ok(depth > plaza, 'U3.32 debe ejecutarse antes de cinematic-depth');
  assert.match(bootstrap, /plazaWaterCheckpoint = 'u3\.32'/);
  assert.match(bootstrap, /closeRangeFidelityCheckpoint = 'u3\.31'/);
  assert.match(bootstrap, /horizonCheckpoint = 'u3\.30'/);
  assert.match(bootstrap, /pathwaysCheckpoint = 'u3\.29'/);
  assert.match(bootstrap, /bootCheckpoint = 'u3\.28'/);
});

test('U3.32 convierte la fuente existente en agua reflectante y escala el detalle', async () => {
  const plaza = await text(WEBGL, 'plaza-water-reflections.js');

  assert.match(plaza, /ringBudget = quality === 'high' \? 12 : quality === 'balanced' \? 8 : 6/);
  assert.match(plaza, /reflectionBudget = quality === 'high' \? 5 : quality === 'balanced' \? 3 : 1/);
  assert.match(plaza, /object\.urbanRole === 'water'/);
  assert.match(plaza, /object\.materialKind = MATERIAL\.GLASS/);
  assert.match(plaza, /object\.u332Water = true/);
  assert.match(plaza, /'upper-water'/);
  assert.match(plaza, /'fountain-jet'/);
  assert.match(plaza, /'fountain-paving-ring'/);
  assert.match(plaza, /MATERIAL\.STONE/);
  assert.match(plaza, /MATERIAL\.METAL/);
  assert.match(plaza, /webglProjectPoint/);
  assert.match(plaza, /mode === 'reduce' \|\| mode === 'protect'/);
  assert.match(plaza, /plazaWaterReflections = 'u3\.32'/);
});

test('U3.10 reconoce superficies de agua explícitas creadas por U3.32', async () => {
  const reflective = await text(WEBGL, 'reflective-materials.js');
  assert.match(reflective, /object\?\.u332Water===true/);
  assert.match(reflective, /gl\.uniform1f\(loc\.water,isWater\?1:0\)/);
});

test('los reflejos de plaza permanecen bajo la UI y degradan antes que la escena', async () => {
  const css = await text(WEBGL, 'plaza-water-reflections.css');
  assert.match(css, /z-index:\s*7/);
  assert.match(css, /mix-blend-mode:\s*screen/);
  assert.match(css, /data-primary="true"/);
  assert.match(css, /data-performance-mode="reduce"/);
  assert.match(css, /data-performance-mode="protect"/);
  assert.match(css, /data-webgl-quality="lite"/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

test('los JavaScript U3.32, U3.10 y bootstrap compilan', () => {
  execFileSync(process.execPath, ['--check', join(WEBGL, 'plaza-water-reflections.js')], { stdio: 'pipe' });
  execFileSync(process.execPath, ['--check', join(WEBGL, 'reflective-materials.js')], { stdio: 'pipe' });
  execFileSync(process.execPath, ['--check', join(WEBGL, 'bootstrap.js')], { stdio: 'pipe' });
});

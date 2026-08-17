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

test('U3.38 se carga después de fidelidad cercana y agua, antes de composición de cámara', async () => {
  const bootstrap = await text(WEBGL, 'bootstrap.js');
  const close = bootstrap.indexOf('/entrada/webgl/close-range-fidelity.js');
  const water = bootstrap.indexOf('/entrada/webgl/plaza-water-reflections.js');
  const dynamic = bootstrap.indexOf('/entrada/webgl/dynamic-local-lighting.js');
  const camera = bootstrap.indexOf('/entrada/webgl/cinematic-depth-composition.js');

  assert.ok(close >= 0 && water > close, 'debe conservarse la fidelidad cercana y el agua');
  assert.ok(dynamic > water, 'U3.38 debe trabajar sobre la escena visual ya finalizada');
  assert.ok(camera > dynamic, 'la composición cinematográfica debe seguir después de U3.38');
  assert.match(bootstrap, /heroHouseFidelityCheckpoint = 'u3\.37'/);
  assert.match(bootstrap, /dynamicLocalLightingCheckpoint = 'u3\.38'/);
});

test('U3.38 usa presupuestos adaptativos y derrames circulares en mundo 3D', async () => {
  const source = await text(WEBGL, 'dynamic-local-lighting.js');

  assert.match(source, /emitterBudget = quality === 'high' \? 28 : quality === 'balanced' \? 16 : 7/);
  assert.match(source, /spillBudget = quality === 'high' \? 18 : quality === 'balanced' \? 10 : 4/);
  assert.match(source, /structureBudget = quality === 'high' \? 110 : quality === 'balanced' \? 70 : 34/);
  assert.match(source, /p9Meshes\.cylinder/);
  assert.match(source, /u338LightSpill/);
  assert.match(source, /u338SelectedPool/);
  assert.doesNotMatch(source, /Math\.random/);
});

test('U3.38 crea profundidad por distancia y realza emisores próximos al taller seleccionado', async () => {
  const source = await text(WEBGL, 'dynamic-local-lighting.js');

  assert.match(source, /if \(d <= 4\.2\)/);
  assert.match(source, /else if \(d <= 8\.5\)/);
  assert.match(source, /quality === 'lite' \? \.90 : \.84/);
  assert.match(source, /const near = d <= 5\.2/);
  assert.match(source, /Math\.max\(alpha, \.82\)/);
  assert.match(source, /dynamicLocalLightingFocus/);
  assert.match(source, /atelier:village-focus/);
  assert.match(source, /atelier:village-back/);
});

test('U3.38 mantiene la cámara estable y degrada efectos bajo presión', async () => {
  const source = await text(WEBGL, 'dynamic-local-lighting.js');
  const css = await text(WEBGL, 'dynamic-local-lighting.css');

  assert.match(source, /mode === 'protect' \|\| mode === 'reduce'/);
  assert.match(source, /quality === 'lite'/);
  assert.match(source, /reducedMotion\?\.matches === true/);
  assert.doesNotMatch(source, /camera\.desired\s*=/);
  assert.doesNotMatch(source, /camera\.yaw\s*[+\-]?=/);
  assert.doesNotMatch(source, /camera\.pitch\s*[+\-]?=/);
  assert.match(css, /data-performance-mode="reduce"/);
  assert.match(css, /data-performance-mode="protect"/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /mix-blend-mode:screen/);
});

test('los JavaScript U3.38 y bootstrap compilan', () => {
  execFileSync(process.execPath, ['--check', join(WEBGL, 'dynamic-local-lighting.js')], { stdio: 'pipe' });
  execFileSync(process.execPath, ['--check', join(WEBGL, 'bootstrap.js')], { stdio: 'pipe' });
});

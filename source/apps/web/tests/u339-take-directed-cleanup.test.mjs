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

test('U3.39 carga después de la luz dinámica y antes de la composición cinematográfica', async () => {
  const bootstrap = await text(WEBGL, 'bootstrap.js');
  const lighting = bootstrap.indexOf('/entrada/webgl/dynamic-local-lighting.js');
  const cleanup = bootstrap.indexOf('/entrada/webgl/take-directed-cleanup.js');
  const cinematic = bootstrap.indexOf('/entrada/webgl/cinematic-depth-composition.js');

  assert.ok(lighting >= 0, 'falta U3.38');
  assert.ok(cleanup > lighting, 'U3.39 debe trabajar sobre la escena ya iluminada');
  assert.ok(cinematic > cleanup, 'U3.25 debe seguir componiendo el plano después de U3.39');
  assert.match(bootstrap, /heroHouseFidelityCheckpoint = 'u3\.37'/);
  assert.match(bootstrap, /dynamicLocalLightingCheckpoint = 'u3\.38'/);
  assert.match(bootstrap, /takeDirectedCleanupCheckpoint = 'u3\.39'/);
});

test('U3.39 reduce ruido formal sin vaciar patios ni usar aleatoriedad', async () => {
  const cleanup = await text(WEBGL, 'take-directed-cleanup.js');

  assert.match(cleanup, /cleanupBudget = quality === 'high' \? 24 : quality === 'balanced' \? 16 : 9/);
  assert.match(cleanup, /role === 'pergola-slat'/);
  assert.match(cleanup, /role === 'patio-wall'/);
  assert.match(cleanup, /role === 'bench-back'/);
  assert.match(cleanup, /role === 'transition-wall'/);
  assert.match(cleanup, /objects\.splice\(index, 1\)/);
  assert.doesNotMatch(cleanup, /Math\.random/);
});

test('la oclusión se calcula en mundo 3D entre cámara y taller y excluye el objetivo', async () => {
  const cleanup = await text(WEBGL, 'take-directed-cleanup.js');

  assert.match(cleanup, /cameraPosition\(\)/);
  assert.match(cleanup, /function targetFor\(name\)/);
  assert.match(cleanup, /const t = \(wx\*vx \+ wy\*vy \+ wz\*vz\) \/ len2/);
  assert.match(cleanup, /if \(t < \.10 \|\| t > \.82\) return false/);
  assert.match(cleanup, /distance3\(p, target\) < 2\.5 \+ radius\*\.45/);
  assert.match(cleanup, /return distance3\(p, closest\) < corridor/);
  assert.match(cleanup, /occlusionBudget = quality === 'high' \? 150 : quality === 'balanced' \? 96 : 48/);
});

test('U3.39 atenúa y restaura materiales sin convertirse en otro controlador de cámara', async () => {
  const cleanup = await text(WEBGL, 'take-directed-cleanup.js');

  assert.match(cleanup, /u339BaseAlpha/);
  assert.match(cleanup, /u339BaseEdges/);
  assert.match(cleanup, /object\.edges = object\.color\[3\] > base\*\.72 \? object\.u339BaseEdges : false/);
  assert.match(cleanup, /return base \* \.16/);
  assert.match(cleanup, /return base \* \.24/);
  assert.match(cleanup, /restoreAll\(reduced\)/);
  assert.doesNotMatch(cleanup, /camera\.desired\s*=/);
  assert.doesNotMatch(cleanup, /camera\.target\s*=/);
  assert.doesNotMatch(cleanup, /camera\.yaw\s*[+\-]?=/);
  assert.doesNotMatch(cleanup, /camera\.pitch\s*[+\-]?=/);
});

test('U3.39 degrada coste con el gobernador y publica diagnóstico', async () => {
  const cleanup = await text(WEBGL, 'take-directed-cleanup.js');

  assert.match(cleanup, /mode === 'protect' \? 120 : mode === 'reduce' \? 80/);
  assert.match(cleanup, /quality === 'high' \? 32 : quality === 'balanced' \? 48 : 84/);
  assert.match(cleanup, /takeDirectedCleanup = 'u3\.39'/);
  assert.match(cleanup, /takeDirectedCleanupRemoved/);
  assert.match(cleanup, /takeDirectedCleanupCandidates/);
  assert.match(cleanup, /takeDirectedOccluders/);
  assert.match(cleanup, /AtelierVillageTakeDirectedCleanup/);
});

test('los JavaScript U3.39 y bootstrap compilan', () => {
  execFileSync(process.execPath, ['--check', join(WEBGL, 'take-directed-cleanup.js')], { stdio: 'pipe' });
  execFileSync(process.execPath, ['--check', join(WEBGL, 'bootstrap.js')], { stdio: 'pipe' });
});

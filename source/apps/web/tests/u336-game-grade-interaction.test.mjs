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

test('U3.36 se carga después de la autoridad de drag y antes del watchdog', async () => {
  const bootstrap = await text(WEBGL, 'bootstrap.js');
  const drag = bootstrap.indexOf('/entrada/webgl/map-drag-navigation.js');
  const game = bootstrap.indexOf('/entrada/webgl/game-grade-interaction.js');
  const watchdog = bootstrap.indexOf('/entrada/webgl/renderer-watchdog.js');

  assert.ok(drag >= 0, 'falta navegación directa U3.17N.2');
  assert.ok(game > drag, 'U3.36 debe reutilizar la autoridad de drag existente');
  assert.ok(watchdog > game, 'el watchdog debe seguir siendo la última protección');
  assert.match(bootstrap, /referenceShapeCleanupCheckpoint = 'u3\.35'/);
  assert.match(bootstrap, /gameGradeInteractionCheckpoint = 'u3\.36'/);
});

test('U3.36 añade inercia corta sin convertirse en un segundo sistema de cámara', async () => {
  const game = await text(WEBGL, 'game-grade-interaction.js');

  assert.match(game, /AtelierVillageMapDrag\?\.apply/);
  assert.match(game, /vx \*= \.82/);
  assert.match(game, /frames > 14/);
  assert.match(game, /Math\.hypot\(vx, vy\) < \.30/);
  assert.doesNotMatch(game, /camera\.desired\s*=/);
  assert.doesNotMatch(game, /camera\.yaw\s*[+\-]?=/);
  assert.doesNotMatch(game, /camera\.pitch\s*[+\-]?=/);
});

test('U3.36 ofrece feedback world-space y selección con lenguaje Atelier', async () => {
  const game = await text(WEBGL, 'game-grade-interaction.js');
  const css = await text(WEBGL, 'game-grade-interaction.css');

  assert.match(game, /webglProjectPoint/);
  assert.match(game, /u336-world-reticle/);
  assert.match(game, /u336-focus-pulse/);
  assert.match(game, /atelier:village-focus/);
  assert.match(game, /syncHighlightBreathing/);
  assert.match(css, /rgba\(213,167,90/);
  assert.match(css, /rgba\(83,19,34/);
  assert.match(css, /u336-reticle-arrive/);
});

test('U3.36 degrada movimiento y coste cuando el equipo lo necesita', async () => {
  const game = await text(WEBGL, 'game-grade-interaction.js');
  const css = await text(WEBGL, 'game-grade-interaction.css');

  assert.match(game, /quality !== 'lite'/);
  assert.match(game, /mode === 'protect' \|\| mode === 'reduce'/);
  assert.match(game, /reducedMotion\?\.matches === true/);
  assert.match(game, /pulseBudget = quality === 'high' \? 5 : quality === 'balanced' \? 3 : 1/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /@media \(max-width:760px\)/);
  assert.doesNotMatch(game, /Math\.random/);
});

test('los JavaScript U3.36 y bootstrap compilan', () => {
  execFileSync(process.execPath, ['--check', join(WEBGL, 'game-grade-interaction.js')], { stdio: 'pipe' });
  execFileSync(process.execPath, ['--check', join(WEBGL, 'bootstrap.js')], { stdio: 'pipe' });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const ROOT = new URL('../public/', import.meta.url);

async function text(path) {
  return readFile(new URL(path, ROOT), 'utf8');
}

test('U3.5A carga la capa de materiales premium después del pueblo cálido', async () => {
  const bootstrap = await text('entrada/webgl/bootstrap.js');
  const warm = bootstrap.indexOf("'/entrada/webgl/warm-village.js'");
  const materials = bootstrap.indexOf("'/entrada/webgl/material-textures.js'");
  const plaques = bootstrap.indexOf("'/entrada/webgl/workshop-plaques.js'");
  assert.ok(warm >= 0, 'debe conservar warm-village.js');
  assert.ok(materials > warm, 'material-textures.js debe aplicarse después de la paleta cálida');
  assert.ok(plaques > materials, 'las placas deben seguir cargando después de los materiales');
});

test('U3.5A mantiene ocho familias de material y fallback dinámico', async () => {
  const source = await text('entrada/webgl/material-textures.js');
  for (const name of ['STUCCO','ROOF','STONE','WOOD','GLASS','METAL','EARTH','VEGETATION']) {
    assert.match(source, new RegExp(`\\b${name}\\b`), `falta material ${name}`);
  }
  assert.match(source, /materialFor\(object\)/);
  assert.match(source, /object\?\.mesh === meshes\.roof/);
  assert.match(source, /palette\.greenDark/);
  assert.match(source, /palette\.road/);
});

test('U3.5A usa detalle adaptativo y texturas procedurales sin bitmaps externos', async () => {
  const source = await text('entrada/webgl/material-textures.js');
  assert.match(source, /quality === 'high' \? 1\.0/);
  assert.match(source, /quality === 'balanced' \? 0\.72 : 0\.44/);
  assert.match(source, /float fbm\(vec2 p\)/);
  assert.match(source, /uniform int uMaterial/);
  assert.match(source, /uniform float uDetail/);
  assert.match(source, /Estuco \/ cal/);
  assert.match(source, /Teja:/);
  assert.match(source, /Piedra:/);
  assert.match(source, /Madera:/);
  assert.match(source, /Cristal \/ luz/);
  assert.doesNotMatch(source, /https?:\/\//, 'el shader no debe depender de texturas remotas');
});

test('U3.5A conserva la tinta ilustrada sobre los materiales', async () => {
  const source = await text('entrada/webgl/material-textures.js');
  assert.match(source, /p9IllustrationLineProgram/);
  assert.match(source, /p9IllustrationLineLocations/);
  assert.match(source, /palette\.ink/);
  assert.match(source, /root\.dataset\.materialTextures = 'procedural'/);
});

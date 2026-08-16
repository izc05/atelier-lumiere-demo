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

test('U3.5A usa detalle adaptativo y fórmulas procedurales reales sin bitmaps externos', async () => {
  const source = await text('entrada/webgl/material-textures.js');
  assert.match(source, /quality === 'high' \? 1\.0/);
  assert.match(source, /quality === 'balanced' \? 0\.72 : 0\.44/);
  assert.match(source, /float fbm\(vec2 p\)/);
  assert.match(source, /uniform int uMaterial/);
  assert.match(source, /uniform float uDetail/);

  // Contrato gráfico: protege las fórmulas que definen la lectura material.
  assert.match(source, /float pore = hash21\(floor\(uv \* \(31\.0 \+ 27\.0 \* uDetail\)\)\)/);
  assert.match(source, /float wash = fbm\(uv \* 1\.7 \+ 4\.3\)/);
  assert.match(source, /float rows = abs\(sin\(/);
  assert.match(source, /float ridges = pow\(abs\(sin\(/);
  assert.match(source, /float joints = mortarGrid\(/);
  assert.match(source, /float block = hash21\(floor\(stoneUv/);
  assert.match(source, /float grain = sin\(/);
  assert.match(source, /float fine = sin\(/);
  assert.match(source, /float knot = smoothstep\(/);
  assert.match(source, /float fresnel = pow\(1\.0 - max\(dot\(normal, viewDir\), 0\.0\), 3\.0\)/);
  assert.match(source, /float pane = 0\.5 \+ 0\.5 \* sin\(/);
  assert.match(source, /float brushed = sin\(/);
  assert.match(source, /float metalTint = uMaterial == 6 \? 1\.0 : 0\.0/);

  assert.doesNotMatch(source, /https?:\/\//, 'el shader no debe depender de texturas remotas');
});

test('U3.5A conserva la tinta ilustrada sobre los materiales', async () => {
  const source = await text('entrada/webgl/material-textures.js');
  assert.match(source, /p9IllustrationLineProgram/);
  assert.match(source, /p9IllustrationLineLocations/);
  assert.match(source, /palette\.ink/);
  assert.match(source, /root\.dataset\.materialTextures = 'procedural'/);
});

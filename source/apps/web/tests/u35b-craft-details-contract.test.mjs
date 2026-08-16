import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const ROOT = new URL('../public/', import.meta.url);
const read = (path) => readFile(new URL(path, ROOT), 'utf8');

test('U3.5B carga microdetalle después de los materiales', async () => {
  const bootstrap = await read('entrada/webgl/bootstrap.js');
  const materials = bootstrap.indexOf("'/entrada/webgl/material-textures.js'");
  const details = bootstrap.indexOf("'/entrada/webgl/craft-details.js'");
  const plaques = bootstrap.indexOf("'/entrada/webgl/workshop-plaques.js'");
  assert.ok(materials >= 0);
  assert.ok(details > materials);
  assert.ok(plaques > details);
});

test('U3.5B mantiene detalle adaptativo por calidad', async () => {
  const source = await read('entrada/webgl/craft-details.js');
  assert.match(source, /quality === 'high' \? 3 : quality === 'balanced' \? 2 : 1/);
  assert.match(source, /craftMicrodetailBudget/);
  assert.match(source, /craftMicrodetailZones/);
});

test('U3.5B conserva utilería específica para las diez familias', async () => {
  const source = await read('entrada/webgl/craft-details.js');
  for (const family of ['CERAMICS','TEXTILE','JEWELRY','WOOD','FLORAL','PAPER','CANDLE','LEATHER','FAN','GLASS','NEUTRAL']) {
    assert.match(source, new RegExp(`\\b${family}:`), `falta renderer ${family}`);
  }
  for (const functionName of ['ceramics','textile','jewelry','woodwork','floral','paper','candles','leatherwork','fans','glasswork','neutral']) {
    assert.match(source, new RegExp(`function ${functionName}\\(`));
  }
});

test('U3.5B etiqueta materiales de los props para aprovechar U3.5A', async () => {
  const source = await read('entrada/webgl/craft-details.js');
  assert.match(source, /window\.AtelierMaterialTextures\?\.MATERIAL/);
  assert.match(source, /object\.materialKind = kind/);
  assert.match(source, /MATERIAL\.WOOD/);
  assert.match(source, /MATERIAL\.GLASS/);
  assert.match(source, /MATERIAL\.METAL/);
  assert.match(source, /MATERIAL\.VEGETATION/);
});

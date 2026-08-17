import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const ROOT = new URL('../public/', import.meta.url);
const read = (path) => readFile(new URL(path, ROOT), 'utf8');

test('U3.5C carga paisaje detallado después del microdetalle', async () => {
  const bootstrap = await read('entrada/webgl/bootstrap.js');
  const craft = bootstrap.indexOf("'/entrada/webgl/craft-details.js'");
  const landscape = bootstrap.indexOf("'/entrada/webgl/landscape-details.js'");
  const plaques = bootstrap.indexOf("'/entrada/webgl/workshop-plaques.js'");
  assert.ok(craft >= 0);
  assert.ok(landscape > craft);
  assert.ok(plaques > landscape);
});

test('U3.5C mantiene detalle adaptativo y materiales etiquetados', async () => {
  const source = await read('entrada/webgl/landscape-details.js');
  assert.match(source, /quality === 'high' \? 1 : quality === 'balanced' \? \.62 : \.32/);
  assert.match(source, /MATERIAL\.STONE/);
  assert.match(source, /MATERIAL\.EARTH/);
  assert.match(source, /MATERIAL\.VEGETATION/);
  assert.match(source, /MATERIAL\.GLASS/);
  assert.match(source, /MATERIAL\.WOOD/);
});

test('U3.5C conserva caminos, vegetación, agua, puente y delantal de oficio', async () => {
  const source = await read('entrada/webgl/landscape-details.js');
  for (const marker of ['pathRuns','pebbleCenters','grassClusters','earthPatches','landscapeCraftAprons']) {
    assert.match(source, new RegExp(marker));
  }
  for (const family of ['CERAMICS','TEXTILE','JEWELRY','WOOD','FLORAL','PAPER','CANDLE','LEATHER','FAN','GLASS','NEUTRAL']) {
    assert.match(source, new RegExp(`${family}:`));
  }
});

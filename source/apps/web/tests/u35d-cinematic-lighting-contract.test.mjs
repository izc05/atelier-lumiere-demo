import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const ROOT = new URL('../public/', import.meta.url);
const read = (path) => readFile(new URL(path, ROOT), 'utf8');

test('U3.5D carga iluminación después del paisaje detallado', async () => {
  const bootstrap = await read('entrada/webgl/bootstrap.js');
  const landscape = bootstrap.indexOf("'/entrada/webgl/landscape-details.js'");
  const lighting = bootstrap.indexOf("'/entrada/webgl/cinematic-lighting.js'");
  const plaques = bootstrap.indexOf("'/entrada/webgl/workshop-plaques.js'");
  assert.ok(landscape >= 0);
  assert.ok(lighting > landscape);
  assert.ok(plaques > lighting);
});

test('U3.5D proyecta halos desde coordenadas 3D reales', async () => {
  const source = await read('entrada/webgl/cinematic-lighting.js');
  assert.match(source, /webglProjectPoint/);
  assert.match(source, /webglInteractionPlaces\?\.atelier\?\.point/);
  assert.match(source, /webglInteractionPlaces\?\.izc\?\.point/);
  assert.match(source, /webglInteractionPlaces\?\.stitch\?\.point/);
  assert.match(source, /webglDynamicProviderPlaces\?\[webglSelectedPlace\]/);
});

test('U3.5D mantiene calidad adaptativa y capa no interactiva', async () => {
  const source = await read('entrada/webgl/cinematic-lighting.js');
  const css = await read('entrada/webgl/cinematic-lighting.css');
  assert.match(source, /quality === 'high'/);
  assert.match(source, /quality === 'lite'/);
  assert.match(css, /pointer-events: none/);
  assert.match(css, /mix-blend-mode: screen/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

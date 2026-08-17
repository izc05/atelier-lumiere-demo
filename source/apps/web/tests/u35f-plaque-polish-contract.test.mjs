import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const ROOT = new URL('../public/', import.meta.url);
const read = (path) => readFile(new URL(path, ROOT), 'utf8');

test('U3.5F carga el pulido después de las placas y antes de navegación espacial', async () => {
  const bootstrap = await read('entrada/webgl/bootstrap.js');
  const plaques = bootstrap.indexOf("'/entrada/webgl/workshop-plaques.js'");
  const polish = bootstrap.indexOf("'/entrada/webgl/plaque-polish.js'");
  const navigation = bootstrap.indexOf("'/entrada/webgl/spatial-navigation.js'");
  assert.ok(plaques >= 0);
  assert.ok(polish > plaques);
  assert.ok(navigation > polish);
});

test('U3.5F mantiene el pulido como capa visual sin tocar la lógica de placas', async () => {
  const source = await read('entrada/webgl/plaque-polish.js');
  const css = await read('entrada/webgl/workshop-plaques-premium.css');
  assert.match(source, /workshop-plaques-premium\.css/);
  assert.match(source, /root\.dataset\.plaquePolish='u3\.5f'/);
  assert.match(css, /\.webgl-workshop-plaque\.is-selected/);
  assert.match(css, /\.webgl-workshop-plaque-logo/);
  assert.match(css, /\.webgl-enter-atelier/);
  assert.match(css, /@media \(max-width:760px\)/);
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)/);
});

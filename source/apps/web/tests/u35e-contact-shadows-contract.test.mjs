import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const ROOT = new URL('../public/', import.meta.url);
const read = (path) => readFile(new URL(path, ROOT), 'utf8');

test('U3.5E carga sombras entre paisaje e iluminación', async () => {
  const bootstrap = await read('entrada/webgl/bootstrap.js');
  const landscape = bootstrap.indexOf("'/entrada/webgl/landscape-details.js'");
  const shadows = bootstrap.indexOf("'/entrada/webgl/contact-shadows.js'");
  const lighting = bootstrap.indexOf("'/entrada/webgl/cinematic-lighting.js'");
  assert.ok(landscape >= 0);
  assert.ok(shadows > landscape);
  assert.ok(lighting > shadows);
});

test('U3.5E deriva desplazamiento de sombra de la dirección de luz', async () => {
  const source = await read('entrada/webgl/contact-shadows.js');
  assert.match(source, /p9LightDirection/);
  assert.match(source, /shadowX/);
  assert.match(source, /shadowZ/);
  assert.match(source, /p9AddContactShadow/);
});

test('U3.5E limita sombras según calidad y respeta zonas ocultas', async () => {
  const source = await read('entrada/webgl/contact-shadows.js');
  assert.match(source, /quality === 'high' \? 26 : quality === 'balanced' \? 18 : 9/);
  assert.match(source, /config\?\.status === 'HIDDEN'/);
  assert.match(source, /contactShadowCount/);
  assert.match(source, /treeShadowPoints/);
});

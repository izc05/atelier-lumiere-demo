import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (file) => fs.readFileSync(new URL(`../public/${file}`, import.meta.url), 'utf8');
const bootstrap = read('entrada/webgl/bootstrap.js');
const lighting = read('entrada/webgl/night-life-lighting.js');
const css = read('entrada/webgl/night-life-lighting.css');

const urbanIndex = bootstrap.indexOf('/entrada/webgl/urban-density.js');
const lightingIndex = bootstrap.indexOf('/entrada/webgl/night-life-lighting.js');
const shadowsIndex = bootstrap.indexOf('/entrada/webgl/contact-shadows.js');
const nightIndex = bootstrap.indexOf('/entrada/webgl/reference-night-direction.js');

assert.ok(urbanIndex >= 0 && lightingIndex > urbanIndex, 'U3.21 debe enriquecer el casco U3.20 ya creado');
assert.ok(shadowsIndex > lightingIndex, 'U3.21 debe existir antes de sombras e iluminación cinematográfica');
assert.ok(nightIndex > lightingIndex, 'U3.18 debe conservar el tone-mapping final después de U3.21');
assert.ok(bootstrap.includes("lightingCheckpoint = 'u3.21'"));

for (const token of [
  "nightLifeLighting = 'u3.21'",
  "quality === 'high' ? 20 : quality === 'balanced' ? 14 : 7",
  "quality === 'high' ? 8 : quality === 'balanced' ? 5 : 2",
  'roof-ridge',
  'plaza-centro',
  "'workshop'",
  'webglProjectPoint',
  'AtelierVillageNightLife',
  'worldLights.length'
]) {
  assert.ok(lighting.includes(token), `U3.21 JS debe conservar ${token}`);
}

for (const token of [
  '.u321-night-life',
  '.u321-world-light',
  'data-light-kind="facade"',
  'data-light-kind="street"',
  'data-light-kind="plaza"',
  'data-light-kind="workshop"',
  'mix-blend-mode: screen',
  'prefers-reduced-motion'
]) {
  assert.ok(css.includes(token), `U3.21 CSS debe conservar ${token}`);
}

assert.equal(/https?:\/\//.test(lighting), false, 'U3.21 JS no debe depender de recursos remotos');
assert.equal(/https?:\/\//.test(css), false, 'U3.21 CSS no debe depender de recursos remotos');

console.log('U3.21 night life lighting contract: OK');

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve('public');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const bootstrap = read('entrada/webgl/bootstrap.js');
const materials = read('entrada/webgl/material-textures.js');
const crafts = read('entrada/webgl/craft-details.js');
const landscape = read('entrada/webgl/landscape-details.js');
const lighting = read('entrada/webgl/cinematic-lighting.js');
const shadows = read('entrada/webgl/contact-shadows.js');
const polish = read('entrada/webgl/plaque-polish.js');

for (const file of [
  '/entrada/webgl/material-textures.js',
  '/entrada/webgl/craft-details.js',
  '/entrada/webgl/landscape-details.js',
  '/entrada/webgl/contact-shadows.js',
  '/entrada/webgl/cinematic-lighting.js',
  '/entrada/webgl/plaque-polish.js'
]) {
  assert.ok(bootstrap.includes(file), `bootstrap debe cargar ${file}`);
}

for (const token of ['STUCCO','ROOF','STONE','WOOD','GLASS','METAL','EARTH','VEGETATION']) {
  assert.ok(materials.includes(token), `material procedural ausente: ${token}`);
}
assert.ok(materials.includes("quality === 'high'"));
assert.ok(materials.includes("quality === 'balanced'"));
assert.ok(materials.includes("root.dataset.materialTextures='u3.5a'"));

for (const token of ['CERAMICS','TEXTILE','JEWELRY','WOOD','FLORAL','PAPER','CANDLE','LEATHER','FAN','GLASS','NEUTRAL']) {
  assert.ok(crafts.includes(token), `microdetalle de oficio ausente: ${token}`);
}
assert.ok(crafts.includes("budget = quality === 'high' ? 3 : quality === 'balanced' ? 2 : 1"));
assert.ok(landscape.includes("density = quality === 'high' ? 1 : quality === 'balanced' ? .62 : .32"));
assert.ok(shadows.includes("budget = quality === 'high' ? 26 : quality === 'balanced' ? 18 : 9"));
assert.ok(lighting.includes("quality === 'lite'"));
assert.ok(polish.includes('workshop-plaques-premium.css'));

for (const file of [materials, crafts, landscape, lighting, shadows]) {
  assert.equal(/https?:\/\//.test(file), false, 'U3.5 no debe depender de texturas remotas');
}

console.log('U3.5 graphics contract: OK');

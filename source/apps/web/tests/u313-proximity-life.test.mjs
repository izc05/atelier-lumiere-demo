import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (file) => fs.readFileSync(new URL(`../public/${file}`, import.meta.url), 'utf8');
const bootstrap = read('entrada/webgl/bootstrap.js');
const life = read('entrada/webgl/proximity-life.js');

const stoneIndex = bootstrap.indexOf('/entrada/webgl/stone-boundaries.js');
const lifeIndex = bootstrap.indexOf('/entrada/webgl/proximity-life.js');
const shadowsIndex = bootstrap.indexOf('/entrada/webgl/contact-shadows.js');
const lodIndex = bootstrap.indexOf('/entrada/webgl/distance-lod.js');

assert.ok(stoneIndex >= 0 && lifeIndex > stoneIndex, 'U3.13 debe cargar después de los bordes de parcela');
assert.ok(shadowsIndex > lifeIndex, 'U3.13 debe cargar antes de sombras/iluminación');
assert.ok(lodIndex > lifeIndex, 'U3.13 debe existir antes del LOD dinámico');
assert.ok(bootstrap.includes("graphicsCheckpoint = 'u3.13'"));

for (const token of ['proximityLife','bench','hangingSign','lantern','crate','CERAMICS','TEXTILE','JEWELRY','WOOD','FLORAL','PAPER','CANDLE','LEATHER','FAN','GLASS']) {
  assert.ok(life.includes(token), `U3.13 debe conservar ${token}`);
}
assert.ok(life.includes("quality === 'high' ? 18 : quality === 'balanced' ? 10 : 4"));
assert.ok(life.includes('taxonomy.resolve'));
assert.ok(life.includes('Promise.resolve(zones.ready).finally(run)'));
assert.equal(/https?:\/\//.test(life), false, 'U3.13 no debe depender de recursos remotos');

console.log('U3.13 proximity life contract: OK');

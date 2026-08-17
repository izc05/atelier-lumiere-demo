import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (file) => fs.readFileSync(new URL(`../public/${file}`, import.meta.url), 'utf8');
const bootstrap = read('entrada/webgl/bootstrap.js');
const stone = read('entrada/webgl/stone-boundaries.js');

const vegetationIndex = bootstrap.indexOf('/entrada/webgl/premium-vegetation.js');
const stoneIndex = bootstrap.indexOf('/entrada/webgl/stone-boundaries.js');
const shadowsIndex = bootstrap.indexOf('/entrada/webgl/contact-shadows.js');

assert.ok(vegetationIndex >= 0 && stoneIndex > vegetationIndex, 'U3.11 debe cargar después de la vegetación premium');
assert.ok(shadowsIndex > stoneIndex, 'U3.11 debe cargar antes de las sombras de contacto');
assert.ok(bootstrap.includes('/entrada/webgl/stone-boundaries.js'));

for (const token of ['stoneBoundaries','u3.11','dryWall','gate','steps','boundaryMarkers']) {
  assert.ok(stone.includes(token), `U3.11 debe conservar ${token}`);
}
assert.ok(stone.includes("quality==='high'?22:quality==='balanced'?14:7"));
assert.ok(stone.includes("quality==='high'?7:quality==='balanced'?4:2"));
assert.ok(stone.includes('Promise.resolve(zones.ready).finally(run)'));
assert.equal(/https?:\/\//.test(stone), false, 'U3.11 no debe depender de recursos remotos');

console.log('U3.11 stone boundaries contract: OK');

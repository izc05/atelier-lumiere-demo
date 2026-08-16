import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (file) => fs.readFileSync(new URL(`../public/${file}`, import.meta.url), 'utf8');
const bootstrap = read('entrada/webgl/bootstrap.js');
const roof = read('entrada/webgl/roof-patina.js');

const facadeIndex = bootstrap.indexOf('/entrada/webgl/facade-details.js');
const roofIndex = bootstrap.indexOf('/entrada/webgl/roof-patina.js');
const landscapeIndex = bootstrap.indexOf('/entrada/webgl/landscape-details.js');

assert.ok(facadeIndex >= 0 && roofIndex > facadeIndex, 'U3.8 debe cargar después del detalle de fachada');
assert.ok(landscapeIndex > roofIndex, 'U3.8 debe cargar antes del paisaje detallado');
assert.ok(bootstrap.includes("graphicsCheckpoint = 'u3.8'"));

for (const token of ['roofPatina','u3.8','ridge','irregularTiles','chimney','stonePlinth','mineralPatina']) {
  assert.ok(roof.includes(token), `U3.8 debe conservar ${token}`);
}
assert.ok(roof.includes("quality === 'high' ? 22 : quality === 'balanced' ? 14 : 7"));
assert.ok(roof.includes("quality === 'high' ? 5 : quality === 'balanced' ? 2 : 0"));
assert.ok(roof.includes('Promise.resolve(zones.ready).finally(run)'));
assert.equal(/https?:\/\//.test(roof), false, 'U3.8 no debe depender de recursos remotos');

console.log('U3.8 roof patina contract: OK');

import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (file) => fs.readFileSync(new URL(`../public/${file}`, import.meta.url), 'utf8');
const bootstrap = read('entrada/webgl/bootstrap.js');
const vegetation = read('entrada/webgl/premium-vegetation.js');

const landscapeIndex = bootstrap.indexOf('/entrada/webgl/landscape-details.js');
const vegetationIndex = bootstrap.indexOf('/entrada/webgl/premium-vegetation.js');
const shadowsIndex = bootstrap.indexOf('/entrada/webgl/contact-shadows.js');

assert.ok(landscapeIndex >= 0 && vegetationIndex > landscapeIndex, 'U3.9 debe cargar después del paisaje detallado');
assert.ok(shadowsIndex > vegetationIndex, 'U3.9 debe cargar antes de las sombras de contacto');
assert.ok(bootstrap.includes('/entrada/webgl/premium-vegetation.js'));

for (const token of ['premiumVegetation','AtelierCraftTaxonomy','FLORAL','TEXTILE','CERAMICS','WOOD','PAPER','CANDLE','FAN','JEWELRY','GLASS','LEATHER']) {
  assert.ok(vegetation.includes(token), `U3.9 debe conservar ${token}`);
}
assert.ok(vegetation.includes("quality === 'high' ? 22 : quality === 'balanced' ? 14 : 7"));
assert.ok(vegetation.includes("quality === 'high' ? 3 : quality === 'balanced' ? 2 : 1"));
assert.ok(vegetation.includes('taxonomy.resolve(cfg.workshopType).key'));
assert.ok(vegetation.includes('Promise.resolve(zones.ready).finally(run)'));
assert.equal(/https?:\/\//.test(vegetation), false, 'U3.9 no debe depender de recursos remotos');

console.log('U3.9 premium vegetation contract: OK');

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve('public');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const bootstrap = read('entrada/webgl/bootstrap.js');
const facade = read('entrada/webgl/facade-details.js');

const craftIndex = bootstrap.indexOf('/entrada/webgl/craft-details.js');
const facadeIndex = bootstrap.indexOf('/entrada/webgl/facade-details.js');
const landscapeIndex = bootstrap.indexOf('/entrada/webgl/landscape-details.js');
assert.ok(craftIndex >= 0 && facadeIndex > craftIndex, 'U3.7 debe cargar después del microdetalle artesanal');
assert.ok(landscapeIndex > facadeIndex, 'U3.7 debe cargar antes del paisaje de detalle');

assert.ok(facade.includes("budget = quality === 'high' ? 22 : quality === 'balanced' ? 14 : 7"));
assert.ok(facade.includes("if (zone.existingPlace) return false"), 'los edificios firma conservan su modelado específico');
assert.ok(facade.includes('hashZone'), 'las variaciones deben ser deterministas por zona');
for (const token of ['MATERIAL.WOOD','MATERIAL.GLASS','MATERIAL.METAL','MATERIAL.STONE']) {
  assert.ok(facade.includes(token), `material ausente en U3.7: ${token}`);
}
assert.ok(facade.includes("root.dataset.facadeDetails='u3.7'"));
assert.equal(/Math\.random\(/.test(facade), false, 'U3.7 no debe cambiar aleatoriamente al recargar');
assert.equal(/https?:\/\//.test(facade), false, 'U3.7 no debe depender de recursos externos');

console.log('U3.7 facade details contract: OK');

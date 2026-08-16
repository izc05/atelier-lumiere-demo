import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (file) => fs.readFileSync(new URL(`../public/${file}`, import.meta.url), 'utf8');
const bootstrap = read('entrada/webgl/bootstrap.js');
const urban = read('entrada/webgl/urban-density.js');

const lifeIndex = bootstrap.indexOf('/entrada/webgl/proximity-life.js');
const urbanIndex = bootstrap.indexOf('/entrada/webgl/urban-density.js');
const shadowsIndex = bootstrap.indexOf('/entrada/webgl/contact-shadows.js');
const nightIndex = bootstrap.indexOf('/entrada/webgl/reference-night-direction.js');

assert.ok(lifeIndex >= 0 && urbanIndex > lifeIndex, 'U3.20 debe compactar el pueblo después del microdetalle de talleres');
assert.ok(shadowsIndex > urbanIndex, 'U3.20 debe existir antes de sombras e iluminación');
assert.ok(nightIndex > urbanIndex, 'U3.18 debe tonalizar también la geometría nueva de U3.20');
assert.ok(bootstrap.includes("urbanCheckpoint = 'u3.20'"));

for (const token of [
  "urbanDensity === 'u3.20'",
  "quality === 'high' ? 20 : quality === 'balanced' ? 14 : 7",
  'oldQuarter',
  'maison',
  'centralPlaza',
  'streetNetwork',
  'streetLamp',
  'thresholdSteps',
  'p9Window',
  'AtelierVillageUrbanDensity',
  "urbanRole = role"
]) {
  assert.ok(urban.includes(token), `U3.20 debe conservar ${token}`);
}

assert.ok(urban.includes("root.dataset.urbanDensity='u3.20'"));
assert.ok(urban.includes("root.dataset.urbanDensityHouses"));
assert.equal(/https?:\/\//.test(urban), false, 'U3.20 no debe depender de recursos remotos');

console.log('U3.20 urban density contract: OK');

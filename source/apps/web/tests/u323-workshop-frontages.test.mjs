import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (file) => fs.readFileSync(new URL(`../public/${file}`, import.meta.url), 'utf8');
const bootstrap = read('entrada/webgl/bootstrap.js');
const frontages = read('entrada/webgl/workshop-frontages.js');

const fineIndex = bootstrap.indexOf('/entrada/webgl/urban-fine-composition.js');
const frontageIndex = bootstrap.indexOf('/entrada/webgl/workshop-frontages.js');
const shadowsIndex = bootstrap.indexOf('/entrada/webgl/contact-shadows.js');
const nightIndex = bootstrap.indexOf('/entrada/webgl/reference-night-direction.js');

assert.ok(fineIndex >= 0 && frontageIndex > fineIndex, 'U3.23 debe aplicarse después de la composición urbana U3.22');
assert.ok(shadowsIndex > frontageIndex, 'U3.23 debe crear geometría antes de sombras de contacto');
assert.ok(nightIndex > frontageIndex, 'U3.18 debe tonalizar también las fachadas nuevas de U3.23');
assert.ok(bootstrap.includes("workshopFrontageCheckpoint = 'u3.23'"));

for (const token of [
  "workshopFrontages === 'u3.23'",
  "quality === 'high' ? 14 : quality === 'balanced' ? 10 : 6",
  "quality === 'high' ? 10 : quality === 'balanced' ? 6 : 3",
  'brandPixels',
  'physical-sign',
  'shop-window',
  'shop-door',
  'awning',
  'wall-sconce',
  'familyAccent',
  "placeName:'atelier'",
  "mark:'AL'",
  "placeName:'izc'",
  "mark:'IZC'",
  "placeName:'stitch'",
  "mark:'TGS'",
  'webglDynamicProviderPlaces',
  'config?.provider',
  'taxonomy.resolve',
  'AtelierVillageWorkshopFrontages'
]) {
  assert.ok(frontages.includes(token), `U3.23 debe conservar ${token}`);
}

for (const family of ['CERAMICS','TEXTILE','JEWELRY','WOOD','FLORAL','PAPER','CANDLE','LEATHER','FAN','GLASS','NEUTRAL']) {
  assert.ok(frontages.includes(family), `U3.23 debe conservar identidad para ${family}`);
}

assert.doesNotThrow(() => new Function(frontages), 'U3.23 debe ser JavaScript sintácticamente válido');
assert.equal(/https?:\/\//.test(frontages), false, 'U3.23 no debe depender de recursos remotos');

console.log('U3.23 workshop frontages contract: OK');

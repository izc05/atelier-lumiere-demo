import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (file) => fs.readFileSync(new URL(`../public/${file}`, import.meta.url), 'utf8');
const bootstrap = read('entrada/webgl/bootstrap.js');
const alignment = read('entrada/webgl/workshop-frontage-alignment.js');

const frontageIndex = bootstrap.indexOf('/entrada/webgl/workshop-frontages.js');
const alignmentIndex = bootstrap.indexOf('/entrada/webgl/workshop-frontage-alignment.js');
const shadowsIndex = bootstrap.indexOf('/entrada/webgl/contact-shadows.js');

assert.ok(frontageIndex >= 0 && alignmentIndex > frontageIndex, 'La alineación U3.23 debe ejecutarse después de crear las fachadas');
assert.ok(shadowsIndex > alignmentIndex, 'La alineación debe cerrarse antes de sombras de contacto');
assert.ok(bootstrap.includes("workshopFrontageAlignmentCheckpoint = 'u3.23'"));

for (const token of [
  "workshopFrontageAlignment === 'u3.23'",
  "role === 'physical-sign'",
  "role === 'physical-brand-pixel'",
  'targetForward',
  'deltaY',
  'AtelierVillageWorkshopFrontageAlignment',
  'workshopFrontageAlignedPlaces',
  'workshopFrontageAlignedPixels'
]) {
  assert.ok(alignment.includes(token), `Alineación U3.23 debe conservar ${token}`);
}

assert.doesNotThrow(() => new Function(alignment), 'La alineación U3.23 debe ser JavaScript sintácticamente válido');
assert.equal(/https?:\/\//.test(alignment), false, 'La alineación U3.23 no debe depender de recursos remotos');

console.log('U3.23 workshop frontage alignment contract: OK');

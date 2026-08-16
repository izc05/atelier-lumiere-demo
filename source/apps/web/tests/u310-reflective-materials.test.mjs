import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (file) => fs.readFileSync(new URL(`../public/${file}`, import.meta.url), 'utf8');
const bootstrap = read('entrada/webgl/bootstrap.js');
const reflective = read('entrada/webgl/reflective-materials.js');

const materialsIndex = bootstrap.indexOf('/entrada/webgl/material-textures.js');
const reflectiveIndex = bootstrap.indexOf('/entrada/webgl/reflective-materials.js');
const craftIndex = bootstrap.indexOf('/entrada/webgl/craft-details.js');

assert.ok(materialsIndex >= 0 && reflectiveIndex > materialsIndex, 'U3.10 debe cargar después de materiales base');
assert.ok(craftIndex > reflectiveIndex, 'U3.10 debe cargar antes del microdetalle de oficio');
assert.ok(bootstrap.includes("graphicsCheckpoint = 'u3.10'"));

for (const token of ['reflectiveMaterials','u3.10','uWater','fresnel','sparkle','brushed','MATERIAL.GLASS','MATERIAL.METAL']) {
  assert.ok(reflective.includes(token), `U3.10 debe conservar ${token}`);
}
assert.ok(reflective.includes("quality === 'lite'"));
assert.ok(reflective.includes("prefers-reduced-motion: reduce"));
assert.ok(reflective.includes('performance.now()/1000'));
assert.equal(/https?:\/\//.test(reflective), false, 'U3.10 no debe depender de recursos remotos');

console.log('U3.10 reflective materials contract: OK');

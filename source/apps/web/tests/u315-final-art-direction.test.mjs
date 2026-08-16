import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (file) => fs.readFileSync(new URL(`../public/${file}`, import.meta.url), 'utf8');
const bootstrap = read('entrada/webgl/bootstrap.js');
const index = read('entrada/webgl/index.html');
const art = read('entrada/webgl/final-art-direction.js');
const css = read('entrada/webgl/final-art-direction.css');

const spatialIndex = bootstrap.indexOf('/entrada/webgl/spatial-navigation.js');
const artIndex = bootstrap.indexOf('/entrada/webgl/final-art-direction.js');
const arrivalIndex = bootstrap.indexOf('/entrada/webgl/arrival-transition.js');

assert.ok(spatialIndex >= 0 && artIndex > spatialIndex, 'U3.15 debe cargar después de navegación espacial');
assert.ok(arrivalIndex > artIndex, 'U3.15 debe fijar composición antes de la llegada cinematográfica');
assert.ok(/graphicsCheckpoint = 'u3\.(1[5-9]|[2-9]\d)'/.test(bootstrap), 'U3.15 debe mantenerse en un checkpoint igual o posterior');
assert.ok(index.includes('/entrada/webgl/final-art-direction.css'));

for (const token of ['finalArtDirection','AtelierVillageArtDirection','atelierDistance','landmarkDistance','p9CameraProfile','selectedPlace']) {
  assert.ok(art.includes(token), `U3.15 debe conservar ${token}`);
}
for (const token of ['25.4','31.8','34.2','15.35','13.1']) {
  assert.ok(art.includes(token), `U3.15 debe conservar la composición ${token}`);
}
assert.ok(art.includes("eyebrow.textContent = 'Atelier Lumière · Pueblo de oficios'"));
assert.ok(css.includes('data-final-art-direction="u3.15"'));
assert.ok(css.includes('.webgl-spatial-controls button'));
assert.ok(css.includes('data-ui-settled="true"'));
assert.ok(css.includes('@media (max-width: 760px)'));
assert.ok(css.includes('@media (max-width: 1050px) and (min-width: 761px)'));
assert.equal(/https?:\/\//.test(art), false, 'U3.15 no debe depender de recursos remotos');
assert.equal(/https?:\/\//.test(css), false, 'U3.15 CSS no debe depender de recursos remotos');

console.log('U3.15 final art direction contract: OK');

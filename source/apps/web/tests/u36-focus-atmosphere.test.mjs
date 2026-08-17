import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve('public');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const bootstrap = read('entrada/webgl/bootstrap.js');
const script = read('entrada/webgl/focus-atmosphere.js');
const css = read('entrada/webgl/focus-atmosphere.css');

const lightingIndex = bootstrap.indexOf('/entrada/webgl/cinematic-lighting.js');
const focusIndex = bootstrap.indexOf('/entrada/webgl/focus-atmosphere.js');
const plaquesIndex = bootstrap.indexOf('/entrada/webgl/workshop-plaques.js');
assert.ok(lightingIndex >= 0 && focusIndex > lightingIndex, 'U3.6 debe cargar después de la iluminación');
assert.ok(plaquesIndex > focusIndex, 'U3.6 debe quedar por debajo de las placas');

assert.ok(script.includes('webglProjectPoint'));
assert.ok(script.includes('webglSelectedPlace'));
assert.ok(script.includes('webglHoverPlace'));
assert.ok(script.includes("selected !== 'overview'"));
assert.ok(script.includes("root.dataset.depthGrading = 'u3.6'"));

assert.ok(css.includes('[data-webgl-quality="balanced"]'));
assert.ok(css.includes('[data-webgl-quality="lite"]'));
assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'));
assert.ok(css.includes('radial-gradient'));
assert.equal(/https?:\/\//.test(css + script), false, 'U3.6 no debe depender de recursos externos');

console.log('U3.6 focus atmosphere contract: OK');

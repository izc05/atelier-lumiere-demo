import fs from 'node:fs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const read = (file) => fs.readFileSync(new URL(`../public/${file}`, import.meta.url), 'utf8');
const bootstrap = read('entrada/webgl/bootstrap.js');
const fidelity = read('entrada/webgl/graphics-fidelity.js');
const bridge = read('entrada/webgl/workshop-page-bridge.js');
const workshop = read('taller/village-continuity.js');
const workshopCss = read('taller/village-continuity.css');
const workshopHtml = read('taller/index.html');
const provider = read('taller/provider.js');

const performanceIndex = bootstrap.indexOf('/entrada/webgl/adaptive-performance.js');
const fidelityIndex = bootstrap.indexOf('/entrada/webgl/graphics-fidelity.js');
const narrativeIndex = bootstrap.indexOf('/entrada/webgl/narrative-entry-transition.js');
const bridgeIndex = bootstrap.indexOf('/entrada/webgl/workshop-page-bridge.js');
const arrivalIndex = bootstrap.indexOf('/entrada/webgl/arrival-transition.js');

assert.ok(performanceIndex >= 0 && fidelityIndex > performanceIndex, 'U3.27A debe partir del gobernador U3.14');
assert.ok(narrativeIndex >= 0 && bridgeIndex > narrativeIndex, 'U3.27B debe partir de la narrativa U3.26');
assert.ok(arrivalIndex > bridgeIndex, 'El puente debe quedar preparado antes de la llegada final');
assert.ok(bootstrap.includes("graphicsFidelityCheckpoint = 'u3.27'"));
assert.ok(bootstrap.includes("workshopContinuityCheckpoint = 'u3.27'"));

for (const token of [
  "graphicsFidelity === 'u3.27'",
  "high: { dpr: 2.0, maxPixels: 7200000 }",
  "balanced: { dpr: 1.45, maxPixels: 3600000 }",
  "lite: { dpr: 1.0, maxPixels: 2100000 }",
  "mode === 'protect'",
  "mode === 'reduce'",
  "mode === 'trim'",
  'Math.sqrt(profile.maxPixels / cssPixels)',
  'resize = function u327HighFidelityResize',
  "attributeFilter: ['data-performance-mode']",
  'AtelierVillageGraphicsFidelity'
]) {
  assert.ok(fidelity.includes(token), `U3.27A debe conservar ${token}`);
}

for (const token of [
  "atelier_village_workshop_transition",
  "version: 'u3.27'",
  "source: 'village'",
  "a.webgl-provider-enter",
  'sessionStorage.setItem',
  'AtelierVillageWorkshopBridge'
]) {
  assert.ok(bridge.includes(token), `U3.27B bridge debe conservar ${token}`);
}

for (const token of [
  "atelier_village_workshop_transition",
  "value?.version !== 'u3.27'",
  "value?.slug !== slug",
  '10 * 60 * 1000',
  "workshopArrival = 'village'",
  'MutationObserver',
  'AtelierWorkshopVillageArrival',
  'CERAMICS', 'TEXTILE', 'JEWELRY', 'WOOD', 'FLORAL', 'PAPER', 'CANDLE', 'LEATHER', 'FAN', 'GLASS'
]) {
  assert.ok(workshop.includes(token), `U3.27B taller debe conservar ${token}`);
}

for (const token of [
  '.u327-workshop-arrival',
  'html[data-workshop-arrival="village"] .provider-hero',
  'html[data-workshop-arrival="village"] .provider-cover',
  '@media(prefers-reduced-motion:reduce)'
]) {
  assert.ok(workshopCss.includes(token), `U3.27B CSS debe conservar ${token}`);
}

assert.ok(workshopHtml.includes('/taller/village-continuity.css'));
assert.ok(workshopHtml.includes('/taller/village-continuity.js'));
assert.ok(provider.includes('defaultWidth: 1600'), 'La portada editorial debe pedir 1600 px');
assert.ok(provider.includes('defaultWidth: index === 0 ? 1280 : 900'), 'La galería debe elevar resolución 1280/900');
assert.ok(provider.includes('defaultWidth: 640'), 'Los productos deben conservar presupuesto contenido');

for (const source of [fidelity, bridge, workshop, workshopCss]) {
  assert.equal(/https?:\/\//.test(source), false, 'U3.27 no debe añadir recursos remotos');
}

for (const file of [
  '../public/entrada/webgl/graphics-fidelity.js',
  '../public/entrada/webgl/workshop-page-bridge.js',
  '../public/taller/village-continuity.js',
  '../public/taller/provider.js',
  '../public/entrada/webgl/bootstrap.js'
]) {
  execFileSync(process.execPath, ['--check', fileURLToPath(new URL(file, import.meta.url))], { stdio: 'pipe' });
}

console.log('U3.27 graphics + workshop continuity contract: OK');

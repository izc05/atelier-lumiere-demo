/* Pueblo Atelier · P8.2C · partículas acuareladas + viaje de cámara */

let webglWatercolorLayer = null;
let webglWatercolorTimer = null;

function webglEnsureWatercolorLayer() {
  if (webglWatercolorLayer) return webglWatercolorLayer;
  const layer = document.createElement('div');
  layer.className = 'webgl-watercolor-layer';
  layer.setAttribute('aria-hidden', 'true');
  root?.append(layer);
  webglWatercolorLayer = layer;
  return layer;
}

function webglSeed(value) {
  let seed = 2166136261;
  for (const char of String(value || 'atelier')) {
    seed ^= char.charCodeAt(0);
    seed = Math.imul(seed, 16777619);
  }
  return seed >>> 0;
}

function webglRandom(seed) {
  let current = seed >>> 0;
  return () => {
    current += 0x6D2B79F5;
    let t = current;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function webglWatercolorOrigin(name) {
  const config = webglInteractionPlaces[name];
  if (!config) {
    const rect = canvas.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }
  return webglProjectPoint(config.point) || webglWatercolorOrigin('overview');
}

function webglRunWatercolor(name) {
  if (reducedMotion.matches || !root) return;
  const layer = webglEnsureWatercolorLayer();
  layer.replaceChildren();
  const origin = webglWatercolorOrigin(name);
  const rootRect = root.getBoundingClientRect();
  const x = origin.x - rootRect.left;
  const y = origin.y - rootRect.top;

  const wash = document.createElement('span');
  wash.className = 'webgl-watercolor-wash';
  wash.style.setProperty('--x', `${x}px`);
  wash.style.setProperty('--y', `${y}px`);
  layer.append(wash);

  const random = webglRandom(webglSeed(name));
  const tones = ['wine', 'gold', 'paper', 'rose'];
  const count = window.innerWidth <= 760 ? 16 : 28;
  for (let index = 0; index < count; index++) {
    const particle = document.createElement('i');
    particle.className = 'webgl-watercolor-particle';
    particle.dataset.tone = tones[index % tones.length];
    const angle = random() * Math.PI * 2;
    const radius = 55 + random() * (window.innerWidth <= 760 ? 105 : 180);
    const size = 12 + random() * (window.innerWidth <= 760 ? 42 : 68);
    particle.style.setProperty('--x', `${x}px`);
    particle.style.setProperty('--y', `${y}px`);
    particle.style.setProperty('--dx', `${Math.cos(angle) * radius}px`);
    particle.style.setProperty('--dy', `${Math.sin(angle) * radius * .7}px`);
    particle.style.setProperty('--size', `${size}px`);
    particle.style.setProperty('--ratio', String(.55 + random() * .9));
    particle.style.setProperty('--blur', `${1 + random() * 4}px`);
    particle.style.setProperty('--delay', `${Math.round(random() * 115)}ms`);
    particle.style.setProperty('--duration', `${700 + Math.round(random() * 320)}ms`);
    particle.style.setProperty('--end-scale', String(1.05 + random() * 1.35));
    particle.style.setProperty('--rotation', `${Math.round((random() - .5) * 72)}deg`);
    particle.style.setProperty('--radius', `${35 + Math.round(random() * 30)}% ${38 + Math.round(random() * 28)}% ${42 + Math.round(random() * 30)}% ${35 + Math.round(random() * 30)}%`);
    layer.append(particle);
  }

  root.dataset.watercolorTransition = 'true';
  window.clearTimeout(webglWatercolorTimer);
  webglWatercolorTimer = window.setTimeout(() => {
    delete root.dataset.watercolorTransition;
    layer.replaceChildren();
  }, 1180);
}

const webglOriginalFocusPlace = webglFocusPlace;
webglFocusPlace = function webglFocusPlaceWithWatercolor(name) {
  const place = places[name];
  if (!place) return;
  webglRunWatercolor(name);
  if (!reducedMotion.matches) camera.distance = Math.min(48, camera.distance + Math.max(.65, camera.distance * .028));
  webglOriginalFocusPlace(name);
};

const webglOriginalFocusOverview = webglFocusOverview;
webglFocusOverview = function webglFocusOverviewWithWatercolor() {
  webglRunWatercolor('overview');
  if (!reducedMotion.matches) camera.distance = Math.min(48, camera.distance + .85);
  webglOriginalFocusOverview();
};

if (root) root.dataset.webglPhase = 'p8.2c';
const webglTransitionPhaseLabel = document.querySelector('.webgl-village-heading > span');
if (webglTransitionPhaseLabel) webglTransitionPhaseLabel.textContent = 'Laboratorio P8.2C · viaje acuarelado 3D';
if (status) status.textContent = 'P8.2C · selecciona un destino para viajar';

/* Pueblo Atelier · P10.6 · atmósfera viva */

(() => {
  if (!root) return;

  const motionReduced = reducedMotion?.matches === true;
  const saveData = Boolean((navigator.connection || navigator.mozConnection || navigator.webkitConnection)?.saveData);
  const quality = typeof webglQualityMode === 'string' ? webglQualityMode : 'balanced';

  if (!document.querySelector('link[data-p10-atmosphere]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/entrada/webgl/ambient-atmosphere.css';
    link.dataset.p10Atmosphere = '';
    document.head.append(link);
  }

  const layer = document.createElement('div');
  layer.className = 'p10-atmosphere';
  layer.setAttribute('aria-hidden', 'true');

  const wash = document.createElement('div');
  wash.className = 'p10-atmosphere-wash';
  layer.append(wash);

  const moteCount = motionReduced || saveData
    ? 0
    : quality === 'high'
      ? 14
      : quality === 'balanced'
        ? 9
        : 4;

  function pseudo(index, salt) {
    const value = Math.sin((index + 1) * (12.9898 + salt * 7.233)) * 43758.5453;
    return value - Math.floor(value);
  }

  for (let i = 0; i < moteCount; i++) {
    const mote = document.createElement('i');
    mote.className = 'p10-mote';
    const size = 1.6 + pseudo(i, 1) * 3.3;
    const x = 4 + pseudo(i, 2) * 92;
    const y = 8 + pseudo(i, 3) * 80;
    const dx = -42 + pseudo(i, 4) * 84;
    const dy = -28 - pseudo(i, 5) * 82;
    const duration = 18 + pseudo(i, 6) * 19;
    const delay = -pseudo(i, 7) * duration;
    mote.style.setProperty('--p10-size', `${size.toFixed(2)}px`);
    mote.style.setProperty('--p10-x', `${x.toFixed(2)}%`);
    mote.style.setProperty('--p10-y', `${y.toFixed(2)}%`);
    mote.style.setProperty('--p10-dx', `${dx.toFixed(1)}px`);
    mote.style.setProperty('--p10-dy', `${dy.toFixed(1)}px`);
    mote.style.setProperty('--p10-duration', `${duration.toFixed(1)}s`);
    mote.style.setProperty('--p10-delay', `${delay.toFixed(1)}s`);
    layer.append(mote);
  }

  const canvasParent = canvas?.parentElement || root;
  canvasParent.append(layer);

  /* Luz lenta: modifica el vector ya utilizado por el shader P9.2, sin recompilar WebGL. */
  let lightRaf = 0;
  let started = performance.now();
  let active = !document.hidden;

  function animateLight(now) {
    lightRaf = 0;
    if (!active || motionReduced || saveData || typeof p9LightDirection === 'undefined') return;

    const elapsed = (now - started) / 1000;
    const cycle = elapsed / 26;
    const soft = Math.sin(cycle * Math.PI * 2);
    const secondary = Math.cos(cycle * Math.PI * 1.4);

    p9LightDirection[0] = -.42 + soft * .045;
    p9LightDirection[1] = .88 + secondary * .018;
    p9LightDirection[2] = .31 + soft * .032;

    lightRaf = requestAnimationFrame(animateLight);
  }

  function resumeLight() {
    if (motionReduced || saveData || lightRaf) return;
    started = performance.now();
    lightRaf = requestAnimationFrame(animateLight);
  }

  document.addEventListener('visibilitychange', () => {
    active = !document.hidden;
    if (!active && lightRaf) {
      cancelAnimationFrame(lightRaf);
      lightRaf = 0;
    } else if (active) {
      resumeLight();
    }
  });

  resumeLight();

  root.dataset.ambientAtmosphere = 'p10.6';
  root.dataset.webglPhase = 'p10.6';

  window.setTimeout(() => {
    const label = document.querySelector('.webgl-village-heading > span');
    if (label) label.textContent = 'P10.6 · Pueblo Atelier · atmósfera viva';
    if (status && !root.dataset.webglError) {
      status.textContent = 'P10.6 · luz editorial viva · arrastra para explorar';
    }
  }, 320);
})();

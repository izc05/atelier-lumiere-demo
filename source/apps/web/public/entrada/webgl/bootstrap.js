/* Pueblo Atelier · P8.2E.1 · bootstrap seguro WebGL/fallback */

(() => {
  const root = document.querySelector('[data-webgl-village]');
  const canvas = document.querySelector('[data-webgl-canvas]');
  const status = document.querySelector('[data-webgl-status]');
  const fallback = document.querySelector('.webgl-village-fallback');

  const failToFallback = (message = 'WebGL2 no disponible') => {
    if (root) {
      root.dataset.webglError = 'true';
      root.dataset.webglPhase = 'fallback';
    }
    if (status) status.textContent = `${message} · abriendo mapa ligero…`;
    if (fallback) fallback.textContent = 'Abrir mapa ligero';
    window.setTimeout(() => {
      if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
        window.location.replace('/entrada/?webgl=0');
      }
    }, 650);
  };

  if (!canvas) {
    failToFallback('No se encontró el lienzo 3D');
    return;
  }

  let context = null;
  try {
    context = canvas.getContext('webgl2', {
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance'
    });
  } catch {
    context = null;
  }

  if (!context) {
    failToFallback();
    return;
  }

  const scripts = [
    '/entrada/webgl/scene.js',
    '/entrada/webgl/art-direction.js',
    '/entrada/webgl/interaction.js',
    '/entrada/webgl/cinematic-modeling.js',
    '/entrada/webgl/illustration-render.js',
    '/entrada/webgl/transition.js',
    '/entrada/webgl/providers.js',
    '/entrada/webgl/cinematic-camera.js',
    '/entrada/webgl/quality.js'
  ];

  const loadScript = (src) => new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.addEventListener('load', resolve, { once: true });
    script.addEventListener('error', () => reject(new Error(`No se pudo cargar ${src}`)), { once: true });
    document.head.append(script);
  });

  (async () => {
    try {
      for (const src of scripts) await loadScript(src);
      if (root) root.dataset.webglBootstrapped = 'true';
    } catch (error) {
      console.error(error);
      failToFallback('No se pudo iniciar la escena 3D');
    }
  })();
})();

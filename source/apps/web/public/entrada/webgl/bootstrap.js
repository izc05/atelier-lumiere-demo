/* Pueblo Atelier · bootstrap seguro WebGL/fallback */

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
    '/village-craft-taxonomy.js',
    '/entrada/webgl/scene.js',
    '/entrada/webgl/art-direction.js',
    '/entrada/webgl/interaction.js',
    '/entrada/webgl/cinematic-modeling.js',
    '/entrada/webgl/architectural-families.js',
    '/entrada/webgl/illustration-render.js',
    '/entrada/webgl/transition.js',
    '/entrada/webgl/village-zones.js',
    '/entrada/webgl/provider-reservations.js',
    '/entrada/webgl/providers.js',
    '/entrada/webgl/parcel-highlights.js',
    '/entrada/webgl/cinematic-camera.js',
    '/entrada/webgl/atelier-maison.js',
    '/entrada/webgl/izc-pavilion.js',
    '/entrada/webgl/gentle-stitch-studio.js',
    '/entrada/webgl/authored-landscape.js',
    '/entrada/webgl/quality.js',
    '/entrada/webgl/craft-architecture.js',
    '/entrada/webgl/page-transition.js',
    '/entrada/webgl/cinematic-ui.js',
    '/entrada/webgl/overview-composition.js',
    '/entrada/webgl/ambient-atmosphere.js',
    '/entrada/webgl/world-signage.js',
    '/entrada/webgl/distant-depth.js',
    '/entrada/webgl/warm-village.js',
    '/entrada/webgl/material-textures.js',
    '/entrada/webgl/reflective-materials.js',
    '/entrada/webgl/craft-details.js',
    '/entrada/webgl/facade-details.js',
    '/entrada/webgl/roof-patina.js',
    '/entrada/webgl/landscape-details.js',
    '/entrada/webgl/premium-vegetation.js',
    '/entrada/webgl/stone-boundaries.js',
    '/entrada/webgl/contact-shadows.js',
    '/entrada/webgl/cinematic-lighting.js',
    '/entrada/webgl/focus-atmosphere.js',
    '/entrada/webgl/distance-lod.js',
    '/entrada/webgl/workshop-plaques.js',
    '/entrada/webgl/plaque-polish.js',
    '/entrada/webgl/spatial-navigation.js',
    '/entrada/webgl/arrival-transition.js'
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
      if (root) {
        root.dataset.webglBootstrapped = 'true';
        root.dataset.graphicsCheckpoint = 'u3.12';
      }
    } catch (error) {
      console.error(error);
      failToFallback('No se pudo iniciar la escena 3D');
    }
  })();
})();

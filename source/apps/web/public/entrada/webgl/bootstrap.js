/* Pueblo Atelier · bootstrap seguro WebGL/fallback */

(() => {
  const root = document.querySelector('[data-webgl-village]');
  const canvas = document.querySelector('[data-webgl-canvas]');
  const status = document.querySelector('[data-webgl-status]');
  const fallback = document.querySelector('.webgl-village-fallback');
  const boot = window.AtelierVillageBoot || null;

  const failToFallback = (message = 'WebGL2 no disponible') => {
    if (root) {
      root.dataset.webglError = 'true';
      root.dataset.webglPhase = 'fallback';
    }
    boot?.fail?.(message);
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
    '/entrada/webgl/mesh-integrity.js',
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
    '/entrada/webgl/horizon-continuity.js',
    '/entrada/webgl/stone-boundaries.js',
    '/entrada/webgl/proximity-life.js',
    '/entrada/webgl/urban-density.js',
    '/entrada/webgl/silhouette-reconstruction.js',
    '/entrada/webgl/night-life-lighting.js',
    '/entrada/webgl/urban-fine-composition.js',
    '/entrada/webgl/workshop-frontages.js',
    '/entrada/webgl/workshop-frontage-alignment.js',
    '/entrada/webgl/village-pathways.js',
    '/entrada/webgl/path-surface-fidelity.js',
    '/entrada/webgl/architectural-realism.js',
    '/entrada/webgl/reference-shape-cleanup.js',
    '/entrada/webgl/hero-house-fidelity.js',
    '/entrada/webgl/contact-shadows.js',
    '/entrada/webgl/cinematic-lighting.js',
    '/entrada/webgl/focus-atmosphere.js',
    '/entrada/webgl/adaptive-performance.js',
    '/entrada/webgl/graphics-fidelity.js',
    '/entrada/webgl/distance-lod.js',
    '/entrada/webgl/workshop-plaques.js',
    '/entrada/webgl/plaque-polish.js',
    '/entrada/webgl/plaque-stability.js',
    '/entrada/webgl/spatial-navigation.js',
    '/entrada/webgl/navigation-stability.js',
    '/entrada/webgl/final-art-direction.js',
    '/entrada/webgl/capture-tuning.js',
    '/entrada/webgl/reference-night-direction.js',
    '/entrada/webgl/ambient-village-life.js',
    '/entrada/webgl/material-depth.js',
    '/entrada/webgl/close-range-fidelity.js',
    '/entrada/webgl/plaza-water-reflections.js',
    '/entrada/webgl/dynamic-local-lighting.js',
    '/entrada/webgl/take-directed-cleanup.js',
    '/entrada/webgl/cinematic-depth-composition.js',
    '/entrada/webgl/narrative-entry-transition.js',
    '/entrada/webgl/workshop-page-bridge.js',
    '/entrada/webgl/arrival-transition.js',
    '/entrada/webgl/map-drag-navigation.js',
    '/entrada/webgl/game-grade-interaction.js',
    '/entrada/webgl/renderer-watchdog.js'
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
      boot?.progress?.(0, scripts.length);
      for (let index = 0; index < scripts.length; index += 1) {
        await loadScript(scripts[index]);
        boot?.progress?.(index + 1, scripts.length);
      }
      if (root) {
        root.dataset.webglBootstrapped = 'true';
        root.dataset.graphicsCheckpoint = 'u3.16';
        root.dataset.referenceArtCheckpoint = 'u3.18';
        root.dataset.navigationCheckpoint = 'u3.17n.4';
        root.dataset.stabilityCheckpoint = 'u3.19';
        root.dataset.urbanCheckpoint = 'u3.20';
        root.dataset.silhouetteReconstructionCheckpoint = 'u3.40';
        root.dataset.lightingCheckpoint = 'u3.21';
        root.dataset.urbanFineCheckpoint = 'u3.22';
        root.dataset.workshopFrontageCheckpoint = 'u3.23';
        root.dataset.workshopFrontageAlignmentCheckpoint = 'u3.23';
        root.dataset.ambientLifeCheckpoint = 'u3.24';
        root.dataset.cinematicDepthCheckpoint = 'u3.25';
        root.dataset.narrativeEntryCheckpoint = 'u3.26';
        root.dataset.graphicsFidelityCheckpoint = 'u3.27';
        root.dataset.workshopContinuityCheckpoint = 'u3.27';
        root.dataset.bootCheckpoint = 'u3.28';
        root.dataset.pathwaysCheckpoint = 'u3.29';
        root.dataset.materialDepthCheckpoint = 'u3.29';
        root.dataset.horizonCheckpoint = 'u3.30';
        root.dataset.vegetationVarietyCheckpoint = 'u3.30';
        root.dataset.closeRangeFidelityCheckpoint = 'u3.31';
        root.dataset.plazaWaterCheckpoint = 'u3.32';
        root.dataset.pathSurfaceCheckpoint = 'u3.33';
        root.dataset.architecturalRealismCheckpoint = 'u3.34';
        root.dataset.referenceShapeCleanupCheckpoint = 'u3.35';
        root.dataset.gameGradeInteractionCheckpoint = 'u3.36';
        root.dataset.heroHouseFidelityCheckpoint = 'u3.37';
        root.dataset.dynamicLocalLightingCheckpoint = 'u3.38';
        root.dataset.takeDirectedCleanupCheckpoint = 'u3.39';
      }
      if (boot?.complete) await boot.complete();
    } catch (error) {
      console.error(error);
      failToFallback('No se pudo iniciar la escena 3D');
    }
  })();
})();

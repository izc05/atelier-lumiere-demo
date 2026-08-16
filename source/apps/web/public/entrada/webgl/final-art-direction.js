/* Atelier Lumière · U3.15 · dirección artística final de composición */
(() => {
  if (!root || typeof camera === 'undefined' || typeof places === 'undefined') return;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  function composition() {
    const mobile = window.matchMedia('(max-width: 760px)').matches;
    const tablet = !mobile && window.matchMedia('(max-width: 1050px)').matches;

    if (mobile) {
      return {
        target: [.82, 0, .18],
        distance: 25.4,
        yaw: .755,
        pitch: .748,
        atelierDistance: 16.8,
        landmarkDistance: 13.8
      };
    }

    if (tablet) {
      return {
        target: [.42, 0, .58],
        distance: 31.8,
        yaw: .792,
        pitch: .792,
        atelierDistance: 15.9,
        landmarkDistance: 13.4
      };
    }

    return {
      target: [.18, 0, .82],
      distance: 34.2,
      yaw: .812,
      pitch: .802,
      atelierDistance: 15.35,
      landmarkDistance: 13.1
    };
  }

  function selectedPlace() {
    return typeof webglSelectedPlace === 'string' ? webglSelectedPlace : 'overview';
  }

  function syncPlaces() {
    const current = composition();
    if (places.overview) {
      places.overview.target = [...current.target];
      places.overview.distance = current.distance;
    }
    if (places.atelier) places.atelier.distance = current.atelierDistance;
    if (places.izc) places.izc.distance = current.landmarkDistance;
    if (places.stitch) places.stitch.distance = current.landmarkDistance;
    return current;
  }

  function applyOverview({ immediate = false } = {}) {
    const current = syncPlaces();
    if (selectedPlace() !== 'overview') return current;
    if (root.dataset.spatialOrbit === 'true' || root.dataset.cinematicCamera === 'true') return current;

    camera.desired = [...current.target];
    camera.desiredDistance = current.distance;
    if (immediate || reduced.matches) {
      camera.target = [...current.target];
      camera.distance = current.distance;
      camera.yaw = current.yaw;
      camera.pitch = current.pitch;
    }
    return current;
  }

  /* La apertura queda más cerca que P10.5 y con Atelier ligeramente por encima del eje visual. */
  const initial = applyOverview({ immediate: true });

  /* Perfil final de cámara: conserva los viajes P9.3, solo afina el encuadre terminal. */
  if (typeof p9CameraProfile === 'function') {
    const previousProfile = p9CameraProfile;
    p9CameraProfile = function u315CameraProfile(name, target) {
      const current = composition();
      if (name === 'overview') return { yaw: current.yaw, pitch: current.pitch };
      if (name === 'atelier') {
        const mobile = window.matchMedia('(max-width: 760px)').matches;
        return { yaw: mobile ? .70 : .652, pitch: mobile ? .735 : .655 };
      }
      if (name === 'izc') return { yaw: .865, pitch: .695 };
      if (name === 'stitch') return { yaw: .595, pitch: .70 };
      return previousProfile(name, target);
    };
  }

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      const current = syncPlaces();
      if (selectedPlace() === 'overview' && root.dataset.spatialOrbit !== 'true' && root.dataset.cinematicCamera !== 'true') {
        camera.desired = [...current.target];
        camera.desiredDistance = current.distance;
      }
    }, 140);
  }, { passive: true });

  root.dataset.finalArtDirection = 'u3.15';
  root.dataset.finalArtOverviewDistance = String(initial.distance);
  root.dataset.finalArtAtelierDistance = String(initial.atelierDistance);
  root.dataset.webglPhase = 'u3.15';

  window.AtelierVillageArtDirection = Object.freeze({
    composition: () => ({ ...composition(), target: [...composition().target] }),
    refresh: () => applyOverview({ immediate: false })
  });

  /* La interfaz pública deja de mostrar nombres de laboratorio/fase. */
  window.setTimeout(() => {
    const eyebrow = document.querySelector('.webgl-village-heading > span');
    const title = document.querySelector('.webgl-village-heading strong');
    const helper = document.querySelector('.webgl-village-heading small');
    if (eyebrow) eyebrow.textContent = 'Atelier Lumière · Pueblo de oficios';
    if (title) title.textContent = 'Creadores, talleres y piezas con historia';
    if (helper) helper.textContent = 'Recorre · descubre · entra';
    if (status && !root.dataset.webglError) status.textContent = 'Pueblo Atelier · experiencia preparada';
  }, 460);
})();

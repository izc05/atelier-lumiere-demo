/* Pueblo Atelier · P10.5 · composición de apertura y vista general */

(() => {
  if (typeof camera === 'undefined' || typeof places === 'undefined') return;

  function composition() {
    const mobile = window.matchMedia('(max-width: 760px)').matches;
    const tablet = !mobile && window.matchMedia('(max-width: 1050px)').matches;

    if (mobile) {
      return {
        target: [1.2, 0, -.25],
        distance: 26.5,
        yaw: .745,
        pitch: .765
      };
    }
    if (tablet) {
      return {
        target: [.85, 0, .15],
        distance: 34.0,
        yaw: .765,
        pitch: .815
      };
    }
    return {
      target: [.55, 0, .35],
      distance: 37.5,
      yaw: .785,
      pitch: .845
    };
  }

  function syncOverviewPlace() {
    const config = composition();
    places.overview.target = [...config.target];
    places.overview.distance = config.distance;
    return config;
  }

  /* Arranque editorial: más aéreo en PC y deliberadamente más cercano en móvil. */
  const initial = syncOverviewPlace();
  camera.target = [...initial.target];
  camera.desired = [...initial.target];
  camera.distance = initial.distance;
  camera.desiredDistance = initial.distance;
  camera.yaw = initial.yaw;
  camera.pitch = initial.pitch;

  /* La acción “vista general” recupera siempre la composición correcta para el dispositivo actual. */
  if (typeof p9CameraProfile === 'function') {
    const previousProfile = p9CameraProfile;
    p9CameraProfile = function p10OverviewCameraProfile(name, target) {
      if (name === 'overview') {
        const current = composition();
        return { yaw: current.yaw, pitch: current.pitch };
      }
      return previousProfile(name, target);
    };
  }

  /* Al cambiar orientación/tamaño solo se actualiza el destino de overview; no se secuestra la cámara del usuario. */
  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      syncOverviewPlace();
    }, 120);
  }, { passive: true });

  if (root) {
    root.dataset.overviewComposition = 'p10.5';
    root.dataset.webglPhase = 'p10.5';
  }

  window.setTimeout(() => {
    const label = document.querySelector('.webgl-village-heading > span');
    if (label) label.textContent = 'P10.5 · Pueblo Atelier · composición cinematográfica';
    if (status && !root?.dataset.webglError) {
      status.textContent = 'P10.5 · arrastra para recorrer el pueblo · selecciona un taller para acercarte';
    }
  }, 260);
})();

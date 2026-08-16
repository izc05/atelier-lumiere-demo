/* Atelier Lumière · U3.17N · navegación estable sobre viajes cinematográficos */
(() => {
  if (!root || !canvas || typeof webglFocusPlace !== 'function' || typeof webglFocusOverview !== 'function') return;

  const SETTLE_DESKTOP = 1480;
  const SETTLE_MOBILE = 1080;
  let lastFocusPlace = typeof webglSelectedPlace === 'string' ? webglSelectedPlace : 'overview';
  let focusSettled = true;
  let manualSinceFocus = false;
  let settleTimer = 0;
  let pointerProbe = null;

  function currentSelected() {
    return typeof webglSelectedPlace === 'string' ? webglSelectedPlace : 'overview';
  }

  function canonicalState(name) {
    const place = places?.[name];
    if (!place) return null;
    const target = Array.isArray(place.target) ? [...place.target] : [...camera.desired];
    const distance = Number(place.distance || camera.desiredDistance || camera.distance);
    const profile = typeof p9CameraProfile === 'function'
      ? p9CameraProfile(name, target)
      : { yaw: camera.yaw, pitch: camera.pitch };
    return {
      target,
      distance,
      yaw: Number.isFinite(profile?.yaw) ? profile.yaw : camera.yaw,
      pitch: Number.isFinite(profile?.pitch) ? profile.pitch : camera.pitch
    };
  }

  function normalizePendingDestination() {
    const selected = currentSelected();
    if (selected === 'overview' || focusSettled || manualSinceFocus) return false;
    const stable = canonicalState(selected);
    if (!stable) return false;

    /* El wrapper U3.3A capturará este estado semántico, no un frame intermedio del travelling. */
    camera.target = [...stable.target];
    camera.desired = [...stable.target];
    camera.distance = stable.distance;
    camera.desiredDistance = stable.distance;
    camera.yaw = stable.yaw;
    camera.pitch = stable.pitch;
    return true;
  }

  function beginSettling(placeName) {
    window.clearTimeout(settleTimer);
    lastFocusPlace = placeName || currentSelected();
    focusSettled = lastFocusPlace === 'overview';
    manualSinceFocus = false;
    if (focusSettled) return;
    const duration = window.innerWidth <= 760 ? SETTLE_MOBILE : SETTLE_DESKTOP;
    settleTimer = window.setTimeout(() => {
      if (currentSelected() === lastFocusPlace) focusSettled = true;
    }, duration);
  }

  root.addEventListener('atelier:village-focus', (event) => {
    beginSettling(event.detail?.place || currentSelected());
  });
  root.addEventListener('atelier:village-back', () => {
    window.clearTimeout(settleTimer);
    focusSettled = true;
    manualSinceFocus = false;
    lastFocusPlace = currentSelected();
  });

  /* Si el usuario ha tomado control manual, respetamos exactamente su encuadre al guardarlo. */
  canvas.addEventListener('pointerdown', (event) => {
    if (event.button === 2 || event.shiftKey) manualSinceFocus = true;
    if (event.button === 0 && !event.shiftKey) {
      pointerProbe = { id: event.pointerId, x: event.clientX, y: event.clientY };
    }
  }, { capture: true });
  canvas.addEventListener('pointermove', (event) => {
    if (!pointerProbe || pointerProbe.id !== event.pointerId) return;
    if (Math.hypot(event.clientX - pointerProbe.x, event.clientY - pointerProbe.y) > 8) manualSinceFocus = true;
  }, { capture: true });
  const clearProbe = (event) => {
    if (!pointerProbe || (event?.pointerId !== undefined && pointerProbe.id !== event.pointerId)) return;
    pointerProbe = null;
  };
  canvas.addEventListener('pointerup', clearProbe, { capture: true });
  canvas.addEventListener('pointercancel', clearProbe, { capture: true });
  canvas.addEventListener('wheel', () => { manualSinceFocus = true; }, { capture: true, passive: true });

  const controls = root.querySelector('.webgl-spatial-controls');
  if (controls) {
    controls.addEventListener('click', (event) => {
      const action = event.target.closest('button')?.dataset.spatialAction;
      if (action && !['back', 'overview'].includes(action)) manualSinceFocus = true;
    }, { capture: true });

    if (!controls.querySelector('[data-spatial-action="overview"]')) {
      const home = document.createElement('button');
      home.type = 'button';
      home.dataset.spatialAction = 'overview';
      home.textContent = '⌂';
      home.title = 'Volver a la vista general';
      home.setAttribute('aria-label', 'Volver a la vista general');
      home.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        webglFocusOverview();
      });
      controls.prepend(home);
    }
  }

  /* Menos falsos positivos al pulsar suelo mientras estamos dentro de un taller. */
  if (typeof webglNearestPlace === 'function') {
    const previousNearest = webglNearestPlace;
    webglNearestPlace = function webglNearestPlaceStable(clientX, clientY) {
      const hit = previousNearest(clientX, clientY);
      if (!hit || currentSelected() === 'overview') return hit;
      const screen = hit.screen || webglProjectPoint?.(hit.config?.point);
      if (!screen) return hit;
      const distance = Math.hypot(clientX - screen.x, clientY - screen.y);
      const threshold = window.innerWidth <= 760 ? 42 : window.innerWidth <= 1050 ? 48 : 54;
      return distance <= threshold ? hit : null;
    };
  }

  /* U3.3A sigue siendo dueño del historial; aquí garantizamos que lo que guarda sea estable. */
  const spatialFocus = webglFocusPlace;
  webglFocusPlace = function webglFocusPlaceStable(name) {
    const selected = currentSelected();
    if (name && name !== selected && selected !== 'overview') normalizePendingDestination();
    spatialFocus(name);
  };

  const spatialOverview = webglFocusOverview;
  webglFocusOverview = function webglFocusOverviewStable() {
    spatialOverview();
    window.clearTimeout(settleTimer);
    focusSettled = true;
    manualSinceFocus = false;
    lastFocusPlace = 'overview';
  };

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Home') return;
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
    event.preventDefault();
    webglFocusOverview();
  });

  root.dataset.navigationStability = 'u3.17n';
  root.dataset.navigationCheckpoint = 'u3.17n';
  window.AtelierVillageStableNavigation = Object.freeze({
    canonicalState,
    selected: currentSelected,
    isSettled: () => focusSettled,
    hasManualView: () => manualSinceFocus
  });
})();

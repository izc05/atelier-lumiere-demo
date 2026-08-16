/* Atelier Lumière · U3.17N.2 · navegación directa del mundo, autoridad única de clic izquierdo */
(() => {
  if (!root || !canvas || typeof camera === 'undefined') return;

  const DRAG_THRESHOLD = 5;
  let gesture = null;
  let suppressClickUntil = 0;
  let debugBadge = null;

  function isPlaque(target) {
    return target instanceof Element && Boolean(target.closest('.webgl-workshop-plaque'));
  }

  function plaquePlace(target) {
    return target instanceof Element ? target.closest('.webgl-workshop-plaque')?.dataset.plaquePlace || null : null;
  }

  function isExcludedUi(target) {
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest(
      '.webgl-spatial-controls, .webgl-enter-atelier, .webgl-village-legend, .webgl-provider-card, .webgl-village-heading, .webgl-village-caption, .webgl-village-fallback'
    ));
  }

  function selectedPlace() {
    return typeof webglSelectedPlace === 'string' ? webglSelectedPlace : 'overview';
  }

  function worldBounds() {
    const points = [];
    if (typeof houses !== 'undefined' && Array.isArray(houses)) houses.forEach((item) => points.push([item[0], item[1]]));
    if (typeof webglProviderSlots !== 'undefined' && Array.isArray(webglProviderSlots)) {
      webglProviderSlots.forEach((item) => points.push([item.x, item.z]));
    }
    if (!points.length) return { minX: -24, maxX: 24, minZ: -18, maxZ: 18 };
    return {
      minX: Math.min(...points.map((point) => point[0])) - 6,
      maxX: Math.max(...points.map((point) => point[0])) + 6,
      minZ: Math.min(...points.map((point) => point[1])) - 6,
      maxZ: Math.max(...points.map((point) => point[1])) + 6
    };
  }

  function clampPanTarget(target) {
    const bounds = worldBounds();
    target[0] = clamp(target[0], bounds.minX, bounds.maxX);
    target[2] = clamp(target[2], bounds.minZ, bounds.maxZ);
    return target;
  }

  function cancelCinema() {
    if (typeof p9CancelCameraJourney === 'function') p9CancelCameraJourney({ keepCurrent: true });
    if (typeof orientationRaf !== 'undefined' && orientationRaf) {
      cancelAnimationFrame(orientationRaf);
      orientationRaf = 0;
    }
  }

  function clearLegacyPointerState() {
    if (typeof dragging !== 'undefined') dragging = false;
    if (typeof webglPointerDown !== 'undefined') webglPointerDown = null;
    if (typeof groundGesture !== 'undefined') groundGesture = null;
    canvas.classList.remove('is-dragging');
  }

  function ensureDebugBadge() {
    if (!['127.0.0.1', 'localhost'].includes(window.location.hostname)) return null;
    if (debugBadge) return debugBadge;
    debugBadge = document.createElement('div');
    debugBadge.dataset.localNavigationDebug = 'true';
    debugBadge.style.cssText = [
      'position:absolute', 'z-index:80', 'left:14px', 'top:14px',
      'padding:7px 9px', 'border-radius:999px',
      'background:rgba(49,7,18,.82)', 'color:#f4dfad',
      'font:700 10px/1.2 ui-monospace,Consolas,monospace',
      'letter-spacing:.03em', 'pointer-events:none',
      'box-shadow:0 6px 18px rgba(0,0,0,.16)'
    ].join(';');
    root.append(debugBadge);
    return debugBadge;
  }

  function updateDebug(state = 'LISTO') {
    const badge = ensureDebugBadge();
    if (!badge) return;
    badge.textContent = `NAV U3.17N.2 · ${state} · X ${camera.target[0].toFixed(2)} · Z ${camera.target[2].toFixed(2)}`;
  }

  function applyDrag(dx, dy) {
    const distance = Math.max(10, Number(camera.distance || camera.desiredDistance || 24));
    const unit = distance * .00435;
    const c = Math.cos(camera.yaw);
    const s = Math.sin(camera.yaw);
    const next = [
      camera.target[0] + (-dx * c - dy * s) * unit,
      camera.target[1],
      camera.target[2] + (dx * s - dy * c) * unit
    ];
    clampPanTarget(next);

    /* Una única fuente de verdad: renderer y proyección HTML leen camera.target. */
    camera.target[0] = next[0];
    camera.target[1] = next[1];
    camera.target[2] = next[2];
    camera.desired[0] = next[0];
    camera.desired[1] = next[1];
    camera.desired[2] = next[2];
    camera.desiredDistance = camera.distance;
    updateDebug('DRAG');
  }

  function nearestPlaceAt(x, y) {
    if (typeof webglNearestPlace !== 'function') return null;
    return webglNearestPlace(x, y)?.name || null;
  }

  function begin(event) {
    if (event.pointerType === 'touch') return;
    if (event.button !== 0 || event.shiftKey) return;
    const onPlaque = isPlaque(event.target);
    if (isExcludedUi(event.target) && !onPlaque) return;

    /* El clic izquierdo no llega a los controladores históricos del canvas. */
    event.preventDefault();
    event.stopPropagation();
    clearLegacyPointerState();
    cancelCinema();

    const explicitPlace = plaquePlace(event.target);
    gesture = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      dragging: false,
      place: explicitPlace || nearestPlaceAt(event.clientX, event.clientY)
    };
    root.setPointerCapture?.(event.pointerId);
    updateDebug('PULSADO');
  }

  function move(event) {
    if (!gesture || gesture.id !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const total = Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY);
    if (!gesture.dragging && total < DRAG_THRESHOLD) return;

    if (!gesture.dragging) {
      gesture.dragging = true;
      clearLegacyPointerState();
      root.dataset.mapDragging = 'true';
      root.classList.add('is-map-dragging');
      document.documentElement.style.cursor = 'grabbing';
    }

    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    gesture.x = event.clientX;
    gesture.y = event.clientY;
    applyDrag(dx, dy);
  }

  function finish(event) {
    if (!gesture || gesture.id !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const ended = gesture;
    gesture = null;
    clearLegacyPointerState();
    root.releasePointerCapture?.(event.pointerId);
    delete root.dataset.mapDragging;
    root.classList.remove('is-map-dragging');
    document.documentElement.style.removeProperty('cursor');

    if (ended.dragging) {
      suppressClickUntil = performance.now() + 350;
      root.dispatchEvent(new CustomEvent('atelier:village-manual-camera', {
        detail: { type: 'pan', target: [...camera.target] }
      }));
      updateDebug('MOVIDO');
      return;
    }

    /* Clic corto: selección o vuelta por terreno, sin handlers duplicados. */
    const releasePlace = ended.place || nearestPlaceAt(event.clientX, event.clientY);
    if (releasePlace && typeof webglFocusPlace === 'function') {
      webglFocusPlace(releasePlace);
      updateDebug(`FOCO ${releasePlace}`);
      return;
    }
    if (selectedPlace() !== 'overview') {
      if (window.AtelierVillageNavigation?.back) window.AtelierVillageNavigation.back();
      else if (typeof webglFocusOverview === 'function') webglFocusOverview();
      updateDebug('VOLVER');
      return;
    }
    updateDebug('LISTO');
  }

  root.addEventListener('pointerdown', begin, { capture: true });
  root.addEventListener('pointermove', move, { capture: true, passive: false });
  root.addEventListener('pointerup', finish, { capture: true });
  root.addEventListener('pointercancel', finish, { capture: true });

  root.addEventListener('click', (event) => {
    if (performance.now() > suppressClickUntil) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, { capture: true });

  updateDebug('LISTO');
  root.dataset.mapDragNavigation = 'u3.17n.2';
  root.dataset.navigationCheckpoint = 'u3.17n.2';
  window.AtelierVillageMapDrag = Object.freeze({
    apply: applyDrag,
    isDragging: () => Boolean(gesture?.dragging),
    debug: updateDebug
  });
})();

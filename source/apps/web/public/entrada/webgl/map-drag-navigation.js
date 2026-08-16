/* Atelier Lumière · U3.17N.1 · arrastre directo del mundo */
(() => {
  if (!root || !canvas || !camera) return;

  const DRAG_THRESHOLD = 5;
  let gesture = null;
  let suppressClickUntil = 0;

  function isPlaque(target) {
    return target instanceof Element && Boolean(target.closest('.webgl-workshop-plaque'));
  }

  function isExcludedUi(target) {
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest(
      '.webgl-spatial-controls, .webgl-enter-atelier, .webgl-village-legend, .webgl-provider-card, .webgl-village-heading, .webgl-village-caption'
    ));
  }

  function worldBounds() {
    const points = [];
    if (Array.isArray(houses)) houses.forEach((item) => points.push([item[0], item[1]]));
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
  }

  function stopLegacyDrag() {
    if (typeof dragging !== 'undefined') dragging = false;
    canvas.classList.remove('is-dragging');
  }

  function applyDrag(dx, dy) {
    const distance = Math.max(10, Number(camera.distance || camera.desiredDistance || 24));
    const unit = distance * .00325;
    const c = Math.cos(camera.yaw);
    const s = Math.sin(camera.yaw);
    const rightX = c;
    const rightZ = -s;
    const forwardX = -s;
    const forwardZ = -c;

    const next = [
      camera.target[0] + (-dx * rightX + dy * forwardX) * unit,
      camera.target[1],
      camera.target[2] + (-dx * rightZ + dy * forwardZ) * unit
    ];
    clampPanTarget(next);

    /* Movimiento inmediato: mundo y placas comparten exactamente la misma cámara. */
    camera.target = [...next];
    camera.desired = [...next];
    camera.desiredDistance = camera.distance;
  }

  root.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'touch') return;
    if (event.button !== 0 || event.shiftKey) return;
    if (isExcludedUi(event.target) && !isPlaque(event.target)) return;

    gesture = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      dragging: false,
      startedOnPlaque: isPlaque(event.target)
    };

    /* scene.js recibe el mismo pointerdown después de esta fase de captura.
       Lo apagamos al terminar el evento para que U3.17N.1 sea la única autoridad de pan. */
    queueMicrotask(() => {
      if (gesture && gesture.id === event.pointerId && !gesture.dragging) stopLegacyDrag();
    });
  }, { capture: true });

  window.addEventListener('pointermove', (event) => {
    if (!gesture || gesture.id !== event.pointerId) return;
    const total = Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY);
    if (!gesture.dragging && total < DRAG_THRESHOLD) return;

    if (!gesture.dragging) {
      gesture.dragging = true;
      cancelCinema();
      stopLegacyDrag();
      root.dataset.mapDragging = 'true';
      root.classList.add('is-map-dragging');
      document.documentElement.style.cursor = 'grabbing';
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    gesture.x = event.clientX;
    gesture.y = event.clientY;
    applyDrag(dx, dy);
  }, { capture: true, passive: false });

  function finish(event) {
    if (!gesture || (event?.pointerId !== undefined && gesture.id !== event.pointerId)) return;
    if (gesture.dragging) {
      stopLegacyDrag();
      suppressClickUntil = performance.now() + 320;
      root.dispatchEvent(new CustomEvent('atelier:village-manual-camera', {
        detail: { type: 'pan', target: [...camera.target] }
      }));
    }
    gesture = null;
    delete root.dataset.mapDragging;
    root.classList.remove('is-map-dragging');
    document.documentElement.style.removeProperty('cursor');
  }

  window.addEventListener('pointerup', finish, { capture: true });
  window.addEventListener('pointercancel', finish, { capture: true });

  /* Tras un drag cancelamos cualquier click residual sobre placa o canvas. */
  root.addEventListener('click', (event) => {
    if (performance.now() > suppressClickUntil) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, { capture: true });

  root.dataset.mapDragNavigation = 'u3.17n.1';
  root.dataset.navigationCheckpoint = 'u3.17n.1';
  window.AtelierVillageMapDrag = Object.freeze({
    apply: applyDrag,
    isDragging: () => Boolean(gesture?.dragging)
  });
})();
/* Atelier Lumière · U3.3A · cámara multieje + historial espacial */
(() => {
  if (!root || !canvas || typeof webglFocusPlace !== 'function') return;

  const styleHref = '/entrada/webgl/spatial-navigation.css';
  if (!document.querySelector(`link[href="${styleHref}"]`)) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = styleHref;
    document.head.append(link);
  }

  const history = [];
  const HISTORY_LIMIT = 24;
  const PITCH_MIN = .38;
  const PITCH_MAX = 1.18;
  const DISTANCE_MIN = 8.5;
  const DISTANCE_MAX = 52;
  let restoring = false;
  let orbitGesture = null;
  let groundGesture = null;
  let orientationRaf = 0;

  function currentSelected() {
    return typeof webglSelectedPlace === 'string' ? webglSelectedPlace : 'overview';
  }

  function snapshot() {
    return {
      target: [...camera.target],
      desired: [...camera.desired],
      distance: camera.distance,
      desiredDistance: camera.desiredDistance,
      yaw: camera.yaw,
      pitch: camera.pitch,
      selectedPlace: currentSelected()
    };
  }

  function updateDepth() {
    root.dataset.spatialDepth = String(history.length);
  }

  function pushState(state = snapshot()) {
    const last = history.at(-1);
    const same = last
      && last.selectedPlace === state.selectedPlace
      && Math.hypot(last.target[0] - state.target[0], last.target[2] - state.target[2]) < .15
      && Math.abs(last.distance - state.distance) < .2;
    if (!same) history.push(state);
    if (history.length > HISTORY_LIMIT) history.splice(0, history.length - HISTORY_LIMIT);
    updateDepth();
  }

  function hideOrShowProvider(placeName) {
    if (placeName && placeName !== 'overview' && typeof webglShowProviderCard === 'function') {
      webglShowProviderCard(placeName);
    } else if (typeof webglProviderCard !== 'undefined' && webglProviderCard) {
      webglProviderCard.hidden = true;
    }
  }

  function syncSelection(placeName) {
    webglSelectedPlace = placeName || 'overview';
    webglHoverPlace = null;
    delete root.dataset.hoverPlace;
    if (typeof webglUpdateHighlights === 'function') webglUpdateHighlights();
    if (typeof webglHideTooltip === 'function') webglHideTooltip();
    if (typeof webglUpdateCaption === 'function') webglUpdateCaption(webglSelectedPlace);
    hideOrShowProvider(webglSelectedPlace);
    document.querySelectorAll('[data-camera-place]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.cameraPlace === webglSelectedPlace);
    });
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
  }

  function animateOrientation(toYaw, toPitch, duration = 520) {
    if (orientationRaf) cancelAnimationFrame(orientationRaf);
    if (reducedMotion.matches || duration <= 0) {
      camera.yaw = toYaw;
      camera.pitch = clamp(toPitch, PITCH_MIN, PITCH_MAX);
      return;
    }
    const fromYaw = camera.yaw;
    const fromPitch = camera.pitch;
    let deltaYaw = (toYaw - fromYaw) % (Math.PI * 2);
    if (deltaYaw > Math.PI) deltaYaw -= Math.PI * 2;
    if (deltaYaw < -Math.PI) deltaYaw += Math.PI * 2;
    const started = performance.now();
    const step = (now) => {
      const t = easeOutCubic((now - started) / duration);
      camera.yaw = fromYaw + deltaYaw * t;
      camera.pitch = clamp(fromPitch + (toPitch - fromPitch) * t, PITCH_MIN, PITCH_MAX);
      if (t < 1) orientationRaf = requestAnimationFrame(step);
      else orientationRaf = 0;
    };
    orientationRaf = requestAnimationFrame(step);
  }

  function applyState(state, reason = 'back') {
    if (!state) return false;
    restoring = true;
    if (typeof p9CancelCameraJourney === 'function') p9CancelCameraJourney({ keepCurrent: true });
    camera.desired = [...state.target];
    camera.desiredDistance = clamp(state.distance, DISTANCE_MIN, DISTANCE_MAX);
    animateOrientation(state.yaw, state.pitch, reducedMotion.matches ? 0 : 560);
    syncSelection(state.selectedPlace || 'overview');
    root.dataset.spatialRestoring = 'true';
    window.setTimeout(() => {
      delete root.dataset.spatialRestoring;
      restoring = false;
    }, reducedMotion.matches ? 20 : 620);
    if (status) status.textContent = state.selectedPlace === 'overview'
      ? 'Vista anterior · territorio recuperado'
      : `${webglInteractionPlaces[state.selectedPlace]?.title || webglProviderByPlace?.get?.(state.selectedPlace)?.displayName || 'Zona anterior'} · encuadre recuperado`;
    root.dispatchEvent(new CustomEvent('atelier:village-back', { detail: { reason, state } }));
    return true;
  }

  function goBack(reason = 'background') {
    const previous = history.pop();
    updateDepth();
    if (previous) return applyState(previous, reason);
    if (currentSelected() !== 'overview') {
      restoring = true;
      baseFocusOverview();
      restoring = false;
      syncSelection('overview');
      return true;
    }
    return false;
  }

  const baseFocusPlace = webglFocusPlace;
  webglFocusPlace = function webglFocusPlaceWithSpatialHistory(name) {
    if (!name || !places[name]) return;
    if (!restoring && currentSelected() === name && name !== 'overview') {
      goBack('same-place');
      return;
    }
    if (!restoring) pushState();
    baseFocusPlace(name);
    updateDepth();
    root.dispatchEvent(new CustomEvent('atelier:village-focus', { detail: { place: name, depth: history.length } }));
  };

  const baseFocusOverview = webglFocusOverview;
  webglFocusOverview = function webglFocusOverviewWithSpatialHistory() {
    if (!restoring) history.length = 0;
    baseFocusOverview();
    updateDepth();
  };

  function worldBounds() {
    const points = [];
    if (Array.isArray(houses)) houses.forEach((item) => points.push([item[0], item[1]]));
    if (typeof webglProviderSlots !== 'undefined' && Array.isArray(webglProviderSlots)) {
      webglProviderSlots.forEach((item) => points.push([item.x, item.z]));
    }
    if (!points.length) return { minX: -22, maxX: 22, minZ: -16, maxZ: 16 };
    return {
      minX: Math.min(...points.map((point) => point[0])) - 5,
      maxX: Math.max(...points.map((point) => point[0])) + 5,
      minZ: Math.min(...points.map((point) => point[1])) - 5,
      maxZ: Math.max(...points.map((point) => point[1])) + 5
    };
  }

  function clampTarget() {
    const bounds = worldBounds();
    camera.desired[0] = clamp(camera.desired[0], bounds.minX, bounds.maxX);
    camera.desired[2] = clamp(camera.desired[2], bounds.minZ, bounds.maxZ);
  }

  function cancelFilm() {
    if (typeof p9CancelCameraJourney === 'function') p9CancelCameraJourney({ keepCurrent: true });
  }

  function orbit(deltaYaw, deltaPitch = 0) {
    cancelFilm();
    camera.yaw += deltaYaw;
    camera.pitch = clamp(camera.pitch + deltaPitch, PITCH_MIN, PITCH_MAX);
    camera.desired = [...camera.target];
    camera.desiredDistance = camera.distance;
  }

  function zoom(factor) {
    cancelFilm();
    camera.desiredDistance = clamp(camera.desiredDistance * factor, DISTANCE_MIN, DISTANCE_MAX);
  }

  function pan(dx, dz) {
    cancelFilm();
    camera.desired[0] += dx;
    camera.desired[2] += dz;
    clampTarget();
  }

  function createControls() {
    const controls = document.createElement('nav');
    controls.className = 'webgl-spatial-controls';
    controls.setAttribute('aria-label', 'Controles de cámara del Pueblo Atelier');
    const actions = [
      ['back', '↶', 'Volver al encuadre anterior'],
      ['yaw-left', '↺', 'Girar a la izquierda'],
      ['yaw-right', '↻', 'Girar a la derecha'],
      ['pitch-up', '↑', 'Elevar la vista'],
      ['pitch-down', '↓', 'Bajar la vista'],
      ['zoom-in', '+', 'Acercar'],
      ['zoom-out', '−', 'Alejar']
    ];
    for (const [action, glyph, label] of actions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.spatialAction = action;
      button.textContent = glyph;
      button.title = label;
      button.setAttribute('aria-label', label);
      controls.append(button);
    }
    controls.addEventListener('click', (event) => {
      const action = event.target.closest('button')?.dataset.spatialAction;
      if (!action) return;
      if (action === 'back') goBack('control');
      if (action === 'yaw-left') orbit(-.16, 0);
      if (action === 'yaw-right') orbit(.16, 0);
      if (action === 'pitch-up') orbit(0, .09);
      if (action === 'pitch-down') orbit(0, -.09);
      if (action === 'zoom-in') zoom(.86);
      if (action === 'zoom-out') zoom(1.16);
    });
    root.append(controls);

    const help = document.createElement('p');
    help.className = 'webgl-spatial-help';
    help.textContent = 'Arrastra para mover · Shift o botón derecho para girar · rueda para zoom';
    root.append(help);

    const backHint = document.createElement('span');
    backHint.className = 'webgl-spatial-back-hint';
    backHint.textContent = 'Pulsa el terreno para volver';
    root.append(backHint);
  }

  function isOrbitStart(event) {
    return event.button === 2 || (event.button === 0 && event.shiftKey);
  }

  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  canvas.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'touch') return;
    if (!isOrbitStart(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    cancelFilm();
    orbitGesture = { id: event.pointerId, x: event.clientX, y: event.clientY };
    canvas.setPointerCapture?.(event.pointerId);
    root.dataset.spatialOrbit = 'true';
  }, { capture: true });

  canvas.addEventListener('pointermove', (event) => {
    if (!orbitGesture || orbitGesture.id !== event.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const dx = event.clientX - orbitGesture.x;
    const dy = event.clientY - orbitGesture.y;
    orbitGesture.x = event.clientX;
    orbitGesture.y = event.clientY;
    camera.yaw -= dx * .0062;
    camera.pitch = clamp(camera.pitch + dy * .0046, PITCH_MIN, PITCH_MAX);
    camera.desired = [...camera.target];
    camera.desiredDistance = camera.distance;
  }, { capture: true });

  const endOrbit = (event) => {
    if (!orbitGesture || orbitGesture.id !== event.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    canvas.releasePointerCapture?.(event.pointerId);
    orbitGesture = null;
    delete root.dataset.spatialOrbit;
  };
  canvas.addEventListener('pointerup', endOrbit, { capture: true });
  canvas.addEventListener('pointercancel', endOrbit, { capture: true });

  canvas.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'touch' || event.button !== 0 || event.shiftKey) return;
    const hit = webglNearestPlace(event.clientX, event.clientY);
    groundGesture = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      travel: 0,
      hit: hit?.name || null
    };
  }, { capture: true });

  canvas.addEventListener('pointermove', (event) => {
    if (!groundGesture || groundGesture.id !== event.pointerId) return;
    groundGesture.travel = Math.max(
      groundGesture.travel,
      Math.hypot(event.clientX - groundGesture.x, event.clientY - groundGesture.y)
    );
  }, { capture: true });

  canvas.addEventListener('pointerup', (event) => {
    if (!groundGesture || groundGesture.id !== event.pointerId) return;
    const gesture = groundGesture;
    groundGesture = null;
    if (gesture.travel > 7 || gesture.hit) return;
    const hit = webglNearestPlace(event.clientX, event.clientY);
    if (!hit && currentSelected() !== 'overview') goBack('background');
  }, { capture: true });

  canvas.addEventListener('pointercancel', () => { groundGesture = null; }, { capture: true });

  document.addEventListener('keydown', (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
    const key = event.key.toLowerCase();
    if (key === 'escape') { event.preventDefault(); goBack('keyboard'); return; }
    if (key === 'q') { event.preventDefault(); orbit(-.12, 0); return; }
    if (key === 'e') { event.preventDefault(); orbit(.12, 0); return; }
    if (key === 'r') { event.preventDefault(); orbit(0, .07); return; }
    if (key === 'f') { event.preventDefault(); orbit(0, -.07); return; }
    if (key === '+' || key === '=') { event.preventDefault(); zoom(.9); return; }
    if (key === '-' || key === '_') { event.preventDefault(); zoom(1.1); return; }
    const step = Math.max(.35, camera.desiredDistance * .018);
    if (key === 'a' || key === 'arrowleft') { event.preventDefault(); pan(-step, 0); }
    if (key === 'd' || key === 'arrowright') { event.preventDefault(); pan(step, 0); }
    if (key === 'w' || key === 'arrowup') { event.preventDefault(); pan(0, -step); }
    if (key === 's' || key === 'arrowdown') { event.preventDefault(); pan(0, step); }
  });

  createControls();
  updateDepth();
  root.dataset.spatialNavigation = 'true';
  root.dataset.webglPhase = 'u3.3a';

  window.AtelierVillageNavigation = Object.freeze({
    back: () => goBack('api'),
    focus: (name) => webglFocusPlace(name),
    overview: () => webglFocusOverview(),
    snapshot,
    getHistory: () => history.map((state) => ({ ...state, target: [...state.target], desired: [...state.desired] })),
    orbit,
    zoom,
    pan
  });
})();

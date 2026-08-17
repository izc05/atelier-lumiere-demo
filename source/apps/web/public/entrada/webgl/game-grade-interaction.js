/* Atelier Lumière · U3.36 · interacción game-grade sin romper navegación estable */
(() => {
  if (!root || !canvas || root.dataset.gameGradeInteraction === 'u3.36') return;
  if (typeof webglProjectPoint !== 'function' || typeof camera === 'undefined') return;

  const quality = typeof webglQualityMode === 'string' ? webglQualityMode : 'balanced';
  const reduced = reducedMotion?.matches === true;
  const inertiaEnabled = !reduced && quality !== 'lite';
  const pulseBudget = quality === 'high' ? 5 : quality === 'balanced' ? 3 : 1;
  const pulses = [];
  let inertiaRaf = 0;
  let feedbackRaf = 0;
  let gesture = null;
  let lastHover = null;

  if (!document.querySelector('link[data-u336-game-grade]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/entrada/webgl/game-grade-interaction.css';
    link.dataset.u336GameGrade = '';
    document.head.append(link);
  }

  const layer = document.createElement('div');
  layer.className = 'u336-feedback-layer';
  layer.setAttribute('aria-hidden', 'true');
  layer.innerHTML = '<i class="u336-world-reticle"><span></span></i>';
  root.append(layer);
  const reticle = layer.querySelector('.u336-world-reticle');

  function performanceProtected() {
    const mode = root.dataset.performanceMode || 'stable';
    return mode === 'protect' || mode === 'reduce';
  }

  function placePoint(name) {
    if (!name || name === 'overview') return null;
    return webglInteractionPlaces?.[name]?.point
      || webglDynamicProviderPlaces?.[name]?.point
      || null;
  }

  function cancelInertia() {
    if (inertiaRaf) cancelAnimationFrame(inertiaRaf);
    inertiaRaf = 0;
    delete root.dataset.gameInertia;
  }

  function startInertia(dx, dy) {
    cancelInertia();
    if (!inertiaEnabled || performanceProtected()) return;
    if (!window.AtelierVillageMapDrag?.apply) return;

    let vx = clamp(dx, -14, 14);
    let vy = clamp(dy, -14, 14);
    if (Math.hypot(vx, vy) < 2.2) return;
    let frames = 0;
    root.dataset.gameInertia = 'true';

    const coast = () => {
      frames += 1;
      vx *= .82;
      vy *= .82;
      if (frames > 14 || Math.hypot(vx, vy) < .30 || performanceProtected()) {
        cancelInertia();
        root.dispatchEvent(new CustomEvent('atelier:village-manual-camera', {
          detail: { type: 'inertia-end', target: [...camera.target] }
        }));
        return;
      }
      window.AtelierVillageMapDrag.apply(vx, vy);
      inertiaRaf = requestAnimationFrame(coast);
    };
    inertiaRaf = requestAnimationFrame(coast);
  }

  function beginGesture(event) {
    if (event.pointerType === 'touch' || event.button !== 0 || event.shiftKey) return;
    cancelInertia();
    gesture = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      lastDx: 0,
      lastDy: 0,
      lastAt: performance.now(),
      travel: 0
    };
    root.classList.add('u336-pointer-down');
  }

  function moveGesture(event) {
    if (!gesture || gesture.id !== event.pointerId) return;
    const now = performance.now();
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    gesture.travel = Math.max(gesture.travel, Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY));
    if (now - gesture.lastAt < 80) {
      gesture.lastDx = dx;
      gesture.lastDy = dy;
    }
    gesture.x = event.clientX;
    gesture.y = event.clientY;
    gesture.lastAt = now;
  }

  function endGesture(event) {
    if (!gesture || gesture.id !== event.pointerId) return;
    const ended = gesture;
    gesture = null;
    root.classList.remove('u336-pointer-down');
    if (ended.travel > 5) startInertia(ended.lastDx, ended.lastDy);
  }

  root.addEventListener('pointerdown', beginGesture, { capture: true });
  root.addEventListener('pointermove', moveGesture, { capture: true, passive: true });
  root.addEventListener('pointerup', endGesture, { capture: true });
  root.addEventListener('pointercancel', endGesture, { capture: true });
  canvas.addEventListener('wheel', cancelInertia, { capture: true, passive: true });

  function makePulse(place) {
    const point = placePoint(place);
    if (!Array.isArray(point) || pulses.length >= pulseBudget || reduced) return;
    const node = document.createElement('i');
    node.className = 'u336-focus-pulse';
    layer.append(node);
    pulses.push({ node, point: [...point], born: performance.now(), life: 760 });
  }

  root.addEventListener('atelier:village-focus', (event) => {
    cancelInertia();
    const place = event.detail?.place;
    if (place && place !== 'overview') makePulse(place);
    root.dataset.gameFocus = place || 'overview';
  });
  root.addEventListener('atelier:village-back', () => {
    cancelInertia();
    delete root.dataset.gameFocus;
  });
  root.addEventListener('atelier:village-manual-camera', () => cancelInertia());

  function syncReticle() {
    const hover = typeof webglHoverPlace === 'string' ? webglHoverPlace : null;
    const selected = typeof webglSelectedPlace === 'string' ? webglSelectedPlace : 'overview';
    const name = hover || (selected !== 'overview' ? selected : null);
    const point = placePoint(name);
    const screen = point ? webglProjectPoint(point) : null;

    if (!name || !screen?.visible || root.dataset.mapDragging === 'true' || root.dataset.spatialOrbit === 'true') {
      reticle.classList.remove('is-visible', 'is-hover', 'is-selected');
      root.classList.remove('u336-has-hover');
      lastHover = null;
      return;
    }

    const rect = root.getBoundingClientRect();
    reticle.style.setProperty('--u336-x', `${(screen.x - rect.left).toFixed(1)}px`);
    reticle.style.setProperty('--u336-y', `${(screen.y - rect.top).toFixed(1)}px`);
    reticle.classList.add('is-visible');
    reticle.classList.toggle('is-hover', Boolean(hover));
    reticle.classList.toggle('is-selected', !hover && selected !== 'overview');
    root.classList.toggle('u336-has-hover', Boolean(hover));

    if (hover !== lastHover) {
      reticle.classList.remove('is-arriving');
      void reticle.offsetWidth;
      if (hover) reticle.classList.add('is-arriving');
      lastHover = hover;
    }
  }

  function syncHighlightBreathing(now) {
    if (typeof webglHighlightObjects?.entries !== 'function') return;
    const protectedMode = performanceProtected();
    const selected = typeof webglSelectedPlace === 'string' ? webglSelectedPlace : 'overview';
    const hover = typeof webglHoverPlace === 'string' ? webglHoverPlace : null;
    const phase = Math.sin(now * .0042) * .5 + .5;

    for (const [name, object] of webglHighlightObjects.entries()) {
      if (!object?.color) continue;
      if (hover === name) object.color[3] = protectedMode || reduced ? .18 : .185 + phase * .045;
      else if (selected === name) object.color[3] = protectedMode || reduced ? .085 : .072 + phase * .032;
      else object.color[3] = 0;
    }
  }

  function syncPulses(now) {
    const rect = root.getBoundingClientRect();
    for (let index = pulses.length - 1; index >= 0; index -= 1) {
      const pulse = pulses[index];
      const age = now - pulse.born;
      const screen = webglProjectPoint(pulse.point);
      if (age >= pulse.life || !screen?.visible) {
        pulse.node.remove();
        pulses.splice(index, 1);
        continue;
      }
      pulse.node.style.setProperty('--u336-x', `${(screen.x - rect.left).toFixed(1)}px`);
      pulse.node.style.setProperty('--u336-y', `${(screen.y - rect.top).toFixed(1)}px`);
      pulse.node.style.setProperty('--u336-life', String(clamp(age / pulse.life, 0, 1)));
    }
  }

  function feedbackFrame(now) {
    syncReticle();
    syncHighlightBreathing(now);
    syncPulses(now);
    feedbackRaf = requestAnimationFrame(feedbackFrame);
  }
  feedbackRaf = requestAnimationFrame(feedbackFrame);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelInertia();
      if (feedbackRaf) cancelAnimationFrame(feedbackRaf);
      feedbackRaf = 0;
    } else if (!feedbackRaf) {
      feedbackRaf = requestAnimationFrame(feedbackFrame);
    }
  });

  root.dataset.gameGradeInteraction = 'u3.36';
  root.dataset.gameGradeInteractionQuality = quality;
  root.dataset.gameGradeInertia = inertiaEnabled ? 'enabled' : 'disabled';
  root.dataset.gameGradePulseBudget = String(pulseBudget);
  root.dataset.webglPhase = 'u3.36';

  window.AtelierVillageGameGradeInteraction = Object.freeze({
    quality,
    inertiaEnabled,
    pulseBudget,
    cancelInertia,
    pulse: makePulse
  });

  if (status && !root.dataset.webglError) {
    status.textContent = `U3.36 · interacción premium · inercia ${inertiaEnabled ? 'activa' : 'reducida'} · ${quality}`;
  }
})();

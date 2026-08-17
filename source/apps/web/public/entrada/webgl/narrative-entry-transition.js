/* Atelier Lumière · U3.26 · narrativa placa → fachada → entrada */
(() => {
  if (!root || root.dataset.narrativeEntry === 'u3.26') return;
  if (!canvas || typeof webglProjectPoint !== 'function') return;

  const styleHref = '/entrada/webgl/narrative-entry-transition.css';
  if (!document.querySelector(`link[href="${styleHref}"]`)) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = styleHref;
    link.dataset.u326NarrativeEntry = '';
    document.head.append(link);
  }

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const quality = typeof webglQualityMode === 'string' ? webglQualityMode : 'balanced';
  const layer = document.createElement('div');
  layer.className = 'u326-narrative-entry';
  layer.setAttribute('aria-hidden', 'true');
  layer.innerHTML = '<span class="u326-narrative-aperture"></span>';
  (canvas.parentElement || root).append(layer);

  let currentPlace = 'overview';
  let currentStage = 'idle';
  let sequence = 0;
  let timers = [];
  let raf = 0;
  let projectionFrame = 0;

  function clearTimers() {
    timers.forEach((timer) => window.clearTimeout(timer));
    timers = [];
  }

  function schedule(delay, callback, token = sequence) {
    const timer = window.setTimeout(() => {
      if (token === sequence) callback();
    }, delay);
    timers.push(timer);
    return timer;
  }

  function providerFor(name) {
    return typeof webglProviderByPlace !== 'undefined' ? webglProviderByPlace?.get?.(name) || null : null;
  }

  function kindFor(name) {
    if (name === 'atelier') return 'atelier';
    if (providerFor(name)) return 'provider';
    return 'reserved';
  }

  function titleFor(name) {
    if (name === 'atelier') return 'Atelier Lumière';
    const provider = providerFor(name);
    if (provider?.displayName) return provider.displayName;
    const dynamic = typeof webglDynamicProviderPlaces !== 'undefined' ? webglDynamicProviderPlaces?.[name] : null;
    const base = typeof webglInteractionPlaces !== 'undefined' ? webglInteractionPlaces?.[name] : null;
    return dynamic?.title || base?.title || 'Taller';
  }

  function pointFor(name) {
    if (!name || name === 'overview') return null;
    const base = typeof webglInteractionPlaces !== 'undefined' ? webglInteractionPlaces?.[name] : null;
    if (Array.isArray(base?.point)) return base.point;
    const dynamic = typeof webglDynamicProviderPlaces !== 'undefined' ? webglDynamicProviderPlaces?.[name] : null;
    if (Array.isArray(dynamic?.point)) return dynamic.point;
    const hero = window.AtelierVillageCinematicDepth?.state?.(name);
    return hero?.target ? [hero.target[0], (hero.target[1] || 0) + .55, hero.target[2]] : null;
  }

  function dispatchStage(reason = '') {
    root.dispatchEvent(new CustomEvent('atelier:narrative-entry-stage', {
      detail: { place: currentPlace, stage: currentStage, reason }
    }));
  }

  function setStage(stage, reason = '') {
    currentStage = stage;
    root.dataset.narrativeStage = stage;
    root.dataset.narrativePlace = currentPlace;
    root.dataset.narrativeKind = kindFor(currentPlace);
    root.dataset.narrativeReason = reason || stage;
    dispatchStage(reason);
  }

  function setEntryInteractive(enabled) {
    const card = root.querySelector('.webgl-provider-card');
    if (card) card.setAttribute('aria-live', enabled ? 'polite' : 'off');

    root.querySelectorAll('.webgl-provider-enter, .webgl-place-enter').forEach((anchor) => {
      if (!enabled) {
        if (!anchor.dataset.u326Tabindex) anchor.dataset.u326Tabindex = anchor.getAttribute('tabindex') ?? '';
        anchor.setAttribute('tabindex', '-1');
        anchor.setAttribute('aria-disabled', 'true');
      } else {
        const previous = anchor.dataset.u326Tabindex;
        if (previous === undefined || previous === '') anchor.removeAttribute('tabindex');
        else anchor.setAttribute('tabindex', previous);
        delete anchor.dataset.u326Tabindex;
        anchor.removeAttribute('aria-disabled');
      }
    });
  }

  function stopProjection() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  function syncProjection() {
    raf = 0;
    if (document.hidden || currentPlace === 'overview' || ['idle', 'manual', 'exit'].includes(currentStage)) return;
    projectionFrame += 1;
    const shouldProject = quality === 'high' || projectionFrame % 2 === 0;
    if (shouldProject) {
      const point = pointFor(currentPlace);
      const projected = point ? webglProjectPoint(point) : null;
      if (projected?.visible) {
        const rect = root.getBoundingClientRect();
        const x = Math.max(0, Math.min(rect.width, projected.x - rect.left));
        const y = Math.max(0, Math.min(rect.height, projected.y - rect.top));
        layer.style.setProperty('--u326-x', `${x.toFixed(1)}px`);
        layer.style.setProperty('--u326-y', `${y.toFixed(1)}px`);
        layer.dataset.visible = 'true';
      } else {
        delete layer.dataset.visible;
      }
    }
    if (currentStage === 'travel' || currentStage === 'approach') raf = requestAnimationFrame(syncProjection);
  }

  function startProjection() {
    stopProjection();
    projectionFrame = 0;
    if (quality === 'lite') return;
    raf = requestAnimationFrame(syncProjection);
  }

  function ready(reason = 'camera-settled') {
    if (currentPlace === 'overview' || !['travel', 'approach'].includes(currentStage)) return;
    clearTimers();
    setStage('ready', reason);
    setEntryInteractive(true);
    stopProjection();
    if (quality !== 'lite') {
      syncProjection();
      schedule(560, () => delete layer.dataset.visible);
    }
    if (status && !root.dataset.webglError) status.textContent = `${titleFor(currentPlace)} · listo para entrar`;
  }

  function begin(place) {
    if (!place || place === 'overview') {
      reset('overview');
      return;
    }

    sequence += 1;
    clearTimers();
    stopProjection();
    currentPlace = place;
    setStage('travel', 'focus');
    setEntryInteractive(false);
    startProjection();

    const mobile = window.innerWidth <= 760;
    const approachAt = mobile ? 180 : 250;
    schedule(approachAt, () => {
      if (currentStage === 'travel') setStage('approach', 'facade');
    });

    if (reduced.matches) {
      schedule(0, () => ready('reduced-motion'));
      return;
    }

    /* P9.3 es la fuente de verdad. Este timeout es solo una red de seguridad. */
    if (root.dataset.cinematicCamera !== 'true') {
      schedule(80, () => ready('no-camera-journey'));
    } else {
      schedule(mobile ? 1260 : 1720, () => ready('settle-fallback'));
    }
  }

  function setManual(reason = 'manual-control') {
    if (currentPlace === 'overview') return;
    if (currentStage === 'travel' || currentStage === 'approach') {
      ready(reason);
      return;
    }
    if (currentStage === 'ready') {
      clearTimers();
      stopProjection();
      delete layer.dataset.visible;
      setStage('manual', reason);
      setEntryInteractive(true);
    }
  }

  function reset(reason = 'back') {
    sequence += 1;
    clearTimers();
    stopProjection();
    delete layer.dataset.visible;
    currentPlace = 'overview';
    currentStage = 'idle';
    root.dataset.narrativeStage = 'idle';
    root.dataset.narrativePlace = 'overview';
    root.dataset.narrativeKind = 'overview';
    root.dataset.narrativeReason = reason;
    setEntryInteractive(true);
    dispatchStage(reason);
  }

  const cameraObserver = new MutationObserver((records) => {
    if (!records.some((record) => record.attributeName === 'data-cinematic-camera')) return;
    if (root.dataset.cinematicCamera === 'true') return;
    if (currentStage === 'travel' || currentStage === 'approach') schedule(45, () => ready('camera-settled'));
  });
  cameraObserver.observe(root, { attributes: true, attributeFilter: ['data-cinematic-camera'] });

  root.addEventListener('atelier:village-focus', (event) => begin(event.detail?.place));
  root.addEventListener('atelier:village-back', () => reset('back'));

  canvas.addEventListener('pointerdown', () => setManual('pointer'), { capture: true });
  canvas.addEventListener('wheel', () => setManual('wheel'), { capture: true, passive: true });

  root.querySelector('.webgl-spatial-controls')?.addEventListener('click', (event) => {
    const action = event.target.closest('button')?.dataset.spatialAction;
    if (action && !['back', 'overview'].includes(action)) setManual(`control-${action}`);
  }, { capture: true });

  root.addEventListener('click', (event) => {
    const anchor = event.target.closest('a.webgl-provider-enter, a[data-atelier-enter]');
    if (!anchor || event.defaultPrevented) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    clearTimers();
    stopProjection();
    delete layer.dataset.visible;
    setStage('exit', 'enter');
    setEntryInteractive(false);
  }, { capture: true });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopProjection();
      return;
    }
    if (currentStage === 'travel' || currentStage === 'approach') startProjection();
  });

  /* Cualquier vuelta explícita a la vista general limpia también el estado narrativo. */
  if (typeof webglFocusOverview === 'function') {
    const narrativeBaseOverview = webglFocusOverview;
    webglFocusOverview = function u326FocusOverview() {
      narrativeBaseOverview();
      reset('overview-focus');
    };
  }

  root.dataset.narrativeEntry = 'u3.26';
  root.dataset.narrativeQuality = quality;
  root.dataset.narrativeStage = 'idle';
  root.dataset.narrativePlace = 'overview';
  root.dataset.narrativeKind = 'overview';
  root.dataset.webglPhase = 'u3.26';

  window.AtelierVillageNarrativeEntry = Object.freeze({
    stage: () => currentStage,
    place: () => currentPlace,
    ready: () => ready('api'),
    reset: () => reset('api'),
    quality
  });
})();
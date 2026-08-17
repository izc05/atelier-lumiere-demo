/* Atelier Lumière · U3.6 · profundidad y foco cinematográfico */
(() => {
  if (!root || typeof webglProjectPoint !== 'function') return;

  const href = '/entrada/webgl/focus-atmosphere.css';
  if (!document.querySelector(`link[href="${href}"]`)) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.append(link);
  }

  const layer = document.createElement('div');
  layer.className = 'u36-focus-atmosphere';
  layer.setAttribute('aria-hidden', 'true');
  const glow = document.createElement('i');
  glow.className = 'u36-focus-glow';
  layer.append(glow);
  (canvas?.parentElement || root).append(layer);

  function placePoint(name) {
    if (!name || name === 'overview') return null;
    const base = webglInteractionPlaces?.[name];
    if (Array.isArray(base?.point)) return base.point;
    const dynamic = webglDynamicProviderPlaces?.[name];
    if (Array.isArray(dynamic?.point)) return dynamic.point;
    const target = places?.[name]?.target;
    if (Array.isArray(target)) return [target[0], (target[1] || 0) + 1.1, target[2]];
    return null;
  }

  let frame = 0;
  let raf = 0;
  let active = !document.hidden;

  function sync() {
    raf = 0;
    if (!active) return;
    frame += 1;

    const quality = typeof webglQualityMode === 'string' ? webglQualityMode : 'balanced';
    if (quality !== 'high' && frame % 2 === 1) {
      raf = requestAnimationFrame(sync);
      return;
    }

    const selected = typeof webglSelectedPlace === 'string' ? webglSelectedPlace : 'overview';
    const hovered = typeof webglHoverPlace === 'string' ? webglHoverPlace : null;
    const candidate = selected !== 'overview' ? selected : hovered;
    const point = placePoint(candidate);
    const screen = point ? webglProjectPoint(point) : null;
    const rect = root.getBoundingClientRect();

    if (screen?.visible) {
      const x = Math.max(0, Math.min(rect.width, screen.x - rect.left));
      const y = Math.max(0, Math.min(rect.height, screen.y - rect.top));
      layer.style.setProperty('--u36-x', `${x.toFixed(1)}px`);
      layer.style.setProperty('--u36-y', `${y.toFixed(1)}px`);
    }

    layer.classList.toggle('is-focused', selected !== 'overview' && Boolean(screen?.visible));
    layer.classList.toggle('is-hovering', selected === 'overview' && Boolean(hovered && screen?.visible));
    root.dataset.atmosphericFocus = selected !== 'overview' ? selected : 'overview';

    raf = requestAnimationFrame(sync);
  }

  document.addEventListener('visibilitychange', () => {
    active = !document.hidden;
    if (!active && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    } else if (active && !raf) {
      raf = requestAnimationFrame(sync);
    }
  });

  raf = requestAnimationFrame(sync);
  root.dataset.depthGrading = 'u3.6';
  root.dataset.webglPhase = 'u3.6';
  if (status && !root.dataset.webglError) status.textContent = 'U3.6 · profundidad y foco cinematográfico';
})();

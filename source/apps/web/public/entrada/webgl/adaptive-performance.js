/* Atelier Lumière · U3.14 · gobernador dinámico de detalle */
(() => {
  if (!root) return;

  const quality = typeof webglQualityMode === 'string' ? webglQualityMode : 'balanced';
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const saveData = Boolean(connection?.saveData);
  const bounds = quality === 'high'
    ? { min: .76, max: 1.15, start: 1.03 }
    : quality === 'lite'
      ? { min: .62, max: .86, start: .78 }
      : { min: .70, max: 1.06, start: .96 };

  let scale = saveData ? Math.min(bounds.start, .76) : bounds.start;
  let ema = 16.7;
  let last = 0;
  let frames = 0;
  let lastAdjust = 0;
  let raf = 0;

  function clampScale(value) {
    return Math.max(bounds.min, Math.min(bounds.max, value));
  }

  function publish(mode='stable') {
    window.AtelierVillageDynamicDetailScale = scale;
    root.dataset.dynamicDetailScale = scale.toFixed(2);
    root.dataset.performanceFrameMs = ema.toFixed(1);
    root.dataset.performanceGovernor = 'u3.14';
    root.dataset.performanceMode = mode;
  }

  function adapt(now) {
    if (frames < 42 || now - lastAdjust < 1500) return;
    let next = scale;
    let mode = 'stable';

    if (ema > 30) {
      next -= .10;
      mode = 'protect';
    } else if (ema > 25) {
      next -= .06;
      mode = 'reduce';
    } else if (ema > 21.5) {
      next -= .025;
      mode = 'trim';
    } else if (ema < 17.2 && !saveData) {
      next += quality === 'high' ? .035 : .022;
      mode = 'enhance';
    }

    next = clampScale(next);
    if (Math.abs(next - scale) >= .009) scale = next;
    lastAdjust = now;
    frames = 0;
    publish(mode);
  }

  function tick(now) {
    raf = 0;
    if (document.hidden) return;
    if (last > 0) {
      const delta = Math.min(80, Math.max(6, now - last));
      ema += (delta - ema) * .065;
      frames += 1;
      adapt(now);
    }
    last = now;
    raf = requestAnimationFrame(tick);
  }

  function resume() {
    if (raf || document.hidden) return;
    last = 0;
    raf = requestAnimationFrame(tick);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      last = 0;
    } else {
      resume();
    }
  });

  publish(saveData ? 'save-data' : 'initial');
  resume();
  root.dataset.webglPhase = 'u3.14';
})();

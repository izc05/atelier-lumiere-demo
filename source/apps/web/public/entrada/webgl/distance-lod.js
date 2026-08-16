/* Atelier Lumière · U3.12 · LOD dinámico por distancia y foco */
(() => {
  if (!root || typeof drawObject !== 'function') return;

  const quality = typeof webglQualityMode === 'string' ? webglQualityMode : 'balanced';
  const previousDraw = drawObject;
  const thresholds = quality === 'high'
    ? { micro: 18.5, small: 29.0, medium: 45.0 }
    : quality === 'balanced'
      ? { micro: 13.5, small: 23.0, medium: 38.0 }
      : { micro: 8.5, small: 15.5, medium: 29.0 };

  let frameDrawn = 0;
  let frameSkipped = 0;
  let lastReport = 0;

  function distance3(a, b) {
    return Math.hypot(
      (a?.[0] || 0) - (b?.[0] || 0),
      (a?.[1] || 0) - (b?.[1] || 0),
      (a?.[2] || 0) - (b?.[2] || 0)
    );
  }

  function objectSize(object) {
    const scale = object?.scale || [1, 1, 1];
    return {
      max: Math.max(Math.abs(scale[0] || 0), Math.abs(scale[1] || 0), Math.abs(scale[2] || 0)),
      min: Math.min(Math.abs(scale[0] || 0), Math.abs(scale[1] || 0), Math.abs(scale[2] || 0))
    };
  }

  function focusPoint() {
    const selected = typeof webglSelectedPlace === 'string' ? webglSelectedPlace : 'overview';
    if (!selected || selected === 'overview') return null;
    const config = webglInteractionPlaces?.[selected] || webglDynamicProviderPlaces?.[selected];
    if (!config) return null;
    if (Array.isArray(config.point)) return config.point;
    if (Array.isArray(config.point3d)) return config.point3d;
    if (Number.isFinite(config.x) && Number.isFinite(config.z)) return [config.x, 0, config.z];
    return null;
  }

  function isProtected(object, size) {
    if (object?.lodAlways === true || object?.existingPlace) return true;
    /* Terreno, caminos, edificios, cubiertas y piezas de gran silueta nunca se podan. */
    if (size.max >= .72) return true;
    if (size.max >= .42 && size.min >= .08) return true;
    return false;
  }

  function tier(size) {
    if (size.max <= .17 || (size.max <= .27 && size.min <= .035)) return 'micro';
    if (size.max <= .38 || (size.max <= .52 && size.min <= .055)) return 'small';
    return 'medium';
  }

  function allowedDistance(object, size) {
    const base = thresholds[tier(size)];
    const focus = focusPoint();
    if (!focus) return base;
    const objectToFocus = distance3(object?.position, focus);
    /* El taller enfocado recibe un círculo de detalle más generoso sin inflar todo el pueblo. */
    if (objectToFocus <= 4.6) return base * 1.48;
    if (objectToFocus <= 8.0) return base * 1.18;
    return base * .92;
  }

  function shouldDraw(object, cameraPositionValue) {
    const size = objectSize(object);
    if (isProtected(object, size)) return true;
    const distance = distance3(object?.position, cameraPositionValue);
    return distance <= allowedDistance(object, size);
  }

  function report(now) {
    if (now - lastReport < 700) return;
    root.dataset.lodDrawn = String(frameDrawn);
    root.dataset.lodSkipped = String(frameSkipped);
    root.dataset.lodQuality = quality;
    frameDrawn = 0;
    frameSkipped = 0;
    lastReport = now;
  }

  drawObject = function u312DistanceLodDraw(object, vp, cameraPositionValue) {
    if (!shouldDraw(object, cameraPositionValue)) {
      frameSkipped += 1;
      report(performance.now());
      return;
    }
    frameDrawn += 1;
    previousDraw(object, vp, cameraPositionValue);
    report(performance.now());
  };

  root.dataset.distanceLod = 'u3.12';
  root.dataset.distanceLodMicro = String(thresholds.micro);
  root.dataset.distanceLodSmall = String(thresholds.small);
  root.dataset.distanceLodMedium = String(thresholds.medium);
  root.dataset.webglPhase = 'u3.12';
  if (status && !root.dataset.webglError) status.textContent = `U3.12 · detalle adaptativo por distancia · ${quality}`;
})();

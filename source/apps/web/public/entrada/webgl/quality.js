/* Pueblo Atelier · P8.2E/U3.3A · calidad adaptativa + gestos táctiles multieje */

const webglConnection = navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;
const webglMemory = Number(navigator.deviceMemory);
const webglCores = Number(navigator.hardwareConcurrency);
const webglTouchPointers = new Map();
let webglTouchGesture = null;

function webglDetectQuality() {
  const saveData = Boolean(webglConnection?.saveData);
  const lowMemory = Number.isFinite(webglMemory) && webglMemory > 0 && webglMemory <= 2;
  const lowCpu = Number.isFinite(webglCores) && webglCores > 0 && webglCores <= 2;
  const mediumMemory = Number.isFinite(webglMemory) && webglMemory > 0 && webglMemory <= 4;
  const narrow = window.matchMedia('(max-width: 980px)').matches;

  if (saveData || lowMemory || lowCpu) return 'lite';
  if (narrow || mediumMemory) return 'balanced';
  return 'high';
}

let webglQualityMode = webglDetectQuality();
const webglDprCaps = { high: 1.65, balanced: 1.3, lite: 1 };

function webglApplyQuality() {
  webglQualityMode = webglDetectQuality();
  if (root) root.dataset.webglQuality = webglQualityMode;

  if (webglQualityMode === 'lite') {
    let coneIndex = 0;
    let roofIndex = 0;
    for (const object of objects) {
      if (object.mesh === meshes.cone) {
        coneIndex += 1;
        if (coneIndex % 2 === 0) object.edges = false;
      }
      if (object.mesh === meshes.roof) {
        roofIndex += 1;
        if (roofIndex % 3 !== 1) object.edges = false;
      }
    }
  }

  let badge = root?.querySelector('.webgl-quality-badge');
  if (!badge && root) {
    badge = document.createElement('span');
    badge.className = 'webgl-quality-badge';
    badge.setAttribute('aria-hidden', 'true');
    root.append(badge);
  }
  if (badge) {
    badge.textContent = webglQualityMode === 'high'
      ? '3D · calidad alta'
      : webglQualityMode === 'balanced'
        ? '3D · calidad equilibrada'
        : '3D · modo ligero';
  }
}

/* Sustituye únicamente el cálculo de resolución; el render P8.1 permanece intacto. */
resize = function webglAdaptiveResize() {
  const cap = webglDprCaps[webglQualityMode] || 1.3;
  const dpr = Math.min(window.devicePixelRatio || 1, cap);
  const width = Math.max(1, Math.round(canvas.clientWidth * dpr));
  const height = Math.max(1, Math.round(canvas.clientHeight * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  gl.viewport(0, 0, width, height);
};

function webglTouchDistance(points) {
  if (points.length < 2) return 0;
  return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
}

function webglTouchAngle(points) {
  if (points.length < 2) return 0;
  return Math.atan2(points[1].y - points[0].y, points[1].x - points[0].x);
}

function webglTouchAngleDelta(from, to) {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

function webglTouchCenter(points) {
  if (points.length === 0) return { x: 0, y: 0 };
  const total = points.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), { x: 0, y: 0 });
  return { x: total.x / points.length, y: total.y / points.length };
}

function webglPanFromTouch(dx, dy) {
  const unit = camera.desiredDistance * .0022;
  const right = [Math.cos(camera.yaw), 0, -Math.sin(camera.yaw)];
  const forward = [-Math.sin(camera.yaw), 0, -Math.cos(camera.yaw)];
  camera.desired[0] += (-dx * right[0] + dy * forward[0]) * unit;
  camera.desired[2] += (-dx * right[2] + dy * forward[2]) * unit;
}

function webglOnTouchDown(event) {
  if (event.pointerType !== 'touch') return;
  event.preventDefault();
  event.stopImmediatePropagation();
  canvas.setPointerCapture?.(event.pointerId);
  webglTouchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

  const points = [...webglTouchPointers.values()];
  if (points.length === 1) {
    webglTouchGesture = {
      mode: 'single',
      x: event.clientX,
      y: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      travel: 0,
      place: webglNearestPlace(event.clientX, event.clientY)?.name || null
    };
  } else if (points.length >= 2) {
    const pair = points.slice(0, 2);
    const center = webglTouchCenter(pair);
    webglTouchGesture = {
      mode: 'pinch',
      distance: webglTouchDistance(pair),
      angle: webglTouchAngle(pair),
      centerX: center.x,
      centerY: center.y
    };
  }
  canvas.classList.add('is-dragging');
}

function webglOnTouchMove(event) {
  if (event.pointerType !== 'touch' || !webglTouchPointers.has(event.pointerId)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  webglTouchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  const points = [...webglTouchPointers.values()];

  if (points.length >= 2) {
    const pair = points.slice(0, 2);
    const distance = Math.max(1, webglTouchDistance(pair));
    const angle = webglTouchAngle(pair);
    const center = webglTouchCenter(pair);
    if (webglTouchGesture?.mode === 'pinch') {
      const factor = webglTouchGesture.distance / distance;
      camera.desiredDistance = clamp(camera.desiredDistance * factor, 8.5, 52);
      webglPanFromTouch(center.x - webglTouchGesture.centerX, center.y - webglTouchGesture.centerY);
      const rotation = webglTouchAngleDelta(webglTouchGesture.angle, angle);
      camera.yaw -= rotation * .88;
    }
    webglTouchGesture = { mode: 'pinch', distance, angle, centerX: center.x, centerY: center.y };
    webglSetHover(null, 0, 0);
    return;
  }

  if (points.length === 1 && webglTouchGesture?.mode === 'single') {
    const point = points[0];
    const dx = point.x - webglTouchGesture.lastX;
    const dy = point.y - webglTouchGesture.lastY;
    webglTouchGesture.travel = Math.max(
      webglTouchGesture.travel,
      Math.hypot(point.x - webglTouchGesture.x, point.y - webglTouchGesture.y)
    );
    webglTouchGesture.lastX = point.x;
    webglTouchGesture.lastY = point.y;
    if (webglTouchGesture.travel > 7) {
      webglPanFromTouch(dx, dy);
      webglSetHover(null, 0, 0);
    }
  }
}

function webglOnTouchEnd(event) {
  if (event.pointerType !== 'touch') return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const gesture = webglTouchGesture;
  const ended = webglTouchPointers.get(event.pointerId);
  webglTouchPointers.delete(event.pointerId);
  canvas.releasePointerCapture?.(event.pointerId);

  if (webglTouchPointers.size === 0) {
    canvas.classList.remove('is-dragging');
    if (gesture?.mode === 'single' && gesture.travel <= 7 && ended) {
      const hit = webglNearestPlace(ended.x, ended.y);
      if (gesture.place && hit?.name === gesture.place) {
        webglFocusPlace(hit.name);
      } else if (!gesture.place && !hit && typeof window.AtelierVillageNavigation?.back === 'function') {
        window.AtelierVillageNavigation.back();
      }
    }
    webglTouchGesture = null;
    return;
  }

  const points = [...webglTouchPointers.values()];
  if (points.length === 1) {
    const point = points[0];
    webglTouchGesture = {
      mode: 'single',
      x: point.x,
      y: point.y,
      lastX: point.x,
      lastY: point.y,
      travel: 8,
      place: null
    };
  }
}

/* Captura táctil antes que los listeners P8.1, sin alterar ratón/trackpad. */
canvas.addEventListener('pointerdown', webglOnTouchDown, { capture: true, passive: false });
canvas.addEventListener('pointermove', webglOnTouchMove, { capture: true, passive: false });
canvas.addEventListener('pointerup', webglOnTouchEnd, { capture: true, passive: false });
canvas.addEventListener('pointercancel', webglOnTouchEnd, { capture: true, passive: false });

window.addEventListener('resize', () => {
  const next = webglDetectQuality();
  if (next !== webglQualityMode) webglApplyQuality();
}, { passive: true });

webglApplyQuality();
if (root) root.dataset.webglPhase = 'p8.2e';
const webglQualityPhaseLabel = document.querySelector('.webgl-village-heading > span');
if (webglQualityPhaseLabel) webglQualityPhaseLabel.textContent = 'Laboratorio P8.2E · calidad adaptativa WebGL';

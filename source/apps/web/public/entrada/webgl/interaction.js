/* Pueblo Atelier · P8.2B · hit testing desde el mundo 3D real */

const webglInteractionPlaces = Object.freeze({
  atelier: {
    point: [0, atelierTerrainHeight(0, 0) + 1.65, 0],
    plot: [0, atelierTerrainHeight(0, 0) + .11, 0],
    scale: [2.8, .025, 2.45],
    title: 'Atelier Lumière',
    kicker: 'Plaza central',
    detail: 'El punto de encuentro del pueblo',
    caption: 'La casa central de Atelier Lumière.'
  },
  izc: {
    point: [-11, atelierTerrainHeight(-11, 7) + 1.45, 7],
    plot: [-11, atelierTerrainHeight(-11, 7) + .11, 7],
    scale: [2.35, .025, 2.05],
    title: 'IZC',
    kicker: 'Jaén · Abanicos',
    detail: 'Taller asociado',
    caption: 'Abanicos artesanales creados en Jaén.'
  },
  stitch: {
    point: [12, atelierTerrainHeight(12, -7) + 1.45, -7],
    plot: [12, atelierTerrainHeight(12, -7) + .11, -7],
    scale: [2.35, .025, 2.05],
    title: 'The Gentle Stitch',
    kicker: 'Textil · Bordado',
    detail: 'Taller asociado',
    caption: 'Bordado textil y piezas personalizadas.'
  }
});

const webglHighlightObjects = new Map();
let webglHoverPlace = null;
let webglSelectedPlace = 'overview';
let webglPointerDown = null;
let webglInteractionTooltip = null;
let webglCameraTimer = null;

function webglCreateHighlight(placeName, config) {
  const color = [palette.wine[0], palette.wine[1], palette.wine[2], 0];
  const object = {
    mesh: meshes.box,
    position: [...config.plot],
    scale: [...config.scale],
    color,
    rotation: placeName === 'atelier' ? Math.PI / 4 : 0,
    edges: false
  };
  objects.push(object);
  webglHighlightObjects.set(placeName, object);
}

function webglUpdateHighlights() {
  for (const [name, object] of webglHighlightObjects) {
    const selected = webglSelectedPlace === name;
    const hovered = webglHoverPlace === name;
    object.color[3] = hovered ? .20 : selected ? .105 : 0;
  }
}

function webglVec4(matrix, point) {
  const [x, y, z] = point;
  const w = 1;
  return [
    matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12] * w,
    matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13] * w,
    matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14] * w,
    matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15] * w
  ];
}

function webglCurrentViewProjection() {
  const eye = cameraPosition();
  const aspect = Math.max(.1, canvas.width / Math.max(1, canvas.height));
  const projection = mat4Perspective(36 * Math.PI / 180, aspect, .1, 100);
  const view = mat4LookAt(eye, camera.target);
  return mat4Multiply(projection, view);
}

function webglProjectPoint(point) {
  const clip = webglVec4(webglCurrentViewProjection(), point);
  if (clip[3] <= .001) return null;
  const ndcX = clip[0] / clip[3];
  const ndcY = clip[1] / clip[3];
  const rect = canvas.getBoundingClientRect();
  return {
    x: (ndcX * .5 + .5) * rect.width + rect.left,
    y: (-ndcY * .5 + .5) * rect.height + rect.top,
    visible: Math.abs(ndcX) <= 1.15 && Math.abs(ndcY) <= 1.15
  };
}

function webglNearestPlace(clientX, clientY) {
  const threshold = window.innerWidth <= 760 ? 56 : window.innerWidth <= 1050 ? 68 : 76;
  let nearest = null;
  let distance = threshold;
  for (const [name, config] of Object.entries(webglInteractionPlaces)) {
    const screen = webglProjectPoint(config.point);
    if (!screen?.visible) continue;
    const current = Math.hypot(clientX - screen.x, clientY - screen.y);
    if (current < distance) {
      distance = current;
      nearest = { name, config, screen };
    }
  }
  return nearest;
}

function webglEnsureTooltip() {
  if (webglInteractionTooltip) return webglInteractionTooltip;
  const tooltip = document.createElement('div');
  tooltip.className = 'webgl-place-tooltip';
  tooltip.setAttribute('aria-hidden', 'true');
  tooltip.innerHTML = '<small></small><strong></strong><span></span>';
  root?.append(tooltip);
  webglInteractionTooltip = tooltip;
  return tooltip;
}

function webglShowTooltip(hit, clientX, clientY) {
  const tooltip = webglEnsureTooltip();
  tooltip.querySelector('small').textContent = hit.config.kicker;
  tooltip.querySelector('strong').textContent = hit.config.title;
  tooltip.querySelector('span').textContent = 'Seleccionar para acercar la cámara';

  const rootRect = root.getBoundingClientRect();
  const width = 250;
  const height = 78;
  const left = clamp(clientX - rootRect.left, 8, Math.max(8, rootRect.width - width - 24));
  const top = clamp(clientY - rootRect.top, 78, Math.max(78, rootRect.height - height - 90));
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
  tooltip.classList.add('is-visible');
}

function webglHideTooltip() {
  webglInteractionTooltip?.classList.remove('is-visible');
}

function webglSetHover(hit, clientX, clientY) {
  const next = hit?.name || null;
  if (next !== webglHoverPlace) {
    webglHoverPlace = next;
    if (root) {
      if (next) root.dataset.hoverPlace = next;
      else delete root.dataset.hoverPlace;
    }
    webglUpdateHighlights();
  }
  if (hit && window.innerWidth > 760) webglShowTooltip(hit, clientX, clientY);
  else webglHideTooltip();
}

function webglUpdateCaption(name) {
  const caption = root?.querySelector('.webgl-village-caption');
  if (!caption) return;
  const config = webglInteractionPlaces[name];
  const kicker = caption.querySelector('p');
  const heading = caption.querySelector('h1');
  let context = caption.querySelector('[data-place-context]');
  if (!context) {
    context = document.createElement('span');
    context.dataset.placeContext = 'true';
    caption.append(context);
  }

  if (!config) {
    if (kicker) kicker.textContent = 'Atelier Lumière';
    if (heading) heading.textContent = 'Un territorio para descubrir a quienes crean cada pieza.';
    context.textContent = 'Explora el pueblo completo';
    return;
  }

  if (kicker) kicker.textContent = config.kicker;
  if (heading) heading.textContent = config.title;
  context.textContent = config.caption;
}

function webglFocusPlace(name) {
  const place = places[name];
  if (!place) return;
  webglSelectedPlace = name;
  webglHoverPlace = null;
  delete root?.dataset.hoverPlace;
  webglUpdateHighlights();
  webglHideTooltip();

  camera.desired = [...place.target];
  camera.desiredDistance = place.distance;
  root?.setAttribute('data-camera-moving', 'true');
  window.clearTimeout(webglCameraTimer);
  webglCameraTimer = window.setTimeout(() => root?.removeAttribute('data-camera-moving'), reducedMotion.matches ? 40 : 920);

  document.querySelectorAll('[data-camera-place]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.cameraPlace === name);
  });
  webglUpdateCaption(name);
  if (status) status.textContent = `${webglInteractionPlaces[name]?.title || 'Vista general'} · cámara enfocada`;
}

function webglFocusOverview() {
  webglSelectedPlace = 'overview';
  webglHoverPlace = null;
  delete root?.dataset.hoverPlace;
  webglUpdateHighlights();
  webglHideTooltip();
  camera.desired = [...places.overview.target];
  camera.desiredDistance = places.overview.distance;
  document.querySelectorAll('[data-camera-place]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.cameraPlace === 'overview');
  });
  webglUpdateCaption('overview');
  if (status) status.textContent = 'Vista general · territorio completo';
}

function webglOnPointerMove(event) {
  if (webglPointerDown) {
    webglPointerDown.travel = Math.max(
      webglPointerDown.travel,
      Math.hypot(event.clientX - webglPointerDown.x, event.clientY - webglPointerDown.y)
    );
    if (webglPointerDown.travel > 7) {
      webglSetHover(null, event.clientX, event.clientY);
      return;
    }
  }
  if (dragging) return;
  webglSetHover(webglNearestPlace(event.clientX, event.clientY), event.clientX, event.clientY);
}

function webglOnPointerDown(event) {
  if (event.button !== 0) return;
  const hit = webglNearestPlace(event.clientX, event.clientY);
  webglPointerDown = {
    x: event.clientX,
    y: event.clientY,
    travel: 0,
    place: hit?.name || null
  };
}

function webglOnPointerUp(event) {
  const down = webglPointerDown;
  webglPointerDown = null;
  if (!down || down.travel > 7 || !down.place) return;
  const hit = webglNearestPlace(event.clientX, event.clientY);
  if (hit?.name === down.place) webglFocusPlace(hit.name);
}

for (const [name, config] of Object.entries(webglInteractionPlaces)) webglCreateHighlight(name, config);
canvas.addEventListener('pointermove', webglOnPointerMove);
canvas.addEventListener('pointerleave', () => webglSetHover(null, 0, 0));
canvas.addEventListener('pointerdown', webglOnPointerDown);
canvas.addEventListener('pointerup', webglOnPointerUp);
canvas.addEventListener('pointercancel', () => { webglPointerDown = null; webglSetHover(null, 0, 0); });

for (const button of document.querySelectorAll('[data-camera-place]')) {
  button.addEventListener('click', () => {
    const name = button.dataset.cameraPlace;
    if (name === 'overview') webglFocusOverview();
    else webglFocusPlace(name);
  });
}

webglUpdateCaption('overview');
webglUpdateHighlights();
if (root) root.dataset.webglPhase = 'p8.2b';
const phaseLabel = document.querySelector('.webgl-village-heading > span');
if (phaseLabel) phaseLabel.textContent = 'Laboratorio P8.2B · parcelas interactivas 3D';
if (status) status.textContent = 'P8.2B · pasa sobre Atelier o un taller';

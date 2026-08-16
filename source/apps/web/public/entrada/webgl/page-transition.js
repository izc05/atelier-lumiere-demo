/* Pueblo Atelier · P9.4 · transición narrativa edificio → página */

let p9ExitLayer = null;
let p9ExitTimer = null;
let p9ExitActive = false;
let p9AtelierEnter = null;

function p9EnsureExitLayer() {
  if (p9ExitLayer) return p9ExitLayer;
  const layer = document.createElement('div');
  layer.className = 'webgl-page-exit-layer';
  layer.setAttribute('aria-hidden', 'true');
  layer.innerHTML = '<span class="webgl-page-exit-bloom"></span><span class="webgl-page-exit-grain"></span>';
  root?.append(layer);
  p9ExitLayer = layer;
  return layer;
}

function p9EnsureAtelierEnter() {
  if (p9AtelierEnter) return p9AtelierEnter;
  const caption = root?.querySelector('.webgl-village-caption');
  if (!caption) return null;
  const enter = document.createElement('a');
  enter.className = 'webgl-place-enter';
  enter.dataset.atelierEnter = 'true';
  enter.href = '/?intro=0';
  enter.hidden = true;
  enter.textContent = 'Entrar en Atelier';
  caption.append(enter);
  p9AtelierEnter = enter;
  return enter;
}

function p9UpdateAtelierEnter(name) {
  const enter = p9EnsureAtelierEnter();
  if (!enter) return;
  enter.hidden = name !== 'atelier';
}

function p9ExitOrigin(name) {
  const projected = typeof webglWatercolorOrigin === 'function'
    ? webglWatercolorOrigin(name)
    : null;
  const rect = root?.getBoundingClientRect();
  if (!rect) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  return {
    x: projected?.x ? projected.x - rect.left : rect.width / 2,
    y: projected?.y ? projected.y - rect.top : rect.height / 2
  };
}

function p9ExitDestinationName() {
  if (typeof webglSelectedPlace === 'string' && webglSelectedPlace !== 'overview') return webglSelectedPlace;
  return 'atelier';
}

function p9NavigateAfterExit(href) {
  window.location.assign(href);
}

function p9StartPageExit(href, name = p9ExitDestinationName()) {
  if (p9ExitActive || !href || href === '#') return;
  if (reducedMotion.matches) {
    p9NavigateAfterExit(href);
    return;
  }

  p9ExitActive = true;
  const layer = p9EnsureExitLayer();
  const origin = p9ExitOrigin(name);
  const rootRect = root?.getBoundingClientRect();
  const mobile = window.matchMedia('(max-width: 760px)').matches;
  const duration = mobile ? 650 : 880;

  layer.style.setProperty('--exit-x', `${origin.x}px`);
  layer.style.setProperty('--exit-y', `${origin.y}px`);
  layer.style.setProperty('--exit-w', `${rootRect?.width || window.innerWidth}px`);
  layer.style.setProperty('--exit-h', `${rootRect?.height || window.innerHeight}px`);

  if (root) {
    root.dataset.pageExit = 'true';
    root.dataset.exitPlace = name;
  }

  if (typeof p9CancelCameraJourney === 'function') p9CancelCameraJourney({ keepCurrent: false });
  const place = places[name];
  if (place) {
    camera.desired = [...place.target];
    camera.desiredDistance = Math.max(9.5, Math.min(place.distance * .72, camera.distance * .82));
    const profile = typeof p9CameraProfile === 'function' ? p9CameraProfile(name, place.target) : null;
    if (profile && typeof p9AnimateOrientation === 'function') {
      p9CameraSequence += 1;
      p9AnimateOrientation(profile.yaw, Math.max(.62, profile.pitch - .055), duration * .78, p9CameraSequence);
    }
  }

  if (typeof webglRunWatercolor === 'function') webglRunWatercolor(name);
  if (status) status.textContent = 'Entrando…';

  window.clearTimeout(p9ExitTimer);
  p9ExitTimer = window.setTimeout(() => p9NavigateAfterExit(href), duration);
}

function p9ShouldInterceptLink(event, anchor) {
  if (!anchor || event.defaultPrevented) return false;
  if (event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  if (anchor.target && anchor.target !== '_self') return false;
  return true;
}

root?.addEventListener('click', (event) => {
  const anchor = event.target.closest('a.webgl-provider-enter, a[data-atelier-enter]');
  if (!p9ShouldInterceptLink(event, anchor)) return;
  const href = anchor.getAttribute('href');
  if (!href || href === '#') return;
  event.preventDefault();
  p9StartPageExit(href, anchor.matches('[data-atelier-enter]') ? 'atelier' : p9ExitDestinationName());
});

const p9PageBaseFocusPlace = webglFocusPlace;
webglFocusPlace = function p9FocusPlaceWithEntry(name) {
  p9PageBaseFocusPlace(name);
  p9UpdateAtelierEnter(name);
};

const p9PageBaseFocusOverview = webglFocusOverview;
webglFocusOverview = function p9FocusOverviewWithEntry() {
  p9PageBaseFocusOverview();
  p9UpdateAtelierEnter('overview');
};

p9EnsureExitLayer();
p9EnsureAtelierEnter();
window.setTimeout(() => {
  if (root) root.dataset.webglPhase = 'p9.4';
  const label = document.querySelector('.webgl-village-heading > span');
  if (label) label.textContent = 'Laboratorio P9.4 · transición edificio → página';
  if (status && !root?.dataset.webglError) status.textContent = 'P9.4 · explora un taller y entra cuando quieras';
}, 160);

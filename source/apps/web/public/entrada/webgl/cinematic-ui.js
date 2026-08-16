/* Pueblo Atelier · P9.7 · interfaz contextual, escena primero */

let p97SettleTimer = null;

function p97ApplySceneUi(name = 'overview') {
  if (!root) return;
  const mode = name === 'overview' ? 'overview' : 'focus';
  root.dataset.sceneUi = mode;
  if (mode === 'overview') {
    window.clearTimeout(p97SettleTimer);
    delete root.dataset.uiSettled;
    if (!reducedMotion.matches) {
      p97SettleTimer = window.setTimeout(() => {
        if (root.dataset.sceneUi === 'overview') root.dataset.uiSettled = 'true';
      }, 3200);
    }
  } else {
    window.clearTimeout(p97SettleTimer);
    delete root.dataset.uiSettled;
  }
}

const p97BaseFocusPlace = webglFocusPlace;
webglFocusPlace = function p97FocusPlaceWithContextualUi(name) {
  p97ApplySceneUi(name);
  return p97BaseFocusPlace(name);
};

const p97BaseFocusOverview = webglFocusOverview;
webglFocusOverview = function p97FocusOverviewWithContextualUi() {
  p97ApplySceneUi('overview');
  return p97BaseFocusOverview();
};

/* Un movimiento manual no obliga a recuperar paneles: solo despierta ligeramente la cabecera. */
function p97WakeUi() {
  if (!root || root.dataset.sceneUi !== 'overview') return;
  delete root.dataset.uiSettled;
  window.clearTimeout(p97SettleTimer);
  if (!reducedMotion.matches) {
    p97SettleTimer = window.setTimeout(() => {
      if (root.dataset.sceneUi === 'overview') root.dataset.uiSettled = 'true';
    }, 2200);
  }
}

canvas.addEventListener('pointerdown', p97WakeUi, { passive: true });
canvas.addEventListener('wheel', p97WakeUi, { passive: true });

p97ApplySceneUi('overview');
window.setTimeout(() => {
  if (root) root.dataset.webglPhase = 'p9.7';
  const label = document.querySelector('.webgl-village-heading > span');
  if (label) label.textContent = 'Laboratorio P9.7 · escena primero';
  if (status && !root?.dataset.webglError) status.textContent = 'P9.7 · interfaz contextual activa';
}, 300);

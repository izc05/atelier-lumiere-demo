/* Atelier Lumière · U2.2 · transición de llegada desde la entrada general */
(() => {
  const ARRIVAL_KEY = 'atelier_arrival_from_entry';
  const root = document.querySelector('[data-webgl-village]');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (!root) return;

  let fromEntry = false;
  try {
    fromEntry = sessionStorage.getItem(ARRIVAL_KEY) === '1';
    sessionStorage.removeItem(ARRIVAL_KEY);
  } catch {
    fromEntry = false;
  }

  if (!fromEntry) {
    root.dataset.arrival = 'direct';
    return;
  }

  root.dataset.arrival = 'cinematic';

  const overlay = document.createElement('div');
  overlay.className = 'webgl-arrival';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.innerHTML = `
    <div class="webgl-arrival-inner">
      <img src="/assets/brand/atelier-logo-official-light.svg" alt="">
      <span>Atelier Lumière</span>
      <strong>El pueblo de los oficios</strong>
    </div>`;
  document.body.append(overlay);

  if (!reducedMotion.matches) {
    try {
      if (typeof camera !== 'undefined') {
        const finalDistance = Number(camera.desiredDistance || camera.distance || 33);
        camera.distance = Math.min(48, finalDistance + (window.innerWidth <= 760 ? 4.5 : 8));
        camera.desiredDistance = finalDistance;
      }
    } catch {
      /* La llegada visual sigue funcionando aunque la cámara no esté disponible. */
    }
  }

  const reveal = () => {
    overlay.classList.add('is-revealing');
    window.setTimeout(() => {
      overlay.remove();
      root.dataset.arrival = 'complete';
    }, reducedMotion.matches ? 30 : 820);
  };

  if (reducedMotion.matches) {
    window.setTimeout(reveal, 20);
  } else {
    window.setTimeout(reveal, 420);
  }
})();

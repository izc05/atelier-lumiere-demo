/* Atelier Lumière · U3.28 · llegada coordinada con el boot gate inicial */
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

  if (!reducedMotion.matches) {
    try {
      if (typeof camera !== 'undefined') {
        const finalDistance = Number(camera.desiredDistance || camera.distance || 33);
        camera.distance = Math.min(48, finalDistance + (window.innerWidth <= 760 ? 4.5 : 8));
        camera.desiredDistance = finalDistance;
      }
    } catch {
      /* El boot gate sigue protegiendo el primer frame aunque la cámara no esté disponible. */
    }
  }

  const completeArrival = () => {
    root.dataset.arrival = 'complete';
  };

  if (root.dataset.bootState === 'complete') {
    completeArrival();
  } else {
    window.addEventListener('atelier:village-boot-complete', completeArrival, { once: true });
  }
})();

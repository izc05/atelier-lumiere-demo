/* Atelier Lumière · U3.28 · gate de arranque antes de mostrar el Pueblo */
(() => {
  const ARRIVAL_KEY = 'atelier_arrival_from_entry';
  const root = document.querySelector('[data-webgl-village]');
  const boot = document.querySelector('[data-webgl-boot]');
  const bar = document.querySelector('[data-webgl-boot-progress]');
  const stage = document.querySelector('[data-webgl-boot-stage]');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (!root || !boot) return;

  const startedAt = performance.now();
  let fromEntry = false;
  let finishing = false;

  try {
    fromEntry = sessionStorage.getItem(ARRIVAL_KEY) === '1';
  } catch {
    fromEntry = false;
  }

  root.dataset.bootState = 'loading';
  root.dataset.bootOrigin = fromEntry ? 'entry' : 'direct';
  root.dataset.bootCheckpoint = 'u3.28';

  const setProgress = (ratio) => {
    if (!bar) return;
    const safe = Math.min(1, Math.max(.04, Number(ratio) || .04));
    bar.style.transform = `scaleX(${safe.toFixed(3)})`;
  };

  const setStage = (text) => {
    if (stage && text) stage.textContent = text;
  };

  const progress = (loaded = 0, total = 1) => {
    const count = Math.max(1, Number(total) || 1);
    const current = Math.min(count, Math.max(0, Number(loaded) || 0));
    const ratio = current / count;
    setProgress(.05 + ratio * .90);

    if (ratio < .18) setStage('Preparando el terreno…');
    else if (ratio < .48) setStage('Construyendo calles y talleres…');
    else if (ratio < .76) setStage('Encendiendo el pueblo…');
    else if (ratio < .96) setStage('Ajustando iluminación y detalle…');
    else setStage('Componiendo la vista final…');
  };

  const afterTwoFrames = () => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });

  const waitForFonts = async () => {
    if (!document.fonts?.ready) return;
    await Promise.race([
      document.fonts.ready.catch(() => undefined),
      new Promise((resolve) => window.setTimeout(resolve, 650))
    ]);
  };

  const complete = async () => {
    if (finishing) return;
    finishing = true;
    setProgress(1);
    setStage('El pueblo está listo');

    const minimum = reducedMotion.matches ? 120 : (fromEntry ? 900 : 420);
    const elapsed = performance.now() - startedAt;
    if (elapsed < minimum) {
      await new Promise((resolve) => window.setTimeout(resolve, minimum - elapsed));
    }

    await waitForFonts();
    await afterTwoFrames();

    root.dataset.bootState = 'revealing';
    window.dispatchEvent(new CustomEvent('atelier:village-boot-reveal', {
      detail: { fromEntry, version: 'u3.28' }
    }));

    window.setTimeout(() => {
      boot.remove();
      root.dataset.bootState = 'complete';
      window.dispatchEvent(new CustomEvent('atelier:village-boot-complete', {
        detail: { fromEntry, version: 'u3.28' }
      }));
    }, reducedMotion.matches ? 50 : 760);
  };

  const fail = (message = 'No se pudo completar la experiencia 3D') => {
    finishing = true;
    root.dataset.bootState = 'loading';
    setProgress(1);
    setStage(`${message} · abriendo mapa ligero…`);
  };

  progress(0, 1);
  window.AtelierVillageBoot = Object.freeze({
    version: 'u3.28',
    fromEntry,
    progress,
    complete,
    fail
  });
})();

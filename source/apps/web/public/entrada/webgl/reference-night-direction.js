/* Atelier Lumière · U3.18 · dirección nocturna de referencia */
(() => {
  if (!root || typeof objects === 'undefined' || typeof palette === 'undefined' || typeof camera === 'undefined' || typeof places === 'undefined') return;
  if (root.dataset.referenceNightDirection === 'u3.18') return;

  const styleHref = '/entrada/webgl/reference-night-direction.css';
  if (!document.querySelector(`link[href="${styleHref}"]`)) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = styleHref;
    link.dataset.u318ReferenceNight = '';
    document.head.append(link);
  }

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const quality = typeof webglQualityMode === 'string' ? webglQualityMode : 'balanced';

  const clamp01 = (value) => Math.min(1, Math.max(0, value));
  const luminance = (color) => color[0] * .2126 + color[1] * .7152 + color[2] * .0722;
  const isWarmLight = (color) => color[0] > .76 && color[1] > .43 && color[1] < color[0] * .88 && color[2] < .46;
  const isGreen = (color) => color[1] > color[0] * 1.03 && color[1] > color[2] * 1.04;
  const isWine = (color) => color[0] > color[1] * 1.45 && color[0] > color[2] * 1.25 && color[0] < .58;

  function toneColor(source) {
    const alpha = source[3] ?? 1;
    if (isWarmLight(source)) {
      return [clamp01(source[0] * 1.08), clamp01(source[1] * 1.04), clamp01(source[2] * .92), Math.max(alpha, .72)];
    }

    const luma = luminance(source);
    if (isGreen(source)) {
      return [source[0] * .34 + .035, source[1] * .40 + .055, source[2] * .36 + .045, alpha];
    }
    if (isWine(source)) {
      return [source[0] * .76 + .045, source[1] * .56 + .020, source[2] * .60 + .025, alpha];
    }
    if (luma > .78) {
      return [source[0] * .54 + .075, source[1] * .46 + .055, source[2] * .38 + .045, alpha];
    }
    if (luma > .50) {
      return [source[0] * .58 + .050, source[1] * .52 + .038, source[2] * .46 + .032, alpha];
    }
    return [source[0] * .70 + .026, source[1] * .64 + .018, source[2] * .61 + .018, alpha];
  }

  /* Todos los objetos se desacoplan de las referencias de paleta antes de oscurecer cielo/fog. */
  for (const object of objects) {
    if (!Array.isArray(object?.color) || object.color.length < 3) continue;
    object.color = toneColor([...object.color]);
  }

  const nightSky = hex('#171113');
  palette.paperLight[0] = nightSky[0];
  palette.paperLight[1] = nightSky[1];
  palette.paperLight[2] = nightSky[2];
  palette.paperLight[3] = 1;
  palette.ink[0] = .075;
  palette.ink[1] = .045;
  palette.ink[2] = .040;
  palette.ink[3] = .28;

  function profile() {
    const mobile = window.matchMedia('(max-width:760px)').matches;
    const tablet = !mobile && window.matchMedia('(max-width:1050px)').matches;
    if (mobile) return { target:[.30,0,.12], distance:22.9, yaw:.758, pitch:.675, atelier:15.2, landmark:12.7 };
    if (tablet) return { target:[.08,0,.30], distance:27.2, yaw:.798, pitch:.685, atelier:14.6, landmark:12.25 };
    return { target:[-.02,0,.30], distance:28.4, yaw:.807, pitch:.675, atelier:14.25, landmark:12.05 };
  }

  function selected() {
    return typeof webglSelectedPlace === 'string' ? webglSelectedPlace : 'overview';
  }

  function syncCamera({ immediate = false } = {}) {
    const current = profile();
    if (places.overview) {
      places.overview.target = [...current.target];
      places.overview.distance = current.distance;
    }
    if (places.atelier) places.atelier.distance = current.atelier;
    if (places.izc) places.izc.distance = current.landmark;
    if (places.stitch) places.stitch.distance = current.landmark;

    if (selected() === 'overview' && root.dataset.spatialOrbit !== 'true' && root.dataset.cinematicCamera !== 'true') {
      camera.desired = [...current.target];
      camera.desiredDistance = current.distance;
      if (immediate || reduced.matches) {
        camera.target = [...current.target];
        camera.distance = current.distance;
        camera.yaw = current.yaw;
        camera.pitch = current.pitch;
      }
    }
    return current;
  }

  const initial = syncCamera({ immediate: true });

  if (typeof p9CameraProfile === 'function') {
    const previous = p9CameraProfile;
    p9CameraProfile = function u318CameraProfile(name, target) {
      const current = profile();
      if (name === 'overview') return { yaw: current.yaw, pitch: current.pitch };
      if (name === 'atelier') return { yaw: .650, pitch: .603 };
      if (name === 'izc') return { yaw: .858, pitch: .642 };
      if (name === 'stitch') return { yaw: .606, pitch: .650 };
      return previous(name, target);
    };
  }

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => syncCamera({ immediate: false }), 120);
  }, { passive: true });

  root.dataset.referenceNightDirection = 'u3.18';
  root.dataset.referenceNightQuality = quality;
  root.dataset.referenceNightDistance = String(initial.distance);
  root.dataset.referenceNightPitch = String(initial.pitch);
  root.dataset.webglPhase = 'u3.18';

  if (status && !root.dataset.webglError) status.textContent = 'Pueblo Atelier · noche cálida preparada';
})();

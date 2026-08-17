/* Atelier Lumière · U3.16 · ajuste sobre captura real */
(() => {
  if (!root || typeof camera === 'undefined' || typeof places === 'undefined') return;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  function profile() {
    const mobile = window.matchMedia('(max-width:760px)').matches;
    const tablet = !mobile && window.matchMedia('(max-width:1050px)').matches;
    if (mobile) {
      return { target:[.45,0,.12], distance:23.8, yaw:.755, pitch:.705, atelier:15.9, landmark:13.2 };
    }
    if (tablet) {
      return { target:[.18,0,.32], distance:28.8, yaw:.795, pitch:.725, atelier:15.1, landmark:12.8 };
    }
    return { target:[.02,0,.36], distance:30.8, yaw:.802, pitch:.735, atelier:14.7, landmark:12.45 };
  }

  function selected() {
    return typeof webglSelectedPlace === 'string' ? webglSelectedPlace : 'overview';
  }

  function sync({ immediate=false }={}) {
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

  const initial = sync({ immediate:true });

  if (typeof p9CameraProfile === 'function') {
    const previous = p9CameraProfile;
    p9CameraProfile = function u316CameraProfile(name,target) {
      const current = profile();
      if (name === 'overview') return { yaw:current.yaw, pitch:current.pitch };
      if (name === 'atelier') return { yaw:.648, pitch:.625 };
      if (name === 'izc') return { yaw:.855, pitch:.665 };
      if (name === 'stitch') return { yaw:.605, pitch:.675 };
      return previous(name,target);
    };
  }

  let resizeTimer = 0;
  window.addEventListener('resize',()=>{
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(()=>sync({ immediate:false }),120);
  },{passive:true});

  /* Ninguna capa antigua vuelve a enseñar nombres de laboratorio al usuario. */
  function sanitizeHeading() {
    const eyebrow = document.querySelector('.webgl-village-heading > span');
    const title = document.querySelector('.webgl-village-heading strong');
    const helper = document.querySelector('.webgl-village-heading small');
    if (eyebrow && eyebrow.textContent !== 'Atelier Lumière') eyebrow.textContent = 'Atelier Lumière';
    if (title && title.textContent !== 'El pueblo de los oficios') title.textContent = 'El pueblo de los oficios';
    if (helper && helper.textContent !== 'Recorre · descubre · entra') helper.textContent = 'Recorre · descubre · entra';
  }
  sanitizeHeading();
  const heading = document.querySelector('.webgl-village-heading');
  if (heading) {
    const observer = new MutationObserver(sanitizeHeading);
    observer.observe(heading,{subtree:true,characterData:true,childList:true});
  }

  root.dataset.captureTuning = 'u3.16';
  root.dataset.captureOverviewDistance = String(initial.distance);
  root.dataset.captureOverviewPitch = String(initial.pitch);
  root.dataset.webglPhase = 'u3.16';
  if (status && !root.dataset.webglError) status.textContent = 'Pueblo Atelier · listo para explorar';
})();

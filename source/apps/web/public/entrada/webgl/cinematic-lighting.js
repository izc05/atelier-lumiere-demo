/* Atelier Lumière · U3.5D · iluminación cinematográfica anclada al mundo */
(() => {
  if (!root || typeof webglProjectPoint !== 'function') return;

  const quality = typeof webglQualityMode === 'string' ? webglQualityMode : 'balanced';
  const reduced = reducedMotion?.matches === true;

  if (!document.querySelector('link[data-u35-lighting]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/entrada/webgl/cinematic-lighting.css';
    link.dataset.u35Lighting = '';
    document.head.append(link);
  }

  const layer = document.createElement('div');
  layer.className = 'u35-lighting';
  layer.setAttribute('aria-hidden', 'true');

  const wash = document.createElement('div');
  wash.className = 'u35-lighting-wash';
  const vignette = document.createElement('div');
  vignette.className = 'u35-lighting-vignette';
  layer.append(wash, vignette);

  const canvasParent = canvas?.parentElement || root;
  canvasParent.append(layer);

  const basePlaces = [
    ['atelier', webglInteractionPlaces?.atelier?.point],
    ['izc', webglInteractionPlaces?.izc?.point],
    ['stitch', webglInteractionPlaces?.stitch?.point]
  ].filter(([,point]) => Array.isArray(point));

  const maxBase = quality === 'high' ? 3 : quality === 'balanced' ? 3 : 1;
  const glows = new Map();

  function ensureGlow(name, point, dynamic = false) {
    if (!Array.isArray(point)) return null;
    let glow = glows.get(name);
    if (!glow) {
      glow = document.createElement('i');
      glow.className = 'u35-world-glow';
      glow.dataset.place = name;
      if (dynamic) glow.dataset.dynamic = 'true';
      layer.append(glow);
      glows.set(name, glow);
    }
    glow._u35Point = point;
    return glow;
  }

  basePlaces.slice(0,maxBase).forEach(([name,point]) => ensureGlow(name,point,false));

  function selectedDynamic() {
    if (quality === 'lite') return null;
    if (typeof webglSelectedPlace !== 'string' || webglSelectedPlace === 'overview') return null;
    if (webglInteractionPlaces?.[webglSelectedPlace]) return null;
    const config = webglDynamicProviderPlaces?.[webglSelectedPlace];
    if (!config?.point) return null;
    return [webglSelectedPlace, config.point];
  }

  function syncDynamicGlow() {
    const dynamic = selectedDynamic();
    const currentDynamic = [...glows.entries()].find(([,node]) => node.dataset.dynamic === 'true');
    if (!dynamic) {
      if (currentDynamic) {
        currentDynamic[1].remove();
        glows.delete(currentDynamic[0]);
      }
      return;
    }
    const [name,point] = dynamic;
    if (currentDynamic && currentDynamic[0] !== name) {
      currentDynamic[1].remove();
      glows.delete(currentDynamic[0]);
    }
    ensureGlow(name,point,true);
  }

  let frame = 0;
  let raf = 0;
  let active = !document.hidden;

  function update() {
    raf = 0;
    if (!active) return;
    frame += 1;
    if (quality !== 'high' && frame % 2 === 1) {
      raf = requestAnimationFrame(update);
      return;
    }

    syncDynamicGlow();
    const rect = root.getBoundingClientRect();
    for (const [name, glow] of glows) {
      const screen = webglProjectPoint(glow._u35Point);
      if (!screen?.visible) {
        glow.style.opacity = '0';
        continue;
      }
      const x = screen.x - rect.left;
      const y = screen.y - rect.top;
      glow.style.setProperty('--u35-x', `${x.toFixed(1)}px`);
      glow.style.setProperty('--u35-y', `${y.toFixed(1)}px`);
      glow.style.opacity = '';
      glow.classList.toggle('is-selected', webglSelectedPlace === name);
      glow.classList.toggle('is-hovered', webglHoverPlace === name);
    }
    raf = requestAnimationFrame(update);
  }

  document.addEventListener('visibilitychange', () => {
    active = !document.hidden;
    if (!active && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    } else if (active && !raf) {
      raf = requestAnimationFrame(update);
    }
  });

  raf = requestAnimationFrame(update);

  root.dataset.cinematicLighting='u3.5d';
  root.dataset.cinematicLightingQuality=quality;
  root.dataset.webglPhase='u3.5d';
  if(status && !root.dataset.webglError) status.textContent=`U3.5D · iluminación cinematográfica ${quality}`;
})();

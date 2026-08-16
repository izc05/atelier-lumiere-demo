/* Atelier Lumière · U3.19 · placas persistentes, logos con fallback y clamp de viewport */
(() => {
  if (!root || typeof webglProjectPoint !== 'function') return;

  const styleHref = '/entrada/webgl/plaque-stability.css';
  if (!document.querySelector(`link[href="${styleHref}"]`)) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = styleHref;
    document.head.append(link);
  }

  const plaquesRoot = document.querySelector('.webgl-workshop-plaques');
  if (!plaquesRoot) return;

  const sticky = new Set();
  let previousMode = '';
  let frame = 0;

  const localClamp = (value, min, max) => Math.min(max, Math.max(min, value));

  function initials(value) {
    const words = String(value || 'Taller').trim().split(/\s+/).filter(Boolean);
    if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
    return words.slice(0, 3).map((word) => word[0]).join('').toUpperCase();
  }

  function ensureLogoFallback(plaque) {
    const logo = plaque.querySelector('.webgl-workshop-plaque-logo');
    if (!logo || logo.dataset.u319LogoReady === 'true') return;
    logo.dataset.u319LogoReady = 'true';

    const title = plaque.querySelector('strong')?.textContent || plaque.dataset.plaquePlace || 'Taller';
    let fallback = logo.querySelector('.u319-logo-fallback');
    if (!fallback) {
      const existing = logo.querySelector('span:not(.u319-logo-fallback)');
      fallback = existing || document.createElement('span');
      fallback.classList.add('u319-logo-fallback');
      fallback.textContent = fallback.textContent?.trim() || initials(title);
      if (!existing) logo.prepend(fallback);
    }

    const image = logo.querySelector('img');
    if (!image) return;

    const loaded = () => {
      if (image.naturalWidth > 0) logo.classList.add('has-loaded-logo');
    };
    const failed = () => {
      logo.classList.remove('has-loaded-logo');
      image.remove();
    };

    image.addEventListener('load', loaded, { once: true });
    image.addEventListener('error', failed, { once: true });
    if (image.complete) {
      if (image.naturalWidth > 0) loaded();
      else failed();
    }
  }

  function syncLogos() {
    document.querySelectorAll('.webgl-workshop-plaque').forEach((plaque) => {
      plaque.classList.add('is-u319-stable');
      ensureLogoFallback(plaque);
    });
  }

  const plaqueObserver = new MutationObserver(syncLogos);
  plaqueObserver.observe(plaquesRoot, { childList: true, subtree: true });
  syncLogos();

  function placeConfig(name) {
    return webglInteractionPlaces?.[name] || webglDynamicProviderPlaces?.[name] || null;
  }

  function limits(focused) {
    const quality = typeof webglQualityMode === 'string' ? webglQualityMode : 'balanced';
    if (focused) return quality === 'high' ? 4 : quality === 'balanced' ? 3 : 1;
    return quality === 'high' ? 8 : quality === 'balanced' ? 6 : 4;
  }

  function projected(rootRect) {
    const centerX = rootRect.width / 2;
    const centerY = rootRect.height / 2;
    const result = [];

    for (const plaque of document.querySelectorAll('.webgl-workshop-plaque')) {
      const name = plaque.dataset.plaquePlace;
      const config = placeConfig(name);
      if (!name || !config?.point) continue;
      const screen = webglProjectPoint(config.point);
      if (!screen) continue;
      const localX = screen.x - rootRect.left;
      const localY = screen.y - rootRect.top;
      const withinExtendedViewport = localX > -220 && localX < rootRect.width + 220
        && localY > -180 && localY < rootRect.height + 160;
      if (!withinExtendedViewport) continue;

      result.push({
        name,
        plaque,
        config,
        localX,
        localY,
        distance: Math.hypot(localX - centerX, localY - centerY),
        realProvider: !plaque.classList.contains('is-reserved')
      });
    }
    return result;
  }

  function selectStable(items, selected, focused) {
    const available = new Map(items.map((item) => [item.name, item]));
    const max = limits(focused);
    const next = [];

    if (focused && selected && selected !== 'overview' && available.has(selected)) next.push(selected);

    for (const name of sticky) {
      if (next.length >= max) break;
      if (!available.has(name) || next.includes(name)) continue;
      next.push(name);
    }

    const candidates = [...items].sort((left, right) => {
      if (left.name === selected) return -1;
      if (right.name === selected) return 1;
      if (left.realProvider !== right.realProvider) return left.realProvider ? -1 : 1;
      return left.distance - right.distance;
    });

    for (const item of candidates) {
      if (next.length >= max) break;
      if (!next.includes(item.name)) next.push(item.name);
    }

    sticky.clear();
    next.forEach((name) => sticky.add(name));
    return new Set(next);
  }

  function collides(rect, occupied) {
    return occupied.some((other) => !(
      rect.right + 7 < other.left ||
      rect.left - 7 > other.right ||
      rect.bottom + 6 < other.top ||
      rect.top - 6 > other.bottom
    ));
  }

  function layoutAllowed(items, allowed, rootRect) {
    const mobile = rootRect.width <= 760;
    const tablet = !mobile && rootRect.width <= 1050;
    const sideLeft = mobile ? 7 : 12;
    const sideRight = mobile ? 7 : 62;
    const safeTop = mobile ? 58 : tablet ? 68 : 72;
    const safeBottom = mobile ? 68 : 62;
    const occupied = [];

    const ordered = items
      .filter((item) => allowed.has(item.name))
      .sort((left, right) => {
        const selected = typeof webglSelectedPlace === 'string' ? webglSelectedPlace : 'overview';
        if (left.name === selected) return -1;
        if (right.name === selected) return 1;
        return left.distance - right.distance;
      });

    for (const item of ordered) {
      const plaque = item.plaque;
      plaque.hidden = false;

      const scale = Number.parseFloat(getComputedStyle(plaque).getPropertyValue('--plaque-scale')) || 1;
      const width = Math.max(86, plaque.offsetWidth * scale);
      const height = Math.max(58, plaque.offsetHeight * scale);
      const minX = sideLeft + width / 2;
      const maxX = Math.max(minX, rootRect.width - sideRight - width / 2);
      const minY = safeTop + height;
      const maxY = Math.max(minY, rootRect.height - safeBottom);
      const baseX = localClamp(item.localX, minX, maxX);
      const baseY = localClamp(item.localY - 10, minY, maxY);

      const offsets = [
        [0, 0],
        [-width * .62, 0],
        [width * .62, 0],
        [-width * .38, -height * .42],
        [width * .38, -height * .42],
        [0, height * .40]
      ];

      let chosen = null;
      for (const [dx, dy] of offsets) {
        const x = localClamp(baseX + dx, minX, maxX);
        const y = localClamp(baseY + dy, minY, maxY);
        const rect = {
          left: x - width / 2,
          right: x + width / 2,
          top: y - height,
          bottom: y
        };
        if (!collides(rect, occupied)) {
          chosen = { x, y, rect };
          break;
        }
      }
      if (!chosen) {
        chosen = {
          x: baseX,
          y: baseY,
          rect: { left: baseX - width / 2, right: baseX + width / 2, top: baseY - height, bottom: baseY }
        };
      }

      occupied.push(chosen.rect);
      plaque.style.left = `${chosen.x.toFixed(1)}px`;
      plaque.style.top = `${chosen.y.toFixed(1)}px`;
      const clamped = Math.abs(chosen.x - item.localX) > 2 || Math.abs(chosen.y - (item.localY - 10)) > 2;
      plaque.classList.toggle('is-edge-clamped', clamped);
    }
  }

  function stabilize() {
    frame += 1;
    const rootRect = root.getBoundingClientRect();
    const selected = typeof webglSelectedPlace === 'string' ? webglSelectedPlace : 'overview';
    const focused = selected !== 'overview';
    const mode = focused ? `focus:${selected}` : 'overview';
    const items = projected(rootRect);

    if (mode !== previousMode) {
      sticky.clear();
      previousMode = mode;
    }

    const allowed = selectStable(items, selected, focused);
    const itemNames = new Set(items.map((item) => item.name));

    for (const plaque of document.querySelectorAll('.webgl-workshop-plaque')) {
      const name = plaque.dataset.plaquePlace;
      if (!itemNames.has(name) || !allowed.has(name)) {
        plaque.hidden = true;
        plaque.classList.remove('is-edge-clamped');
      }
    }

    layoutAllowed(items, allowed, rootRect);

    if (frame % 20 === 0) {
      root.dataset.plaqueStableVisible = String(allowed.size);
      root.dataset.plaqueStableMode = focused ? 'focus' : 'overview';
    }
    requestAnimationFrame(stabilize);
  }

  root.dataset.plaqueStability = 'u3.19';
  root.dataset.stabilityCheckpoint = 'u3.19';
  requestAnimationFrame(stabilize);

  window.AtelierVillagePlaqueStability = Object.freeze({
    visiblePlaces: () => [...sticky],
    refreshLogos: syncLogos
  });
})();

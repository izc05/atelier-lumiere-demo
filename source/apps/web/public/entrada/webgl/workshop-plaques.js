/* Atelier Lumière · U3.2/U3.16 · placas proyectadas, adaptativas y despejadas */
(() => {
  const styleHref = '/entrada/webgl/workshop-plaques.css';
  if (!document.querySelector(`link[href="${styleHref}"]`)) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = styleHref;
    document.head.append(link);
  }

  if (!root) return;

  const container = document.createElement('div');
  container.className = 'webgl-workshop-plaques';
  container.setAttribute('aria-label', 'Talleres y zonas visibles en el Pueblo Atelier');
  root.append(container);

  const home = document.createElement('a');
  home.className = 'webgl-enter-atelier';
  home.href = '/?intro=0';
  home.innerHTML = `
    <span class="webgl-enter-atelier-mark" aria-hidden="true">AL</span>
    <span><strong>Entrar a Atelier</strong><small>Ir a la página principal</small></span>`;
  root.append(home);

  const plaqueByPlace = new Map();
  let visiblePlaces = [];

  const qualityLimit = () => {
    const quality = typeof webglQualityMode === 'string' ? webglQualityMode : 'balanced';
    return quality === 'high' ? 6 : quality === 'balanced' ? 5 : 3;
  };

  function initials(value) {
    const words = String(value || 'Taller').trim().split(/\s+/).filter(Boolean);
    if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
    return words.slice(0, 3).map((word) => word[0]).join('').toUpperCase();
  }

  function providerLogoUrl(provider) {
    if (!provider?.logo?.path || typeof webglProviderMediaUrl !== 'function') return null;
    return webglProviderMediaUrl(provider.logo.path, 220);
  }

  function signatureVisible(zoneKey) {
    const config = window.AtelierVillageZones?.configuration?.(zoneKey);
    return config?.status !== 'HIDDEN';
  }

  function workshopEntries() {
    const base = [
      ['izc', 'ZONE_01'],
      ['stitch', 'ZONE_02']
    ]
      .filter(([, zoneKey]) => signatureVisible(zoneKey))
      .map(([name]) => [name, webglInteractionPlaces[name]])
      .filter(([, config]) => Boolean(config));
    const dynamic = Object.entries(webglDynamicProviderPlaces || {});
    return [...base, ...dynamic];
  }

  function createPlaque(name, config, index) {
    const provider = webglProviderByPlace.get(name) || config.provider || null;
    const title = config.title || provider?.displayName || 'Taller invitado';
    const specialty = config.workshopType || provider?.specialty || provider?.locationLabel || config.kicker || 'Taller asociado';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'webgl-workshop-plaque';
    button.dataset.plaquePlace = name;
    button.dataset.plaqueIndex = String(index);
    if (config.zoneKey) button.dataset.zoneKey = config.zoneKey;
    button.classList.toggle('is-reserved', !provider);
    button.setAttribute('aria-label', provider ? `Acercarse al taller ${title}` : `Acercarse a la zona ${title}`);

    const logo = document.createElement('span');
    logo.className = 'webgl-workshop-plaque-logo';
    const logoUrl = providerLogoUrl(provider);
    if (logoUrl) {
      const image = document.createElement('img');
      image.src = logoUrl;
      image.alt = '';
      image.loading = 'eager';
      logo.append(image);
    } else {
      const fallback = document.createElement('span');
      fallback.textContent = initials(config.workshopType || title);
      logo.append(fallback);
    }

    const copy = document.createElement('span');
    copy.className = 'webgl-workshop-plaque-copy';
    const strong = document.createElement('strong');
    strong.textContent = title;
    const small = document.createElement('small');
    small.textContent = specialty;
    copy.append(strong, small);
    button.append(logo, copy);
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      webglFocusPlace(name);
    });
    return button;
  }

  function rebuildPlaques() {
    visiblePlaces = workshopEntries();
    const nextNames = new Set(visiblePlaces.map(([name]) => name));
    for (const [name, plaque] of plaqueByPlace) {
      if (!nextNames.has(name)) {
        plaque.remove();
        plaqueByPlace.delete(name);
      }
    }

    visiblePlaces.forEach(([name, config], index) => {
      const previous = plaqueByPlace.get(name);
      if (previous) previous.remove();
      const plaque = createPlaque(name, config, index);
      plaqueByPlace.set(name, plaque);
      container.append(plaque);
    });
  }

  function pickOverviewPlaques(projected, rootRect) {
    const max = qualityLimit();
    const chosen = [];
    const minX = rootRect.width <= 760 ? 108 : rootRect.width <= 1050 ? 126 : 145;
    const minY = rootRect.width <= 760 ? 58 : 72;

    for (const item of projected) {
      const collides = chosen.some((other) => (
        Math.abs(other.localX - item.localX) < minX &&
        Math.abs(other.localY - item.localY) < minY
      ));
      if (collides) continue;
      chosen.push(item);
      if (chosen.length >= max) break;
    }
    return new Set(chosen.map((item) => item.name));
  }

  function positionPlaques() {
    const rootRect = root.getBoundingClientRect();
    const selected = typeof webglSelectedPlace === 'string' ? webglSelectedPlace : 'overview';
    const focused = selected && selected !== 'overview';
    const distanceScale = clamp(1.02 - (camera.distance - 12) * .010, .68, .94);
    const centerX = rootRect.width / 2;
    const centerY = rootRect.height / 2;
    const projected = [];

    for (const [name, config] of visiblePlaces) {
      const screen = webglProjectPoint(config.point);
      const localX = screen?.x - rootRect.left;
      const localY = screen?.y - rootRect.top;
      const inside = screen?.visible
        && localX > -100 && localX < rootRect.width + 100
        && localY > 62 && localY < rootRect.height - 44;
      if (!inside) continue;
      const priority = name === selected
        ? -1e6
        : Math.hypot(localX - centerX, localY - centerY);
      projected.push({ name, config, screen, localX, localY, priority });
    }

    projected.sort((left, right) => left.priority - right.priority);
    const allowed = focused
      ? new Set(projected.filter((item) => item.name === selected).map((item) => item.name))
      : pickOverviewPlaques(projected, rootRect);
    const byName = new Map(projected.map((item) => [item.name, item]));

    for (const [name] of visiblePlaces) {
      const plaque = plaqueByPlace.get(name);
      if (!plaque) continue;
      const item = byName.get(name);
      if (!item || !allowed.has(name)) {
        plaque.hidden = true;
        continue;
      }
      plaque.hidden = false;
      plaque.style.left = `${item.localX}px`;
      plaque.style.top = `${item.localY - 10}px`;
      plaque.style.setProperty('--plaque-scale', String(name === selected ? Math.min(1.02, distanceScale + .10) : distanceScale));
      plaque.classList.toggle('is-selected', name === selected);
      plaque.classList.toggle('is-muted', focused && name !== selected);
    }
    requestAnimationFrame(positionPlaques);
  }

  const providerObserver = new MutationObserver((records) => {
    if (records.some((record) => ['data-webgl-providers', 'data-webgl-reserved-zones', 'data-village-zone-config'].includes(record.attributeName))) {
      rebuildPlaques();
    }
  });
  providerObserver.observe(root, {
    attributes: true,
    attributeFilter: ['data-webgl-providers', 'data-webgl-reserved-zones', 'data-village-zone-config']
  });

  window.addEventListener('resize', rebuildPlaques, { passive: true });
  rebuildPlaques();
  requestAnimationFrame(positionPlaques);

  root.dataset.webglPlaques = 'true';
  root.dataset.webglPlaqueLimit = String(qualityLimit());
})();

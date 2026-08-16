/* Atelier Lumière · U3.2 · placas de talleres proyectadas desde el mundo 3D */
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
  container.setAttribute('aria-label', 'Talleres visibles en el Pueblo Atelier');
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
    return quality === 'high' ? 12 : quality === 'balanced' ? 6 : 3;
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

  function workshopEntries() {
    const base = ['izc', 'stitch']
      .map((name) => [name, webglInteractionPlaces[name]])
      .filter(([, config]) => Boolean(config));
    const dynamic = Object.entries(webglDynamicProviderPlaces || {});
    return [...base, ...dynamic].slice(0, qualityLimit());
  }

  function createPlaque(name, config, index) {
    const provider = webglProviderByPlace.get(name) || config.provider || null;
    const title = provider?.displayName || config.title || 'Taller invitado';
    const specialty = provider?.specialty || provider?.locationLabel || config.kicker || 'Taller asociado';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'webgl-workshop-plaque';
    button.dataset.plaquePlace = name;
    button.dataset.plaqueIndex = String(index);
    button.setAttribute('aria-label', `Acercarse al taller ${title}`);

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
      fallback.textContent = initials(title);
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

  function positionPlaques() {
    const rootRect = root.getBoundingClientRect();
    const selected = typeof webglSelectedPlace === 'string' ? webglSelectedPlace : 'overview';
    const focused = selected && selected !== 'overview';
    const distanceScale = clamp(1.16 - (camera.distance - 12) * .012, .76, 1.05);

    for (const [name, config] of visiblePlaces) {
      const plaque = plaqueByPlace.get(name);
      if (!plaque) continue;
      const screen = webglProjectPoint(config.point);
      if (!screen?.visible) {
        plaque.hidden = true;
        continue;
      }
      plaque.hidden = false;
      plaque.style.left = `${screen.x - rootRect.left}px`;
      plaque.style.top = `${screen.y - rootRect.top - 12}px`;
      plaque.style.setProperty('--plaque-scale', String(name === selected ? Math.min(1.12, distanceScale + .13) : distanceScale));
      plaque.classList.toggle('is-selected', name === selected);
      plaque.classList.toggle('is-muted', focused && name !== selected);
    }
    requestAnimationFrame(positionPlaques);
  }

  const providerObserver = new MutationObserver((records) => {
    if (records.some((record) => record.attributeName === 'data-webgl-providers')) rebuildPlaques();
  });
  providerObserver.observe(root, { attributes: true, attributeFilter: ['data-webgl-providers'] });

  window.addEventListener('resize', rebuildPlaques, { passive: true });
  rebuildPlaques();
  requestAnimationFrame(positionPlaques);

  root.dataset.webglPlaques = 'true';
})();

/* Pueblo Atelier · P8.2D · catálogo real + parcelas procedimentales WebGL */

const webglDynamicProviderPlaces = Object.create(null);
const webglProviderByPlace = new Map();
let webglProviderCard = null;

const webglProviderSlots = [
  { x: -16, z: -9, scale: .84 },
  { x: -8, z: -7, scale: .78 },
  { x: 9, z: -10, scale: .78 },
  { x: 17, z: -3, scale: .74 },
  { x: -16, z: 5, scale: .76 },
  { x: -7, z: 8, scale: .78 },
  { x: 6, z: 8, scale: .75 },
  { x: 15, z: 7, scale: .78 },
  { x: -13, z: 11, scale: .72 },
  { x: -3, z: 10, scale: .70 },
  { x: 8, z: 11, scale: .72 },
  { x: 16, z: 10, scale: .70 }
];

function webglNormalizeProvider(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .trim();
}

function webglProviderMediaUrl(path, width = 640) {
  if (typeof path !== 'string' || !path.startsWith('/api/')) return null;
  const url = new URL(path.replace(/^\/api\//, '/internal/'), window.location.origin);
  url.searchParams.set('width', String(width));
  return `${url.pathname}${url.search}`;
}

function webglPreferredProviderMedia(provider) {
  return provider?.cover || provider?.gallery?.[0] || provider?.logo || null;
}

function webglExistingPlaceForProvider(provider) {
  const name = webglNormalizeProvider(provider?.displayName);
  const slug = webglNormalizeProvider(provider?.slug);
  if (name === 'izc' || slug === 'izc') return 'izc';
  if (name.includes('gentle stitch') || slug.includes('gentle-stitch')) return 'stitch';
  return null;
}

function webglProviderKicker(provider) {
  return [provider?.locationLabel, provider?.specialty].filter(Boolean).join(' · ') || 'Taller asociado';
}

function webglProviderCaption(provider) {
  return provider?.tagline || provider?.craftDescription || provider?.story || 'Piezas creadas con oficio y seleccionadas por Atelier Lumière.';
}

function webglUpdateExistingProvider(place, provider) {
  const config = webglInteractionPlaces[place];
  if (!config) return;
  config.title = provider.displayName || config.title;
  config.kicker = webglProviderKicker(provider);
  config.detail = provider.acceptsCustomRequests ? 'Encargos disponibles' : 'Taller asociado';
  config.caption = webglProviderCaption(provider);
  webglProviderByPlace.set(place, provider);
  const button = document.querySelector(`[data-camera-place="${place}"] span`);
  if (button) button.textContent = config.title;
}

function webglSlugKey(slug, index) {
  const safe = webglNormalizeProvider(slug)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 34);
  return `provider-${safe || index + 1}`;
}

function webglProviderAccent(index) {
  const accents = [
    palette.wine,
    palette.linen,
    mix3(palette.roof, palette.wine, .28),
    mix3(palette.roof, palette.gold, .18),
    mix3(palette.linen, palette.wine, .16)
  ];
  return accents[index % accents.length];
}

function webglCreateDynamicBuilding(placeName, provider, slot, index) {
  const before = objects.length;
  building(slot.x, slot.z, slot.scale, webglProviderAccent(index), mix3(palette.paperDeep, palette.paperLight, .7));
  const height = atelierTerrainHeight(slot.x, slot.z);
  for (let cursor = before; cursor < objects.length; cursor++) objects[cursor].position[1] += height;

  const point = [slot.x, height + 1.45 * slot.scale, slot.z];
  const plot = [slot.x, height + .11, slot.z];
  const config = {
    point,
    plot,
    scale: [2.0 * slot.scale, .025, 1.8 * slot.scale],
    title: provider.displayName || 'Taller invitado',
    kicker: webglProviderKicker(provider),
    detail: provider.acceptsCustomRequests ? 'Encargos disponibles' : 'Taller asociado',
    caption: webglProviderCaption(provider),
    provider
  };
  webglDynamicProviderPlaces[placeName] = config;
  webglProviderByPlace.set(placeName, provider);
  places[placeName] = { target: [slot.x, height, slot.z], distance: 14.5 };

  const highlightColor = [palette.wine[0], palette.wine[1], palette.wine[2], 0];
  const highlight = {
    mesh: meshes.box,
    position: [...plot],
    scale: [...config.scale],
    color: highlightColor,
    rotation: 0,
    edges: false
  };
  objects.push(highlight);
  webglHighlightObjects.set(placeName, highlight);

  const nav = document.querySelector('.webgl-village-legend');
  if (nav) {
    nav.classList.add('has-dynamic-providers');
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.cameraPlace = placeName;
    button.innerHTML = `<b>${String(index + 4).padStart(2, '0')}</b><span></span>`;
    button.querySelector('span').textContent = config.title;
    button.addEventListener('click', () => webglFocusPlace(placeName));
    nav.append(button);
  }
}

function webglDynamicNearest(clientX, clientY, currentHit) {
  const threshold = window.innerWidth <= 760 ? 56 : window.innerWidth <= 1050 ? 68 : 76;
  let best = currentHit;
  let bestDistance = Infinity;
  if (currentHit?.screen) bestDistance = Math.hypot(clientX - currentHit.screen.x, clientY - currentHit.screen.y);

  for (const [name, config] of Object.entries(webglDynamicProviderPlaces)) {
    const screen = webglProjectPoint(config.point);
    if (!screen?.visible) continue;
    const distance = Math.hypot(clientX - screen.x, clientY - screen.y);
    if (distance < threshold && distance < bestDistance) {
      bestDistance = distance;
      best = { name, config, screen };
    }
  }
  return best;
}

const webglBaseNearestPlace = webglNearestPlace;
webglNearestPlace = function webglNearestPlaceWithProviders(clientX, clientY) {
  return webglDynamicNearest(clientX, clientY, webglBaseNearestPlace(clientX, clientY));
};

const webglBaseUpdateCaption = webglUpdateCaption;
webglUpdateCaption = function webglUpdateCaptionWithProviders(name) {
  const config = webglDynamicProviderPlaces[name];
  if (!config) {
    webglBaseUpdateCaption(name);
    return;
  }
  const caption = root?.querySelector('.webgl-village-caption');
  if (!caption) return;
  const kicker = caption.querySelector('p');
  const heading = caption.querySelector('h1');
  let context = caption.querySelector('[data-place-context]');
  if (!context) {
    context = document.createElement('span');
    context.dataset.placeContext = 'true';
    caption.append(context);
  }
  if (kicker) kicker.textContent = config.kicker;
  if (heading) heading.textContent = config.title;
  context.textContent = config.caption;
};

const webglBaseWatercolorOrigin = webglWatercolorOrigin;
webglWatercolorOrigin = function webglWatercolorOriginWithProviders(name) {
  const config = webglDynamicProviderPlaces[name];
  if (!config) return webglBaseWatercolorOrigin(name);
  return webglProjectPoint(config.point) || webglBaseWatercolorOrigin('overview');
};

function webglEnsureProviderCard() {
  if (webglProviderCard) return webglProviderCard;
  const card = document.createElement('aside');
  card.className = 'webgl-provider-card';
  card.hidden = true;
  card.setAttribute('aria-live', 'polite');
  card.innerHTML = `
    <div class="webgl-provider-media">
      <img data-provider-cover alt="">
      <span class="webgl-provider-logo" data-provider-logo-wrap hidden><img data-provider-logo alt=""></span>
    </div>
    <div class="webgl-provider-body">
      <p class="webgl-provider-kicker"></p>
      <h2></h2>
      <p class="webgl-provider-copy"></p>
      <div class="webgl-provider-signals"></div>
      <a class="webgl-provider-enter" href="#">Entrar al taller</a>
    </div>`;
  root?.append(card);
  webglProviderCard = card;
  return card;
}

function webglProviderSignal(container, text) {
  if (!text) return;
  const span = document.createElement('span');
  span.textContent = text;
  container.append(span);
}

function webglShowProviderCard(placeName) {
  const provider = webglProviderByPlace.get(placeName);
  if (!provider) {
    if (webglProviderCard) webglProviderCard.hidden = true;
    return;
  }
  const card = webglEnsureProviderCard();
  const media = webglPreferredProviderMedia(provider);
  const cover = card.querySelector('[data-provider-cover]');
  const coverUrl = webglProviderMediaUrl(media?.path, 640);
  if (coverUrl) {
    cover.src = coverUrl;
    cover.alt = media?.altText || `Taller ${provider.displayName || 'artesano'}`;
  } else {
    cover.removeAttribute('src');
    cover.alt = '';
  }

  const logoWrap = card.querySelector('[data-provider-logo-wrap]');
  const logo = card.querySelector('[data-provider-logo]');
  const logoUrl = webglProviderMediaUrl(provider.logo?.path, 320);
  if (logoUrl) {
    logo.src = logoUrl;
    logo.alt = `Logotipo de ${provider.displayName || 'taller'}`;
    logoWrap.hidden = false;
  } else {
    logoWrap.hidden = true;
  }

  card.querySelector('.webgl-provider-kicker').textContent = webglProviderKicker(provider);
  card.querySelector('h2').textContent = provider.displayName || 'Taller invitado';
  card.querySelector('.webgl-provider-copy').textContent = webglProviderCaption(provider);
  const signals = card.querySelector('.webgl-provider-signals');
  signals.replaceChildren();
  if (Number.isFinite(provider.publishedProductCount)) {
    webglProviderSignal(signals, `${provider.publishedProductCount} ${provider.publishedProductCount === 1 ? 'pieza' : 'piezas'}`);
  }
  if (provider.acceptsCustomRequests) webglProviderSignal(signals, 'Encargos disponibles');
  const material = Array.isArray(provider.materials) ? provider.materials.find(Boolean) : null;
  if (material) webglProviderSignal(signals, material);

  const enter = card.querySelector('.webgl-provider-enter');
  enter.href = provider.slug ? `/taller/?slug=${encodeURIComponent(provider.slug)}` : '/talleres/';
  card.hidden = false;
  card.classList.add('is-entering');
  requestAnimationFrame(() => requestAnimationFrame(() => card.classList.remove('is-entering')));
}

const webglProviderBaseFocusPlace = webglFocusPlace;
webglFocusPlace = function webglFocusPlaceWithProviderCard(name) {
  webglProviderBaseFocusPlace(name);
  webglShowProviderCard(name);
  const provider = webglProviderByPlace.get(name);
  if (provider && status) status.textContent = `${provider.displayName || 'Taller'} · identidad pública cargada`;
};

const webglProviderBaseFocusOverview = webglFocusOverview;
webglFocusOverview = function webglFocusOverviewWithProviderCard() {
  webglProviderBaseFocusOverview();
  if (webglProviderCard) webglProviderCard.hidden = true;
};

async function webglLoadProviders() {
  try {
    const response = await fetch('/internal/catalog/providers', { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('catalog');
    const payload = await response.json().catch(() => ({}));
    const providers = Array.isArray(payload.providers) ? payload.providers : [];

    const remaining = [];
    for (const provider of providers) {
      const place = webglExistingPlaceForProvider(provider);
      if (place) webglUpdateExistingProvider(place, provider);
      else remaining.push(provider);
    }

    remaining.slice(0, webglProviderSlots.length).forEach((provider, index) => {
      const name = webglSlugKey(provider.slug, index);
      webglCreateDynamicBuilding(name, provider, webglProviderSlots[index], index);
    });

    if (root) root.dataset.webglProviders = String(providers.length);
    if (status) status.textContent = providers.length
      ? `${providers.length} ${providers.length === 1 ? 'taller publicado' : 'talleres publicados'} · WebGL conectado`
      : 'Pueblo WebGL · catálogo sin talleres publicados';
  } catch {
    if (status) status.textContent = 'Pueblo WebGL · usando identidad local de laboratorio';
  }
}

void webglLoadProviders();
if (root) root.dataset.webglPhase = 'p8.2d';
const webglProvidersPhaseLabel = document.querySelector('.webgl-village-heading > span');
if (webglProvidersPhaseLabel) webglProvidersPhaseLabel.textContent = 'Laboratorio P8.2D · talleres reales en WebGL';

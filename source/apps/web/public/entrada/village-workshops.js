const VILLAGE_PROVIDER_MATCHERS = Object.freeze({
  izc: (provider) => normalizeVillageName(provider.displayName) === "izc" || normalizeVillageName(provider.slug) === "izc",
  stitch: (provider) => normalizeVillageName(provider.displayName).includes("gentle stitch") || normalizeVillageName(provider.slug).includes("gentle-stitch")
});

const VILLAGE_DYNAMIC_PARCELS = Object.freeze([
  { x: 884, y: 420, house: ".house--4" },
  { x: 1624, y: 450, house: ".house--6" },
  { x: 2234, y: 500, house: ".house--8" },
  { x: 744, y: 785, house: ".house--11" },
  { x: 1494, y: 755, house: ".house--13" },
  { x: 2004, y: 785, house: ".house--15" },
  { x: 854, y: 1150, house: ".house--18" },
  { x: 1464, y: 1150, house: ".house--20" },
  { x: 1934, y: 1200, house: ".house--22" },
  { x: 2154, y: 1290, house: ".house--23" },
  { x: 234, y: 380, house: ".house--1" },
  { x: 1434, y: 340, house: ".house--5" }
]);

const VILLAGE_REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)");
const wiredEntryHits = new WeakSet();
let villageProvidersPromise = null;
let villageProviderByPlace = new Map();
let villageLeaving = false;
let villageWorkshopPanel = null;

function ensureVillageWorkshopStyles() {
  if (document.head.querySelector('link[href="/entrada/village-workshops.css"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/entrada/village-workshops.css";
  document.head.append(link);
}

function normalizeVillageName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .trim();
}

function villagePlaceSlug(value) {
  const normalized = normalizeVillageName(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return normalized ? `provider-${normalized}` : "";
}

function villageInitials(value) {
  const parts = String(value || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "AL";
  if (parts.length === 1) return parts[0].slice(0, 3).toLocaleUpperCase("es");
  return `${parts[0][0]}${parts.at(-1)[0]}`.toLocaleUpperCase("es");
}

function villageMediaUrl(path, width = 640) {
  if (typeof path !== "string" || !path.startsWith("/api/")) return null;
  const internal = path.replace(/^\/api\//, "/internal/");
  const url = new URL(internal, window.location.origin);
  url.searchParams.set("width", String(width));
  return `${url.pathname}${url.search}`;
}

function preferredVillageMedia(provider) {
  return provider?.cover || provider?.gallery?.[0] || provider?.logo || null;
}

function fixedVillageProviders(providers) {
  const result = new Map();
  for (const [place, matcher] of Object.entries(VILLAGE_PROVIDER_MATCHERS)) {
    const provider = providers.find((item) => matcher(item));
    if (provider) result.set(place, provider);
  }
  return result;
}

function assignVillageProviders(providers) {
  const result = fixedVillageProviders(providers);
  const usedSlugs = new Set([...result.values()].map((provider) => provider.slug).filter(Boolean));
  const remaining = providers
    .filter((provider) => provider?.slug && !usedSlugs.has(provider.slug))
    .sort((left, right) => String(left.slug).localeCompare(String(right.slug), "es"));

  remaining.slice(0, VILLAGE_DYNAMIC_PARCELS.length).forEach((provider, index) => {
    const place = villagePlaceSlug(provider.slug);
    if (place) result.set(place, provider);
  });
  return result;
}

async function requestVillageProviders() {
  if (villageProvidersPromise) return villageProvidersPromise;
  villageProvidersPromise = fetch("/internal/catalog/providers", {
    headers: { Accept: "application/json" }
  })
    .then(async (response) => {
      if (!response.ok) return [];
      const payload = await response.json().catch(() => ({}));
      return Array.isArray(payload.providers) ? payload.providers : [];
    })
    .catch(() => []);
  return villageProvidersPromise;
}

function addBrandBadge(place, provider) {
  const landmark = document.querySelector(`[data-place="${place}"]`);
  if (!landmark) return;
  landmark.dataset.providerSlug = provider?.slug || "";
  if (!provider?.logo?.path || landmark.querySelector(".landmark-brand-badge")) return;
  const source = villageMediaUrl(provider.logo.path, 320);
  if (!source) return;
  const badge = document.createElement("span");
  badge.className = "landmark-brand-badge";
  const image = document.createElement("img");
  image.src = source;
  image.alt = "";
  image.loading = "lazy";
  image.decoding = "async";
  badge.append(image);
  landmark.append(badge);
}

function makeProviderPanel() {
  const panel = document.createElement("aside");
  panel.className = "village-workshop-card";
  panel.hidden = true;
  panel.setAttribute("aria-live", "polite");
  panel.innerHTML = `
    <div class="village-workshop-card-media">
      <img class="village-workshop-card-cover" alt="">
      <span class="village-workshop-card-logo" hidden><img alt=""></span>
    </div>
    <div class="village-workshop-card-body">
      <p class="village-workshop-card-kicker"></p>
      <h2></h2>
      <p class="village-workshop-card-copy"></p>
      <div class="village-workshop-card-signals"></div>
      <div class="village-workshop-card-foot">
        <span>Identidad pública del taller</span>
        <button type="button" class="village-workshop-enter" data-village-workshop-enter>Entrar al taller</button>
      </div>
    </div>`;
  panel.querySelector("[data-village-workshop-enter]")?.addEventListener("click", () => {
    const place = panel.dataset.place || "";
    if (place) void enterVillagePlace(place);
  });
  document.querySelector("[data-village-experience]")?.append(panel);
  return panel;
}

function panelSignal(container, text) {
  if (!text) return;
  const span = document.createElement("span");
  span.textContent = text;
  container.append(span);
}

function renderProviderPanel(panel, provider, place) {
  const media = preferredVillageMedia(provider);
  const cover = panel.querySelector(".village-workshop-card-cover");
  const coverSource = villageMediaUrl(media?.path, 640);
  if (coverSource) {
    cover.src = coverSource;
    cover.alt = media?.altText || `Taller ${provider.displayName || "artesano"}`;
  } else {
    cover.removeAttribute("src");
    cover.alt = "";
  }

  const logoWrap = panel.querySelector(".village-workshop-card-logo");
  const logo = logoWrap.querySelector("img");
  const logoSource = villageMediaUrl(provider.logo?.path, 320);
  if (logoSource) {
    logo.src = logoSource;
    logo.alt = `Logotipo de ${provider.displayName || "taller"}`;
    logoWrap.hidden = false;
  } else {
    logoWrap.hidden = true;
  }

  const kicker = panel.querySelector(".village-workshop-card-kicker");
  kicker.textContent = [provider.locationLabel, provider.specialty].filter(Boolean).join(" · ") || "Taller asociado";
  panel.querySelector("h2").textContent = provider.displayName || "Taller invitado";
  panel.querySelector(".village-workshop-card-copy").textContent = provider.tagline || provider.craftDescription || provider.story || "Piezas creadas con oficio y seleccionadas por Atelier Lumière.";

  const signals = panel.querySelector(".village-workshop-card-signals");
  signals.replaceChildren();
  if (Number.isFinite(provider.publishedProductCount)) {
    panelSignal(signals, `${provider.publishedProductCount} ${provider.publishedProductCount === 1 ? "pieza" : "piezas"}`);
  }
  if (provider.acceptsCustomRequests) panelSignal(signals, "Encargos disponibles");
  const material = Array.isArray(provider.materials) ? provider.materials.find(Boolean) : null;
  if (material) panelSignal(signals, material);

  panel.dataset.place = place;
  panel.hidden = false;
  panel.classList.add("is-entering");
  requestAnimationFrame(() => requestAnimationFrame(() => panel.classList.remove("is-entering")));
}

function hideProviderPanel(panel) {
  panel.hidden = true;
  delete panel.dataset.place;
}

function ensureVillageExitLayer() {
  let layer = document.querySelector("[data-village-exit-layer]");
  if (layer) return layer;
  layer = document.createElement("div");
  layer.className = "village-exit-layer";
  layer.hidden = true;
  layer.dataset.villageExitLayer = "true";
  layer.setAttribute("aria-live", "polite");
  layer.innerHTML = `
    <span class="village-exit-mark" aria-hidden="true">AL</span>
    <p>Entrando en</p>
    <strong></strong>`;
  document.querySelector("[data-village-experience]")?.append(layer);
  return layer;
}

function destinationLabel(place, provider) {
  if (place === "atelier") return "Atelier Lumière";
  return provider?.displayName || "el taller";
}

async function destinationForPlace(place) {
  if (place === "atelier") return { href: "/", label: "Atelier Lumière" };
  let provider = villageProviderByPlace.get(place);
  if (!provider) {
    const providers = await requestVillageProviders();
    villageProviderByPlace = assignVillageProviders(providers);
    provider = villageProviderByPlace.get(place);
  }
  if (!provider?.slug) return null;
  return {
    href: `/taller/?slug=${encodeURIComponent(provider.slug)}`,
    label: destinationLabel(place, provider)
  };
}

async function enterVillagePlace(place) {
  if (villageLeaving || !place || place === "overview") return;
  const destination = await destinationForPlace(place);
  if (!destination) return;

  villageLeaving = true;
  const experience = document.querySelector("[data-village-experience]");
  const landmark = document.querySelector(`[data-place="${place}"]`);
  const layer = ensureVillageExitLayer();
  const label = layer.querySelector("strong");
  if (label) label.textContent = destination.label;

  experience?.setAttribute("aria-busy", "true");
  experience?.setAttribute("data-village-leaving", place);
  landmark?.classList.add("is-village-exit-target");
  if (villageWorkshopPanel) hideProviderPanel(villageWorkshopPanel);
  layer.hidden = false;

  requestAnimationFrame(() => requestAnimationFrame(() => layer.classList.add("is-visible")));
  const delay = VILLAGE_REDUCED_MOTION.matches ? 60 : 880;
  window.setTimeout(() => window.location.assign(destination.href), delay);
}

function wireVillageEntryInteractions() {
  for (const hit of document.querySelectorAll(".landmark-hit[data-focus-place]")) {
    if (wiredEntryHits.has(hit)) continue;
    wiredEntryHits.add(hit);
    hit.addEventListener("click", () => {
      const place = hit.dataset.focusPlace;
      if (place && place !== "overview") void enterVillagePlace(place);
    });
  }
}

function dynamicParcelForIndex(index) {
  return VILLAGE_DYNAMIC_PARCELS[index] || null;
}

function createDynamicLandmark(place, provider, index) {
  const parcel = dynamicParcelForIndex(index);
  const world = document.querySelector("[data-village-world]");
  if (!parcel || !world || document.querySelector(`[data-place="${place}"]`)) return;

  const displayName = provider.displayName || "Taller invitado";
  const specialty = provider.specialty || "Oficio artesanal";
  const location = provider.locationLabel || "Taller asociado";
  const landmark = document.createElement("section");
  landmark.className = "village-landmark village-landmark--dynamic";
  landmark.dataset.place = place;
  landmark.dataset.providerSlug = provider.slug || "";
  landmark.style.setProperty("--x", String(parcel.x));
  landmark.style.setProperty("--y", String(parcel.y));
  landmark.style.setProperty("--scale", ".82");
  landmark.innerHTML = `
    <button class="landmark-hit" type="button" data-focus-place="${place}" aria-label="Entrar en el taller ${displayName}"></button>
    <div class="landmark-building landmark-building--workshop landmark-building--dynamic">
      <span class="awning"><i></i><i></i><i></i><i></i><i></i></span>
      <span class="shop-sign"><strong>${villageInitials(displayName)}</strong><small></small></span>
      <span class="shop-window shop-window--generic"><i></i><i></i><i></i></span>
      <span class="shop-door"></span>
    </div>
    <div class="landmark-copy">
      <small></small>
      <strong></strong>
      <span>Taller asociado</span>
    </div>`;
  landmark.querySelector(".shop-sign small").textContent = specialty;
  landmark.querySelector(".landmark-copy small").textContent = [location, specialty].filter(Boolean).join(" · ");
  landmark.querySelector(".landmark-copy strong").textContent = displayName;
  world.append(landmark);

  document.querySelector(parcel.house)?.classList.add("is-village-parcel-occupied");
  window.AtelierVillage?.registerPlace(place, {
    x: parcel.x,
    y: parcel.y,
    desktopScale: 1.08,
    mobileScale: .82
  }, `${displayName}, ${specialty}`);
  landmark.querySelector(".landmark-hit")?.addEventListener("click", () => window.AtelierVillage?.focusPlace(place));
  addBrandBadge(place, provider);
}

function createDynamicNavigation(place, provider, index) {
  const navigation = document.querySelector(".village-navigation");
  if (!navigation || navigation.querySelector(`[data-focus-place="${place}"]`)) return;
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.focusPlace = place;
  button.innerHTML = `<span></span><strong></strong><small></small>`;
  button.querySelector("span").textContent = String(index + 4).padStart(2, "0");
  button.querySelector("strong").textContent = provider.displayName || "Taller";
  button.querySelector("small").textContent = provider.specialty || provider.locationLabel || "Taller asociado";
  button.addEventListener("click", () => window.AtelierVillage?.focusPlace(place));
  navigation.append(button);
  navigation.classList.add("has-dynamic-workshops");
}

function createDynamicVillageWorkshops() {
  const fixedPlaces = new Set(["izc", "stitch"]);
  const dynamicEntries = [...villageProviderByPlace.entries()].filter(([place]) => !fixedPlaces.has(place));
  dynamicEntries.forEach(([place, provider], index) => {
    createDynamicLandmark(place, provider, index);
    createDynamicNavigation(place, provider, index);
  });
  wireVillageEntryInteractions();
  window.AtelierVillage?.refreshNavigationAccessibility();
}

async function loadVillageWorkshopIdentity() {
  ensureVillageWorkshopStyles();
  wireVillageEntryInteractions();
  const note = document.querySelector(".village-lab-note");
  if (note) note.textContent = "Laboratorio E5 · talleres dinámicos y parcelas · Home intacta";

  const providers = await requestVillageProviders();
  villageProviderByPlace = assignVillageProviders(providers);

  createDynamicVillageWorkshops();
  for (const [place, provider] of villageProviderByPlace) addBrandBadge(place, provider);
  if (villageProviderByPlace.size === 0) return;

  villageWorkshopPanel = makeProviderPanel();
  const showPlace = (place) => {
    const provider = villageProviderByPlace.get(place);
    if (provider) renderProviderPanel(villageWorkshopPanel, provider, place);
    else hideProviderPanel(villageWorkshopPanel);
  };

  window.addEventListener("atelier:village-selection", (event) => showPlace(event.detail?.place));
  document.querySelector("[data-village-overview]")?.addEventListener("click", () => hideProviderPanel(villageWorkshopPanel));
  document.querySelector("[data-village-viewport]")?.addEventListener("pointerdown", (event) => {
    if (!event.target.closest("button")) hideProviderPanel(villageWorkshopPanel);
  });
}

void loadVillageWorkshopIdentity();

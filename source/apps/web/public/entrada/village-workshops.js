const VILLAGE_PROVIDER_MATCHERS = Object.freeze({
  izc: (provider) => normalizeVillageName(provider.displayName) === "izc" || normalizeVillageName(provider.slug) === "izc",
  stitch: (provider) => normalizeVillageName(provider.displayName).includes("gentle stitch") || normalizeVillageName(provider.slug).includes("gentle-stitch")
});

const VILLAGE_REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)");
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

function matchVillageProviders(providers) {
  const result = new Map();
  for (const [place, matcher] of Object.entries(VILLAGE_PROVIDER_MATCHERS)) {
    const provider = providers.find((item) => matcher(item));
    if (provider) result.set(place, provider);
  }
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
  if (place === "atelier") {
    return { href: "/", label: "Atelier Lumière" };
  }
  let provider = villageProviderByPlace.get(place);
  if (!provider) {
    const providers = await requestVillageProviders();
    villageProviderByPlace = matchVillageProviders(providers);
    provider = villageProviderByPlace.get(place);
  }
  if (!provider?.slug) return null;
  return {
    href: `/taller/?slug=${encodeURIComponent(provider.slug)}`,
    label: destinationLabel(place, provider)
  };
}

async function enterVillagePlace(place) {
  if (villageLeaving || !["atelier", "izc", "stitch"].includes(place)) return;
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
    hit.addEventListener("click", () => {
      const place = hit.dataset.focusPlace;
      if (place && place !== "overview") void enterVillagePlace(place);
    });
  }
}

async function loadVillageWorkshopIdentity() {
  ensureVillageWorkshopStyles();
  wireVillageEntryInteractions();
  const note = document.querySelector(".village-lab-note");
  if (note) note.textContent = "Laboratorio E3 · transición y acceso real · Home intacta";

  const providers = await requestVillageProviders();
  villageProviderByPlace = matchVillageProviders(providers);

  for (const [place, provider] of villageProviderByPlace) addBrandBadge(place, provider);
  if (villageProviderByPlace.size === 0) return;

  villageWorkshopPanel = makeProviderPanel();
  const showPlace = (place) => {
    const provider = villageProviderByPlace.get(place);
    if (provider) renderProviderPanel(villageWorkshopPanel, provider, place);
    else hideProviderPanel(villageWorkshopPanel);
  };

  for (const button of document.querySelectorAll("[data-focus-place]")) {
    button.addEventListener("click", () => showPlace(button.dataset.focusPlace));
  }
  document.querySelector("[data-village-overview]")?.addEventListener("click", () => hideProviderPanel(villageWorkshopPanel));
  document.querySelector("[data-village-viewport]")?.addEventListener("pointerdown", (event) => {
    if (!event.target.closest("button")) hideProviderPanel(villageWorkshopPanel);
  });
}

void loadVillageWorkshopIdentity();

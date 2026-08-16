const VILLAGE_PROVIDER_MATCHERS = Object.freeze({
  izc: (provider) => normalizeVillageName(provider.displayName) === "izc" || normalizeVillageName(provider.slug) === "izc",
  stitch: (provider) => normalizeVillageName(provider.displayName).includes("gentle stitch") || normalizeVillageName(provider.slug).includes("gentle-stitch")
});

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

function addBrandBadge(place, provider) {
  const landmark = document.querySelector(`[data-place="${place}"]`);
  if (!landmark || !provider?.logo?.path || landmark.querySelector(".landmark-brand-badge")) return;
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
  landmark.dataset.providerSlug = provider.slug || "";
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
      <div class="village-workshop-card-foot"><span>Identidad pública del taller</span><strong>Acceso en E3</strong></div>
    </div>`;
  document.querySelector("[data-village-experience]")?.append(panel);
  return panel;
}

function panelSignal(container, text) {
  if (!text) return;
  const span = document.createElement("span");
  span.textContent = text;
  container.append(span);
}

function renderProviderPanel(panel, provider) {
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

  panel.hidden = false;
  panel.classList.add("is-entering");
  requestAnimationFrame(() => requestAnimationFrame(() => panel.classList.remove("is-entering")));
}

function hideProviderPanel(panel) {
  panel.hidden = true;
}

async function loadVillageWorkshopIdentity() {
  ensureVillageWorkshopStyles();
  const response = await fetch("/internal/catalog/providers", {
    headers: { Accept: "application/json" }
  }).catch(() => null);
  if (!response?.ok) return;
  const payload = await response.json().catch(() => ({}));
  const providers = Array.isArray(payload.providers) ? payload.providers : [];
  const providerByPlace = matchVillageProviders(providers);
  if (providerByPlace.size === 0) return;

  for (const [place, provider] of providerByPlace) addBrandBadge(place, provider);

  const panel = makeProviderPanel();
  const showPlace = (place) => {
    const provider = providerByPlace.get(place);
    if (provider) renderProviderPanel(panel, provider);
    else hideProviderPanel(panel);
  };

  for (const button of document.querySelectorAll("[data-focus-place]")) {
    button.addEventListener("click", () => showPlace(button.dataset.focusPlace));
  }
  document.querySelector("[data-village-overview]")?.addEventListener("click", () => hideProviderPanel(panel));
  document.querySelector("[data-village-viewport]")?.addEventListener("pointerdown", (event) => {
    if (!event.target.closest("button")) hideProviderPanel(panel);
  });
}

void loadVillageWorkshopIdentity();

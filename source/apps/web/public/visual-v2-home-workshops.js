/* Atelier Lumière · Visual V2 · Fase 3.1B
 * Añade la identidad visual del taller a las tarjetas ya renderizadas por home.js.
 * No modifica catálogo, rutas ni datos: solo reutiliza provider.logo.
 */

function v2WorkshopInitials(value) {
  const parts = String(value || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "AL";
  if (parts.length === 1) return parts[0].slice(0, 2).toLocaleUpperCase("es");
  return `${parts[0][0]}${parts.at(-1)[0]}`.toLocaleUpperCase("es");
}

function v2ProviderMap(products) {
  const providers = new Map();
  for (const product of products) {
    const provider = product?.provider;
    if (!provider?.slug || providers.has(provider.slug)) continue;
    providers.set(provider.slug, provider);
  }
  return providers;
}

function v2CardSlug(card) {
  const link = card.querySelector("a.workshop-card-link[href]");
  if (!link) return "";
  try {
    const url = new URL(link.href, window.location.href);
    return url.searchParams.get("slug") || "";
  } catch {
    return "";
  }
}

function v2CreateBrandMark(provider) {
  const mark = document.createElement("span");
  mark.className = "workshop-brand-mark";
  mark.setAttribute("aria-hidden", "true");

  const image = document.createElement("img");
  image.className = "workshop-brand-logo";
  const configured = provider?.logo?.path && window.AtelierImages?.configure?.(image, {
    path: provider.logo.path,
    alt: "",
    width: provider.logo.width,
    height: provider.logo.height,
    sizes: "126px",
    loading: "lazy",
    priority: "low",
    defaultWidth: 320
  });

  if (configured) {
    mark.append(image);
    return mark;
  }

  const fallback = document.createElement("span");
  fallback.className = "workshop-brand-fallback";
  fallback.textContent = v2WorkshopInitials(provider?.displayName || "Atelier Lumière");
  mark.append(fallback);
  return mark;
}

function v2ApplyWorkshopBranding(providers) {
  const cards = [...document.querySelectorAll("#atelier-grid .workshop-card")];
  if (cards.length === 0) return false;

  for (const card of cards) {
    const media = card.querySelector(".workshop-card-media");
    if (!media || media.querySelector(".workshop-brand-mark")) continue;
    const provider = providers.get(v2CardSlug(card));
    if (!provider) continue;
    media.append(v2CreateBrandMark(provider));
  }
  return true;
}

async function v2LoadWorkshopBranding() {
  const grid = document.getElementById("atelier-grid");
  if (!grid) return;

  const response = await fetch("/internal/catalog/products", {
    headers: { Accept: "application/json" }
  }).catch(() => null);
  if (!response?.ok) return;
  const payload = await response.json().catch(() => ({}));
  const products = Array.isArray(payload.products) ? payload.products : [];
  const providers = v2ProviderMap(products);
  if (providers.size === 0) return;

  if (v2ApplyWorkshopBranding(providers)) return;

  const observer = new MutationObserver(() => {
    if (!v2ApplyWorkshopBranding(providers)) return;
    observer.disconnect();
  });
  observer.observe(grid, { childList: true });
}

void v2LoadWorkshopBranding();

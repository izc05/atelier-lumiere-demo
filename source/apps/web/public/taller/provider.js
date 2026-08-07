let providerProducts = [];
let searchTimer = null;

function byId(id) { return document.getElementById(id); }
function node(tag, className, text) {
  const value = document.createElement(tag);
  if (className) value.className = className;
  if (text !== undefined) value.textContent = text;
  return value;
}
function money(cents, currency = "EUR") {
  if (!Number.isInteger(cents)) return "Consultar";
  return new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(cents / 100);
}
function providerSlug() {
  const value = new URLSearchParams(window.location.search).get("slug") ?? "";
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) ? value : null;
}
async function requestCatalog() {
  const response = await fetch("/internal/catalog/products", { headers: { Accept: "application/json" } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || "No se pudo abrir el catálogo.");
  return Array.isArray(payload.products) ? payload.products : [];
}
function initials(value) {
  const parts = String(value || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "AL";
  if (parts.length === 1) return parts[0].slice(0, 2).toLocaleUpperCase("es");
  return `${parts[0][0]}${parts.at(-1)[0]}`.toLocaleUpperCase("es");
}
function framingPercent(value, fallback = 50) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(100, Math.max(0, parsed));
}
function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}
function coverGeometry(containerWidth, containerHeight, sourceWidth, sourceHeight, focalX, focalY) {
  if (![containerWidth, containerHeight, sourceWidth, sourceHeight].every((value) => Number.isFinite(value) && value > 0)) {
    return null;
  }
  const scale = Math.max(containerWidth / sourceWidth, containerHeight / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  const desiredLeft = (containerWidth / 2) - (width * focalX / 100);
  const desiredTop = (containerHeight / 2) - (height * focalY / 100);
  return {
    width,
    height,
    left: clamp(desiredLeft, containerWidth - width, 0),
    top: clamp(desiredTop, containerHeight - height, 0)
  };
}
function applyCoverFraming(image, visual, cover) {
  const focalX = framingPercent(cover?.focalX);
  const focalY = framingPercent(cover?.focalY);
  visual.style.setProperty("position", "relative", "important");
  visual.style.setProperty("overflow", "hidden", "important");
  image.style.setProperty("display", "block", "important");
  image.style.setProperty("max-width", "none", "important");
  image.style.setProperty("max-height", "none", "important");

  const render = () => {
    if (!visual.isConnected) return;
    const sourceWidth = image.naturalWidth || Number(cover?.width);
    const sourceHeight = image.naturalHeight || Number(cover?.height);
    const geometry = coverGeometry(visual.clientWidth, visual.clientHeight, sourceWidth, sourceHeight, focalX, focalY);
    if (!geometry) return;
    image.style.setProperty("position", "absolute", "important");
    image.style.setProperty("width", `${geometry.width}px`, "important");
    image.style.setProperty("height", `${geometry.height}px`, "important");
    image.style.setProperty("left", `${geometry.left}px`, "important");
    image.style.setProperty("top", `${geometry.top}px`, "important");
    image.style.setProperty("object-fit", "fill", "important");
    image.style.setProperty("object-position", "50% 50%", "important");
  };

  image.addEventListener("load", render, { once: true });
  if (image.complete && image.naturalWidth > 0) queueMicrotask(render);
  if (typeof ResizeObserver === "function") {
    const observer = new ResizeObserver(() => {
      if (!visual.isConnected) {
        observer.disconnect();
        return;
      }
      render();
    });
    observer.observe(visual);
  }
}
function productCard(product) {
  const article = node("article", "product-card");
  const visual = node("div", "product-image", "Pieza artesanal");
  if (product.cover?.path) {
    const image = document.createElement("img");
    window.AtelierImages.configure(image, {
      path: product.cover.path,
      alt: product.cover.altText || product.name,
      width: product.cover.width,
      height: product.cover.height,
      sizes: "(max-width: 700px) calc(100vw - 44px), (max-width: 980px) 50vw, 390px",
      loading: "lazy",
      priority: "low",
      defaultWidth: 640
    });
    visual.replaceChildren(image);
    applyCoverFraming(image, visual, product.cover);
  }
  const body = node("div", "product-body");
  body.append(node("span", "provider", product.category || "Pieza artesanal"));
  body.append(node("h2", "", product.name));
  body.append(node("p", "", product.shortDescription || "Pieza revisada por Atelier Lumière."));
  const tags = node("div", "tags");
  for (const event of (product.events ?? []).slice(0, 3)) {
    tags.append(node("span", "tag", event.replaceAll("-", " ")));
  }
  if (product.customizable) tags.append(node("span", "tag", "personalizable"));
  body.append(tags);
  const foot = node("div", "card-foot");
  foot.append(node("strong", "price", money(product.priceCents, product.currency)));
  const link = node("a", "button primary", "Ver pieza");
  link.href = `/tienda/articulo/?taller=${encodeURIComponent(product.provider.slug)}&articulo=${encodeURIComponent(product.slug)}`;
  foot.append(link);
  body.append(foot);
  article.append(visual, body);
  return article;
}
function renderProducts() {
  const query = byId("search-input").value.trim().toLocaleLowerCase("es");
  const visible = query ? providerProducts.filter((product) => [
    product.name,
    product.shortDescription,
    product.category,
    ...(product.events ?? [])
  ].filter(Boolean).some((value) => String(value).toLocaleLowerCase("es").includes(query))) : providerProducts;
  const view = byId("products-view");
  view.replaceChildren(...visible.map(productCard));
  if (visible.length === 0) view.append(node("p", "provider-empty", "No hay piezas que coincidan con esta búsqueda."));
}
function revealProviderSections() {
  for (const id of ["provider-hero", "provider-editorial", "collection", "provider-bespoke", "provider-footer-note"]) {
    byId(id).hidden = false;
  }
}
function hydrateProvider(provider) {
  const displayName = provider.displayName || "Taller invitado";
  const specialty = provider.specialty || "Piezas artesanales seleccionadas por Atelier Lumière.";
  const lead = provider.tagline || specialty;
  const categories = new Set(providerProducts.map((product) => product.category).filter(Boolean));
  const customizable = providerProducts.filter((product) => product.customizable).length;

  document.title = `${displayName} · Atelier Lumière`;
  byId("provider-name").textContent = displayName;
  byId("provider-specialty").textContent = lead;
  byId("provider-identity-name").textContent = displayName;
  byId("provider-monogram").textContent = initials(displayName);
  byId("provider-piece-count").textContent = String(providerProducts.length);
  byId("provider-category-count").textContent = String(categories.size || 1);
  byId("customizable-count").textContent = String(customizable);
  byId("collection-note").textContent = `${providerProducts.length} ${providerProducts.length === 1 ? "pieza publicada" : "piezas publicadas"} en esta edición del taller.`;

  if (provider.locationLabel) {
    byId("provider-location-signal").textContent = provider.locationLabel;
    byId("provider-location-signal").hidden = false;
  }
  if (provider.story) byId("provider-story").textContent = provider.story;
  if (provider.craftDescription) byId("provider-craft").textContent = provider.craftDescription;

  if (Array.isArray(provider.materials) && provider.materials.length > 0) {
    byId("provider-materials-title").textContent = "Materiales";
    byId("provider-materials-copy").textContent = provider.materials.join(" · ");
  }
  if (Array.isArray(provider.techniques) && provider.techniques.length > 0) {
    byId("provider-techniques-title").textContent = "Técnicas y oficio";
    byId("provider-techniques-copy").textContent = provider.techniques.join(" · ");
  }
  if (provider.acceptsCustomRequests) {
    byId("provider-bespoke-copy").textContent = "Este taller está abierto a encargos personalizados. Explora la colección y entra en la pieza más cercana a tu idea para consultar opciones y tiempos.";
  }
  if (provider.preparationNote) {
    byId("collection-note").textContent += ` ${provider.preparationNote}`;
  }
  if (provider.locationLabel) {
    byId("provider-footer-copy").textContent = `${displayName} · ${provider.locationLabel} · Selección Atelier Lumière`;
  }
}
async function load() {
  const slug = providerSlug();
  if (!slug) {
    byId("loading-view").hidden = true;
    byId("error-message").textContent = "El enlace del taller no es válido.";
    byId("error-view").hidden = false;
    return;
  }
  try {
    const products = await requestCatalog();
    providerProducts = products.filter((product) => product.provider?.slug === slug);
    if (providerProducts.length === 0) {
      byId("empty-view").hidden = false;
      return;
    }
    hydrateProvider(providerProducts[0].provider);
    revealProviderSections();
    renderProducts();
  } catch (error) {
    byId("error-message").textContent = error.message;
    byId("error-view").hidden = false;
  } finally {
    byId("loading-view").hidden = true;
  }
}

byId("search-input").addEventListener("input", () => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(renderProducts, 180);
});
window.AtelierCart.wireCount(byId("cart-count"));
void load();

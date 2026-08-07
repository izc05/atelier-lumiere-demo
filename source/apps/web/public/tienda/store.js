let products = [];
let searchTimer = null;

function byId(id) {
  return document.getElementById(id);
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function money(cents, currency = "EUR") {
  if (!Number.isInteger(cents)) return "Consultar";
  return new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(cents / 100);
}

async function requestJson(path) {
  const response = await fetch(path, { headers: { Accept: "application/json" } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || "No se pudo abrir el catálogo.");
  return payload;
}

function tag(value) {
  return element("span", "tag", value.replaceAll("-", " "));
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
  if (
    ![containerWidth, containerHeight, sourceWidth, sourceHeight].every((value) => Number.isFinite(value) && value > 0)
  ) return null;

  const scale = Math.max(containerWidth / sourceWidth, containerHeight / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  const desiredLeft = (containerWidth / 2) - (width * focalX / 100);
  const desiredTop = (containerHeight / 2) - (height * focalY / 100);
  const left = clamp(desiredLeft, containerWidth - width, 0);
  const top = clamp(desiredTop, containerHeight - height, 0);

  return { width, height, left, top };
}

function applyCoverFraming(image, visual, cover) {
  const focalX = framingPercent(cover?.focalX);
  const focalY = framingPercent(cover?.focalY);

  visual.style.setProperty("position", "relative", "important");
  visual.style.setProperty("overflow", "hidden", "important");
  visual.dataset.focalX = String(focalX);
  visual.dataset.focalY = String(focalY);

  image.style.setProperty("display", "block", "important");
  image.style.setProperty("max-width", "none", "important");
  image.style.setProperty("max-height", "none", "important");
  image.style.setProperty("object-fit", "cover", "important");
  image.style.setProperty("object-position", `${focalX}% ${focalY}%`, "important");

  const render = () => {
    if (!visual.isConnected) return;
    const sourceWidth = image.naturalWidth || Number(cover?.width);
    const sourceHeight = image.naturalHeight || Number(cover?.height);
    const geometry = coverGeometry(
      visual.clientWidth,
      visual.clientHeight,
      sourceWidth,
      sourceHeight,
      focalX,
      focalY
    );
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

function card(product) {
  const article = element("article", "product-card");
  const visual = element("div", "product-image", "Pieza artesanal");
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

  const body = element("div", "product-body");
  const providerLink = element("a", "provider provider-link", product.provider.displayName);
  providerLink.href = `/taller/?slug=${encodeURIComponent(product.provider.slug)}`;
  providerLink.setAttribute("aria-label", `Ver el taller ${product.provider.displayName}`);
  body.append(providerLink);
  body.append(element("h2", "", product.name));
  body.append(element("p", "", product.shortDescription || "Pieza artesanal revisada por Atelier Lumière."));
  const tags = element("div", "tags");
  if (product.category) tags.append(tag(product.category));
  for (const event of (product.events ?? []).slice(0, 3)) tags.append(tag(event));
  body.append(tags);

  const foot = element("div", "card-foot");
  foot.append(element("strong", "price", money(product.priceCents, product.currency)));
  const link = element("a", "button primary", "Ver pieza");
  link.href = `/tienda/articulo/?taller=${encodeURIComponent(product.provider.slug)}&articulo=${encodeURIComponent(product.slug)}`;
  foot.append(link);
  body.append(foot);
  article.append(visual, body);
  return article;
}

function render() {
  const view = byId("products-view");
  view.replaceChildren(...products.map(card));
  view.hidden = products.length === 0;
  byId("empty-view").hidden = products.length !== 0;
}

function updateCategories(items) {
  const select = byId("category-filter");
  const current = select.value;
  const categories = [...new Set(items.map((item) => item.category).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "es"));
  const defaultOption = element("option", "", "Todas las categorías");
  defaultOption.value = "";
  const options = categories.map((value) => {
    const option = element("option", "", value);
    option.value = value;
    return option;
  });
  select.replaceChildren(defaultOption, ...options);
  if (categories.includes(current)) select.value = current;
}

async function load({ refreshCategories = false } = {}) {
  byId("loading-view").hidden = false;
  byId("error-view").hidden = true;
  byId("empty-view").hidden = true;
  byId("products-view").hidden = true;
  try {
    const params = new URLSearchParams();
    const query = byId("search-input").value.trim();
    const category = byId("category-filter").value;
    const event = byId("event-filter").value;
    if (query) params.set("q", query);
    if (category) params.set("category", category);
    if (event) params.set("event", event);
    const suffix = params.toString() ? `?${params}` : "";
    const payload = await requestJson(`/internal/catalog/products${suffix}`);
    products = Array.isArray(payload.products) ? payload.products : [];
    if (refreshCategories) updateCategories(products);
    render();
  } catch (error) {
    byId("error-message").textContent = error.message;
    byId("error-view").hidden = false;
  } finally {
    byId("loading-view").hidden = true;
  }
}

byId("search-input").addEventListener("input", () => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => void load(), 280);
});
byId("category-filter").addEventListener("change", () => void load());
byId("event-filter").addEventListener("change", () => void load());
byId("retry-button").addEventListener("click", () => void load());
window.AtelierCart.wireCount(byId("cart-count"));

void load({ refreshCategories: true });

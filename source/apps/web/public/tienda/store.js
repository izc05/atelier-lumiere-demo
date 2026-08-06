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
    image.style.objectPosition = `${product.cover.focalX ?? 50}% ${product.cover.focalY ?? 50}%`;
    visual.replaceChildren(image);
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

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
  }
  const body = node("div", "product-body");
  body.append(node("span", "provider", product.category || "Pieza artesanal"));
  body.append(node("h2", "", product.name));
  body.append(node("p", "", product.shortDescription || "Pieza revisada por Atelier Lumière."));
  const tags = node("div", "tags");
  for (const event of (product.events ?? []).slice(0, 3)) {
    tags.append(node("span", "tag", event.replaceAll("-", " ")));
  }
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
    const provider = providerProducts[0].provider;
    document.title = `${provider.displayName} · Atelier Lumière`;
    byId("provider-name").textContent = provider.displayName;
    byId("provider-specialty").textContent = provider.specialty || "Piezas artesanales seleccionadas por Atelier Lumière.";
    byId("provider-hero").hidden = false;
    byId("collection").hidden = false;
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

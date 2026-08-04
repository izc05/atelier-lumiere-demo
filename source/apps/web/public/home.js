function byId(id) {
  return document.getElementById(id);
}

function node(tag, className, text) {
  const value = document.createElement(tag);
  if (className) value.className = className;
  if (text !== undefined) value.textContent = text;
  return value;
}

function money(cents, currency = "EUR") {
  if (!Number.isInteger(cents)) return "Consultar";
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency
  }).format(cents / 100);
}

function productCard(product) {
  const article = node("article", "product-card");
  const visual = node("div", "product-visual");

  if (product.cover?.path) {
    const image = document.createElement("img");
    window.AtelierImages.configure(image, {
      path: product.cover.path,
      alt: product.cover.altText || product.name || "Pieza artesanal",
      width: product.cover.width,
      height: product.cover.height,
      sizes: "(max-width: 760px) calc(100vw - 48px), (max-width: 1100px) 50vw, 360px",
      loading: "lazy",
      priority: "low",
      defaultWidth: 640
    });
    visual.append(image);
  }

  const provider = node(
    "span",
    "product-provider",
    product.provider?.displayName || "Taller invitado"
  );
  const title = node("h3", "", product.name || "Pieza artesanal");
  const meta = node("div", "product-meta");
  const price = node("strong", "", money(product.priceCents, product.currency));
  const link = node("a", "", "Ver pieza →");
  const providerSlug = encodeURIComponent(product.provider?.slug || "");
  const productSlug = encodeURIComponent(product.slug || "");
  link.href = `/tienda/articulo/?taller=${providerSlug}&articulo=${productSlug}`;
  link.setAttribute("aria-label", `Ver ${product.name || "pieza artesanal"}`);
  meta.append(price, link);
  article.append(visual, provider, title, meta);
  return article;
}

async function loadFeaturedProducts() {
  const loading = byId("featured-loading");
  const view = byId("featured-products");
  const empty = byId("featured-empty");

  try {
    const response = await fetch("/internal/catalog/products", {
      headers: { Accept: "application/json" }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || "Catálogo no disponible");

    const products = Array.isArray(payload.products) ? payload.products.slice(0, 3) : [];
    if (products.length === 0) {
      empty.hidden = false;
      return;
    }

    view.replaceChildren(...products.map(productCard));
    view.hidden = false;
  } catch {
    empty.hidden = false;
  } finally {
    loading.hidden = true;
  }
}

function setupCartCount() {
  const count = byId("cart-count");
  if (count && window.AtelierCart?.wireCount) {
    window.AtelierCart.wireCount(count);
  }
}

setupCartCount();
void loadFeaturedProducts();

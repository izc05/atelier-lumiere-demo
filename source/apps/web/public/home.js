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

function mediaPath(path) {
  return typeof path === "string" ? path.replace(/^\/api\//, "/internal/") : null;
}

function productCard(product) {
  const article = node("article", "product-card");
  const visual = node("div", "product-visual");
  const imagePath = mediaPath(product.cover?.path);

  if (imagePath) {
    const image = document.createElement("img");
    image.src = imagePath;
    image.alt = product.cover?.altText || product.name || "Pieza artesanal";
    image.loading = "lazy";
    image.decoding = "async";
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

function setupMenu() {
  const button = byId("menu-toggle");
  const menu = byId("mobile-nav");
  if (!button || !menu) return;

  function close() {
    button.setAttribute("aria-expanded", "false");
    button.textContent = "Menú";
    menu.hidden = true;
    document.body.classList.remove("menu-open");
  }

  button.addEventListener("click", () => {
    const open = button.getAttribute("aria-expanded") === "true";
    if (open) {
      close();
      return;
    }
    button.setAttribute("aria-expanded", "true");
    button.textContent = "Cerrar";
    menu.hidden = false;
    document.body.classList.add("menu-open");
  });

  menu.addEventListener("click", (event) => {
    if (event.target.closest("a")) close();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
  });
}

function setupCartCount() {
  const count = byId("cart-count");
  if (count && window.AtelierCart?.wireCount) {
    window.AtelierCart.wireCount(count);
  }
}

setupMenu();
setupCartCount();
void loadFeaturedProducts();

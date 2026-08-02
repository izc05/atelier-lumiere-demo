let product = null;

function byId(id) {
  return document.getElementById(id);
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function mediaPath(path) {
  return typeof path === "string" ? path.replace(/^\/api\//, "/internal/") : null;
}

function money(cents, currency = "EUR") {
  if (!Number.isInteger(cents)) return "Consultar";
  return new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(cents / 100);
}

function querySlugs() {
  const params = new URL(window.location.href).searchParams;
  const provider = params.get("taller")?.trim().toLowerCase() ?? "";
  const item = params.get("articulo")?.trim().toLowerCase() ?? "";
  const valid = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  return valid.test(provider) && valid.test(item) ? { provider, item } : null;
}

function preparationLabel() {
  if (!Number.isInteger(product.preparationMinDays) || !Number.isInteger(product.preparationMaxDays)) return "Consultar";
  return product.preparationMinDays === product.preparationMaxDays
    ? `${product.preparationMinDays} días`
    : `${product.preparationMinDays}–${product.preparationMaxDays} días`;
}

function stockLabel() {
  if (product.stockMode === "MADE_TO_ORDER") return "Fabricado bajo pedido";
  if (product.stockMode === "UNLIMITED") return "Disponible";
  return product.stockQuantity > 0 ? `${product.stockQuantity} unidades` : "Agotado";
}

async function requestJson(path) {
  const response = await fetch(path, { headers: { Accept: "application/json" } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || "No se pudo abrir el artículo.");
  return payload;
}

function showMedia(item) {
  const main = byId("main-media");
  if (item.kind === "VIDEO") {
    const video = document.createElement("video");
    video.src = mediaPath(item.path);
    video.controls = true;
    video.preload = "metadata";
    video.setAttribute("playsinline", "");
    main.replaceChildren(video);
    return;
  }
  const image = document.createElement("img");
  image.src = mediaPath(item.path);
  image.alt = item.altText || product.name;
  main.replaceChildren(image);
}

function renderGallery() {
  const media = Array.isArray(product.media) ? product.media : [];
  if (media.length === 0) {
    byId("main-media").replaceChildren(element("p", "copy", "La pieza todavía no tiene imágenes disponibles."));
    return;
  }
  showMedia(media[0]);
  const thumbs = media.map((item, index) => {
    const button = element("button", "thumb");
    button.type = "button";
    button.setAttribute("aria-label", item.kind === "VIDEO" ? "Ver vídeo" : `Ver imagen ${index + 1}`);
    if (item.kind === "IMAGE") {
      const image = document.createElement("img");
      image.src = mediaPath(item.path);
      image.alt = "";
      image.loading = "lazy";
      button.append(image);
    } else {
      button.append(element("span", "", "Vídeo"));
    }
    button.addEventListener("click", () => showMedia(item));
    return button;
  });
  byId("thumbs").replaceChildren(...thumbs);
}

function renderOptions() {
  const options = Array.isArray(product.personalizations) ? product.personalizations : [];
  const panel = byId("personalization-panel");
  panel.hidden = !product.customizable && options.length === 0;
  if (panel.hidden) return;
  const items = options.map((option) => {
    const wrapper = element("article", "option");
    wrapper.append(element("strong", "", `${option.name}${option.required ? " · obligatoria" : ""}`));
    const details = [];
    if (Array.isArray(option.choices) && option.choices.length > 0) details.push(option.choices.join(", "));
    if (option.priceDeltaCents > 0) details.push(`Suplemento ${money(option.priceDeltaCents, product.currency)}`);
    wrapper.append(element("small", "", details.join(" · ") || "Se concretará al realizar el encargo."));
    return wrapper;
  });
  byId("options-list").replaceChildren(...items);
  byId("personalization-notes").textContent = product.personalizationNotes || "Consulta con el taller las posibilidades disponibles.";
}

function render() {
  document.title = `${product.name} · Atelier Lumière`;
  byId("provider-name").textContent = product.provider.displayName;
  byId("product-name").textContent = product.name;
  byId("short-description").textContent = product.shortDescription || "Pieza artesanal revisada por Atelier Lumière.";
  byId("price-value").textContent = money(product.priceCents, product.currency);
  byId("preparation-value").textContent = preparationLabel();
  byId("stock-value").textContent = stockLabel();
  byId("category-value").textContent = product.category || "Artesanía";
  byId("story-value").textContent = product.story || "El taller no ha añadido todavía la historia de esta pieza.";
  byId("shipping-value").textContent = product.shippingNotes || "Las condiciones se confirmarán antes del pedido.";
  byId("events-list").replaceChildren(...(product.events ?? []).map((value) => element("span", "tag", value.replaceAll("-", " "))));
  renderGallery();
  renderOptions();
}

async function load() {
  const slugs = querySlugs();
  if (!slugs) {
    byId("loading-view").hidden = true;
    byId("error-message").textContent = "El enlace del artículo no es válido.";
    byId("error-view").hidden = false;
    return;
  }
  try {
    const payload = await requestJson(`/internal/catalog/products/${encodeURIComponent(slugs.provider)}/${encodeURIComponent(slugs.item)}`);
    product = payload.product;
    render();
    byId("loading-view").hidden = true;
    byId("detail-view").hidden = false;
  } catch (error) {
    byId("loading-view").hidden = true;
    byId("error-message").textContent = error.message;
    byId("error-view").hidden = false;
  }
}

void load();

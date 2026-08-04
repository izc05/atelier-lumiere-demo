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

function money(cents, currency = "EUR") {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(Number(cents) / 100);
}

function mediaUrl(path) {
  return window.AtelierImages.mediaUrl(path);
}

function safeMessage(node, text, type = "") {
  node.textContent = text;
  node.className = `message${type ? ` ${type}` : ""}`;
}

function stockLabel(item) {
  if (item.stockMode === "UNLIMITED") return "Disponible";
  if (item.stockMode === "MADE_TO_ORDER") return "Bajo pedido";
  return `${item.stockQuantity ?? 0} unidades`;
}

function optionDescription(item) {
  const parts = [item.required ? "Obligatoria" : "Opcional"];
  if (item.priceDeltaCents > 0) parts.push(`+ ${money(item.priceDeltaCents, product.currency)}`);
  if (Array.isArray(item.choices) && item.choices.length) parts.push(item.choices.join(" · "));
  return parts.join(" · ");
}

function optionNode(item) {
  const row = element("article", "option-item");
  row.append(element("strong", "", item.name), element("small", "", optionDescription(item)));
  return row;
}

function purchaseOptionNode(item) {
  const label = element("label", "field");
  label.append(document.createTextNode(item.name));
  let control;
  if (["SELECT", "COLOR"].includes(item.optionType)) {
    control = element("select");
    const empty = element("option", "", item.required ? "Selecciona una opción" : "Sin selección");
    empty.value = "";
    control.append(empty);
    for (const choice of Array.isArray(item.choices) ? item.choices : []) {
      const option = element("option", "", String(choice));
      option.value = String(choice);
      control.append(option);
    }
  } else {
    control = element("input");
    control.type = item.optionType === "NUMBER" ? "number" : "text";
    control.maxLength = 500;
    control.placeholder = item.optionType === "NUMBER" ? "Introduce un número" : "Escribe el texto o detalle";
  }
  control.required = Boolean(item.required);
  control.dataset.optionId = item.id;
  control.dataset.optionName = item.name;
  control.dataset.priceDeltaCents = String(item.priceDeltaCents ?? 0);
  label.append(control);
  if (item.priceDeltaCents > 0) {
    label.append(element("small", "option-price", `Suplemento: ${money(item.priceDeltaCents, product.currency)}`));
  }
  return label;
}

function mediaNode(item) {
  if (item.kind === "VIDEO") {
    const card = element("article", "media-card");
    const video = document.createElement("video");
    video.controls = true;
    video.preload = "metadata";
    video.playsInline = true;
    video.src = mediaUrl(item.path);
    video.setAttribute("aria-label", item.altText || "Vídeo de la pieza");
    card.append(video, element("footer", "", item.altText || "Vídeo del proceso artesanal"));
    return card;
  }
  const card = element("article", "media-card");
  const image = document.createElement("img");
  window.AtelierImages.configure(image, {
    path: item.path,
    alt: item.altText || "Detalle de la pieza artesanal",
    width: item.width,
    height: item.height,
    sizes: "(max-width: 760px) calc(100vw - 36px), (max-width: 1100px) 50vw, 560px",
    loading: "lazy",
    priority: "low",
    defaultWidth: 640
  });
  card.append(image, element("footer", "", item.altText || "Detalle artesanal"));
  return card;
}

function renderProduct() {
  document.title = `${product.name} · Atelier Lumière`;
  byId("product-provider").textContent = `${product.provider.displayName} · ${product.provider.specialty || "Taller artesanal"}`;
  byId("product-name").textContent = product.name;
  byId("product-short").textContent = product.shortDescription;
  byId("product-price").textContent = money(product.priceCents, product.currency);
  byId("product-story").textContent = product.story;
  byId("personalization-notes").textContent = product.personalizationNotes || "Esta pieza no necesita instrucciones adicionales.";
  byId("shipping-notes").textContent = product.shippingNotes || "El taller confirmará las condiciones de envío antes de la expedición.";
  byId("product-facts").replaceChildren(
    element("span", "", stockLabel(product)),
    element("span", "", `${product.preparationMinDays ?? "?"}–${product.preparationMaxDays ?? "?"} días`),
    ...(product.category ? [element("span", "", product.category)] : []),
    ...(product.customizable ? [element("span", "", "Personalizable")] : [])
  );
  byId("product-events").replaceChildren(...(product.events ?? []).map((value) => element("span", "", value.replaceAll("-", " "))));
  byId("availability-data").replaceChildren(
    keyValue("Disponibilidad", stockLabel(product)),
    keyValue("Preparación", `${product.preparationMinDays ?? "?"}–${product.preparationMaxDays ?? "?"} días`),
    keyValue("Modalidad", product.stockMode === "MADE_TO_ORDER" ? "Elaboración bajo pedido" : product.stockMode === "FINITE" ? "Stock limitado" : "Disponibilidad continua")
  );
  byId("personalization-options").replaceChildren(...product.personalizations.map(optionNode));
  byId("purchase-options").replaceChildren(...product.personalizations.map(purchaseOptionNode));
  byId("custom-request-container").hidden = !product.customizable;

  const images = product.media.filter((item) => item.kind === "IMAGE");
  const hero = byId("hero-media");
  if (images[0]) {
    const image = document.createElement("img");
    window.AtelierImages.configure(image, {
      path: images[0].path,
      alt: images[0].altText || product.name,
      width: images[0].width,
      height: images[0].height,
      sizes: "(max-width: 980px) calc(100vw - 28px), 56vw",
      loading: "eager",
      priority: "high",
      defaultWidth: 960
    });
    hero.replaceChildren(image);
  } else {
    hero.replaceChildren(element("span", "hero-placeholder", "Pieza artesanal"));
  }
  byId("media-gallery").replaceChildren(...product.media.map(mediaNode));
  byId("loading-view").hidden = true;
  byId("product-view").hidden = false;
}

function keyValue(label, value) {
  const row = element("div");
  row.append(element("span", "", label), element("strong", "", value));
  return row;
}

async function requestJson(path) {
  const response = await fetch(path, { headers: { Accept: "application/json" } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || "No se pudo abrir la pieza.");
    error.code = payload.error;
    throw error;
  }
  return payload;
}

async function loadProduct() {
  const params = new URLSearchParams(window.location.search);
  const provider = params.get("taller") || "";
  const slug = params.get("articulo") || "";
  if (!provider || !slug) throw new Error("La dirección de esta pieza no es válida.");
  const payload = await requestJson(`/internal/catalog/products/${encodeURIComponent(provider)}/${encodeURIComponent(slug)}`);
  product = payload.product;
  renderProduct();
}

function selectedPersonalization() {
  const values = {};
  const labels = [];
  for (const control of byId("purchase-options").querySelectorAll("[data-option-id]")) {
    const value = String(control.value ?? "").trim();
    if (!value) {
      if (control.required) {
        control.focus();
        throw new Error(`Completa la opción “${control.dataset.optionName}”.`);
      }
      continue;
    }
    values[control.dataset.optionId] = value;
    labels.push({
      name: control.dataset.optionName,
      value,
      priceDeltaCents: Number(control.dataset.priceDeltaCents) || 0
    });
  }
  return { values, labels };
}

function selectedCustomRequest() {
  if (!product.customizable || !byId("custom-request-toggle").checked) return null;
  const title = byId("custom-request-title").value.trim();
  const brief = byId("custom-request-brief").value.trim();
  const desiredDate = byId("custom-request-date").value;
  if (title.length < 3) throw new Error("Escribe un título para el diseño propio.");
  if (brief.length < 20) throw new Error("Describe el diseño propio con al menos veinte caracteres.");
  return { title, brief, desiredDate };
}

byId("custom-request-toggle").addEventListener("change", () => {
  const enabled = byId("custom-request-toggle").checked;
  byId("custom-request-fields").hidden = !enabled;
  byId("custom-request-title").required = enabled;
  byId("custom-request-brief").required = enabled;
});

byId("purchase-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const result = byId("purchase-result");
  safeMessage(result, "");
  try {
    if (!product) throw new Error("La pieza todavía no está preparada.");
    const quantity = Number(byId("purchase-quantity").value);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10) {
      throw new Error("La cantidad debe estar entre 1 y 10.");
    }
    if (product.stockMode === "FINITE" && quantity > Number(product.stockQuantity ?? 0)) {
      throw new Error("No hay suficientes unidades disponibles.");
    }
    const selected = selectedPersonalization();
    window.AtelierCart.add({
      lineId: crypto.randomUUID(),
      productId: product.id,
      productSlug: product.slug,
      productName: product.name,
      providerSlug: product.provider.slug,
      providerName: product.provider.displayName,
      quantity,
      basePriceCents: product.priceCents,
      currency: product.currency,
      personalization: selected.values,
      personalizationLabels: selected.labels,
      customRequest: selectedCustomRequest()
    });
    const link = element("a", "button secondary", "Abrir carrito");
    link.href = "/carrito/";
    result.replaceChildren(document.createTextNode("Pieza añadida. "), link);
    result.className = "message success";
  } catch (error) {
    safeMessage(result, error.message, "error");
  }
});

window.AtelierCart.wireCount(byId("cart-count"));

loadProduct().catch((error) => {
  byId("loading-view").hidden = true;
  byId("error-message").textContent = error.message;
  byId("error-view").hidden = false;
});

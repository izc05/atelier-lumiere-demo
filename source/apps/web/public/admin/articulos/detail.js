const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUS_LABELS = Object.freeze({
  DRAFT: "Borrador",
  IN_REVIEW: "En revisión",
  CHANGES_REQUESTED: "Cambios solicitados",
  APPROVED: "Aprobado",
  PUBLISHED: "Publicado",
  ARCHIVED: "Archivado"
});
const STATUS_CLASSES = Object.freeze({
  DRAFT: "draft",
  IN_REVIEW: "review",
  CHANGES_REQUESTED: "changes",
  APPROVED: "approved",
  PUBLISHED: "published",
  ARCHIVED: "archived"
});

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

function setMessage(id, text = "", type = "") {
  const node = byId(id);
  node.textContent = text;
  node.className = `message${type ? ` ${type}` : ""}`;
}

function queryProductId() {
  const value = new URL(window.location.href).searchParams.get("id")?.trim() ?? "";
  return UUID_PATTERN.test(value) ? value : null;
}

function money(cents, currency = "EUR") {
  if (!Number.isInteger(cents)) return "Pendiente";
  return new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(cents / 100);
}

function formatDate(value) {
  if (!value) return "Sin fecha";
  try {
    return new Intl.DateTimeFormat("es-ES", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(value));
  } catch {
    return "Sin fecha";
  }
}

function stockLabel(item) {
  if (item.stockMode === "MADE_TO_ORDER") return "Bajo pedido";
  if (item.stockMode === "UNLIMITED") return "Sin límite";
  return `${item.stockQuantity ?? 0} unidades`;
}

function preparationLabel(item) {
  if (!Number.isInteger(item.preparationMinDays) || !Number.isInteger(item.preparationMaxDays)) {
    return "Pendiente";
  }
  return item.preparationMinDays === item.preparationMaxDays
    ? `${item.preparationMinDays} días`
    : `${item.preparationMinDays}–${item.preparationMaxDays} días`;
}

async function requestJson(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers ?? {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (response.status === 401) {
    window.location.replace("/admin/proveedores/");
    throw new Error("La sesión administrativa ha caducado.");
  }
  if (!response.ok) {
    const error = new Error(payload.message || "No se pudo completar la operación.");
    error.code = payload.error;
    throw error;
  }
  return payload;
}

function renderStatus() {
  const status = byId("product-status");
  status.textContent = STATUS_LABELS[product.status] ?? product.status;
  status.className = `status ${STATUS_CLASSES[product.status] ?? "archived"}`;
  byId("decision-panel").hidden = product.status !== "IN_REVIEW";
  byId("publish-panel").hidden = product.status !== "APPROVED";
}

function renderMedia() {
  const cards = (product.media ?? []).map((item) => {
    const card = element("article", "media-card");
    if (item.kind === "IMAGE" && item.previewPath) {
      const image = document.createElement("img");
      image.src = `/internal/admin/products/${product.id}/media/${item.id}/preview`;
      image.alt = item.altText || item.originalFilename;
      image.loading = "lazy";
      card.append(image);
    } else {
      card.append(element("div", "video-placeholder", "Vídeo MP4"));
    }
    const footer = document.createElement("footer");
    footer.append(element("strong", "", item.originalFilename));
    footer.append(document.createElement("br"));
    footer.append(document.createTextNode(item.altText || "Sin descripción del archivo"));
    card.append(footer);
    return card;
  });
  byId("media-grid").replaceChildren(...cards);
  if (cards.length === 0) byId("media-grid").append(element("p", "copy", "No hay archivos disponibles."));
}

function renderEvents() {
  const tags = (product.events ?? []).map((value) => element("span", "tag", value.replaceAll("-", " ")));
  byId("events-list").replaceChildren(...tags);
  if (tags.length === 0) byId("events-list").append(element("span", "copy", "Sin ocasiones asignadas."));
}

function renderOptions() {
  const options = (product.personalizations ?? []).map((item) => {
    const wrapper = element("article", "option-item");
    wrapper.append(element("strong", "", `${item.name}${item.required ? " · obligatoria" : ""}`));
    const details = [item.optionType];
    if (Array.isArray(item.choices) && item.choices.length > 0) details.push(item.choices.join(", "));
    if (item.priceDeltaCents > 0) details.push(`+${money(item.priceDeltaCents, product.currency)}`);
    wrapper.append(element("small", "", details.join(" · ")));
    return wrapper;
  });
  byId("options-list").replaceChildren(...options);
  if (options.length === 0) byId("options-list").append(element("p", "copy", "No se han definido opciones."));
  byId("personalization-notes").textContent = product.personalizationNotes || "Sin indicaciones adicionales.";
}

function renderHistory() {
  const items = (product.reviews ?? []).map((review) => {
    const article = element("article", "history-item");
    article.append(element("strong", "", `Envío ${review.submissionNumber} · ${review.status}`));
    const pieces = [`Enviado ${formatDate(review.submittedAt)}`];
    if (review.reviewedAt) pieces.push(`Resuelto ${formatDate(review.reviewedAt)}`);
    article.append(element("small", "", pieces.join(" · ")));
    if (review.providerNote) article.append(element("p", "copy", `Proveedor: ${review.providerNote}`));
    if (review.reviewerNote) article.append(element("p", "copy", `Administración: ${review.reviewerNote}`));
    return article;
  });
  byId("history-list").replaceChildren(...items);
  if (items.length === 0) byId("history-list").append(element("p", "copy", "Sin historial editorial."));
}

function render() {
  byId("provider-eyebrow").textContent = product.provider.displayName;
  byId("product-name").textContent = product.name;
  byId("product-description").textContent = product.shortDescription || "Sin descripción breve.";
  byId("price-value").textContent = money(product.priceCents, product.currency);
  byId("stock-value").textContent = stockLabel(product);
  byId("preparation-value").textContent = preparationLabel(product);
  byId("category-value").textContent = product.category || "Sin categoría";
  byId("version-value").textContent = `v${product.version}`;
  byId("updated-value").textContent = formatDate(product.updatedAt);
  byId("story-value").textContent = product.story || "Sin historia añadida.";
  byId("shipping-value").textContent = product.shippingNotes || "Sin condiciones específicas.";
  byId("provider-name").textContent = product.provider.displayName;
  byId("provider-contact").textContent = `${product.provider.contactName} · ${product.provider.contactEmail}`;
  const currentReview = (product.reviews ?? []).find((item) => item.status === "PENDING") ?? product.reviews?.[0];
  byId("provider-note").textContent = currentReview?.providerNote || "Sin nota adicional.";
  renderStatus();
  renderMedia();
  renderEvents();
  renderOptions();
  renderHistory();
}

async function decide(decision) {
  if (!product || product.status !== "IN_REVIEW") return;
  const note = byId("reviewer-note").value.trim();
  if (decision === "CHANGES_REQUESTED" && note.length < 10) {
    setMessage("decision-message", "Explica los cambios con al menos 10 caracteres.", "warning");
    byId("reviewer-note").focus();
    return;
  }
  const approveButton = byId("approve-button");
  const changesButton = byId("request-changes-button");
  approveButton.disabled = true;
  changesButton.disabled = true;
  setMessage("decision-message", "Guardando la decisión…");
  try {
    const result = await requestJson(`/internal/admin/products/${product.id}/review`, {
      method: "POST",
      body: JSON.stringify({ decision, reviewerNote: note })
    });
    product.status = result.status;
    product.version = result.version;
    product.approvedAt = result.approvedAt;
    product.updatedAt = result.updatedAt;
    product.reviews = [result.review, ...(product.reviews ?? [])];
    renderStatus();
    renderHistory();
    setMessage(
      "decision-message",
      decision === "APPROVED" ? "Artículo aprobado. Ya puede publicarse." : "Artículo devuelto al taller.",
      "success"
    );
  } catch (error) {
    setMessage("decision-message", error.message, "error");
    approveButton.disabled = false;
    changesButton.disabled = false;
  }
}

async function publish() {
  if (!product || product.status !== "APPROVED") return;
  const button = byId("publish-button");
  button.disabled = true;
  setMessage("publish-message", "Publicando el artículo…");
  try {
    const result = await requestJson(`/internal/admin/products/${product.id}/publish`, { method: "POST" });
    product.status = result.status;
    product.version = result.version;
    product.publishedAt = result.publishedAt;
    product.updatedAt = result.updatedAt;
    renderStatus();
    setMessage("publish-message", "Artículo publicado correctamente.", "success");
  } catch (error) {
    setMessage("publish-message", error.message, "error");
    button.disabled = false;
  }
}

async function load() {
  const id = queryProductId();
  if (!id) {
    byId("loading-view").hidden = true;
    byId("error-message").textContent = "El identificador del artículo no es válido.";
    byId("error-view").hidden = false;
    return;
  }
  try {
    const payload = await requestJson(`/internal/admin/products/${id}`);
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

byId("request-changes-button").addEventListener("click", () => void decide("CHANGES_REQUESTED"));
byId("approve-button").addEventListener("click", () => void decide("APPROVED"));
byId("publish-button").addEventListener("click", () => void publish());
byId("logout-button").addEventListener("click", async () => {
  try {
    await fetch("/internal/admin/session", { method: "DELETE" });
  } finally {
    window.location.replace("/admin/proveedores/");
  }
});

void load();

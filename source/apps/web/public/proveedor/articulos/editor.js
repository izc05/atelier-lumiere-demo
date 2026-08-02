const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EDITABLE = new Set(["DRAFT", "CHANGES_REQUESTED"]);
const STATUS_LABELS = Object.freeze({
  DRAFT: "Borrador",
  IN_REVIEW: "En revisión",
  CHANGES_REQUESTED: "Cambios solicitados",
  APPROVED: "Aprobado",
  PUBLISHED: "Publicado",
  ARCHIVED: "Archivado"
});
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

const state = { product: null, options: [], saving: false };

function byId(id) { return document.getElementById(id); }
function node(tag, className, text) {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (text !== undefined) item.textContent = text;
  return item;
}
function message(id, text = "", type = "") {
  const item = byId(id);
  item.textContent = text;
  item.className = `message${type ? ` ${type}` : ""}`;
}
function isEditable() { return !state.product || EDITABLE.has(state.product.status); }
function queryId() {
  const value = new URL(window.location.href).searchParams.get("id")?.trim() ?? "";
  return UUID_PATTERN.test(value) ? value : null;
}
function asInteger(value) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}
function asCents(value) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) : null;
}
function formatDate(value) {
  if (!value) return "Sin guardar";
  try {
    return new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" })
      .format(new Date(value));
  } catch { return "Sin guardar"; }
}
function slugify(value) {
  return String(value ?? "")
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

async function api(path, options = {}) {
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
    window.location.replace("/proveedor/acceso/");
    throw new Error("La sesión ha caducado.");
  }
  if (!response.ok) {
    const error = new Error(payload.message || "No se pudo completar la operación.");
    error.code = payload.error;
    error.details = payload.details;
    throw error;
  }
  return payload;
}

function selectedEvents() {
  const checked = [...byId("events-grid").querySelectorAll("input:checked")].map((item) => item.value);
  const custom = byId("custom-events").value.split(",").map(slugify).filter(Boolean);
  return [...new Set([...checked, ...custom])].slice(0, 20);
}

function productInput() {
  const stockMode = byId("stock-mode").value;
  return {
    name: byId("name").value.trim(),
    category: byId("category").value.trim() || null,
    priceCents: asCents(byId("price").value),
    shortDescription: byId("short-description").value.trim(),
    story: byId("story").value.trim(),
    stockMode,
    stockQuantity: stockMode === "FINITE" ? asInteger(byId("stock-quantity").value) ?? 0 : null,
    preparationMinDays: asInteger(byId("preparation-min").value),
    preparationMaxDays: asInteger(byId("preparation-max").value),
    shippingNotes: byId("shipping-notes").value.trim(),
    customizable: byId("customizable").checked,
    personalizationNotes: byId("personalization-notes").value.trim()
  };
}

function optionsInput() {
  return state.options
    .map((item) => ({
      name: item.name.trim(),
      optionType: item.optionType,
      required: item.required,
      choices: ["SELECT", "COLOR"].includes(item.optionType)
        ? [...new Set(item.choices.split(",").map((value) => value.trim()).filter(Boolean))]
        : [],
      priceDeltaCents: asCents(item.priceDelta) ?? 0
    }))
    .filter((item) => item.name);
}

function mediaItems() {
  return Array.isArray(state.product?.media)
    ? state.product.media.filter((item) => item.status !== "DELETED")
    : [];
}

function summary() {
  const media = mediaItems();
  const images = media.filter((item) => item.kind === "IMAGE" && item.status === "READY").length;
  const videos = media.filter((item) => item.kind === "VIDEO" && item.status === "READY").length;
  byId("status-title").textContent = state.product
    ? STATUS_LABELS[state.product.status] ?? state.product.status
    : "Borrador nuevo";
  byId("version-label").textContent = state.product ? `v${state.product.version}` : "—";
  byId("image-count").textContent = `${images}/8`;
  byId("video-count").textContent = `${videos}/1`;
  byId("updated-label").textContent = formatDate(state.product?.updatedAt);
}

function stockVisibility() {
  byId("stock-quantity-field").hidden = byId("stock-mode").value !== "FINITE";
}

function optionField(label, input) {
  const field = node("label", "field", label);
  field.append(input);
  return field;
}

function renderOptions() {
  const rows = state.options.map((option, index) => {
    const row = node("div", "option-row");
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.maxLength = 120;
    nameInput.value = option.name;
    nameInput.disabled = !isEditable();
    nameInput.addEventListener("input", () => { option.name = nameInput.value; });

    const typeSelect = document.createElement("select");
    for (const [value, label] of [["TEXT", "Texto"], ["SELECT", "Selección"], ["COLOR", "Color"], ["NUMBER", "Número"]]) {
      const item = document.createElement("option");
      item.value = value;
      item.textContent = label;
      item.selected = option.optionType === value;
      typeSelect.append(item);
    }
    typeSelect.disabled = !isEditable();

    const choicesInput = document.createElement("input");
    choicesInput.type = "text";
    choicesInput.maxLength = 800;
    choicesInput.placeholder = "Rojo, azul, verde";
    choicesInput.value = option.choices;
    choicesInput.disabled = !isEditable();
    choicesInput.addEventListener("input", () => { option.choices = choicesInput.value; });
    const choicesField = optionField("Valores separados por comas", choicesInput);
    choicesField.classList.add("option-choices");

    const priceInput = document.createElement("input");
    priceInput.type = "number";
    priceInput.min = "0";
    priceInput.max = "1000000";
    priceInput.step = "0.01";
    priceInput.value = option.priceDelta;
    priceInput.disabled = !isEditable();
    priceInput.addEventListener("input", () => { option.priceDelta = priceInput.value; });

    const requiredLabel = node("label", "checkline");
    const requiredInput = document.createElement("input");
    requiredInput.type = "checkbox";
    requiredInput.checked = option.required;
    requiredInput.disabled = !isEditable();
    requiredInput.addEventListener("change", () => { option.required = requiredInput.checked; });
    requiredLabel.append(requiredInput, node("span", "", "Obligatoria"));
    const removeButton = node("button", "button ghost", "Eliminar");
    removeButton.type = "button";
    removeButton.disabled = !isEditable();
    removeButton.addEventListener("click", () => {
      state.options.splice(index, 1);
      renderOptions();
    });
    const actions = node("div", "option-actions");
    actions.append(requiredLabel, removeButton);

    function refreshChoices() {
      choicesField.hidden = !["SELECT", "COLOR"].includes(option.optionType);
    }
    typeSelect.addEventListener("change", () => {
      option.optionType = typeSelect.value;
      refreshChoices();
    });
    refreshChoices();

    row.append(
      optionField("Nombre", nameInput),
      optionField("Tipo", typeSelect),
      choicesField,
      optionField("Suplemento (€)", priceInput),
      actions
    );
    return row;
  });
  byId("options-list").replaceChildren(...rows);
}

function mediaCard(item) {
  const card = node("article", "media-card");
  const visual = node("div", `media-visual${item.kind === "VIDEO" ? " video" : ""}`);
  if (item.kind === "IMAGE" && item.status === "READY") {
    const image = document.createElement("img");
    image.src = `/internal/provider/products/${state.product.id}/media/${item.id}/preview`;
    image.alt = item.altText || item.originalFilename;
    image.loading = "lazy";
    visual.append(image);
  } else {
    visual.textContent = item.kind === "VIDEO" ? "Vídeo MP4" : item.status;
  }

  const body = node("div", "media-body");
  body.append(node("div", "media-name", item.originalFilename));
  const alt = document.createElement("input");
  alt.type = "text";
  alt.maxLength = 240;
  alt.placeholder = item.kind === "IMAGE" ? "Texto alternativo" : "Descripción del vídeo";
  alt.value = item.altText || "";
  alt.disabled = !isEditable();
  const order = document.createElement("input");
  order.type = "number";
  order.min = "0";
  order.max = "1000";
  order.value = String(item.sortOrder ?? 0);
  order.disabled = !isEditable();

  const save = node("button", "button secondary", "Guardar datos");
  save.type = "button";
  save.disabled = !isEditable();
  save.addEventListener("click", async () => {
    save.disabled = true;
    try {
      const payload = await api(`/internal/provider/products/${state.product.id}/media/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ altText: alt.value.trim(), sortOrder: Number(order.value) || 0 })
      });
      Object.assign(item, payload.media);
      message("media-message", "Información del archivo guardada.", "success");
    } catch (error) {
      message("media-message", error.message, "error");
    } finally { save.disabled = !isEditable(); }
  });

  const remove = node("button", "button ghost", "Retirar");
  remove.type = "button";
  remove.disabled = !isEditable();
  remove.addEventListener("click", async () => {
    if (!window.confirm(`¿Retirar ${item.originalFilename} de la ficha?`)) return;
    remove.disabled = true;
    try {
      await api(`/internal/provider/products/${state.product.id}/media/${item.id}`, { method: "DELETE" });
      state.product.media = state.product.media.filter((media) => media.id !== item.id);
      renderMedia();
      message("media-message", "Archivo retirado.", "success");
    } catch (error) {
      message("media-message", error.message, "error");
      remove.disabled = false;
    }
  });

  body.append(alt, order, save, remove);
  card.append(visual, body);
  return card;
}

function renderMedia() {
  byId("media-grid").replaceChildren(...mediaItems().map(mediaCard));
  summary();
}

function applyState() {
  const editable = isEditable();
  for (const control of byId("product-form").querySelectorAll("input,select,textarea,button")) {
    control.disabled = !editable;
  }
  byId("save-button").disabled = !editable;
  byId("submit-review-button").disabled = !editable || !state.product;
  byId("media-needs-save").hidden = Boolean(state.product);
  byId("media-controls").hidden = !state.product;
  byId("locked-banner").hidden = editable;
  if (!editable) {
    byId("locked-banner").textContent = state.product.status === "IN_REVIEW"
      ? "La ficha está en revisión y permanece bloqueada hasta que Atelier Lumière la apruebe o solicite cambios."
      : "La ficha no se puede modificar en su estado actual.";
  } else if (state.product?.status === "CHANGES_REQUESTED") {
    const review = state.product.reviews?.find((item) => item.reviewerNote);
    if (review?.reviewerNote) {
      byId("locked-banner").hidden = false;
      byId("locked-banner").textContent = `Cambios solicitados: ${review.reviewerNote}`;
    }
  }
  renderOptions();
  renderMedia();
}

function fill(data) {
  byId("name").value = data.name ?? "";
  byId("category").value = data.category ?? "";
  byId("price").value = Number.isInteger(data.priceCents) ? (data.priceCents / 100).toFixed(2) : "";
  byId("short-description").value = data.shortDescription ?? "";
  byId("story").value = data.story ?? "";
  byId("stock-mode").value = data.stockMode ?? "FINITE";
  byId("stock-quantity").value = data.stockQuantity ?? 0;
  byId("preparation-min").value = data.preparationMinDays ?? "";
  byId("preparation-max").value = data.preparationMaxDays ?? "";
  byId("shipping-notes").value = data.shippingNotes ?? "";
  byId("customizable").checked = Boolean(data.customizable);
  byId("personalization-notes").value = data.personalizationNotes ?? "";
  byId("short-description-count").textContent = String(byId("short-description").value.length);

  const common = new Set([...byId("events-grid").querySelectorAll("input")].map((item) => item.value));
  for (const item of byId("events-grid").querySelectorAll("input")) {
    item.checked = data.events?.includes(item.value) ?? false;
  }
  byId("custom-events").value = (data.events ?? []).filter((item) => !common.has(item)).join(", ");
  state.options = (data.personalizations ?? []).map((item) => ({
    name: item.name,
    optionType: item.optionType,
    required: Boolean(item.required),
    choices: Array.isArray(item.choices) ? item.choices.join(", ") : "",
    priceDelta: String(Number(item.priceDeltaCents ?? 0) / 100)
  }));
  stockVisibility();
  summary();
  applyState();
}

async function save({ quiet = false } = {}) {
  if (state.saving || !isEditable()) return state.product;
  if (!byId("product-form").reportValidity()) return null;
  state.saving = true;
  const button = byId("save-button");
  const previous = button.textContent;
  button.disabled = true;
  button.textContent = "Guardando…";
  if (!quiet) message("save-message", "Guardando la ficha…");

  try {
    const input = productInput();
    if (!input.name) throw new Error("Escribe un nombre para el artículo.");
    const payload = state.product
      ? await api(`/internal/provider/products/${state.product.id}`, {
          method: "PATCH",
          body: JSON.stringify({ ...input, expectedVersion: state.product.version })
        })
      : await api("/internal/provider/products", {
          method: "POST",
          body: JSON.stringify(input)
        });

    const saved = payload.product;
    const events = selectedEvents();
    const options = optionsInput();
    state.product = {
      ...(state.product ?? {}),
      ...saved,
      events,
      personalizations: options,
      media: state.product?.media ?? [],
      reviews: state.product?.reviews ?? []
    };
    if (!queryId()) {
      history.replaceState(null, "", `/proveedor/articulos/editar/?id=${encodeURIComponent(saved.id)}`);
    }
    await api(`/internal/provider/products/${saved.id}/events`, {
      method: "PUT", body: JSON.stringify({ events })
    });
    await api(`/internal/provider/products/${saved.id}/personalizations`, {
      method: "PUT", body: JSON.stringify({ personalizations: options })
    });

    byId("page-title").textContent = saved.name;
    byId("media-needs-save").hidden = true;
    byId("media-controls").hidden = false;
    summary();
    applyState();
    if (!quiet) message("save-message", "Borrador guardado.", "success");
    return state.product;
  } catch (error) {
    message(
      "save-message",
      error.code === "PRODUCT_VERSION_CONFLICT"
        ? "La ficha ha cambiado en otra ventana. Recárgala antes de guardar."
        : error.message,
      error.code === "PRODUCT_VERSION_CONFLICT" ? "warning" : "error"
    );
    return null;
  } finally {
    state.saving = false;
    button.textContent = previous;
    button.disabled = !isEditable();
  }
}

async function uploadOne(file) {
  const imageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
  const video = file.type === "video/mp4";
  if (!video && !imageTypes.has(file.type)) throw new Error(`${file.name}: formato no permitido.`);
  if (file.size < 1 || file.size > (video ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES)) {
    throw new Error(`${file.name}: supera el límite de ${video ? 50 : 12} MB.`);
  }
  const response = await fetch(`/internal/provider/products/${state.product.id}/media`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": file.type,
      "X-File-Name": encodeURIComponent(file.name),
      "X-Alt-Text": ""
    },
    body: file
  });
  const payload = await response.json().catch(() => ({}));
  if (response.status === 401) {
    window.location.replace("/proveedor/acceso/");
    throw new Error("La sesión ha caducado.");
  }
  if (!response.ok) throw new Error(payload.message || `No se pudo subir ${file.name}.`);
  state.product.media ??= [];
  state.product.media.push(payload.media);
}

async function uploadMany(files) {
  if (!state.product || !isEditable() || files.length === 0) return;
  const status = byId("upload-status");
  const progress = byId("upload-progress-bar");
  status.hidden = false;
  progress.value = 0;
  message("media-message");
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    byId("upload-label").textContent = `Subiendo ${index + 1} de ${files.length}: ${file.name}`;
    progress.value = Math.round((index / files.length) * 100);
    try {
      await uploadOne(file);
      renderMedia();
    } catch (error) {
      message("media-message", error.message, "error");
      break;
    }
  }
  progress.value = 100;
  byId("upload-label").textContent = "Carga terminada.";
  window.setTimeout(() => { status.hidden = true; progress.value = 0; }, 1200);
  byId("image-input").value = "";
  byId("video-input").value = "";
}

async function submitReview() {
  if (!isEditable()) return;
  message("review-message", "Guardando antes de enviar…");
  const saved = await save({ quiet: true });
  if (!saved) {
    message("review-message", "No se pudo guardar la ficha antes de enviarla.", "error");
    return;
  }
  const button = byId("submit-review-button");
  button.disabled = true;
  button.textContent = "Enviando…";
  try {
    const payload = await api(`/internal/provider/products/${saved.id}/submit`, {
      method: "POST",
      body: JSON.stringify({
        expectedVersion: saved.version,
        providerNote: byId("review-note").value.trim()
      })
    });
    state.product = { ...state.product, ...payload.product };
    summary();
    applyState();
    message("review-message", "Artículo enviado a revisión.", "success");
  } catch (error) {
    message(
      "review-message",
      error.message,
      error.code === "PRODUCT_NOT_READY_FOR_REVIEW" ? "warning" : "error"
    );
  } finally { button.textContent = "Enviar a revisión"; }
}

async function load() {
  const productId = queryId();
  if (!productId) {
    stockVisibility();
    summary();
    applyState();
    byId("editor-loading").hidden = true;
    byId("editor-content").hidden = false;
    return;
  }
  try {
    const payload = await api(`/internal/provider/products/${productId}`);
    state.product = payload.product;
    byId("page-title").textContent = state.product.name;
    byId("page-lead").textContent = "Actualiza la ficha, gestiona sus archivos y controla el envío a revisión.";
    fill(state.product);
    byId("editor-loading").hidden = true;
    byId("editor-content").hidden = false;
  } catch (error) {
    byId("editor-loading").hidden = true;
    byId("editor-error-message").textContent = error.message;
    byId("editor-error").hidden = false;
  }
}

byId("product-form").addEventListener("submit", (event) => { event.preventDefault(); void save(); });
byId("short-description").addEventListener("input", () => {
  byId("short-description-count").textContent = String(byId("short-description").value.length);
});
byId("stock-mode").addEventListener("change", stockVisibility);
byId("add-option-button").addEventListener("click", () => {
  state.options.push({ name: "", optionType: "TEXT", required: false, choices: "", priceDelta: "0" });
  renderOptions();
});
byId("image-input").addEventListener("change", (event) => void uploadMany([...event.target.files]));
byId("video-input").addEventListener("change", (event) => void uploadMany([...event.target.files]));
byId("submit-review-button").addEventListener("click", () => void submitReview());
byId("logout-button").addEventListener("click", async () => {
  try { await fetch("/internal/provider/session", { method: "DELETE" }); }
  finally { window.location.replace("/proveedor/acceso/"); }
});

void load();

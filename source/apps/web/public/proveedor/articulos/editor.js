const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EDITABLE_STATUSES = new Set(["DRAFT", "CHANGES_REQUESTED"]);
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

let product = null;
let personalizations = [];
let saving = false;

function byId(id) {
  return document.getElementById(id);
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function setMessage(target, message = "", type = "") {
  const node = typeof target === "string" ? byId(target) : target;
  node.textContent = message;
  node.className = `message${type ? ` ${type}` : ""}`;
}

function formatDate(value) {
  if (!value) return "Sin guardar";
  try {
    return new Intl.DateTimeFormat("es-ES", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(value));
  } catch {
    return "Sin guardar";
  }
}

function numberOrNull(value) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function priceCents(value) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) : null;
}

function slugify(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
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
    window.location.replace("/proveedor/acceso/");
    throw new Error("La sesión ha caducado.");
  }
  if (!response.ok) {
    const error = new Error(payload.message || "No se pudo completar la operación.");
    error.code = payload.error;
    error.details = payload.details;
    error.status = response.status;
    throw error;
  }
  return payload;
}

function queryProductId() {
  const value = new URL(window.location.href).searchParams.get("id")?.trim() ?? "";
  return UUID_PATTERN.test(value) ? value : null;
}

function selectedEvents() {
  const common = [...byId("events-grid").querySelectorAll("input:checked")]
    .map((input) => input.value);
  const custom = byId("custom-events").value
    .split(",")
    .map(slugify)
    .filter(Boolean);
  return [...new Set([...common, ...custom])].slice(0, 20);
}

function formPayload() {
  const stockMode = byId("stock-mode").value;
  return {
    name: byId("name").value.trim(),
    shortDescription: byId("short-description").value.trim(),
    story: byId("story").value.trim(),
    category: byId("category").value.trim() || null,
    priceCents: priceCents(byId("price").value),
    stockMode,
    stockQuantity: stockMode === "FINITE" ? numberOrNull(byId("stock-quantity").value) ?? 0 : null,
    preparationMinDays: numberOrNull(byId("preparation-min").value),
    preparationMaxDays: numberOrNull(byId("preparation-max").value),
    customizable: byId("customizable").checked,
    personalizationNotes: byId("personalization-notes").value.trim(),
    shippingNotes: byId("shipping-notes").value.trim()
  };
}

function personalizationPayload() {
  return personalizations.map((option, index) => ({
    name: option.name.trim(),
    optionType: option.optionType,
    required: Boolean(option.required),
    choices: ["SELECT", "COLOR"].includes(option.optionType)
      ? [...new Set(option.choices.split(",").map((value) => value.trim()).filter(Boolean))]
      : [],
    priceDeltaCents: priceCents(option.priceDelta) ?? 0,
    sortOrder: index
  })).filter((option) => option.name);
}

function currentMedia() {
  return Array.isArray(product?.media) ? product.media.filter((item) => item.status !== "DELETED") : [];
}

function updateSummary() {
  const media = currentMedia();
  const images = media.filter((item) => item.kind === "IMAGE" && item.status === "READY").length;
  const videos = media.filter((item) => item.kind === "VIDEO" && item.status === "READY").length;
  byId("status-title").textContent = product ? STATUS_LABELS[product.status] ?? product.status : "Borrador nuevo";
  byId("version-label").textContent = product ? `v${product.version}` : "—";
  byId("image-count").textContent = `${images}/8`;
  byId("video-count").textContent = `${videos}/1`;
  byId("updated-label").textContent = formatDate(product?.updatedAt);
}

function updateStockVisibility() {
  byId("stock-quantity-field").hidden = byId("stock-mode").value !== "FINITE";
}

function optionRow(option, index) {
  const row = element("div", "option-row");

  const nameField = element("label", "field", "Nombre");
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.maxLength = 120;
  nameInput.value = option.name;
  nameInput.addEventListener("input", () => { option.name = nameInput.value; });
  nameField.append(nameInput);

  const typeField = element("label", "field", "Tipo");
  const typeSelect = document.createElement("select");
  for (const [value, label] of [["TEXT", "Texto"], ["SELECT", "Selección"], ["COLOR", "Color"], ["NUMBER", "Número"]]) {
    const choice = document.createElement("option");
    choice.value = value;
    choice.textContent = label;
    choice.selected = value === option.optionType;
    typeSelect.append(choice);
  }
  typeField.append(typeSelect);

  const detailField = element("label", "field");
  const detailInput = document.createElement("input");
  detailInput.type = "text";
  detailInput.maxLength = 800;
  detailInput.value = option.choices;
  const refreshDetail = () => {
    const needsChoices = ["SELECT", "COLOR"].includes(option.optionType);
    detailField.firstChild?.remove();
    detailField.prepend(document.createTextNode(needsChoices ? "Valores separados por comas" : "Incremento de precio (€)"));
    detailInput.type = needsChoices ? "text" : "number";
    detailInput.step = needsChoices ? "" : "0.01";
    detailInput.min = needsChoices ? "" : "0";
    detailInput.value = needsChoices ? option.choices : option.priceDelta;
  };
  typeSelect.addEventListener("change", () => {
    option.optionType = typeSelect.value;
    refreshDetail();
  });
  detailInput.addEventListener("input", () => {
    if (["SELECT", "COLOR"].includes(option.optionType)) option.choices = detailInput.value;
    else option.priceDelta = detailInput.value;
  });
  detailField.append(detailInput);
  refreshDetail();

  const controls = element("div", "field");
  const requiredLabel = element("label", "checkline");
  const required = document.createElement("input");
  required.type = "checkbox";
  required.checked = option.required;
  required.addEventListener("change", () => { option.required = required.checked; });
  requiredLabel.append(required, element("span", "", "Obligatoria"));
  const remove = element("button", "button ghost", "Eliminar");
  remove.type = "button";
  remove.addEventListener("click", () => {
    personalizations.splice(index, 1);
    renderPersonalizations();
  });
  controls.append(requiredLabel, remove);

  row.append(nameField, typeField, detailField, controls);
  return row;
}

function renderPersonalizations() {
  byId("options-list").replaceChildren(...personalizations.map(optionRow));
}

function mediaCard(item) {
  const card = element("article", "media-card");
  const visual = element("div", `media-visual${item.kind === "VIDEO" ? " video" : ""}`);
  if (item.kind === "IMAGE" && item.status === "READY") {
    const image = document.createElement("img");
    image.src = `/internal/provider/products/${product.id}/media/${item.id}/preview`;
    image.alt = item.altText || item.originalFilename;
    image.loading = "lazy";
    visual.append(image);
  } else {
    visual.textContent = item.kind === "VIDEO" ? "Vídeo MP4" : item.status;
  }

  const body = element("div", "media-body");
  body.append(element("div", "media-name", item.originalFilename));
  const alt = document.createElement("input");
  alt.type = "text";
  alt.maxLength = 240;
  alt.placeholder = item.kind === "IMAGE" ? "Texto alternativo" : "Descripción del vídeo";
  alt.value = item.altText || "";
  const order = document.createElement("input");
  order.type = "number";
  order.min = "0";
  order.max = "1000";
  order.step = "1";
  order.value = String(item.sortOrder ?? 0);

  const save = element("button", "button secondary", "Guardar datos");
  save.type = "button";
  save.disabled = !isEditable();
  save.addEventListener("click", async () => {
    save.disabled = true;
    setMessage("media-message", "Guardando información…");
    try {
      const payload = await requestJson(
        `/internal/provider/products/${product.id}/media/${item.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ altText: alt.value.trim(), sortOrder: Number(order.value) || 0 })
        }
      );
      Object.assign(item, payload.media);
      setMessage("media-message", "Información guardada.", "success");
    } catch (error) {
      setMessage("media-message", error.message, "error");
    } finally {
      save.disabled = !isEditable();
    }
  });

  const remove = element("button", "button ghost", "Retirar");
  remove.type = "button";
  remove.disabled = !isEditable();
  remove.addEventListener("click", async () => {
    if (!window.confirm(`¿Retirar ${item.originalFilename} de la ficha?`)) return;
    remove.disabled = true;
    try {
      await requestJson(`/internal/provider/products/${product.id}/media/${item.id}`, {
        method: "DELETE"
      });
      product.media = product.media.filter((media) => media.id !== item.id);
      renderMedia();
      setMessage("media-message", "Archivo retirado.", "success");
    } catch (error) {
      setMessage("media-message", error.message, "error");
      remove.disabled = false;
    }
  });

  body.append(alt, order, save, remove);
  card.append(visual, body);
  return card;
}

function renderMedia() {
  const media = currentMedia();
  byId("media-grid").replaceChildren(...media.map(mediaCard));
  updateSummary();
}

function isEditable() {
  return !product || EDITABLE_STATUSES.has(product.status);
}

function applyEditableState() {
  const editable = isEditable();
  for (const control of byId("product-form").querySelectorAll("input, select, textarea, button")) {
    control.disabled = !editable;
  }
  byId("save-button").disabled = !editable;
  byId("submit-review-button").disabled = !editable || !product;
  byId("media-needs-save").hidden = Boolean(product);
  byId("media-controls").hidden = !product;
  byId("locked-banner").hidden = editable;
  if (!editable) {
    byId("locked-banner").textContent = product.status === "IN_REVIEW"
      ? "La ficha está en revisión y permanece bloqueada hasta que Atelier Lumière la apruebe o solicite cambios."
      : "Esta ficha no se puede editar en su estado actual.";
  }
  if (product?.status === "CHANGES_REQUESTED") {
    const review = product.reviews?.find((item) => item.status === "CHANGES_REQUESTED" || item.reviewerNote);
    if (review?.reviewerNote) {
      byId("locked-banner").hidden = false;
      byId("locked-banner").textContent = `Cambios solicitados: ${review.reviewerNote}`;
    }
  }
}

function fillForm(data) {
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

  const commonValues = new Set(
    [...byId("events-grid").querySelectorAll("input")].map((input) => input.value)
  );
  for (const input of byId("events-grid").querySelectorAll("input")) {
    input.checked = data.events?.includes(input.value) ?? false;
  }
  byId("custom-events").value = (data.events ?? [])
    .filter((value) => !commonValues.has(value))
    .join(", ");

  personalizations = (data.personalizations ?? []).map((option) => ({
    name: option.name,
    optionType: option.optionType,
    required: option.required,
    choices: Array.isArray(option.choices) ? option.choices.join(", ") : "",
    priceDelta: Number(option.priceDeltaCents ?? 0) / 100
  }));
  renderPersonalizations();
  updateStockVisibility();
  renderMedia();
  applyEditableState();
}

async function saveProduct({ quiet = false } = {}) {
  if (saving || !isEditable()) return product;
  if (!byId("product-form").reportValidity()) return null;
  saving = true;
  const button = byId("save-button");
  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = "Guardando…";
  if (!quiet) setMessage("save-message", "Guardando la ficha…");

  try {
    const data = formPayload();
    if (!data.name) throw new Error("Escribe un nombre para el artículo.");
    let saved;
    if (product) {
      const payload = await requestJson(`/internal/provider/products/${product.id}`, {
        method: "PATCH",
        body: JSON.stringify({ ...data, expectedVersion: product.version })
      });
      saved = payload.product;
    } else {
      const payload = await requestJson("/internal/provider/products", {
        method: "POST",
        body: JSON.stringify(data)
      });
      saved = payload.product;
      history.replaceState(null, "", `/proveedor/articulos/editar/?id=${encodeURIComponent(saved.id)}`);
    }

    product = {
      ...(product ?? {}),
      ...saved,
      events: selectedEvents(),
      personalizations: personalizationPayload(),
      media: product?.media ?? [],
      reviews: product?.reviews ?? []
    };

    await requestJson(`/internal/provider/products/${product.id}/events`, {
      method: "PUT",
      body: JSON.stringify({ events: product.events })
    });
    await requestJson(`/internal/provider/products/${product.id}/personalizations`, {
      method: "PUT",
      body: JSON.stringify({ personalizations: product.personalizations })
    });

    byId("page-title").textContent = product.name;
    byId("media-needs-save").hidden = true;
    byId("media-controls").hidden = false;
    byId("submit-review-button").disabled = false;
    updateSummary();
    applyEditableState();
    if (!quiet) setMessage("save-message", "Borrador guardado.", "success");
    return product;
  } catch (error) {
    if (error.code === "PRODUCT_VERSION_CONFLICT") {
      setMessage("save-message", "La ficha ha cambiado en otra ventana. Recárgala antes de guardar.", "warning");
    } else {
      setMessage("save-message", error.message, "error");
    }
    return null;
  } finally {
    saving = false;
    button.textContent = originalLabel;
    button.disabled = !isEditable();
  }
}

async function uploadFile(file) {
  const allowedImages = new Set(["image/jpeg", "image/png", "image/webp"]);
  const isVideo = file.type === "video/mp4";
  if (!isVideo && !allowedImages.has(file.type)) {
    throw new Error(`${file.name}: formato no permitido.`);
  }
  const maximum = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (file.size < 1 || file.size > maximum) {
    throw new Error(`${file.name}: supera el límite de ${isVideo ? "50" : "12"} MB.`);
  }

  const response = await fetch(`/internal/provider/products/${product.id}/media`, {
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
  product.media ??= [];
  product.media.push(payload.media);
}

async function uploadFiles(files) {
  if (!product || !isEditable() || files.length === 0) return;
  const status = byId("upload-status");
  const bar = byId("upload-progress-bar");
  status.hidden = false;
  setMessage("media-message");

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    byId("upload-label").textContent = `Subiendo ${index + 1} de ${files.length}: ${file.name}`;
    bar.style.width = `${Math.round((index / files.length) * 100)}%`;
    try {
      await uploadFile(file);
      renderMedia();
    } catch (error) {
      setMessage("media-message", error.message, "error");
      break;
    }
  }
  bar.style.width = "100%";
  byId("upload-label").textContent = "Carga terminada.";
  window.setTimeout(() => { status.hidden = true; bar.style.width = "0"; }, 1200);
  byId("image-input").value = "";
  byId("video-input").value = "";
}

async function submitForReview() {
  if (!isEditable()) return;
  setMessage("review-message", "Guardando antes de enviar…");
  const saved = await saveProduct({ quiet: true });
  if (!saved) {
    setMessage("review-message", "No se pudo guardar la ficha antes de enviarla.", "error");
    return;
  }
  const button = byId("submit-review-button");
  button.disabled = true;
  button.textContent = "Enviando…";
  try {
    const payload = await requestJson(`/internal/provider/products/${product.id}/submit`, {
      method: "POST",
      body: JSON.stringify({
        expectedVersion: product.version,
        providerNote: byId("review-note").value.trim()
      })
    });
    product = {
      ...product,
      ...payload.product,
      reviews: [payload.review, ...(product.reviews ?? [])]
    };
    updateSummary();
    applyEditableState();
    setMessage("review-message", "Artículo enviado a revisión.", "success");
  } catch (error) {
    setMessage("review-message", error.message, error.code === "PRODUCT_NOT_READY_FOR_REVIEW" ? "warning" : "error");
    button.disabled = false;
  } finally {
    button.textContent = "Enviar a revisión";
  }
}

async function loadEditor() {
  const productId = queryProductId();
  if (!productId) {
    personalizations = [];
    renderPersonalizations();
    updateStockVisibility();
    updateSummary();
    applyEditableState();
    byId("editor-loading").hidden = true;
    byId("editor-content").hidden = false;
    return;
  }

  try {
    const payload = await requestJson(`/internal/provider/products/${productId}`);
    product = payload.product;
    byId("page-title").textContent = product.name;
    byId("page-lead").textContent = "Actualiza la ficha, gestiona sus archivos y controla el envío a revisión.";
    fillForm(product);
    byId("editor-loading").hidden = true;
    byId("editor-content").hidden = false;
  } catch (error) {
    byId("editor-loading").hidden = true;
    byId("editor-error-message").textContent = error.message;
    byId("editor-error").hidden = false;
  }
}

byId("product-form").addEventListener("submit", (event) => {
  event.preventDefault();
  void saveProduct();
});
byId("short-description").addEventListener("input", () => {
  byId("short-description-count").textContent = String(byId("short-description").value.length);
});
byId("stock-mode").addEventListener("change", updateStockVisibility);
byId("customizable").addEventListener("change", () => {
  if (!byId("customizable").checked && personalizations.length > 0) {
    setMessage("save-message", "Las opciones se conservarán, pero el artículo figura como no personalizable.", "warning");
  }
});
byId("add-option-button").addEventListener("click", () => {
  personalizations.push({
    name: "",
    optionType: "TEXT",
    required: false,
    choices: "",
    priceDelta: "0"
  });
  renderPersonalizations();
});
byId("image-input").addEventListener("change", (event) => {
  void uploadFiles([...event.target.files]);
});
byId("video-input").addEventListener("change", (event) => {
  void uploadFiles([...event.target.files]);
});
byId("submit-review-button").addEventListener("click", () => void submitForReview());
byId("logout-button").addEventListener("click", async () => {
  try {
    await fetch("/internal/provider/session", { method: "DELETE" });
  } finally {
    window.location.replace("/proveedor/acceso/");
  }
});

void loadEditor();

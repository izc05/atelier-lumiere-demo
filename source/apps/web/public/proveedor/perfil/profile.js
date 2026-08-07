const fields = [
  "public-name", "specialty-label", "tagline", "location-label", "story", "craft-description",
  "materials", "techniques", "preparation-note", "shipping-note", "accepts-custom-requests"
];
const mediaInputs = ["logo-file", "cover-file", "gallery-file"];
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
let currentProfile = null;
let currentMedia = [];
let mediaBusy = false;

function byId(id) { return document.getElementById(id); }
function text(id, value) { byId(id).textContent = value ?? ""; }
function listValue(value) {
  return String(value ?? "").split(",").map((item) => item.trim()).filter(Boolean).slice(0, 12);
}
function monogram(value) {
  const words = String(value ?? "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "AL";
  return words.slice(0, 2).map((word) => word[0]).join("").toLocaleUpperCase("es");
}
function internalPath(path) {
  return typeof path === "string" && path.startsWith("/api/") ? path.replace(/^\/api\//, "/internal/") : null;
}
function node(tag, className, value) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (value !== undefined) element.textContent = value;
  return element;
}
function mediaFor(kind) {
  return currentMedia.filter((item) => item.kind === kind && item.status === "READY");
}
function defaultAlt(kind) {
  const name = byId("public-name").value.trim() || "el taller";
  if (kind === "LOGO") return `Logotipo de ${name}`;
  if (kind === "COVER") return `Portada del taller ${name}`;
  return `Detalle del taller ${name}`;
}

async function request(path, { method = "GET", body } = {}) {
  const response = await fetch(path, {
    method,
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const payload = await response.json().catch(() => ({}));
  if (response.status === 401) {
    window.location.replace("/proveedor/acceso/");
    throw new Error("Sesión caducada.");
  }
  if (!response.ok) throw new Error(payload.message || "No se pudo completar la operación.");
  return payload;
}

function statusCopy(profile) {
  const values = {
    DRAFT: ["Borrador", "Perfil en preparación", "Puedes editarlo y guardarlo tantas veces como necesites antes de enviarlo a Atelier Lumière."],
    IN_REVIEW: ["En revisión", "Atelier Lumière lo está revisando", "El contenido y las imágenes quedan bloqueados hasta que termine la revisión editorial."],
    CHANGES_REQUESTED: ["Cambios solicitados", "Hay ajustes pendientes", "Revisa la indicación editorial, guarda la nueva versión y vuelve a enviarla."],
    APPROVED: ["Aprobado", "Preparado para publicación", "Atelier Lumière ha aprobado esta versión. El perfil permanece bloqueado hasta su publicación."],
    PUBLISHED: ["Publicado", "Esta versión está publicada", "La página pública usa esta versión. Al cambiar texto o imágenes se abrirá automáticamente una nueva revisión."]
  };
  return values[profile.status] ?? [profile.status, "Estado del perfil", ""];
}

function isLocked() {
  return Boolean(currentProfile && ["IN_REVIEW", "APPROVED"].includes(currentProfile.status));
}

function setLocked(locked) {
  for (const id of fields) byId(id).disabled = locked;
  for (const id of mediaInputs) byId(id).disabled = locked || mediaBusy;
  byId("save-button").disabled = locked;
  byId("submit-button").disabled = locked;
  document.body.classList.toggle("profile-locked", locked);
}

function populate(profile) {
  currentProfile = profile;
  byId("public-name").value = profile.publicName ?? "";
  byId("specialty-label").value = profile.specialtyLabel ?? "";
  byId("tagline").value = profile.tagline ?? "";
  byId("location-label").value = profile.locationLabel ?? "";
  byId("story").value = profile.story ?? "";
  byId("craft-description").value = profile.craftDescription ?? "";
  byId("materials").value = (profile.materials ?? []).join(", ");
  byId("techniques").value = (profile.techniques ?? []).join(", ");
  byId("preparation-note").value = profile.preparationNote ?? "";
  byId("shipping-note").value = profile.shippingNote ?? "";
  byId("accepts-custom-requests").checked = Boolean(profile.acceptsCustomRequests);
  byId("public-profile-link").href = `/taller/?slug=${encodeURIComponent(profile.providerSlug)}`;

  const [badge, titleValue, copy] = statusCopy(profile);
  text("status-badge", badge);
  text("status-title", titleValue);
  text("status-copy", copy);
  const note = byId("editorial-note");
  note.hidden = !profile.editorialNote;
  note.textContent = profile.editorialNote ? `Nota editorial: ${profile.editorialNote}` : "";

  setLocked(isLocked());
  byId("save-button").textContent = profile.status === "PUBLISHED" ? "Crear revisión y guardar" : "Guardar borrador";
  byId("submit-button").textContent = profile.status === "CHANGES_REQUESTED" ? "Volver a enviar" : "Enviar a revisión";
  renderMedia();
  updatePreview();
}

function formData() {
  return {
    publicName: byId("public-name").value.trim(),
    specialtyLabel: byId("specialty-label").value.trim(),
    tagline: byId("tagline").value.trim(),
    locationLabel: byId("location-label").value.trim(),
    story: byId("story").value.trim(),
    craftDescription: byId("craft-description").value.trim(),
    materials: listValue(byId("materials").value),
    techniques: listValue(byId("techniques").value),
    preparationNote: byId("preparation-note").value.trim(),
    shippingNote: byId("shipping-note").value.trim(),
    acceptsCustomRequests: byId("accepts-custom-requests").checked
  };
}

function readiness(data) {
  const values = {
    "ready-name": data.publicName.length >= 2 && data.specialtyLabel.length >= 2,
    "ready-tagline": data.tagline.length >= 10,
    "ready-story": data.story.length >= 40,
    "ready-craft": data.craftDescription.length >= 20,
    "ready-cover": mediaFor("COVER").length === 1
  };
  for (const [id, ready] of Object.entries(values)) {
    byId(id).classList.toggle("ready", ready);
    byId(id).textContent = `${ready ? "✓" : "○"} ${byId(id).textContent.replace(/^[✓○]\s*/, "")}`;
  }
  return Object.values(values).every(Boolean);
}

function configurePreviewImage(image, item) {
  const path = internalPath(item?.previewPath);
  if (!path) {
    image.hidden = true;
    image.removeAttribute("src");
    return;
  }
  image.src = path;
  image.alt = item.altText || "";
  image.hidden = false;
}

function updatePreview() {
  const data = formData();
  text("tagline-count", String(data.tagline.length));
  text("story-count", String(data.story.length));
  text("craft-count", String(data.craftDescription.length));
  text("preview-title", data.publicName || "Tu taller");
  text("preview-specialty", data.specialtyLabel || "Especialidad");
  text("preview-tagline", data.tagline || "Tu frase de presentación aparecerá aquí.");
  text("preview-monogram", monogram(data.publicName));
  text("preview-location", data.locationLabel || "Ubicación por completar");
  text("preview-custom", data.acceptsCustomRequests ? "Acepta encargos personalizados" : "Encargos según disponibilidad");

  const cover = mediaFor("COVER")[0] ?? null;
  const logo = mediaFor("LOGO")[0] ?? null;
  configurePreviewImage(byId("preview-cover"), cover);
  configurePreviewImage(byId("preview-logo"), logo);
  byId("preview-monogram").hidden = Boolean(logo);

  const ready = readiness(data);
  if (currentProfile && !isLocked()) byId("submit-button").disabled = !ready || mediaBusy;
}

function message(value, type = "") {
  const element = byId("form-message");
  element.textContent = value;
  element.className = `form-message${type ? ` ${type}` : ""}`;
}
function mediaMessage(value, type = "") {
  const element = byId("media-message");
  element.textContent = value;
  element.className = `form-message${type ? ` ${type}` : ""}`;
}

function mediaCard(item) {
  const card = node("article", "media-card");
  const image = document.createElement("img");
  image.src = internalPath(item.previewPath) || "";
  image.alt = item.altText || "";
  image.loading = "lazy";
  image.decoding = "async";
  const body = node("div", "media-card-body");
  const title = node("strong", "", item.kind === "LOGO" ? "Logo actual" : item.kind === "COVER" ? "Portada actual" : "Foto de galería");
  const meta = node("small", "", `${item.width || "?"}×${item.height || "?"} · ${Math.max(1, Math.round(item.sizeBytes / 1024))} KB`);
  const alt = document.createElement("input");
  alt.type = "text";
  alt.maxLength = 240;
  alt.value = item.altText || "";
  alt.placeholder = "Describe brevemente la imagen";
  alt.disabled = isLocked() || mediaBusy;
  alt.setAttribute("aria-label", "Texto alternativo de la imagen");

  const actions = node("div", "media-card-actions");
  const saveAlt = node("button", "mini-button", "Guardar descripción");
  saveAlt.type = "button";
  saveAlt.disabled = isLocked() || mediaBusy;
  saveAlt.addEventListener("click", () => void updateMediaMetadata(item.id, { altText: alt.value.trim() }));
  const remove = node("button", "mini-button danger", "Eliminar");
  remove.type = "button";
  remove.disabled = isLocked() || mediaBusy;
  remove.addEventListener("click", () => void removeMedia(item.id));
  actions.append(saveAlt, remove);
  body.append(title, meta, alt, actions);
  card.append(image, body);
  return card;
}

function emptySlot(label) {
  const empty = node("div", "media-empty");
  empty.append(node("span", "", "+"), node("p", "", label));
  return empty;
}

function renderMedia() {
  const logo = mediaFor("LOGO");
  const cover = mediaFor("COVER");
  const gallery = mediaFor("GALLERY");
  byId("logo-media").replaceChildren(logo[0] ? mediaCard(logo[0]) : emptySlot("Todavía no has añadido un logo."));
  byId("cover-media").replaceChildren(cover[0] ? mediaCard(cover[0]) : emptySlot("Añade una portada para poder enviar el perfil a revisión."));
  byId("gallery-media").replaceChildren(...gallery.map(mediaCard));
  if (!gallery.length) byId("gallery-media").append(emptySlot("La galería está vacía."));
  const galleryInput = byId("gallery-file");
  galleryInput.disabled = isLocked() || mediaBusy || gallery.length >= 6;
  updatePreview();
}

function validateFile(file) {
  if (!(file instanceof File) || !IMAGE_TYPES.has(file.type)) throw new Error("Solo se admiten imágenes JPEG, PNG o WebP.");
  if (file.size < 1 || file.size > MAX_IMAGE_BYTES) throw new Error("Cada imagen debe ocupar como máximo 12 MB.");
}

async function uploadOne(kind, file) {
  validateFile(file);
  const response = await fetch("/internal/provider/profile/media", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": file.type,
      "X-File-Name": encodeURIComponent(file.name),
      "X-Alt-Text": encodeURIComponent(defaultAlt(kind)),
      "X-Media-Kind": kind
    },
    body: file
  });
  const payload = await response.json().catch(() => ({}));
  if (response.status === 401) {
    window.location.replace("/proveedor/acceso/");
    throw new Error("Sesión caducada.");
  }
  if (!response.ok) throw new Error(payload.message || "No se pudo subir la imagen.");
  return payload.media;
}

async function uploadFiles(kind, files) {
  if (isLocked() || mediaBusy || !files.length) return;
  const selected = [...files];
  if (kind === "GALLERY") {
    const remaining = 6 - mediaFor("GALLERY").length;
    if (remaining <= 0) {
      mediaMessage("La galería ya tiene seis fotografías.", "error");
      return;
    }
    selected.splice(remaining);
  } else if (mediaFor(kind).length) {
    mediaMessage(kind === "LOGO" ? "Elimina el logo actual antes de sustituirlo." : "Elimina la portada actual antes de sustituirla.", "error");
    return;
  }

  mediaBusy = true;
  setLocked(isLocked());
  mediaMessage(`Subiendo ${selected.length === 1 ? "imagen" : `${selected.length} imágenes`}…`);
  try {
    for (const file of selected) await uploadOne(kind, file);
    await reloadProfileAndMedia();
    mediaMessage("Imágenes guardadas en el borrador privado.", "success");
  } catch (error) {
    mediaMessage(error.message, "error");
  } finally {
    mediaBusy = false;
    for (const id of mediaInputs) byId(id).value = "";
    setLocked(isLocked());
    renderMedia();
  }
}

async function updateMediaMetadata(mediaId, data) {
  if (isLocked() || mediaBusy) return;
  mediaBusy = true;
  mediaMessage("Guardando descripción…");
  try {
    await request(`/internal/provider/profile/media/${encodeURIComponent(mediaId)}`, { method: "PATCH", body: data });
    await reloadProfileAndMedia();
    mediaMessage("Descripción de imagen guardada.", "success");
  } catch (error) {
    mediaMessage(error.message, "error");
  } finally {
    mediaBusy = false;
    setLocked(isLocked());
    renderMedia();
  }
}

async function removeMedia(mediaId) {
  if (isLocked() || mediaBusy) return;
  mediaBusy = true;
  mediaMessage("Retirando imagen del borrador…");
  try {
    await request(`/internal/provider/profile/media/${encodeURIComponent(mediaId)}`, { method: "DELETE" });
    await reloadProfileAndMedia();
    mediaMessage("Imagen retirada. La versión pública anterior permanece intacta.", "success");
  } catch (error) {
    mediaMessage(error.message, "error");
  } finally {
    mediaBusy = false;
    setLocked(isLocked());
    renderMedia();
  }
}

async function reloadProfileAndMedia() {
  const [profilePayload, mediaPayload] = await Promise.all([
    request("/internal/provider/profile"),
    request("/internal/provider/profile/media")
  ]);
  currentMedia = Array.isArray(mediaPayload.media) ? mediaPayload.media : [];
  populate(profilePayload.profile);
}

async function save() {
  const button = byId("save-button");
  button.disabled = true;
  message("Guardando…");
  try {
    const payload = await request("/internal/provider/profile", { method: "PATCH", body: formData() });
    populate(payload.profile);
    message("Borrador guardado correctamente.", "success");
  } catch (error) {
    message(error.message, "error");
  } finally {
    if (currentProfile && !isLocked()) button.disabled = false;
  }
}

async function submit() {
  if (!readiness(formData())) {
    message("Completa los requisitos marcados, incluida la portada, antes de enviar el perfil.", "error");
    return;
  }
  const button = byId("submit-button");
  button.disabled = true;
  message("Guardando la última versión…");
  try {
    const saved = await request("/internal/provider/profile", { method: "PATCH", body: formData() });
    populate(saved.profile);
    message("Enviando a revisión…");
    const payload = await request("/internal/provider/profile/submit", { method: "POST" });
    populate(payload.profile);
    message("Perfil e imágenes enviados a Atelier Lumière para revisión.", "success");
  } catch (error) {
    message(error.message, "error");
    updatePreview();
  }
}

async function load() {
  try {
    await reloadProfileAndMedia();
    byId("loading-view").hidden = true;
    byId("editor-view").hidden = false;
  } catch (error) {
    byId("loading-view").hidden = true;
    byId("error-message").textContent = error.message;
    byId("error-view").hidden = false;
  }
}

for (const id of fields) {
  byId(id).addEventListener("input", updatePreview);
  byId(id).addEventListener("change", updatePreview);
}
byId("logo-file").addEventListener("change", (event) => void uploadFiles("LOGO", event.target.files));
byId("cover-file").addEventListener("change", (event) => void uploadFiles("COVER", event.target.files));
byId("gallery-file").addEventListener("change", (event) => void uploadFiles("GALLERY", event.target.files));
byId("save-button").addEventListener("click", () => void save());
byId("submit-button").addEventListener("click", () => void submit());
void load();

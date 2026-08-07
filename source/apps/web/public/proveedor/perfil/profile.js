const fields = [
  "public-name", "specialty-label", "tagline", "location-label", "story", "craft-description",
  "materials", "techniques", "preparation-note", "shipping-note", "accepts-custom-requests"
];
let currentProfile = null;

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
    IN_REVIEW: ["En revisión", "Atelier Lumière lo está revisando", "El contenido queda bloqueado hasta que termine la revisión editorial."],
    CHANGES_REQUESTED: ["Cambios solicitados", "Hay ajustes pendientes", "Revisa la indicación editorial, guarda la nueva versión y vuelve a enviarla."],
    APPROVED: ["Aprobado", "Preparado para publicación", "Atelier Lumière ha aprobado esta versión. El perfil permanece bloqueado hasta su publicación."],
    PUBLISHED: ["Publicado", "Esta versión está publicada", "La página pública usa esta versión. Al guardar un cambio se abrirá automáticamente una nueva revisión."]
  };
  return values[profile.status] ?? [profile.status, "Estado del perfil", ""];
}

function setLocked(locked) {
  for (const id of fields) byId(id).disabled = locked;
  byId("save-button").disabled = locked;
  byId("submit-button").disabled = locked;
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

  const locked = ["IN_REVIEW", "APPROVED"].includes(profile.status);
  setLocked(locked);
  byId("save-button").textContent = profile.status === "PUBLISHED" ? "Crear revisión y guardar" : "Guardar borrador";
  byId("submit-button").textContent = profile.status === "CHANGES_REQUESTED" ? "Volver a enviar" : "Enviar a revisión";
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
    "ready-craft": data.craftDescription.length >= 20
  };
  for (const [id, ready] of Object.entries(values)) {
    byId(id).classList.toggle("ready", ready);
    byId(id).textContent = `${ready ? "✓" : "○"} ${byId(id).textContent.replace(/^[✓○]\s*/, "")}`;
  }
  return Object.values(values).every(Boolean);
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
  const ready = readiness(data);
  if (currentProfile && !["IN_REVIEW", "APPROVED"].includes(currentProfile.status)) {
    byId("submit-button").disabled = !ready;
  }
}

function message(value, type = "") {
  const node = byId("form-message");
  node.textContent = value;
  node.className = `form-message${type ? ` ${type}` : ""}`;
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
    if (currentProfile && !["IN_REVIEW", "APPROVED"].includes(currentProfile.status)) button.disabled = false;
  }
}

async function submit() {
  if (!readiness(formData())) {
    message("Completa los requisitos marcados antes de enviar el perfil.", "error");
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
    message("Perfil enviado a Atelier Lumière para revisión.", "success");
  } catch (error) {
    message(error.message, "error");
    updatePreview();
  }
}

async function load() {
  try {
    const payload = await request("/internal/provider/profile");
    populate(payload.profile);
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
byId("save-button").addEventListener("click", () => void save());
byId("submit-button").addEventListener("click", () => void submit());
void load();

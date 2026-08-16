const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const PAGE_ORDER = Object.freeze(["HOME", "STORE", "WORKSHOPS", "STORIES", "COMMISSIONS"]);
const PAGE_META = Object.freeze({
  HOME: { title: "Home", description: "Fotografía principal de la portada de Atelier Lumière." },
  STORE: { title: "Tienda", description: "Imagen editorial que acompaña la entrada al catálogo." },
  WORKSHOPS: { title: "Talleres", description: "Imagen general del directorio de talleres asociados." },
  STORIES: { title: "Historias", description: "Fotografía de apertura de la revista editorial." },
  COMMISSIONS: { title: "Encargos", description: "Imagen que acompaña el recorrido de diseño propio." }
});

let slots = [];
let busySlot = null;

function byId(id) { return document.getElementById(id); }
function node(tag, className, text) {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (text !== undefined) item.textContent = text;
  return item;
}

function formatDate(value) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  } catch {
    return "—";
  }
}

function formatBytes(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 1) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function readPayload(response) {
  return response.json().catch(() => ({}));
}

function redirectToAdmin() {
  window.location.replace("/admin/proveedores/");
}

async function requireOwner() {
  const response = await fetch("/internal/admin/session", {
    credentials: "same-origin",
    headers: { Accept: "application/json" }
  });
  const payload = await readPayload(response);
  if (!response.ok || payload.authenticated !== true) {
    redirectToAdmin();
    throw new Error("La sesión administrativa ha caducado.");
  }
  if (payload.account?.role !== "PLATFORM_OWNER") {
    redirectToAdmin();
    throw new Error("Este apartado está reservado al propietario de la plataforma.");
  }
}

async function requestJson(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      ...(options.body !== undefined ? { "Content-Type": "application/json" } : {})
    },
    method: options.method || "GET",
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {})
  });
  const payload = await readPayload(response);
  if (response.status === 401) {
    redirectToAdmin();
    throw new Error("La sesión administrativa ha caducado.");
  }
  if (response.status === 403) {
    throw new Error("Tu rol administrativo no permite modificar el escaparate.");
  }
  if (!response.ok) throw new Error(payload.message || "No se pudo completar la operación.");
  return payload;
}

function validateFile(file) {
  if (!(file instanceof File) || !IMAGE_TYPES.has(file.type)) {
    throw new Error("Solo se admiten imágenes JPEG, PNG o WebP.");
  }
  if (file.size < 1 || file.size > MAX_IMAGE_BYTES) {
    throw new Error("Cada imagen debe ocupar como máximo 12 MB.");
  }
}

function previewUrl(slot, width = 960) {
  const version = slot.media?.updatedAt ? `&v=${encodeURIComponent(slot.media.updatedAt)}` : "";
  return `/internal/admin/showcase/${encodeURIComponent(slot.slotKey)}/preview?width=${width}${version}`;
}

function setSlotMessage(card, text, tone = "") {
  const message = card.querySelector(".showcase-status");
  message.textContent = text;
  message.className = `showcase-status${tone ? ` ${tone}` : ""}`;
}

function syncFocal(card) {
  const x = Number(card.querySelector('[data-focal="x"]').value);
  const y = Number(card.querySelector('[data-focal="y"]').value);
  card.querySelector('[data-focal-value="x"]').textContent = `${x}%`;
  card.querySelector('[data-focal-value="y"]').textContent = `${y}%`;
  const image = card.querySelector(".showcase-preview img");
  if (image) image.style.objectPosition = `${x}% ${y}%`;
  const marker = card.querySelector(".focal-marker");
  if (marker) {
    marker.style.left = `${x}%`;
    marker.style.top = `${y}%`;
  }
}

function controlsDisabled(card, value) {
  for (const element of card.querySelectorAll("button, input")) element.disabled = value;
  card.setAttribute("aria-busy", String(value));
}

async function uploadSlot(card, slot, file) {
  if (busySlot) return;
  try {
    validateFile(file);
    busySlot = slot.slotKey;
    controlsDisabled(card, true);
    setSlotMessage(card, "Subiendo y preparando variantes…");
    const alt = card.querySelector('[data-field="alt"]').value.trim();
    const focalX = card.querySelector('[data-focal="x"]').value;
    const focalY = card.querySelector('[data-focal="y"]').value;
    const response = await fetch(`/internal/admin/showcase/${encodeURIComponent(slot.slotKey)}`, {
      method: "PUT",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Content-Type": file.type,
        "X-File-Name": encodeURIComponent(file.name),
        "X-Alt-Text": encodeURIComponent(alt),
        "X-Focal-X": focalX,
        "X-Focal-Y": focalY
      },
      body: file
    });
    const payload = await readPayload(response);
    if (response.status === 401) {
      redirectToAdmin();
      throw new Error("La sesión administrativa ha caducado.");
    }
    if (response.status === 403) throw new Error("Solo PLATFORM_OWNER puede cambiar estas imágenes.");
    if (!response.ok) throw new Error(payload.message || "No se pudo subir la imagen.");
    await loadSlots({ silent: true });
  } catch (error) {
    controlsDisabled(card, false);
    setSlotMessage(card, error.message, "error");
  } finally {
    busySlot = null;
  }
}

async function saveMetadata(card, slot) {
  if (!slot.media || busySlot) return;
  busySlot = slot.slotKey;
  controlsDisabled(card, true);
  setSlotMessage(card, "Guardando descripción y foco…");
  try {
    await requestJson(`/internal/admin/showcase/${encodeURIComponent(slot.slotKey)}`, {
      method: "PATCH",
      body: {
        altText: card.querySelector('[data-field="alt"]').value.trim(),
        focalX: Number(card.querySelector('[data-focal="x"]').value),
        focalY: Number(card.querySelector('[data-focal="y"]').value)
      }
    });
    await loadSlots({ silent: true });
  } catch (error) {
    controlsDisabled(card, false);
    setSlotMessage(card, error.message, "error");
  } finally {
    busySlot = null;
  }
}

async function removeSlot(card, slot) {
  if (!slot.media || busySlot) return;
  if (!window.confirm(`¿Retirar la imagen de ${slot.label}? La web volverá a usar su imagen de respaldo.`)) return;
  busySlot = slot.slotKey;
  controlsDisabled(card, true);
  setSlotMessage(card, "Retirando imagen…");
  try {
    await requestJson(`/internal/admin/showcase/${encodeURIComponent(slot.slotKey)}`, { method: "DELETE" });
    await loadSlots({ silent: true });
  } catch (error) {
    controlsDisabled(card, false);
    setSlotMessage(card, error.message, "error");
  } finally {
    busySlot = null;
  }
}

function emptyPreview() {
  const empty = node("div", "showcase-empty");
  empty.append(
    node("strong", "", "Usando imagen de respaldo"),
    node("span", "", "Sube una imagen para reemplazar únicamente este espacio editorial.")
  );
  return empty;
}

function focalControl(axis, value) {
  const wrap = node("label", "focal-control");
  const label = node("span", "", axis === "x" ? "Foco horizontal" : "Foco vertical");
  const output = node("span", "focal-value", `${value}%`);
  output.dataset.focalValue = axis;
  const input = document.createElement("input");
  input.type = "range";
  input.min = "0";
  input.max = "100";
  input.step = "1";
  input.value = String(value);
  input.dataset.focal = axis;
  wrap.append(label, output, input);
  return wrap;
}

function slotCard(slot) {
  const card = node("article", "showcase-slot");
  card.dataset.slotKey = slot.slotKey;
  card.dataset.viewport = slot.viewport;

  const title = node("div", "showcase-slot-title");
  title.append(
    node("h3", "", slot.viewport === "MOBILE" ? "Móvil" : "Escritorio"),
    node("span", "", slot.media ? "Imagen administrada" : "Fallback activo")
  );

  const preview = node("div", "showcase-preview");
  if (slot.media) {
    const image = document.createElement("img");
    image.src = previewUrl(slot, slot.viewport === "MOBILE" ? 640 : 960);
    image.alt = slot.media.altText || "Vista previa del escaparate";
    image.loading = "lazy";
    const marker = node("span", "focal-marker");
    preview.append(image, marker);
  } else {
    preview.append(emptyPreview());
  }

  const meta = node("div", "showcase-meta");
  const altLabel = document.createElement("label");
  altLabel.textContent = "Texto alternativo";
  const alt = document.createElement("input");
  alt.type = "text";
  alt.maxLength = 240;
  alt.value = slot.media?.altText || "";
  alt.placeholder = "Describe brevemente lo que aparece en la fotografía";
  alt.dataset.field = "alt";
  altLabel.append(alt);

  const focalControls = node("div", "focal-controls");
  focalControls.append(
    focalControl("x", slot.media?.focalX ?? 50),
    focalControl("y", slot.media?.focalY ?? 50)
  );
  meta.append(altLabel, focalControls);

  const actions = node("div", "showcase-actions");
  const fileLabel = node("label", "button secondary showcase-file-label", slot.media ? "Reemplazar imagen" : "Subir imagen");
  const file = document.createElement("input");
  file.type = "file";
  file.accept = "image/jpeg,image/png,image/webp";
  file.setAttribute("aria-label", `Seleccionar imagen para ${slot.label}`);
  fileLabel.append(file);

  const save = node("button", "button ghost", "Guardar ALT y foco");
  save.type = "button";
  save.disabled = !slot.media;
  const remove = node("button", "button ghost showcase-remove", "Retirar");
  remove.type = "button";
  remove.disabled = !slot.media;
  actions.append(fileLabel, save, remove);

  const fileMeta = node("div", "showcase-file-meta");
  if (slot.media) {
    fileMeta.append(
      node("span", "", slot.media.originalFilename || "Imagen editorial"),
      node("span", "", formatBytes(slot.media.sizeBytes)),
      node("span", "", `${slot.media.originalWidth || slot.media.width} × ${slot.media.originalHeight || slot.media.height}px`)
    );
  } else {
    fileMeta.append(node("span", "", "Sin imagen administrada. La web mantiene su fotografía actual."));
  }

  const status = node("p", "showcase-status", slot.media ? `Actualizada ${formatDate(slot.media.updatedAt)}` : "Puedes dejar este espacio vacío sin afectar a la web.");
  card.append(title, preview, meta, actions, fileMeta, status);

  for (const range of card.querySelectorAll('input[type="range"]')) {
    range.addEventListener("input", () => syncFocal(card));
  }
  preview.addEventListener("click", (event) => {
    if (!slot.media) return;
    const rect = preview.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, Math.round(((event.clientX - rect.left) / rect.width) * 100)));
    const y = Math.max(0, Math.min(100, Math.round(((event.clientY - rect.top) / rect.height) * 100)));
    card.querySelector('[data-focal="x"]').value = String(x);
    card.querySelector('[data-focal="y"]').value = String(y);
    syncFocal(card);
    setSlotMessage(card, "Punto focal ajustado. Pulsa “Guardar ALT y foco”.");
  });
  file.addEventListener("change", () => {
    const selected = file.files?.[0];
    if (selected) void uploadSlot(card, slot, selected);
  });
  save.addEventListener("click", () => void saveMetadata(card, slot));
  remove.addEventListener("click", () => void removeSlot(card, slot));
  syncFocal(card);
  return card;
}

function pageSection(pageKey, pageSlots) {
  const section = node("section", "showcase-page");
  const head = node("header", "showcase-page-head");
  const copy = node("div");
  copy.append(
    node("p", "eyebrow", "Página pública"),
    node("h2", "", PAGE_META[pageKey]?.title || pageKey),
    node("p", "", PAGE_META[pageKey]?.description || "Imagen editorial administrable.")
  );
  const configured = pageSlots.filter((slot) => slot.media).length;
  const state = node("span", "showcase-page-state", `${configured}/2 configurados`);
  head.append(copy, state);

  const grid = node("div", "showcase-slot-grid");
  const ordered = [...pageSlots].sort((left, right) => (left.viewport === "DESKTOP" ? -1 : 1));
  grid.append(...ordered.map(slotCard));
  section.append(head, grid);
  return section;
}

function updateMetrics() {
  const media = slots.map((slot) => slot.media).filter(Boolean);
  byId("metric-total").textContent = String(slots.length || 10);
  byId("metric-ready").textContent = String(media.length);
  byId("metric-fallback").textContent = String((slots.length || 10) - media.length);
  const latest = media.map((item) => item.updatedAt).filter(Boolean).sort().at(-1);
  byId("metric-updated").textContent = latest ? formatDate(latest) : "—";
}

function render() {
  const target = byId("showcase-pages");
  const sections = PAGE_ORDER.map((page) => pageSection(page, slots.filter((slot) => slot.page === page)));
  target.replaceChildren(...sections);
  target.hidden = false;
  updateMetrics();
}

async function loadSlots({ silent = false } = {}) {
  if (!silent) {
    byId("loading-view").hidden = false;
    byId("showcase-pages").hidden = true;
  }
  byId("error-view").hidden = true;
  try {
    const payload = await requestJson("/internal/admin/showcase");
    slots = Array.isArray(payload.slots) ? payload.slots : [];
    render();
  } catch (error) {
    byId("error-message").textContent = error.message;
    byId("error-view").hidden = false;
  } finally {
    byId("loading-view").hidden = true;
  }
}

async function start() {
  try {
    await requireOwner();
    await loadSlots();
  } catch (error) {
    byId("loading-view").hidden = true;
    if (!document.hidden) {
      byId("error-message").textContent = error.message;
      byId("error-view").hidden = false;
    }
  }
}

byId("refresh-button").addEventListener("click", () => void loadSlots());
byId("retry-button").addEventListener("click", () => void loadSlots());
byId("logout-button").addEventListener("click", async () => {
  try { await fetch("/internal/admin/session", { method: "DELETE", credentials: "same-origin" }); }
  finally { redirectToAdmin(); }
});

void start();

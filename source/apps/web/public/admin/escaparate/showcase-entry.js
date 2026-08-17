(() => {
  "use strict";

  const ENTRY_SLOTS = new Set(["ENTRY_HERO_DESKTOP", "ENTRY_HERO_MOBILE"]);
  const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
  const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
  const target = document.getElementById("showcase-pages");
  if (!target) return;

  const node = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };

  const readPayload = (response) => response.json().catch(() => ({}));

  async function requestJson(path, options = {}) {
    const response = await fetch(path, {
      method: options.method || "GET",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        ...(options.body !== undefined ? { "Content-Type": "application/json" } : {})
      },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {})
    });
    const payload = await readPayload(response);
    if (!response.ok) throw new Error(payload.message || "No se pudo completar la operación.");
    return payload;
  }

  function validateFile(file) {
    if (!(file instanceof File) || !IMAGE_TYPES.has(file.type)) throw new Error("Solo se admiten imágenes JPEG, PNG o WebP.");
    if (file.size < 1 || file.size > MAX_IMAGE_BYTES) throw new Error("Cada imagen debe ocupar como máximo 12 MB.");
  }

  function previewUrl(slot, width) {
    const version = slot.media?.updatedAt ? `&v=${encodeURIComponent(slot.media.updatedAt)}` : "";
    return `/internal/admin/showcase/${encodeURIComponent(slot.slotKey)}/preview?width=${width}${version}`;
  }

  function setStatus(card, text, tone = "") {
    const status = card.querySelector(".showcase-status");
    status.textContent = text;
    status.className = `showcase-status${tone ? ` ${tone}` : ""}`;
  }

  function syncFocal(card) {
    const x = Number(card.querySelector('[data-entry-focal="x"]').value);
    const y = Number(card.querySelector('[data-entry-focal="y"]').value);
    card.querySelector('[data-entry-focal-value="x"]').textContent = `${x}%`;
    card.querySelector('[data-entry-focal-value="y"]').textContent = `${y}%`;
    const image = card.querySelector(".showcase-preview img");
    if (image) image.style.objectPosition = `${x}% ${y}%`;
    const marker = card.querySelector(".focal-marker");
    if (marker) {
      marker.style.left = `${x}%`;
      marker.style.top = `${y}%`;
    }
  }

  function focalControl(axis, value) {
    const label = node("label", "focal-control");
    label.append(node("span", "", axis === "x" ? "Foco horizontal" : "Foco vertical"));
    const output = node("span", "focal-value", `${value}%`);
    output.dataset.entryFocalValue = axis;
    const input = document.createElement("input");
    input.type = "range";
    input.min = "0";
    input.max = "100";
    input.step = "1";
    input.value = String(value);
    input.dataset.entryFocal = axis;
    label.append(output, input);
    return label;
  }

  async function refreshEntrySection() {
    const payload = await requestJson("/internal/admin/showcase");
    const slots = (Array.isArray(payload.slots) ? payload.slots : []).filter((slot) => ENTRY_SLOTS.has(slot.slotKey));
    renderEntry(slots);
  }

  async function upload(card, slot, file) {
    try {
      validateFile(file);
      setStatus(card, "Subiendo y preparando variantes…");
      const response = await fetch(`/internal/admin/showcase/${encodeURIComponent(slot.slotKey)}`, {
        method: "PUT",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "Content-Type": file.type,
          "X-File-Name": encodeURIComponent(file.name),
          "X-Alt-Text": encodeURIComponent(card.querySelector('[data-entry-field="alt"]').value.trim()),
          "X-Focal-X": card.querySelector('[data-entry-focal="x"]').value,
          "X-Focal-Y": card.querySelector('[data-entry-focal="y"]').value
        },
        body: file
      });
      const payload = await readPayload(response);
      if (!response.ok) throw new Error(payload.message || "No se pudo subir la imagen.");
      await refreshEntrySection();
    } catch (error) {
      setStatus(card, error.message, "error");
    }
  }

  async function save(card, slot) {
    try {
      setStatus(card, "Guardando descripción y foco…");
      await requestJson(`/internal/admin/showcase/${encodeURIComponent(slot.slotKey)}`, {
        method: "PATCH",
        body: {
          altText: card.querySelector('[data-entry-field="alt"]').value.trim(),
          focalX: Number(card.querySelector('[data-entry-focal="x"]').value),
          focalY: Number(card.querySelector('[data-entry-focal="y"]').value)
        }
      });
      await refreshEntrySection();
    } catch (error) {
      setStatus(card, error.message, "error");
    }
  }

  async function remove(card, slot) {
    if (!window.confirm(`¿Retirar la imagen de ${slot.label}? La entrada volverá al bordado de respaldo.`)) return;
    try {
      setStatus(card, "Retirando imagen…");
      await requestJson(`/internal/admin/showcase/${encodeURIComponent(slot.slotKey)}`, { method: "DELETE" });
      await refreshEntrySection();
    } catch (error) {
      setStatus(card, error.message, "error");
    }
  }

  function slotCard(slot) {
    const card = node("article", "showcase-slot");
    card.dataset.slotKey = slot.slotKey;
    card.dataset.viewport = slot.viewport;

    const title = node("div", "showcase-slot-title");
    title.append(
      node("h3", "", slot.viewport === "MOBILE" ? "Móvil" : "Escritorio"),
      node("span", "", slot.media ? "Imagen administrada" : "Bordado de respaldo")
    );

    const preview = node("div", "showcase-preview");
    if (slot.media) {
      const image = document.createElement("img");
      image.src = previewUrl(slot, slot.viewport === "MOBILE" ? 640 : 960);
      image.alt = slot.media.altText || "Vista previa de la entrada";
      image.loading = "lazy";
      preview.append(image, node("span", "focal-marker"));
    } else {
      const empty = node("div", "showcase-empty");
      empty.append(
        node("strong", "", "Bordado cinematográfico activo"),
        node("span", "", "Sube una fotografía para sustituir el fondo únicamente en este formato.")
      );
      preview.append(empty);
    }

    const meta = node("div", "showcase-meta");
    const altLabel = document.createElement("label");
    altLabel.textContent = "Texto alternativo";
    const alt = document.createElement("input");
    alt.type = "text";
    alt.maxLength = 240;
    alt.value = slot.media?.altText || "";
    alt.placeholder = "Ej.: manos bordando una pieza artesanal";
    alt.dataset.entryField = "alt";
    altLabel.append(alt);
    const focals = node("div", "focal-controls");
    focals.append(focalControl("x", slot.media?.focalX ?? 50), focalControl("y", slot.media?.focalY ?? 50));
    meta.append(altLabel, focals);

    const actions = node("div", "showcase-actions");
    const fileLabel = node("label", "button secondary showcase-file-label", slot.media ? "Reemplazar imagen" : "Subir imagen");
    const file = document.createElement("input");
    file.type = "file";
    file.accept = "image/jpeg,image/png,image/webp";
    file.setAttribute("aria-label", `Seleccionar imagen para ${slot.label}`);
    fileLabel.append(file);
    const saveButton = node("button", "button ghost", "Guardar ALT y foco");
    saveButton.type = "button";
    saveButton.disabled = !slot.media;
    const removeButton = node("button", "button ghost showcase-remove", "Retirar");
    removeButton.type = "button";
    removeButton.disabled = !slot.media;
    actions.append(fileLabel, saveButton, removeButton);

    const status = node("p", "showcase-status", slot.media ? "Fotografía activa en la entrada." : "La entrada usa actualmente el bordado de respaldo.");
    card.append(title, preview, meta, actions, status);

    for (const range of card.querySelectorAll('input[type="range"]')) range.addEventListener("input", () => syncFocal(card));
    preview.addEventListener("click", (event) => {
      if (!slot.media) return;
      const rect = preview.getBoundingClientRect();
      card.querySelector('[data-entry-focal="x"]').value = String(Math.max(0, Math.min(100, Math.round((event.clientX - rect.left) / rect.width * 100))));
      card.querySelector('[data-entry-focal="y"]').value = String(Math.max(0, Math.min(100, Math.round((event.clientY - rect.top) / rect.height * 100))));
      syncFocal(card);
      setStatus(card, "Punto focal ajustado. Pulsa “Guardar ALT y foco”.");
    });
    file.addEventListener("change", () => { if (file.files?.[0]) void upload(card, slot, file.files[0]); });
    saveButton.addEventListener("click", () => void save(card, slot));
    removeButton.addEventListener("click", () => void remove(card, slot));
    syncFocal(card);
    return card;
  }

  function renderEntry(slots) {
    target.querySelector("#showcase-entry-page")?.remove();
    if (slots.length === 0) return;

    const section = node("section", "showcase-page");
    section.id = "showcase-entry-page";
    const head = node("header", "showcase-page-head");
    const copy = node("div");
    copy.append(
      node("p", "eyebrow", "Primera impresión"),
      node("h2", "", "Entrada cinematográfica"),
      node("p", "", "Fotografía de apertura antes de entrar al Pueblo Atelier. Si se retira, vuelve automáticamente el bordado dorado de respaldo.")
    );
    head.append(copy, node("span", "showcase-page-state", `${slots.filter((slot) => slot.media).length}/2 configurados`));
    const grid = node("div", "showcase-slot-grid");
    grid.append(...[...slots].sort((a, b) => a.viewport === "DESKTOP" ? -1 : b.viewport === "DESKTOP" ? 1 : 0).map(slotCard));
    section.append(head, grid);
    target.prepend(section);
  }

  let injecting = false;
  async function inject() {
    if (injecting || target.hidden || target.querySelector("#showcase-entry-page")) return;
    injecting = true;
    try { await refreshEntrySection(); } catch { /* el editor principal mantiene el estado de error */ }
    finally { injecting = false; }
  }

  const observer = new MutationObserver(() => {
    if (!target.hidden && !target.querySelector("#showcase-entry-page")) void inject();
  });
  observer.observe(target, { childList: true, attributes: true, attributeFilter: ["hidden"] });
  void inject();
})();

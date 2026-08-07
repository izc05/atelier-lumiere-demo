let galleryOrderBusy = false;

function orderedGalleryItems() {
  return mediaFor("GALLERY");
}

function galleryOrderButton(label, disabled, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "mini-button gallery-order-button";
  button.textContent = label;
  button.disabled = disabled;
  button.addEventListener("click", onClick);
  return button;
}

function renderGalleryOrderControls() {
  const container = byId("gallery-media");
  if (!container) return;
  const items = orderedGalleryItems();
  const cards = [...container.querySelectorAll(":scope > .media-card")];
  if (cards.length !== items.length) return;

  cards.forEach((card, index) => {
    card.querySelector(".gallery-order-actions")?.remove();
    const item = items[index];
    card.dataset.galleryMediaId = item.id;

    const controls = document.createElement("div");
    controls.className = "gallery-order-actions";
    const position = document.createElement("span");
    position.className = "gallery-order-position";
    position.textContent = `Posición ${index + 1} de ${items.length}`;

    const buttons = document.createElement("div");
    buttons.className = "gallery-order-buttons";
    const locked = isLocked() || mediaBusy || galleryOrderBusy;
    const up = galleryOrderButton("Subir", locked || index === 0, () => void moveGalleryItem(index, -1));
    up.setAttribute("aria-label", `Subir fotografía ${index + 1}`);
    const down = galleryOrderButton("Bajar", locked || index === items.length - 1, () => void moveGalleryItem(index, 1));
    down.setAttribute("aria-label", `Bajar fotografía ${index + 1}`);
    buttons.append(up, down);
    controls.append(position, buttons);
    card.querySelector(".media-card-body")?.append(controls);
  });
}

async function moveGalleryItem(index, direction) {
  if (isLocked() || mediaBusy || galleryOrderBusy) return;
  const items = orderedGalleryItems();
  const target = index + direction;
  if (target < 0 || target >= items.length) return;

  const mediaIds = items.map((item) => item.id);
  [mediaIds[index], mediaIds[target]] = [mediaIds[target], mediaIds[index]];
  galleryOrderBusy = true;
  mediaMessage("Guardando el nuevo orden de la galería…");
  renderGalleryOrderControls();

  try {
    await request("/internal/provider/profile/media/reorder", {
      method: "POST",
      body: { mediaIds }
    });
    await reloadProfileAndMedia({ preserveFeatured: true });
    mediaMessage("Orden de la galería guardado en el borrador privado.", "success");
  } catch (error) {
    mediaMessage(error.message, "error");
    if (error.message.includes("galería ha cambiado")) {
      await reloadProfileAndMedia({ preserveFeatured: true }).catch(() => {});
    }
  } finally {
    galleryOrderBusy = false;
    renderGalleryOrderControls();
  }
}

const galleryContainer = byId("gallery-media");
if (galleryContainer) {
  const galleryObserver = new MutationObserver(() => queueMicrotask(renderGalleryOrderControls));
  galleryObserver.observe(galleryContainer, { childList: true });
  renderGalleryOrderControls();
}
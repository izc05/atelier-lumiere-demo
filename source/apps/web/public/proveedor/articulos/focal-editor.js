const FOCAL_UUID_PATTERN = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const FOCAL_MEDIA_PATTERN = new RegExp(`/media/(${FOCAL_UUID_PATTERN})/preview`, "i");
const FOCAL_PRODUCT_PATTERN = new RegExp(`^${FOCAL_UUID_PATTERN}$`, "i");

const focalState = {
  productId: null,
  productStatus: null,
  editable: false,
  publication: null,
  media: new Map()
};

function focalNode(tag, className, text) {
  const value = document.createElement(tag);
  if (className) value.className = className;
  if (text !== undefined) value.textContent = text;
  return value;
}

function focalProductId() {
  const value = new URL(window.location.href).searchParams.get("id")?.trim() ?? "";
  return FOCAL_PRODUCT_PATTERN.test(value) ? value : null;
}

async function focalRequest(path, options = {}) {
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
  if (!response.ok) throw new Error(payload.message || "No se pudo completar la operación.");
  return payload;
}

function focalMediaId(card) {
  const image = card.querySelector(".media-visual img");
  return image?.src.match(FOCAL_MEDIA_PATTERN)?.[1]?.toLowerCase() ?? null;
}

function focalPosition(image, marker, item) {
  const x = Math.min(100, Math.max(0, Number(item.focalX ?? 50)));
  const y = Math.min(100, Math.max(0, Number(item.focalY ?? 50)));
  image.style.objectPosition = `${x}% ${y}%`;
  marker.style.left = `${x}%`;
  marker.style.top = `${y}%`;
}

function focalControl(labelText, value, axis) {
  const label = focalNode("label", "focal-field");
  const heading = focalNode("span", "focal-field-heading");
  const name = focalNode("span", "", labelText);
  const output = focalNode("output", "focal-output", `${value}%`);
  heading.append(name, output);
  const input = document.createElement("input");
  input.type = "range";
  input.min = "0";
  input.max = "100";
  input.step = "1";
  input.value = String(value);
  input.dataset.axis = axis;
  label.append(heading, input);
  return { label, input, output };
}

function publicationDescription(status, publication) {
  if (!publication?.exists) {
    return status === "PUBLISHED"
      ? "La versión pública necesita actualizarse antes de preparar una revisión."
      : "";
  }
  if (!publication.visible) {
    return "La versión pública está pausada y no aparece en la tienda. Puedes seguir preparando cambios con normalidad.";
  }
  switch (status) {
    case "PUBLISHED":
      return "La pieza está visible en la tienda. Al empezar una edición, esta versión seguirá publicada hasta que Administración apruebe y publique la nueva.";
    case "DRAFT":
      return "Estás preparando una nueva versión. La versión anterior continúa visible en la tienda mientras guardas el borrador.";
    case "CHANGES_REQUESTED":
      return "Corrige la nueva versión con tranquilidad: la versión anterior continúa visible en la tienda.";
    case "IN_REVIEW":
      return "Los cambios están en revisión. La tienda mantiene la última versión publicada hasta que se aprueben.";
    case "APPROVED":
      return "La nueva versión está aprobada. La tienda mantendrá la anterior hasta que Administración pulse Publicar.";
    default:
      return "Existe una versión pública independiente de los cambios que estás preparando.";
  }
}

function renderPublicationControls() {
  const content = document.getElementById("editor-content");
  const lockedBanner = document.getElementById("locked-banner");
  if (!content || !lockedBanner) return;

  let panel = document.getElementById("publication-revision-panel");
  if (!panel) {
    panel = focalNode("section", "publication-revision-panel");
    panel.id = "publication-revision-panel";
    lockedBanner.insertAdjacentElement("afterend", panel);
  }

  const publication = focalState.publication;
  if (!publication?.exists && focalState.productStatus !== "PUBLISHED") {
    panel.hidden = true;
    panel.replaceChildren();
    return;
  }
  panel.hidden = false;

  const copy = focalNode("div", "publication-revision-copy");
  copy.append(
    focalNode("p", "eyebrow", publication?.visible === false ? "Publicación pausada" : "Versión pública protegida"),
    focalNode(
      "h2",
      "publication-revision-title",
      focalState.productStatus === "PUBLISHED" ? "Editar sin retirar la pieza" : "La tienda conserva la versión anterior"
    ),
    focalNode("p", "publication-revision-help", publicationDescription(focalState.productStatus, publication))
  );

  if (publication?.exists) {
    const metadata = focalNode("p", "publication-revision-meta");
    metadata.textContent = `Versión pública ${publication.revision}${publication.visible ? " · Visible" : " · Pausada"}`;
    copy.append(metadata);
  }

  const actions = focalNode("div", "publication-revision-actions");
  const status = focalNode("p", "message publication-revision-message");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");

  if (focalState.productStatus === "PUBLISHED" && publication?.exists) {
    const edit = focalNode("button", "button primary", "Editar artículo publicado");
    edit.type = "button";
    edit.addEventListener("click", async () => {
      if (!window.confirm(
        "Se abrirá una nueva versión editable. La versión actual seguirá visible hasta que los cambios se aprueben y publiquen."
      )) return;
      edit.disabled = true;
      status.textContent = "Preparando una copia editable…";
      status.className = "message publication-revision-message";
      try {
        await focalRequest(
          `/internal/provider/products/${focalState.productId}/publication/edit`,
          { method: "POST" }
        );
        status.textContent = "Versión editable preparada. Recargando la ficha…";
        status.className = "message publication-revision-message success";
        window.location.reload();
      } catch (error) {
        status.textContent = error.message;
        status.className = "message publication-revision-message error";
        edit.disabled = false;
      }
    });
    actions.append(edit);
  }

  if (publication?.exists) {
    const visibility = focalNode(
      "button",
      "button secondary",
      publication.visible ? "Pausar publicación" : "Reactivar publicación"
    );
    visibility.type = "button";
    visibility.addEventListener("click", async () => {
      const nextVisible = !publication.visible;
      const confirmation = nextVisible
        ? "¿Volver a mostrar esta pieza en la tienda?"
        : "¿Ocultar temporalmente esta pieza de la tienda? No se borrará ningún dato.";
      if (!window.confirm(confirmation)) return;
      visibility.disabled = true;
      status.textContent = nextVisible ? "Reactivando publicación…" : "Pausando publicación…";
      status.className = "message publication-revision-message";
      try {
        const payload = await focalRequest(
          `/internal/provider/products/${focalState.productId}/publication/${nextVisible ? "resume" : "pause"}`,
          { method: "POST" }
        );
        focalState.publication = payload.publication;
        renderPublicationControls();
      } catch (error) {
        status.textContent = error.message;
        status.className = "message publication-revision-message error";
        visibility.disabled = false;
      }
    });
    actions.append(visibility);
  }

  const controls = focalNode("div", "publication-revision-controls");
  controls.append(actions, status);
  panel.replaceChildren(copy, controls);
}

function enhanceFocalCard(card) {
  if (card.dataset.focalEnhanced === "true") return;
  const mediaId = focalMediaId(card);
  const image = card.querySelector(".media-visual img");
  const body = card.querySelector(".media-body");
  const visual = card.querySelector(".media-visual");
  if (!mediaId || !image || !body || !visual) return;

  card.dataset.focalEnhanced = "true";
  const item = focalState.media.get(mediaId) ?? {
    id: mediaId,
    focalX: 50,
    focalY: 50
  };
  focalState.media.set(mediaId, item);

  visual.classList.add("focal-preview");
  visual.title = "Pulsa sobre la fotografía para situar el punto principal";
  const marker = focalNode("span", "focal-marker");
  marker.setAttribute("aria-hidden", "true");
  visual.append(marker);
  focalPosition(image, marker, item);

  const panel = focalNode("section", "focal-panel");
  panel.append(
    focalNode("strong", "focal-title", "Encuadre de la miniatura"),
    focalNode(
      "p",
      "focal-help",
      "Mueve el punto hacia el producto que debe permanecer visible cuando la fotografía se recorte."
    )
  );

  const xControl = focalControl("Horizontal", item.focalX ?? 50, "x");
  const yControl = focalControl("Vertical", item.focalY ?? 50, "y");
  const controls = focalNode("div", "focal-controls");
  controls.append(xControl.label, yControl.label);
  panel.append(controls);

  const actions = focalNode("div", "focal-actions");
  const reset = focalNode("button", "button ghost focal-reset", "Centrar");
  reset.type = "button";
  const save = focalNode("button", "button secondary focal-save", "Guardar encuadre");
  save.type = "button";
  const status = focalNode("p", "message focal-message");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  actions.append(reset, save);
  panel.append(actions, status);
  body.append(panel);

  function update() {
    item.focalX = Number(xControl.input.value);
    item.focalY = Number(yControl.input.value);
    xControl.output.textContent = `${item.focalX}%`;
    yControl.output.textContent = `${item.focalY}%`;
    focalPosition(image, marker, item);
    status.textContent = "Cambios sin guardar.";
    status.className = "message focal-message warning";
  }

  xControl.input.addEventListener("input", update);
  yControl.input.addEventListener("input", update);
  visual.addEventListener("click", (event) => {
    if (!focalState.editable) return;
    const bounds = visual.getBoundingClientRect();
    xControl.input.value = String(Math.round(((event.clientX - bounds.left) / bounds.width) * 100));
    yControl.input.value = String(Math.round(((event.clientY - bounds.top) / bounds.height) * 100));
    update();
  });
  reset.addEventListener("click", () => {
    xControl.input.value = "50";
    yControl.input.value = "50";
    update();
  });
  save.addEventListener("click", async () => {
    save.disabled = true;
    status.textContent = "Guardando encuadre…";
    status.className = "message focal-message";
    try {
      const payload = await focalRequest(
        `/internal/provider/products/${focalState.productId}/media-focal/${mediaId}`,
        {
          method: "PATCH",
          body: JSON.stringify({ focalX: item.focalX, focalY: item.focalY })
        }
      );
      Object.assign(item, payload.focal);
      focalPosition(image, marker, item);
      status.textContent = "Encuadre guardado. La tienda usará esta posición.";
      status.className = "message focal-message success";
    } catch (error) {
      status.textContent = error.message;
      status.className = "message focal-message error";
    } finally {
      save.disabled = !focalState.editable;
    }
  });

  for (const control of [xControl.input, yControl.input, reset, save]) {
    control.disabled = !focalState.editable;
  }
  if (!focalState.editable) {
    status.textContent = focalState.productStatus === "IN_REVIEW"
      ? "El encuadre queda bloqueado mientras el artículo está en revisión."
      : "El encuadre no se puede modificar en este estado.";
  }
}

function enhanceFocalCards() {
  for (const card of document.querySelectorAll("#media-grid .media-card")) enhanceFocalCard(card);
}

async function startFocalEditor() {
  focalState.productId = focalProductId();
  if (!focalState.productId) return;

  try {
    const payload = await focalRequest(
      `/internal/provider/products/${focalState.productId}/media-focal`
    );
    focalState.productStatus = payload.productStatus;
    focalState.editable = Boolean(payload.editable);
    focalState.publication = payload.publication ?? null;
    for (const item of payload.media ?? []) focalState.media.set(item.id.toLowerCase(), item);
    renderPublicationControls();
  } catch (error) {
    const message = document.getElementById("media-message");
    if (message) {
      message.textContent = error.message;
      message.className = "message error";
    }
    return;
  }

  const grid = document.getElementById("media-grid");
  if (!grid) return;
  new MutationObserver(enhanceFocalCards).observe(grid, { childList: true, subtree: true });
  enhanceFocalCards();
}

void startFocalEditor();

const FOCAL_UUID_PATTERN = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const FOCAL_MEDIA_PATTERN = new RegExp(`/media/(${FOCAL_UUID_PATTERN})/preview`, "i");
const FOCAL_PRODUCT_PATTERN = new RegExp(`^${FOCAL_UUID_PATTERN}$`, "i");

const focalState = {
  productId: null,
  productStatus: null,
  editable: false,
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
  if (!response.ok) throw new Error(payload.message || "No se pudo guardar el encuadre.");
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
    for (const item of payload.media ?? []) focalState.media.set(item.id.toLowerCase(), item);
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

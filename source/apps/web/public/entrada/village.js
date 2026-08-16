const WORLD_WIDTH = 2400;
const WORLD_HEIGHT = 1500;
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
const MOBILE_QUERY = "(max-width: 760px)";

const experience = document.querySelector("[data-village-experience]");
const viewport = document.querySelector("[data-village-viewport]");
const world = document.querySelector("[data-village-world]");
const hint = document.querySelector("[data-village-hint]");
const overviewButton = document.querySelector("[data-village-overview]");
const focusButtons = [...document.querySelectorAll("[data-focus-place]")];
const zoomButtons = [...document.querySelectorAll("[data-village-zoom]")];

/* E1.2 · Los talleres se separan de la plaza para que el pueblo se recorra,
 * en lugar de percibirse como tres iconos alrededor de un único centro.
 */
const places = Object.freeze({
  atelier: { x: 1200, y: 735, desktopScale: .98, mobileScale: .82 },
  izc: { x: 430, y: 1190, desktopScale: 1.14, mobileScale: .84 },
  stitch: { x: 2010, y: 285, desktopScale: 1.12, mobileScale: .84 }
});

const placeLabels = Object.freeze({
  overview: "Vista general del Pueblo Atelier",
  atelier: "Atelier Lumière, plaza central",
  izc: "IZC, abanicos artesanales en Jaén",
  stitch: "The Gentle Stitch, bordado textil"
});

let state = {
  x: 0,
  y: 0,
  scale: 1,
  selected: "overview",
  dragging: false,
  pointerId: null,
  lastX: 0,
  lastY: 0
};

let transitionTimer = null;
let resizeTimer = null;
let liveStatus = null;
const reducedMotion = window.matchMedia(REDUCED_MOTION);
const mobile = window.matchMedia(MOBILE_QUERY);

document.documentElement.classList.remove("no-js");
document.documentElement.classList.add("js");

function applyPhaseE12Layout() {
  const atelier = document.querySelector('[data-place="atelier"]');
  const izc = document.querySelector('[data-place="izc"]');
  const stitch = document.querySelector('[data-place="stitch"]');
  if (atelier) {
    atelier.style.setProperty("--x", String(places.atelier.x));
    atelier.style.setProperty("--y", String(places.atelier.y));
    atelier.style.setProperty("--scale", "1.02");
  }
  if (izc) {
    izc.style.setProperty("--x", String(places.izc.x));
    izc.style.setProperty("--y", String(places.izc.y));
    izc.style.setProperty("--scale", ".92");
  }
  if (stitch) {
    stitch.style.setProperty("--x", String(places.stitch.x));
    stitch.style.setProperty("--y", String(places.stitch.y));
    stitch.style.setProperty("--scale", ".9");
  }

  const style = document.createElement("style");
  style.dataset.villagePhase = "e12";
  style.textContent = `
    /* E1.2: más territorio aparente, menos densidad y más profundidad. */
    .village-ground { filter: saturate(.92) contrast(.99); }
    .village-houses { opacity: .82; }
    .village-houses .house { transform-origin: 50% 100%; }
    .village-trees { opacity: .82; }
    .roads { opacity: .86; }
    .road-lines { opacity: .34 !important; }
    .future-quarter { opacity: .58; }
    .village-compass { opacity: .7; }
    .village-header { background: linear-gradient(to bottom, rgba(247,240,231,.92), rgba(247,240,231,.55) 72%, transparent); }
    .village-navigation { background: rgba(255,253,249,.84); }
    .village-lab-note { font-size: 0; }
    .village-lab-note::after {
      content: "Laboratorio E4 · navegación y accesibilidad · Home intacta";
      font-size: .48rem;
    }
    @media (min-width: 761px) {
      .village-landmark { width: 255px; height: 270px; }
      .village-houses .house { width: 102px; height: 77px; }
    }
  `;
  document.head.append(style);
}

function visuallyHidden(node) {
  Object.assign(node.style, {
    position: "absolute",
    width: "1px",
    height: "1px",
    padding: "0",
    margin: "-1px",
    overflow: "hidden",
    clip: "rect(0,0,0,0)",
    whiteSpace: "nowrap",
    border: "0"
  });
  return node;
}

function ensureAccessibilitySupport() {
  if (!experience || !viewport) return;

  const instructions = visuallyHidden(document.createElement("p"));
  instructions.id = "village-keyboard-help";
  instructions.textContent = "Pueblo interactivo. Usa la barra de destinos para enfocar lugares. Pulsa un edificio para entrar. Con teclado: flechas para recorrer, más y menos para zoom, Escape, Inicio o cero para volver a la vista general.";

  liveStatus = visuallyHidden(document.createElement("p"));
  liveStatus.id = "village-live-status";
  liveStatus.setAttribute("role", "status");
  liveStatus.setAttribute("aria-live", "polite");
  liveStatus.setAttribute("aria-atomic", "true");

  experience.append(instructions, liveStatus);
  viewport.setAttribute("tabindex", "0");
  viewport.setAttribute("aria-describedby", instructions.id);

  overviewButton?.setAttribute("aria-keyshortcuts", "Escape Home 0");
  zoomButtons.find((button) => button.dataset.villageZoom === "in")?.setAttribute("aria-keyshortcuts", "+");
  zoomButtons.find((button) => button.dataset.villageZoom === "out")?.setAttribute("aria-keyshortcuts", "-");

  const landmarkLabels = {
    atelier: "Entrar en Atelier Lumière",
    izc: "Entrar en el taller IZC",
    stitch: "Entrar en el taller The Gentle Stitch"
  };
  for (const hit of document.querySelectorAll(".landmark-hit[data-focus-place]")) {
    const place = hit.dataset.focusPlace;
    if (landmarkLabels[place]) hit.setAttribute("aria-label", landmarkLabels[place]);
  }

  for (const button of document.querySelectorAll(".village-navigation [data-focus-place]")) {
    const place = button.dataset.focusPlace;
    button.setAttribute("aria-label", `Enfocar ${placeLabels[place] || "destino"} en el mapa`);
  }
}

function announce(text) {
  if (!liveStatus || !text) return;
  liveStatus.textContent = "";
  window.setTimeout(() => {
    if (liveStatus) liveStatus.textContent = text;
  }, 20);
}

function viewportSize() {
  return {
    width: Math.max(1, viewport?.clientWidth || window.innerWidth),
    height: Math.max(1, viewport?.clientHeight || window.innerHeight)
  };
}

function limitsForScale(scale) {
  const { width, height } = viewportSize();
  const scaledWidth = WORLD_WIDTH * scale;
  const scaledHeight = WORLD_HEIGHT * scale;
  const overscroll = mobile.matches ? 70 : 150;

  let minX;
  let maxX;
  let minY;
  let maxY;

  if (scaledWidth <= width) {
    minX = maxX = (width - scaledWidth) / 2;
  } else {
    minX = width - scaledWidth - overscroll;
    maxX = overscroll;
  }

  if (scaledHeight <= height) {
    minY = maxY = (height - scaledHeight) / 2;
  } else {
    minY = height - scaledHeight - overscroll;
    maxY = overscroll;
  }

  return { minX, maxX, minY, maxY };
}

function clampTransform() {
  const limits = limitsForScale(state.scale);
  state.x = Math.min(limits.maxX, Math.max(limits.minX, state.x));
  state.y = Math.min(limits.maxY, Math.max(limits.minY, state.y));
}

function scaleBounds() {
  const { width, height } = viewportSize();
  const fit = Math.min(width / WORLD_WIDTH, height / WORLD_HEIGHT);
  return {
    min: mobile.matches ? Math.max(.27, fit * .96) : Math.max(.42, fit * .86),
    max: mobile.matches ? 1.18 : 1.7
  };
}

function setTransition(active) {
  window.clearTimeout(transitionTimer);
  if (!world) return;
  if (!active || reducedMotion.matches) {
    world.style.transition = "none";
    return;
  }
  world.style.transition = "transform 980ms cubic-bezier(.22,.72,.18,1)";
  transitionTimer = window.setTimeout(() => {
    if (!state.dragging) world.style.transition = "none";
  }, 1040);
}

function render({ animate = false } = {}) {
  if (!world) return;
  clampTransform();
  setTransition(animate);
  world.style.transform = `translate3d(${state.x}px, ${state.y}px, 0) scale(${state.scale})`;
}

function setSelected(place) {
  state.selected = place;
  for (const button of focusButtons) {
    const active = button.dataset.focusPlace === place;
    button.classList.toggle("is-active", active);
    if (active) {
      button.setAttribute("aria-current", "true");
      if (mobile.matches && button.closest(".village-navigation")) {
        button.scrollIntoView({
          behavior: reducedMotion.matches ? "auto" : "smooth",
          block: "nearest",
          inline: "center"
        });
      }
    } else {
      button.removeAttribute("aria-current");
    }
  }
  if (placeLabels[place]) announce(`${placeLabels[place]} enfocado.`);
}

function updateHint() {
  const label = hint?.querySelector("span");
  if (!label) return;
  label.textContent = mobile.matches
    ? "Barra: enfocar · edificio: entrar · arrastra para recorrer"
    : "Arrastra para recorrer · rueda para zoom · edificio para entrar";
}

function hideHint() {
  hint?.classList.add("is-hidden");
}

function overviewTransform() {
  const { width, height } = viewportSize();
  const horizontalPadding = mobile.matches ? 30 : 120;
  const verticalPadding = mobile.matches ? 120 : 112;
  const scaleX = Math.max(1, width - horizontalPadding * 2) / WORLD_WIDTH;
  const scaleY = Math.max(1, height - verticalPadding * 2) / WORLD_HEIGHT;
  const natural = Math.min(scaleX, scaleY);
  const scale = mobile.matches
    ? Math.max(.31, Math.min(.46, natural * 1.28))
    : Math.max(.46, Math.min(.62, natural * 1.01));
  return {
    scale,
    x: (width - WORLD_WIDTH * scale) / 2,
    y: (height - WORLD_HEIGHT * scale) / 2 + (mobile.matches ? -12 : 20)
  };
}

function focusOverview({ animate = true } = {}) {
  const next = overviewTransform();
  state.scale = next.scale;
  state.x = next.x;
  state.y = next.y;
  setSelected("overview");
  render({ animate });
}

function focusPlace(name, { animate = true } = {}) {
  if (name === "overview") {
    focusOverview({ animate });
    return;
  }
  const place = places[name];
  if (!place) return;
  const { width, height } = viewportSize();
  const bounds = scaleBounds();
  const desired = mobile.matches ? place.mobileScale : place.desktopScale;
  state.scale = Math.min(bounds.max, Math.max(bounds.min, desired));

  const verticalBias = mobile.matches ? -18 : 28;
  state.x = width / 2 - place.x * state.scale;
  state.y = height / 2 - place.y * state.scale + verticalBias;
  setSelected(name);
  hideHint();
  render({ animate });
}

function clearSelectedForFreeExplore() {
  if (state.selected === "custom") return;
  state.selected = "custom";
  for (const button of focusButtons) {
    button.classList.remove("is-active");
    button.removeAttribute("aria-current");
  }
  announce("Exploración libre del Pueblo Atelier.");
}

function zoomAt(screenX, screenY, factor, { animate = false } = {}) {
  const bounds = scaleBounds();
  const previous = state.scale;
  const next = Math.min(bounds.max, Math.max(bounds.min, previous * factor));
  if (Math.abs(next - previous) < .0001) return;

  const worldX = (screenX - state.x) / previous;
  const worldY = (screenY - state.y) / previous;
  state.scale = next;
  state.x = screenX - worldX * next;
  state.y = screenY - worldY * next;
  clearSelectedForFreeExplore();
  hideHint();
  render({ animate });
}

function zoomFromCenter(factor) {
  const { width, height } = viewportSize();
  zoomAt(width / 2, height / 2, factor, { animate: true });
}

function beginDrag(event) {
  if (!viewport || event.button !== 0 || event.target.closest("button, a")) return;
  state.dragging = true;
  state.pointerId = event.pointerId;
  state.lastX = event.clientX;
  state.lastY = event.clientY;
  viewport.classList.add("is-dragging");
  viewport.setPointerCapture?.(event.pointerId);
  setTransition(false);
  hideHint();
}

function moveDrag(event) {
  if (!state.dragging || event.pointerId !== state.pointerId) return;
  const dx = event.clientX - state.lastX;
  const dy = event.clientY - state.lastY;
  state.lastX = event.clientX;
  state.lastY = event.clientY;
  state.x += dx;
  state.y += dy;
  clearSelectedForFreeExplore();
  render();
}

function endDrag(event) {
  if (!state.dragging || (event?.pointerId !== undefined && event.pointerId !== state.pointerId)) return;
  state.dragging = false;
  state.pointerId = null;
  viewport?.classList.remove("is-dragging");
  if (event?.pointerId !== undefined) viewport?.releasePointerCapture?.(event.pointerId);
}

function onWheel(event) {
  if (!viewport) return;
  event.preventDefault();
  const rect = viewport.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const factor = Math.exp(-event.deltaY * .00105);
  zoomAt(x, y, factor);
}

function onKeydown(event) {
  if (event.defaultPrevented || ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
  const step = event.shiftKey ? 95 : 48;
  if (event.key === "+" || event.key === "=") {
    event.preventDefault();
    zoomFromCenter(1.14);
  } else if (event.key === "-") {
    event.preventDefault();
    zoomFromCenter(1 / 1.14);
  } else if (event.key === "Escape" || event.key === "Home" || event.key === "0") {
    event.preventDefault();
    focusOverview();
  } else if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
    event.preventDefault();
    if (event.key === "ArrowLeft") state.x += step;
    if (event.key === "ArrowRight") state.x -= step;
    if (event.key === "ArrowUp") state.y += step;
    if (event.key === "ArrowDown") state.y -= step;
    clearSelectedForFreeExplore();
    render({ animate: true });
    hideHint();
  }
}

function onResize() {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    updateHint();
    if (state.selected === "overview") focusOverview({ animate: false });
    else if (places[state.selected]) focusPlace(state.selected, { animate: false });
    else render();
  }, 80);
}

for (const button of focusButtons) {
  button.addEventListener("click", () => focusPlace(button.dataset.focusPlace));
}
overviewButton?.addEventListener("click", () => focusOverview());
for (const button of zoomButtons) {
  button.addEventListener("click", () => {
    zoomFromCenter(button.dataset.villageZoom === "in" ? 1.16 : 1 / 1.16);
  });
}

viewport?.addEventListener("pointerdown", beginDrag);
viewport?.addEventListener("pointermove", moveDrag);
viewport?.addEventListener("pointerup", endDrag);
viewport?.addEventListener("pointercancel", endDrag);
viewport?.addEventListener("wheel", onWheel, { passive: false });
window.addEventListener("keydown", onKeydown);
window.addEventListener("resize", onResize, { passive: true });
mobile.addEventListener?.("change", () => onResize());
reducedMotion.addEventListener?.("change", () => render());

applyPhaseE12Layout();
ensureAccessibilitySupport();
updateHint();
if (mobile.matches) focusPlace("atelier", { animate: false });
else focusOverview({ animate: false });
window.setTimeout(hideHint, 6500);

if (experience) {
  experience.dataset.villageReady = "true";
  experience.dataset.villagePhase = "e4";
  window.dispatchEvent(new CustomEvent("atelier:village-ready", { detail: { phase: "e4" } }));
}

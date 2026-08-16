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

const places = Object.freeze({
  atelier: { x: 1200, y: 720, desktopScale: 1.05, mobileScale: .82 },
  izc: { x: 615, y: 1015, desktopScale: 1.18, mobileScale: .84 },
  stitch: { x: 1810, y: 370, desktopScale: 1.16, mobileScale: .84 }
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
const reducedMotion = window.matchMedia(REDUCED_MOTION);
const mobile = window.matchMedia(MOBILE_QUERY);

document.documentElement.classList.remove("no-js");
document.documentElement.classList.add("js");

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
  const overscroll = mobile.matches ? 70 : 120;

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
    min: mobile.matches ? Math.max(.27, fit * .98) : Math.max(.5, fit * .92),
    max: mobile.matches ? 1.18 : 1.75
  };
}

function setTransition(active) {
  window.clearTimeout(transitionTimer);
  if (!world) return;
  if (!active || reducedMotion.matches) {
    world.style.transition = "none";
    return;
  }
  world.style.transition = "transform 920ms cubic-bezier(.22,.72,.18,1)";
  transitionTimer = window.setTimeout(() => {
    if (!state.dragging) world.style.transition = "none";
  }, 980);
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
      if (mobile.matches) {
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
}

function updateHint() {
  const label = hint?.querySelector("span");
  if (!label) return;
  label.textContent = mobile.matches
    ? "Toca un destino o arrastra el pueblo"
    : "Arrastra para recorrer el pueblo";
}

function hideHint() {
  hint?.classList.add("is-hidden");
}

function overviewTransform() {
  const { width, height } = viewportSize();
  const horizontalPadding = mobile.matches ? 30 : 90;
  const verticalPadding = mobile.matches ? 120 : 90;
  const scaleX = Math.max(1, width - horizontalPadding * 2) / WORLD_WIDTH;
  const scaleY = Math.max(1, height - verticalPadding * 2) / WORLD_HEIGHT;
  const natural = Math.min(scaleX, scaleY);
  const scale = mobile.matches
    ? Math.max(.31, Math.min(.48, natural * 1.35))
    : Math.max(.54, Math.min(.72, natural * 1.08));
  return {
    scale,
    x: (width - WORLD_WIDTH * scale) / 2,
    y: (height - WORLD_HEIGHT * scale) / 2 + (mobile.matches ? -12 : 14)
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

  const verticalBias = mobile.matches ? -18 : 22;
  state.x = width / 2 - place.x * state.scale;
  state.y = height / 2 - place.y * state.scale + verticalBias;
  setSelected(name);
  hideHint();
  render({ animate });
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
  state.selected = "custom";
  for (const button of focusButtons) {
    button.classList.remove("is-active");
    button.removeAttribute("aria-current");
  }
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
  state.selected = "custom";
  for (const button of focusButtons) {
    button.classList.remove("is-active");
    button.removeAttribute("aria-current");
  }
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
  const factor = Math.exp(-event.deltaY * .00115);
  zoomAt(x, y, factor);
}

function onKeydown(event) {
  if (event.defaultPrevented || ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
  const step = event.shiftKey ? 85 : 42;
  if (event.key === "+" || event.key === "=") {
    event.preventDefault();
    zoomFromCenter(1.14);
  } else if (event.key === "-") {
    event.preventDefault();
    zoomFromCenter(1 / 1.14);
  } else if (event.key === "Home" || event.key === "0") {
    event.preventDefault();
    focusOverview();
  } else if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
    event.preventDefault();
    if (event.key === "ArrowLeft") state.x += step;
    if (event.key === "ArrowRight") state.x -= step;
    if (event.key === "ArrowUp") state.y += step;
    if (event.key === "ArrowDown") state.y -= step;
    state.selected = "custom";
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

updateHint();
if (mobile.matches) focusPlace("atelier", { animate: false });
else focusOverview({ animate: false });
window.setTimeout(hideHint, 6500);

if (experience) {
  experience.dataset.villageReady = "true";
  window.dispatchEvent(new CustomEvent("atelier:village-ready"));
}

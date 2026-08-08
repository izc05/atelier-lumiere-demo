function homeFramingPercent(value, fallback = 50) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(100, Math.max(0, parsed));
}

function homeClamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function homeCoverGeometry(containerWidth, containerHeight, sourceWidth, sourceHeight, focalX, focalY) {
  if (![containerWidth, containerHeight, sourceWidth, sourceHeight]
    .every((value) => Number.isFinite(value) && value > 0)) return null;

  const scale = Math.max(containerWidth / sourceWidth, containerHeight / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  const desiredLeft = (containerWidth / 2) - (width * focalX / 100);
  const desiredTop = (containerHeight / 2) - (height * focalY / 100);
  return {
    width,
    height,
    left: homeClamp(desiredLeft, containerWidth - width, 0),
    top: homeClamp(desiredTop, containerHeight - height, 0)
  };
}

function applyHomeCoverFraming(image, visual, cover) {
  const focalX = homeFramingPercent(cover?.focalX);
  const focalY = homeFramingPercent(cover?.focalY);

  visual.style.setProperty("position", "relative", "important");
  visual.style.setProperty("overflow", "hidden", "important");
  image.style.setProperty("display", "block", "important");
  image.style.setProperty("max-width", "none", "important");
  image.style.setProperty("max-height", "none", "important");
  image.style.setProperty("object-fit", "cover", "important");
  image.style.setProperty("object-position", `${focalX}% ${focalY}%`, "important");
  image.style.setProperty("padding", "0", "important");

  const render = () => {
    if (!visual.isConnected) return;
    const sourceWidth = image.naturalWidth || Number(cover?.width);
    const sourceHeight = image.naturalHeight || Number(cover?.height);
    const geometry = homeCoverGeometry(
      visual.clientWidth,
      visual.clientHeight,
      sourceWidth,
      sourceHeight,
      focalX,
      focalY
    );
    if (!geometry) return;

    image.style.setProperty("position", "absolute", "important");
    image.style.setProperty("width", `${geometry.width}px`, "important");
    image.style.setProperty("height", `${geometry.height}px`, "important");
    image.style.setProperty("left", `${geometry.left}px`, "important");
    image.style.setProperty("top", `${geometry.top}px`, "important");
    image.style.setProperty("object-fit", "fill", "important");
    image.style.setProperty("object-position", "50% 50%", "important");
  };

  image.addEventListener("load", render, { once: true });
  if (image.complete && image.naturalWidth > 0) queueMicrotask(render);

  if (typeof ResizeObserver === "function") {
    const observer = new ResizeObserver(() => {
      if (!visual.isConnected) {
        observer.disconnect();
        return;
      }
      render();
    });
    observer.observe(visual);
  }
}

async function loadHomeProductFraming() {
  const container = document.getElementById("featured-products");
  if (!container) return;

  const response = await fetch("/internal/catalog/products", {
    headers: { Accept: "application/json" }
  });
  if (!response.ok) return;
  const payload = await response.json().catch(() => ({}));
  const products = Array.isArray(payload.products) ? payload.products.slice(0, 3) : [];
  if (products.length === 0) return;

  const apply = () => {
    const cards = [...container.querySelectorAll(".product-card")];
    if (cards.length === 0) return false;
    for (const [index, card] of cards.entries()) {
      const cover = products[index]?.cover;
      const visual = card.querySelector(".product-visual");
      const image = visual?.querySelector("img");
      if (cover?.path && visual && image && !visual.dataset.storeFraming) {
        visual.dataset.storeFraming = "true";
        applyHomeCoverFraming(image, visual, cover);
      }
    }
    return true;
  };

  if (apply()) return;
  const observer = new MutationObserver(() => {
    if (!apply()) return;
    observer.disconnect();
  });
  observer.observe(container, { childList: true });
}

void loadHomeProductFraming();

const PAGE_SHOWCASE_MOBILE_QUERY = "(max-width: 760px)";
const PAGE_SHOWCASE_CONFIG = Object.freeze({
  "/tienda": {
    desktop: "STORE_HERO_DESKTOP",
    mobile: "STORE_HERO_MOBILE",
    selector: ".storefront-hero",
    className: "v2-page-showcase-media",
    mode: "append"
  },
  "/talleres": {
    desktop: "WORKSHOPS_HERO_DESKTOP",
    mobile: "WORKSHOPS_HERO_MOBILE",
    selector: ".workshops-hero",
    className: "v2-page-showcase-media",
    mode: "append"
  },
  "/blog": {
    desktop: "STORIES_HERO_DESKTOP",
    mobile: "STORIES_HERO_MOBILE",
    selector: "main > .hero",
    className: "v2-page-showcase-media",
    mode: "append"
  },
  "/": {
    desktop: "COMMISSIONS_HERO_DESKTOP",
    mobile: "COMMISSIONS_HERO_MOBILE",
    selector: "#como-funciona .commission-intro",
    className: "v2-page-showcase-media v2-commission-showcase-media",
    mode: "before-brief"
  }
});

function pageShowcasePath() {
  const value = window.location.pathname.replace(/\/+$/g, "");
  return value || "/";
}

function pageShowcaseEnsureStyles() {
  if (document.head.querySelector('link[href="/visual-v2-page-showcase.css"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/visual-v2-page-showcase.css";
  link.dataset.atelierVisualV2 = "page-showcase";
  document.head.append(link);
}

function pageShowcaseMap(items) {
  return new Map((Array.isArray(items) ? items : []).map((item) => [item.slotKey, item]));
}

function pageShowcaseMedia(config, items, mobile) {
  if (mobile) return items.get(config.mobile) || items.get(config.desktop) || null;
  return items.get(config.desktop) || null;
}

function pageShowcaseConfigureImage(image, media, mobile) {
  if (!media?.previewPath || !window.AtelierImages?.configure) return false;
  const configured = window.AtelierImages.configure(image, {
    path: media.previewPath,
    alt: media.altText || "Imagen editorial de Atelier Lumière",
    width: media.width,
    height: media.height,
    sizes: mobile ? "calc(100vw - 36px)" : "(max-width: 1100px) 100vw, 760px",
    loading: "eager",
    priority: "high",
    defaultWidth: mobile ? 640 : 960
  });
  if (!configured) return false;
  image.style.setProperty("object-position", `${Number(media.focalX) || 50}% ${Number(media.focalY) || 50}%`, "important");
  return true;
}

function pageShowcaseCreateFigure(config) {
  const figure = document.createElement("figure");
  figure.className = config.className;
  const image = document.createElement("img");
  image.decoding = "async";
  figure.append(image);
  return figure;
}

function pageShowcaseRemove(target) {
  target?.classList.remove("has-page-showcase");
  target?.querySelector(":scope > .v2-page-showcase-media")?.remove();
  target?.querySelector(".v2-commission-showcase-media")?.remove();
  target?.removeAttribute("data-showcase-slot");
}

function pageShowcaseApply(config, items, mobile) {
  const target = document.querySelector(config.selector);
  if (!target) return;
  const media = pageShowcaseMedia(config, items, mobile);
  if (!media) {
    pageShowcaseRemove(target);
    return;
  }

  let figure = target.querySelector(".v2-commission-showcase-media, :scope > .v2-page-showcase-media");
  if (!figure) {
    figure = pageShowcaseCreateFigure(config);
    if (config.mode === "before-brief") {
      const brief = target.querySelector(".commission-brief");
      if (brief) target.insertBefore(figure, brief);
      else target.append(figure);
    } else {
      target.append(figure);
    }
  }

  const image = figure.querySelector("img");
  if (!pageShowcaseConfigureImage(image, media, mobile)) {
    pageShowcaseRemove(target);
    return;
  }
  target.classList.add("has-page-showcase");
  target.dataset.showcaseSlot = media.slotKey;
}

async function loadPageShowcase() {
  const config = PAGE_SHOWCASE_CONFIG[pageShowcasePath()];
  if (!config) return;
  const target = document.querySelector(config.selector);
  if (!target) return;

  const response = await fetch("/internal/showcase", {
    headers: { Accept: "application/json" }
  }).catch(() => null);
  if (!response?.ok) return;
  const payload = await response.json().catch(() => ({}));
  const items = pageShowcaseMap(payload.slots);
  if (items.size === 0) return;

  pageShowcaseEnsureStyles();
  const mobileQuery = window.matchMedia(PAGE_SHOWCASE_MOBILE_QUERY);
  const render = () => pageShowcaseApply(config, items, mobileQuery.matches);
  render();
  mobileQuery.addEventListener?.("change", render);
}

void loadPageShowcase();

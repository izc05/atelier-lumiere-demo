const HOME_SHOWCASE_DESKTOP = "HOME_HERO_DESKTOP";
const HOME_SHOWCASE_MOBILE = "HOME_HERO_MOBILE";
const HOME_SHOWCASE_MOBILE_QUERY = "(max-width: 760px)";

function showcaseBySlot(items) {
  return new Map((Array.isArray(items) ? items : []).map((item) => [item.slotKey, item]));
}

function showcaseMediaForViewport(items, mobile) {
  if (mobile) return items.get(HOME_SHOWCASE_MOBILE) || items.get(HOME_SHOWCASE_DESKTOP) || null;
  return items.get(HOME_SHOWCASE_DESKTOP) || null;
}

function showcaseCreateNote() {
  const note = document.createElement("aside");
  note.className = "hero-workshop-note v2-showcase-note";
  const kicker = document.createElement("span");
  kicker.textContent = "Selección Atelier";
  const title = document.createElement("strong");
  title.textContent = "Atelier Lumière";
  const link = document.createElement("a");
  link.href = "/tienda/";
  link.textContent = "Descubrir la colección →";
  link.setAttribute("aria-label", "Descubrir la colección de Atelier Lumière");
  note.append(kicker, title, link);
  return note;
}

function showcaseCreateSeal() {
  const seal = document.createElement("div");
  seal.className = "hero-seal hero-editorial-seal v2-showcase-seal";
  seal.setAttribute("aria-hidden", "true");
  const monogram = document.createElement("span");
  monogram.textContent = "AL";
  seal.append(monogram);
  return seal;
}

function deactivateShowcaseHero(visual) {
  if (!visual?.classList.contains("has-showcase-hero")) return;
  visual.classList.remove("has-showcase-hero");
  visual.querySelector(".v2-showcase-hero-image")?.remove();
  visual.querySelector(".v2-showcase-note")?.remove();
  visual.querySelector(".v2-showcase-seal")?.remove();
  const original = document.getElementById("hero-main-image");
  original?.removeAttribute("aria-hidden");
  visual.removeAttribute("data-showcase-slot");
}

function configureShowcaseImage(image, media, mobile) {
  if (!media?.previewPath || !window.AtelierImages?.configure) return false;
  const configured = window.AtelierImages.configure(image, {
    path: media.previewPath,
    alt: media.altText || "Selección editorial de Atelier Lumière",
    width: media.width,
    height: media.height,
    sizes: mobile
      ? "calc(100vw - 36px)"
      : "(max-width: 1200px) 54vw, 900px",
    loading: "eager",
    priority: "high",
    defaultWidth: mobile ? 640 : 960
  });
  if (!configured) return false;
  image.className = "v2-showcase-hero-image";
  image.style.setProperty("object-position", `${Number(media.focalX) || 50}% ${Number(media.focalY) || 50}%`, "important");
  return true;
}

function activateShowcaseHero(visual, media, mobile) {
  const figure = visual?.querySelector(".hero-photo-main");
  if (!visual || !figure || !media) return false;

  let image = figure.querySelector(".v2-showcase-hero-image");
  if (!image) {
    image = document.createElement("img");
    image.decoding = "async";
    figure.append(image);
  }
  if (!configureShowcaseImage(image, media, mobile)) {
    image.remove();
    return false;
  }

  if (!visual.querySelector(".v2-showcase-note")) visual.append(showcaseCreateNote());
  if (!visual.querySelector(".v2-showcase-seal")) visual.append(showcaseCreateSeal());

  visual.classList.add("has-showcase-hero");
  visual.dataset.showcaseSlot = media.slotKey;
  const original = document.getElementById("hero-main-image");
  if (original) original.setAttribute("aria-hidden", "true");
  return true;
}

async function loadHomeShowcaseHero() {
  const visual = document.getElementById("hero-visual");
  if (!visual) return;

  const response = await fetch("/internal/showcase", {
    headers: { Accept: "application/json" }
  }).catch(() => null);
  if (!response?.ok) return;
  const payload = await response.json().catch(() => ({}));
  const items = showcaseBySlot(payload.slots);
  if (items.size === 0) return;

  const mobileQuery = window.matchMedia(HOME_SHOWCASE_MOBILE_QUERY);
  const render = () => {
    const media = showcaseMediaForViewport(items, mobileQuery.matches);
    if (!media) {
      deactivateShowcaseHero(visual);
      return;
    }
    if (!activateShowcaseHero(visual, media, mobileQuery.matches)) deactivateShowcaseHero(visual);
  };

  render();
  mobileQuery.addEventListener?.("change", render);
}

void loadHomeShowcaseHero();

function byId(id) {
  return document.getElementById(id);
}

function node(tag, className, text) {
  const value = document.createElement(tag);
  if (className) value.className = className;
  if (text !== undefined) value.textContent = text;
  return value;
}

function money(cents, currency = "EUR") {
  if (!Number.isInteger(cents)) return "Consultar";
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency
  }).format(cents / 100);
}

function initials(value) {
  const parts = String(value || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "AL";
  if (parts.length === 1) return parts[0].slice(0, 2).toLocaleUpperCase("es");
  return `${parts[0][0]}${parts.at(-1)[0]}`.toLocaleUpperCase("es");
}

function compactText(value, maximum = 170) {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  if (text.length <= maximum) return text;
  return `${text.slice(0, maximum - 1).trimEnd()}…`;
}

function configureImage(image, media, options = {}) {
  if (!media?.path || !window.AtelierImages?.configure) return false;
  return window.AtelierImages.configure(image, {
    path: media.path,
    alt: media.altText || options.alt || "",
    width: media.width,
    height: media.height,
    sizes: options.sizes || "100vw",
    loading: options.loading || "lazy",
    priority: options.priority || "auto",
    defaultWidth: options.defaultWidth || 640
  });
}

function productCard(product) {
  const article = node("article", "product-card");
  const visual = node("div", "product-visual");

  if (product.cover?.path) {
    const image = document.createElement("img");
    configureImage(image, product.cover, {
      alt: product.name || "Pieza artesanal",
      sizes: "(max-width: 760px) calc(100vw - 48px), (max-width: 1100px) 50vw, 360px",
      defaultWidth: 640
    });
    visual.append(image);
  }

  const provider = node(
    "span",
    "product-provider",
    product.provider?.displayName || "Taller invitado"
  );
  const title = node("h3", "", product.name || "Pieza artesanal");
  const meta = node("div", "product-meta");
  const price = node("strong", "", money(product.priceCents, product.currency));
  const link = node("a", "", "Ver pieza →");
  const providerSlug = encodeURIComponent(product.provider?.slug || "");
  const productSlug = encodeURIComponent(product.slug || "");
  link.href = `/tienda/articulo/?taller=${providerSlug}&articulo=${productSlug}`;
  link.setAttribute("aria-label", `Ver ${product.name || "pieza artesanal"}`);
  meta.append(price, link);
  article.append(visual, provider, title, meta);
  return article;
}

function workshopCard(entry, index) {
  const { provider, products } = entry;
  const displayName = provider.displayName || "Taller invitado";
  const slug = provider.slug || "";
  const article = node("article", "atelier-card workshop-card");
  const link = node("a", "workshop-card-link");
  link.href = `/taller/?slug=${encodeURIComponent(slug)}`;
  link.setAttribute("aria-label", `Conocer el taller ${displayName}`);

  const media = node("div", "workshop-card-media");
  const image = document.createElement("img");
  const preferredMedia = provider.cover || provider.gallery?.[0] || products.find((product) => product.cover)?.cover;
  if (configureImage(image, preferredMedia, {
    alt: preferredMedia?.altText || `Interior o trabajo del taller ${displayName}`,
    sizes: "(max-width: 780px) calc(100vw - 40px), (max-width: 1180px) 50vw, 420px",
    defaultWidth: 720
  })) {
    media.append(image);
  } else {
    media.append(node("span", "workshop-card-placeholder", initials(displayName)));
  }

  const veil = node("span", "workshop-card-veil");
  media.append(veil);

  const content = node("div", "workshop-card-content");
  const top = node("div", "workshop-card-topline");
  top.append(
    node("span", "card-number", String(index + 1).padStart(2, "0")),
    node("span", "workshop-location", provider.locationLabel || "Taller invitado")
  );
  const eyebrow = node("p", "eyebrow", provider.specialty || "Oficio artesanal");
  const title = node("h3", "", displayName);
  const intro = node(
    "p",
    "workshop-card-copy",
    compactText(provider.tagline || provider.craftDescription || provider.story || "Piezas hechas en pequeñas series y seleccionadas por Atelier Lumière.")
  );
  const signals = node("div", "workshop-card-signals");
  const categories = new Set(products.map((product) => product.category).filter(Boolean));
  signals.append(
    node("span", "", `${products.length} ${products.length === 1 ? "pieza" : "piezas"}`),
    node("span", "", `${categories.size || 1} ${categories.size === 1 ? "categoría" : "categorías"}`)
  );
  if (provider.acceptsCustomRequests) signals.append(node("span", "", "Encargos disponibles"));
  const action = node("span", "workshop-card-action", "Entrar al taller →");

  content.append(top, eyebrow, title, intro, signals, action);
  link.append(media, content);
  article.append(link);
  return article;
}

function collectWorkshops(products) {
  const workshops = new Map();
  for (const product of products) {
    const provider = product.provider;
    const slug = provider?.slug;
    if (!slug) continue;
    if (!workshops.has(slug)) workshops.set(slug, { provider, products: [] });
    workshops.get(slug).products.push(product);
  }
  return Array.from(workshops.values()).slice(0, 3);
}

function workshopPrimaryMedia(entry) {
  return entry?.provider?.cover
    || entry?.provider?.gallery?.[0]
    || entry?.products?.find((product) => product.cover?.path)?.cover
    || null;
}

function workshopDetailMedia(entry, primaryPath) {
  const candidates = [
    ...(Array.isArray(entry?.provider?.gallery) ? entry.provider.gallery : []),
    ...(Array.isArray(entry?.products) ? entry.products.map((product) => product.cover) : [])
  ].filter((media) => media?.path && media.path !== primaryPath);
  return candidates[0] || null;
}

function hydrateHero(products) {
  const workshops = collectWorkshops(products);
  if (workshops.length === 0) return;

  const primaryWorkshop = workshops.find((entry) => workshopPrimaryMedia(entry)) || workshops[0];
  const provider = primaryWorkshop.provider || {};
  const displayName = provider.displayName || "Taller invitado";
  const primaryMedia = workshopPrimaryMedia(primaryWorkshop);
  let detailMedia = workshopDetailMedia(primaryWorkshop, primaryMedia?.path);

  if (!detailMedia) {
    for (const entry of workshops) {
      if (entry === primaryWorkshop) continue;
      const candidate = workshopPrimaryMedia(entry);
      if (candidate?.path && candidate.path !== primaryMedia?.path) {
        detailMedia = candidate;
        break;
      }
    }
  }

  const mainImage = byId("hero-main-image");
  if (mainImage && configureImage(mainImage, primaryMedia, {
    alt: primaryMedia?.altText || `Interior o proceso creativo de ${displayName}`,
    sizes: "(max-width: 780px) calc(100vw - 44px), (max-width: 1200px) 54vw, 760px",
    loading: "eager",
    priority: "high",
    defaultWidth: 1100
  })) {
    mainImage.hidden = false;
    byId("hero-main-placeholder").hidden = true;
  }

  const detailImage = byId("hero-detail-image");
  if (detailImage && configureImage(detailImage, detailMedia, {
    alt: detailMedia?.altText || `Detalle artesanal de ${displayName}`,
    sizes: "(max-width: 780px) 38vw, 320px",
    loading: "eager",
    priority: "high",
    defaultWidth: 520
  })) {
    detailImage.hidden = false;
    byId("hero-detail-placeholder").hidden = true;
  }

  byId("hero-workshop-name").textContent = displayName;
  const workshopLink = byId("hero-workshop-link");
  workshopLink.href = `/taller/?slug=${encodeURIComponent(provider.slug || "")}`;
  workshopLink.setAttribute("aria-label", `Conocer el taller ${displayName}`);
}

function renderWorkshops(products) {
  const loading = byId("atelier-loading");
  const view = byId("atelier-grid");
  const empty = byId("atelier-empty");
  const workshops = collectWorkshops(products);

  if (workshops.length === 0) {
    empty.hidden = false;
  } else {
    view.replaceChildren(...workshops.map(workshopCard));
    view.hidden = false;
    requestAnimationFrame(() => {
      for (const card of view.querySelectorAll(".workshop-card")) card.classList.add("is-visible");
    });
  }
  loading.hidden = true;
}

function renderFeaturedProducts(products) {
  const loading = byId("featured-loading");
  const view = byId("featured-products");
  const empty = byId("featured-empty");
  const featured = products.slice(0, 3);

  if (featured.length === 0) {
    empty.hidden = false;
  } else {
    view.replaceChildren(...featured.map(productCard));
    view.hidden = false;
  }
  loading.hidden = true;
}

async function requestCatalog() {
  const response = await fetch("/internal/catalog/products", {
    headers: { Accept: "application/json" }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || "Catálogo no disponible");
  return Array.isArray(payload.products) ? payload.products : [];
}

async function loadHomeContent() {
  try {
    const products = await requestCatalog();
    hydrateHero(products);
    renderWorkshops(products);
    renderFeaturedProducts(products);
  } catch {
    byId("atelier-loading").hidden = true;
    byId("featured-loading").hidden = true;
    byId("atelier-empty").hidden = false;
    byId("featured-empty").hidden = false;
  }
}

function setupScrollReveal() {
  const targets = document.querySelectorAll(
    ".manifesto-section > .section-heading, .featured-section > .section-heading, .process-intro, .process-list, .story-section blockquote, .closing-section"
  );
  if (targets.length === 0) return;

  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  if (reducedMotion || typeof IntersectionObserver !== "function") {
    for (const target of targets) target.classList.add("editorial-reveal", "is-visible");
    return;
  }

  for (const target of targets) target.classList.add("editorial-reveal");
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    }
  }, { rootMargin: "0px 0px -12%", threshold: 0.12 });

  for (const target of targets) observer.observe(target);
}

function setupHeroMotion() {
  const hero = byId("home-hero");
  if (!hero) return;

  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  const finePointer = window.matchMedia?.("(pointer: fine)")?.matches;
  if (reducedMotion || !finePointer) return;

  let frame = 0;
  const render = () => {
    frame = 0;
    const rect = hero.getBoundingClientRect();
    const height = Math.max(hero.offsetHeight, 1);
    const progress = Math.min(1, Math.max(0, -rect.top / height));
    hero.style.setProperty("--hero-main-shift", `${progress * 28}px`);
    hero.style.setProperty("--hero-detail-shift", `${progress * -22}px`);
    hero.style.setProperty("--hero-copy-shift", `${progress * 14}px`);
  };
  const schedule = () => {
    if (frame) return;
    frame = window.requestAnimationFrame(render);
  };

  render();
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule, { passive: true });
}

function setupCartCount() {
  const count = byId("cart-count");
  if (count && window.AtelierCart?.wireCount) {
    window.AtelierCart.wireCount(count);
  }
}

setupCartCount();
setupScrollReveal();
setupHeroMotion();
void loadHomeContent();

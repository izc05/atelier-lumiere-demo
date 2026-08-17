const atelierRoot = document.documentElement;
atelierRoot.classList.add("atelier-premium");

if (!document.querySelector('link[data-atelier-editorial-desktop]')) {
  const editorialStyles = document.createElement("link");
  editorialStyles.rel = "stylesheet";
  editorialStyles.href = "/editorial-desktop.css";
  editorialStyles.dataset.atelierEditorialDesktop = "";
  document.head.append(editorialStyles);
}

if (!document.querySelector('link[data-atelier-global-shell]')) {
  const globalShellStyles = document.createElement("link");
  globalShellStyles.rel = "stylesheet";
  globalShellStyles.href = "/visual-v2-global-shell.css";
  globalShellStyles.dataset.atelierGlobalShell = "";
  document.head.append(globalShellStyles);
}

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
const FINE_POINTER = "(pointer: fine)";
const INTRO_KEY = "atelier-lumiere-opening-seen";
const PRIMARY_PUBLIC_NAVIGATION = Object.freeze([
  ["/tienda/", "Tienda"],
  ["/talleres/", "Talleres"],
  ["/blog/", "Historias"],
  ["/unete/", "Únete como taller"],
  ["/proveedor/acceso/", "Acceso talleres"]
]);

function pageType(pathname) {
  const path = String(pathname || "/");
  if (path === "/" || path === "") return "home";
  if (path.startsWith("/admin/")) return "admin";
  if (path.startsWith("/proveedor/") && !path.startsWith("/proveedor/acceso/") && !path.startsWith("/proveedor/activar/") && !path.includes("recuperar") && !path.includes("configurar-2fa") && !path.includes("codigos-recuperacion") && !path.includes("verificar-correo")) return "provider-private";
  if (path.startsWith("/proveedor/")) return "provider";
  if (path.startsWith("/mis-pedidos/") || path.startsWith("/pedido/") || path.startsWith("/pago/")) return "customer";
  if (path.startsWith("/blog/")) return "editorial";
  if (path.startsWith("/legal/") || path.startsWith("/privacidad/")) return "legal";
  if (path.startsWith("/tienda/") || path.startsWith("/taller/") || path.startsWith("/carrito/")) return "commerce";
  return "utility";
}

atelierRoot.dataset.atelierPage = pageType(window.location.pathname);
atelierRoot.dataset.motion = motionIsReduced() ? "reduced" : "full";

function createElement(tag, className, text = null) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== null) element.textContent = text;
  return element;
}

function motionIsReduced() {
  return window.matchMedia(REDUCED_MOTION).matches;
}

function isPrimaryPublicExperience() {
  const path = String(window.location.pathname || "/");
  const page = atelierRoot.dataset.atelierPage;
  if (["home", "commerce", "editorial"].includes(page)) return true;
  return path.startsWith("/talleres/") || path.startsWith("/unete/");
}

function navigationIsCurrent(href) {
  const path = String(window.location.pathname || "/");
  if (href === "/tienda/") return path.startsWith("/tienda/");
  if (href === "/talleres/") return path.startsWith("/talleres/") || path.startsWith("/taller/");
  if (href === "/blog/") return path.startsWith("/blog/");
  if (href === "/unete/") return path.startsWith("/unete/");
  return false;
}

function initializePublicIdentity() {
  if (!isPrimaryPublicExperience()) return;

  const header = document.querySelector("[data-public-header]");
  const navigation = header?.querySelector("[data-public-navigation]");
  const toggle = header?.querySelector("[data-public-menu-toggle]");
  const brand = header?.querySelector('a[href="/"]');
  if (!header || !navigation || !brand) return;

  atelierRoot.dataset.atelierPublicShell = "v2";
  header.classList.add("atelier-global-header");
  navigation.classList.add("atelier-global-nav");

  brand.classList.add("atelier-global-brand");
  brand.dataset.atelierBrandTone = "dark";
  brand.setAttribute("aria-label", "Atelier Lumière, inicio");
  const logo = createElement("img", "atelier-global-logo");
  logo.src = "/assets/brand/atelier-logo-official-dark.svg";
  logo.alt = "Atelier Lumière";
  logo.decoding = "async";
  logo.setAttribute("fetchpriority", "high");
  brand.replaceChildren(logo);

  const existingCart = header.querySelector('a[href="/carrito/"]');
  let count = existingCart?.querySelector("#cart-count") || null;
  if (!count) {
    count = createElement("span", "cart-count", "0");
    count.id = "cart-count";
  }

  const links = PRIMARY_PUBLIC_NAVIGATION.map(([href, label]) => {
    const link = createElement("a", "atelier-global-nav-link", label);
    link.href = href;
    if (navigationIsCurrent(href)) link.setAttribute("aria-current", "page");
    return link;
  });
  navigation.replaceChildren(...links);

  const cart = existingCart || createElement("a", "", null);
  cart.href = "/carrito/";
  cart.setAttribute("aria-label", "Abrir carrito");
  cart.className = "atelier-global-cart";
  const cartLabel = createElement("span", "atelier-global-cart-label", "Carrito");
  cart.replaceChildren(cartLabel, count);
  if (String(window.location.pathname || "").startsWith("/carrito/")) cart.setAttribute("aria-current", "page");
  else cart.removeAttribute("aria-current");

  let actions = header.querySelector(".header-actions, .atelier-global-actions");
  if (!actions) {
    actions = createElement("div", "atelier-global-actions");
    header.append(actions);
  } else {
    actions.classList.add("atelier-global-actions");
  }

  actions.replaceChildren(cart);
  if (toggle) actions.append(toggle);
  if (navigation.nextElementSibling !== actions) header.insertBefore(navigation, actions);
}

function initializeOpening() {
  if (atelierRoot.dataset.atelierPage !== "home" || motionIsReduced()) return;
  let alreadySeen = false;
  try {
    alreadySeen = window.sessionStorage.getItem(INTRO_KEY) === "1";
  } catch {
    alreadySeen = false;
  }
  if (alreadySeen) return;

  const opening = createElement("div", "atelier-opening");
  opening.setAttribute("aria-hidden", "true");
  const left = createElement("div", "atelier-opening__panel atelier-opening__panel--left");
  const right = createElement("div", "atelier-opening__panel atelier-opening__panel--right");
  const brand = createElement("div", "atelier-opening__brand");
  brand.append(
    createElement("span", "atelier-opening__monogram", "AL"),
    createElement("strong", "atelier-opening__name", "Atelier Lumière"),
    createElement("span", "atelier-opening__tagline", "Artesanía para celebrar")
  );
  opening.append(left, right, brand);
  document.body.prepend(opening);
  document.body.classList.add("atelier-opening-active");

  let completed = false;
  let removalTimer = null;
  const handleSkip = (event) => {
    if (event.type === "keydown" && !["Escape", "Enter", " "].includes(event.key)) return;
    finish();
  };
  const cleanup = () => {
    document.removeEventListener("keydown", handleSkip);
    if (removalTimer !== null) window.clearTimeout(removalTimer);
  };
  const finish = () => {
    if (completed) return;
    completed = true;
    opening.classList.add("is-opening");
    removalTimer = window.setTimeout(() => {
      cleanup();
      opening.remove();
      document.body.classList.remove("atelier-opening-active");
      try {
        window.sessionStorage.setItem(INTRO_KEY, "1");
      } catch {
        // La entrada sigue siendo funcional sin almacenamiento de sesión.
      }
    }, 1550);
  };

  opening.addEventListener("pointerdown", handleSkip, { once: true });
  document.addEventListener("keydown", handleSkip);
  window.setTimeout(finish, 420);
}

function initializeHeader() {
  const header = document.querySelector("[data-public-header], .topbar, .site-header");
  if (!header) return;
  let frame = null;
  const render = () => {
    frame = null;
    header.classList.toggle("is-scrolled", window.scrollY > 22);
  };
  render();
  window.addEventListener("scroll", () => {
    if (frame !== null) return;
    frame = window.requestAnimationFrame(render);
  }, { passive: true });
}

function initializeProgress() {
  if (atelierRoot.dataset.atelierPage === "admin" || atelierRoot.dataset.atelierPage === "provider-private") return;
  const progress = createElement("div", "atelier-progress");
  progress.setAttribute("aria-hidden", "true");
  document.body.append(progress);
  let frame = null;
  const render = () => {
    frame = null;
    const maximum = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
    const ratio = Math.min(Math.max(window.scrollY / maximum, 0), 1);
    progress.style.transform = `scaleX(${ratio})`;
  };
  render();
  window.addEventListener("scroll", () => {
    if (frame !== null) return;
    frame = window.requestAnimationFrame(render);
  }, { passive: true });
  window.addEventListener("resize", render, { passive: true });
}

function initializePointerAura() {
  if (motionIsReduced() || !window.matchMedia(FINE_POINTER).matches) return;
  if (["admin", "provider-private", "customer"].includes(atelierRoot.dataset.atelierPage)) return;
  const aura = createElement("div", "atelier-pointer-aura");
  aura.setAttribute("aria-hidden", "true");
  document.body.prepend(aura);
  let frame = null;
  let x = -600;
  let y = -600;
  const render = () => {
    frame = null;
    atelierRoot.style.setProperty("--atelier-pointer-x", `${x}px`);
    atelierRoot.style.setProperty("--atelier-pointer-y", `${y}px`);
  };
  window.addEventListener("pointermove", (event) => {
    x = event.clientX;
    y = event.clientY;
    if (frame === null) frame = window.requestAnimationFrame(render);
  }, { passive: true });
  window.addEventListener("pointerleave", () => {
    x = -600;
    y = -600;
    render();
  }, { passive: true });
}

function revealCandidates() {
  const selectors = [
    ".hero > *",
    ".page-head > *",
    ".page-heading > *",
    ".toolbar",
    ".metrics > *",
    ".atelier-story-card",
    ".promise-grid > *",
    ".bespoke-copy",
    ".bespoke-image",
    ".journal-card",
    ".product-card",
    ".post-card",
    ".legal-card",
    ".order-card",
    ".provider-card",
    ".process-list > *",
    ".workspace-grid > *",
    ".content-grid > *",
    ".gallery-section",
    ".checkout-panel",
    ".cart-groups",
    ".closing-section > *"
  ];
  return [...new Set(document.querySelectorAll(selectors.join(",")))];
}

function initializePremiumReveals() {
  const candidates = revealCandidates();
  if (candidates.length === 0) return;
  candidates.forEach((element, index) => {
    element.setAttribute("data-premium-reveal", "");
    element.style.setProperty("--premium-delay", String(index % 5));
  });

  const show = (element) => element.classList.add("is-premium-visible");
  if (motionIsReduced() || !("IntersectionObserver" in window)) {
    candidates.forEach(show);
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      show(entry.target);
      observer.unobserve(entry.target);
    }
  }, { rootMargin: "0px 0px -7%", threshold: .06 });
  candidates.forEach((element) => observer.observe(element));
}

function initializeHeroDepth() {
  if (atelierRoot.dataset.atelierPage !== "home" || motionIsReduced() || !window.matchMedia(FINE_POINTER).matches) return;
  const visual = document.querySelector(".hilo-hero-visual");
  const copy = document.querySelector(".hilo-hero-copy");
  if (!visual) return;
  let frame = null;
  let x = 0;
  let y = 0;
  const render = () => {
    frame = null;
    visual.style.setProperty("--premium-hero-x", `${x}px`);
    visual.style.setProperty("--premium-hero-y", `${y}px`);
    if (copy) {
      copy.style.setProperty("--premium-copy-x", `${x * -.12}px`);
      copy.style.setProperty("--premium-copy-y", `${y * -.08}px`);
    }
  };
  const hero = document.querySelector(".hilo-hero");
  hero?.addEventListener("pointermove", (event) => {
    const bounds = hero.getBoundingClientRect();
    x = ((event.clientX - bounds.left) / Math.max(bounds.width, 1) - .5) * 18;
    y = ((event.clientY - bounds.top) / Math.max(bounds.height, 1) - .5) * 12;
    if (frame === null) frame = window.requestAnimationFrame(render);
  }, { passive: true });
  hero?.addEventListener("pointerleave", () => {
    x = 0;
    y = 0;
    render();
  }, { passive: true });
}

function initialize() {
  initializePublicIdentity();
  initializeOpening();
  initializeHeader();
  initializeProgress();
  initializePointerAura();
  initializePremiumReveals();
  initializeHeroDepth();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialize, { once: true });
} else {
  initialize();
}

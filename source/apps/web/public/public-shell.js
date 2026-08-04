const root = document.documentElement;
root.classList.remove("no-js");
root.classList.add("js");

const MOBILE_QUERY = "(max-width: 760px)";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const REVEAL_SELECTOR = [
  ".hero-section",
  ".manifesto-section",
  ".featured-section",
  ".process-section",
  ".story-section",
  ".closing-section",
  ".hero",
  ".toolbar",
  ".provider-hero",
  "#collection",
  ".product-hero",
  ".content-grid",
  ".gallery-section",
  ".cart-layout",
  ".empty-cart",
  ".article-head",
  ".article-layout",
  "#grid"
].join(",");

function normalizedPath(value) {
  const path = String(value || "/").replace(/\/+$/g, "");
  return path || "/";
}

function markCurrentPage(navigation) {
  const current = normalizedPath(window.location.pathname);
  for (const link of navigation.querySelectorAll("a[href]")) {
    let target;
    try {
      target = new URL(link.href, window.location.href);
    } catch {
      continue;
    }
    if (target.origin !== window.location.origin || target.hash) continue;
    const path = normalizedPath(target.pathname);
    const sectionMatch = path !== "/" && current.startsWith(`${path}/`);
    if (current === path || sectionMatch) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
}

function initializeMotionPreference() {
  const preference = window.matchMedia(REDUCED_MOTION_QUERY);
  const apply = () => {
    root.classList.toggle("reduce-motion", preference.matches);
    root.dataset.motion = preference.matches ? "reduced" : "full";
    window.dispatchEvent(new CustomEvent("atelier:motion-preference", {
      detail: { reduced: preference.matches }
    }));
  };
  apply();
  preference.addEventListener?.("change", apply);
}

function initializeReveals() {
  const elements = [...new Set(document.querySelectorAll(REVEAL_SELECTOR))];
  if (elements.length === 0) return;
  for (const element of elements) element.setAttribute("data-public-reveal", "");

  const showAll = () => {
    for (const element of elements) element.classList.add("is-visible");
  };
  if (root.dataset.motion === "reduced" || !("IntersectionObserver" in window)) {
    showAll();
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    }
  }, {
    rootMargin: "0px 0px -8%",
    threshold: .08
  });
  for (const element of elements) observer.observe(element);

  window.addEventListener("atelier:motion-preference", (event) => {
    if (!event.detail?.reduced) return;
    observer.disconnect();
    showAll();
  }, { once: true });
}

function initializeNavigation(header) {
  const toggle = header.querySelector("[data-public-menu-toggle]");
  const navigation = header.querySelector("[data-public-navigation]");
  if (!toggle || !navigation) return;

  const mobile = window.matchMedia(MOBILE_QUERY);
  const background = [
    document.querySelector("#main-content"),
    ...document.querySelectorAll("body > footer")
  ].filter(Boolean);
  let open = false;

  const focusableItems = () => [
    toggle,
    ...navigation.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  ].filter((item) => !item.hidden);

  function setBackgroundInert(value) {
    for (const element of background) {
      if (value) element.setAttribute("inert", "");
      else element.removeAttribute("inert");
    }
  }

  function render() {
    const mobileMode = mobile.matches;
    navigation.hidden = mobileMode ? !open : false;
    toggle.setAttribute("aria-expanded", String(mobileMode && open));
    toggle.setAttribute("aria-label", mobileMode && open ? "Cerrar navegación" : "Abrir navegación");
    toggle.textContent = mobileMode && open ? "Cerrar" : "Menú";
    document.body.classList.toggle("public-menu-open", mobileMode && open);
    setBackgroundInert(mobileMode && open);
  }

  function close({ returnFocus = false } = {}) {
    const wasOpen = open;
    open = false;
    render();
    if (wasOpen && returnFocus && mobile.matches) toggle.focus();
  }

  function openMenu() {
    if (!mobile.matches) return;
    open = true;
    render();
    const firstLink = navigation.querySelector("a[href]");
    firstLink?.focus();
  }

  toggle.addEventListener("click", () => {
    if (open) close({ returnFocus: true });
    else openMenu();
  });

  navigation.addEventListener("click", (event) => {
    if (event.target.closest("a[href]")) close();
  });

  document.addEventListener("keydown", (event) => {
    if (!open || !mobile.matches) return;
    if (event.key === "Escape") {
      event.preventDefault();
      close({ returnFocus: true });
      return;
    }
    if (event.key !== "Tab") return;

    const items = focusableItems();
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  mobile.addEventListener?.("change", () => {
    open = false;
    render();
  });
  window.addEventListener("pagehide", () => close());

  markCurrentPage(navigation);
  render();
}

initializeMotionPreference();
initializeReveals();
for (const header of document.querySelectorAll("[data-public-header]")) {
  initializeNavigation(header);
}

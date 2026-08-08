(() => {
  const OFFICIAL = Object.freeze({
    dark: "/assets/brand/atelier-logo-official-dark.svg",
    light: "/assets/brand/atelier-logo-official-light.svg",
    mark: "/assets/brand/atelier-mark-official.svg"
  });
  const MOBILE_QUERY = "(max-width: 760px)";
  const providerArea = window.location.pathname.startsWith("/proveedor/");

  if (providerArea) document.documentElement.dataset.atelierArea = "provider";

  function applyOfficialBrand() {
    let favicon = document.querySelector('link[rel="icon"]');
    if (!favicon) {
      favicon = document.createElement("link");
      favicon.rel = "icon";
      favicon.type = "image/svg+xml";
      document.head.append(favicon);
    }
    favicon.href = OFFICIAL.mark;

    const entryLogo = document.querySelector(".brand-entry-logo");
    if (entryLogo instanceof HTMLImageElement) entryLogo.src = OFFICIAL.light;

    const selectors = [
      "[data-public-header] a.wordmark",
      "[data-public-header] a.brand"
    ];
    if (providerArea) selectors.push("a.brand");

    const brands = document.querySelectorAll(selectors.join(", "));
    for (const brand of brands) {
      const header = brand.closest("[data-public-header]");
      const light = !providerArea && (brand.classList.contains("wordmark") || header?.classList.contains("site-header"));
      const image = document.createElement("img");
      image.src = light ? OFFICIAL.light : OFFICIAL.dark;
      image.alt = "Atelier Lumière";
      image.className = "atelier-header-logo atelier-official-logo";
      image.decoding = "async";
      image.setAttribute("fetchpriority", "high");
      brand.replaceChildren(image);
      brand.classList.add("atelier-brand-link");
      brand.dataset.atelierBrand = "official";
      brand.dataset.atelierBrandTone = light ? "light" : "dark";
      if (!brand.getAttribute("aria-label")) brand.setAttribute("aria-label", "Atelier Lumière");
    }
  }

  function installMobileOverlay(header) {
    const navigation = header.querySelector("[data-public-navigation]");
    const toggle = header.querySelector("[data-public-menu-toggle]");
    if (!navigation || !toggle) return;

    const navParent = navigation.parentNode;
    const navNext = navigation.nextSibling;
    const toggleParent = toggle.parentNode;
    const toggleNext = toggle.nextSibling;
    const mobile = window.matchMedia(MOBILE_QUERY);

    function restore() {
      if (navigation.parentNode !== navParent) navParent.insertBefore(navigation, navNext);
      if (toggle.parentNode !== toggleParent) toggleParent.insertBefore(toggle, toggleNext);
      navigation.classList.remove("public-navigation-overlay");
      toggle.classList.remove("public-menu-overlay-toggle");
    }

    function mount() {
      if (!mobile.matches || !document.body.classList.contains("public-menu-open")) {
        restore();
        return;
      }
      if (navigation.parentNode !== document.body) document.body.append(navigation);
      if (toggle.parentNode !== document.body) document.body.append(toggle);
      navigation.classList.add("public-navigation-overlay");
      toggle.classList.add("public-menu-overlay-toggle");
    }

    const observer = new MutationObserver(mount);
    observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    mobile.addEventListener?.("change", mount);
    window.addEventListener("pagehide", restore, { once: true });
    mount();
  }

  applyOfficialBrand();
  for (const header of document.querySelectorAll("[data-public-header]")) installMobileOverlay(header);
})();

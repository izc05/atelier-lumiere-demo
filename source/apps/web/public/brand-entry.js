(() => {
  "use strict";

  const SESSION_KEY = "atelier_brand_entry_seen";
  const OFFICIAL_LOGO = "/assets/brand/atelier-logo-official-light.svg";
  const entry = document.getElementById("brand-entry");
  const enterButton = document.getElementById("brand-entry-action");
  const entryLogo = entry?.querySelector(".brand-entry-logo");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  if (!entry || !enterButton) return;
  if (entryLogo instanceof HTMLImageElement) entryLogo.src = OFFICIAL_LOGO;

  const params = new URLSearchParams(window.location.search);
  const forceEntry = params.get("intro") === "1";
  const skipEntry = params.get("intro") === "0";
  const background = [
    document.querySelector(".skip-link"),
    document.querySelector(".site-header"),
    document.getElementById("main-content"),
    ...document.querySelectorAll("body > .site-footer")
  ].filter(Boolean);

  const sessionGet = () => {
    try { return sessionStorage.getItem(SESSION_KEY); } catch { return null; }
  };

  const sessionSet = () => {
    try { sessionStorage.setItem(SESSION_KEY, "1"); } catch { /* almacenamiento no disponible */ }
  };

  const setBackgroundInert = (value) => {
    for (const element of background) {
      if (value) element.setAttribute("inert", "");
      else element.removeAttribute("inert");
    }
  };

  if (skipEntry || (!forceEntry && sessionGet() === "1")) {
    entry.hidden = true;
    return;
  }

  entry.setAttribute("role", "dialog");
  entry.setAttribute("aria-modal", "true");
  document.body.classList.add("brand-entry-active");
  setBackgroundInert(true);
  entry.hidden = false;

  let opening = false;

  const openHome = () => {
    if (opening) return;
    opening = true;
    sessionSet();
    entry.classList.add("is-opening");

    const delay = reducedMotion.matches ? 20 : 590;
    window.setTimeout(() => {
      entry.hidden = true;
      entry.removeAttribute("aria-modal");
      setBackgroundInert(false);
      document.body.classList.remove("brand-entry-active");
      document.getElementById("main-content")?.focus({ preventScroll: true });
    }, delay);
  };

  enterButton.addEventListener("click", openHome);
  document.addEventListener("keydown", (event) => {
    if (entry.hidden || opening) return;
    if (event.key === "Enter") {
      event.preventDefault();
      openHome();
    }
  });

  window.requestAnimationFrame(() => enterButton.focus({ preventScroll: true }));
})();

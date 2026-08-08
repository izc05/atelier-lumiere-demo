(() => {
  "use strict";

  const SESSION_KEY = "atelier_brand_entry_seen";
  const entry = document.getElementById("brand-entry");
  const enterButton = document.getElementById("brand-entry-action");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  if (!entry || !enterButton) return;

  const params = new URLSearchParams(window.location.search);
  const forceEntry = params.get("intro") === "1";
  const skipEntry = params.get("intro") === "0";

  const sessionGet = () => {
    try { return sessionStorage.getItem(SESSION_KEY); } catch { return null; }
  };

  const sessionSet = () => {
    try { sessionStorage.setItem(SESSION_KEY, "1"); } catch { /* almacenamiento no disponible */ }
  };

  if (skipEntry || (!forceEntry && sessionGet() === "1")) {
    entry.hidden = true;
    return;
  }

  document.body.classList.add("brand-entry-active");
  entry.hidden = false;

  let opening = false;

  const openHome = () => {
    if (opening) return;
    opening = true;
    sessionSet();
    document.body.classList.add("brand-entry-opening");
    entry.classList.add("is-opening");

    const delay = reducedMotion.matches ? 30 : 1080;
    window.setTimeout(() => {
      entry.hidden = true;
      document.body.classList.remove("brand-entry-active", "brand-entry-opening");
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

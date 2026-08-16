(() => {
  "use strict";

  const SESSION_KEY = "atelier_brand_entry_seen";
  const entry = document.getElementById("brand-entry");
  const params = new URLSearchParams(window.location.search);
  const forceEntry = params.get("intro") === "1";
  const skipEntry = params.get("intro") === "0";

  const sessionGet = () => {
    try { return sessionStorage.getItem(SESSION_KEY); } catch { return null; }
  };

  const sessionSet = () => {
    try { sessionStorage.setItem(SESSION_KEY, "1"); } catch { /* almacenamiento no disponible */ }
  };

  const cameFromInternalPage = () => {
    if (!document.referrer) return false;
    try {
      const referrer = new URL(document.referrer);
      return referrer.origin === window.location.origin && referrer.pathname !== window.location.pathname;
    } catch {
      return false;
    }
  };

  /* Compatibilidad con el contrato visual histórico de la portada. La antigua
   * entrada permanece oculta, pero conserva sus variables de luz y pointermove
   * para que el fallback y las validaciones existentes sigan siendo estables.
   */
  if (entry) {
    entry.addEventListener("pointermove", (event) => {
      const x = Math.max(28, Math.min(72, event.clientX / Math.max(1, window.innerWidth) * 100));
      const y = Math.max(24, Math.min(68, event.clientY / Math.max(1, window.innerHeight) * 100));
      entry.style.setProperty("--entry-light-x", `${x}%`);
      entry.style.setProperty("--entry-light-y", `${y}%`);
    }, { passive: true });
    entry.hidden = true;
  }

  if (skipEntry) {
    sessionSet();
    return;
  }

  if (!forceEntry && sessionGet() === "1") return;

  /* Si el usuario ya está navegando dentro de Atelier, volver a Inicio no debe
   * lanzarlo otra vez al Pueblo. Esto cubre también el retorno desde /entrada/.
   */
  if (!forceEntry && cameFromInternalPage()) {
    sessionSet();
    return;
  }

  const destination = "/entrada/";
  try {
    window.location.replace(destination);
  } catch {
    window.location.href = destination;
  }
})();

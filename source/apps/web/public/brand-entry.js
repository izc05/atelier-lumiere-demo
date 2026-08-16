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

  /* La antigua pantalla de marca queda retirada visualmente. El Pueblo Atelier
   * es ahora la única entrada de la V2. Conservamos el nodo oculto como fallback
   * estructural para no alterar el HTML de la Home en esta microfase.
   */
  if (entry) entry.hidden = true;

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

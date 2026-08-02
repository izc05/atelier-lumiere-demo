function byId(id) {
  return document.getElementById(id);
}

function formatDate(value) {
  try {
    return new Intl.DateTimeFormat("es-ES", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(value));
  } catch {
    return "";
  }
}

function roleLabel(role) {
  return role === "PROVIDER_OWNER" ? "Responsable del taller" : "Colaborador del taller";
}

async function requestSession(method = "GET") {
  const response = await fetch("/internal/provider/session", {
    method,
    headers: { Accept: "application/json" }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || "La sesión no es válida.");
  return payload;
}

async function loadProductCount() {
  try {
    const response = await fetch("/internal/provider/products", {
      headers: { Accept: "application/json" }
    });
    if (response.status === 401) {
      window.location.replace("/proveedor/acceso/");
      return;
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error();
    const products = Array.isArray(payload.products) ? payload.products : [];
    byId("articles-count").textContent = String(products.length);
    const pending = products.filter((item) => item.status === "IN_REVIEW").length;
    byId("articles-note").textContent = pending > 0
      ? `${pending} pendiente${pending === 1 ? "" : "s"} de revisión`
      : products.length > 0 ? "Catálogo privado preparado" : "Crea el primer artículo";
  } catch {
    byId("articles-note").textContent = "No se pudo cargar el resumen";
  }
}

async function loadPanel() {
  try {
    const data = await requestSession();
    byId("user-name").textContent = data.user.displayName;
    byId("provider-name").textContent = data.provider.displayName;
    byId("role-label").textContent = roleLabel(data.membership.role);
    byId("account-email").textContent = data.user.email;
    byId("session-expiry").textContent = formatDate(data.session.expiresAt);
    byId("panel-loading").hidden = true;
    byId("panel-content").hidden = false;
    void loadProductCount();
  } catch {
    window.location.replace("/proveedor/acceso/");
  }
}

byId("logout-button").addEventListener("click", async () => {
  const button = byId("logout-button");
  button.disabled = true;
  button.textContent = "Cerrando…";
  try {
    await requestSession("DELETE");
  } catch {
    // La cookie se elimina aunque la API ya no reconozca la sesión.
  }
  window.location.replace("/proveedor/acceso/");
});

void loadPanel();

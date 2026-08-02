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

async function loadPrivateSummary(path, countId, noteId, itemKey, emptyText, readyText) {
  try {
    const response = await fetch(path, { headers: { Accept: "application/json" } });
    if (response.status === 401) {
      window.location.replace("/proveedor/acceso/");
      return;
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error();
    const items = Array.isArray(payload[itemKey]) ? payload[itemKey] : [];
    byId(countId).textContent = String(items.length);
    const pending = items.filter((item) => item.status === "IN_REVIEW").length;
    byId(noteId).textContent = pending > 0
      ? `${pending} pendiente${pending === 1 ? "" : "s"} de revisión`
      : items.length > 0 ? readyText : emptyText;
  } catch {
    byId(noteId).textContent = "No se pudo cargar el resumen";
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
    void Promise.all([
      loadPrivateSummary(
        "/internal/provider/products",
        "articles-count",
        "articles-note",
        "products",
        "Crea el primer artículo",
        "Catálogo privado preparado"
      ),
      loadPrivateSummary(
        "/internal/provider/blog-posts",
        "posts-count",
        "posts-note",
        "posts",
        "Crea la primera historia",
        "Blog privado preparado"
      )
    ]);
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

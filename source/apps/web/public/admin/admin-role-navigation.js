const currentPath = window.location.pathname;
const isEditorialSection = currentPath.startsWith("/admin/articulos/")
  || currentPath.startsWith("/admin/publicaciones/")
  || currentPath.startsWith("/admin/talleres/");
const isPlatformOwnerSection = currentPath.startsWith("/admin/escaparate/")
  || currentPath.startsWith("/admin/pueblo/");

function hideLinks(path) {
  for (const link of document.querySelectorAll(`a[href="${path}"]`)) link.hidden = true;
}

function ensureOwnerLink(actions, path, label) {
  if (actions.querySelector(`a[href="${path}"]`)) return;
  const link = document.createElement("a");
  link.href = path;
  link.textContent = label;
  const active = currentPath.startsWith(path);
  link.className = active ? "button secondary" : "button ghost";
  if (active) link.setAttribute("aria-current", "page");
  const logout = [...actions.querySelectorAll("button")]
    .find((button) => button.textContent.trim().toLocaleLowerCase("es").includes("cerrar sesión"));
  actions.insertBefore(link, logout || null);
}

function ensurePlatformOwnerLinks() {
  for (const actions of document.querySelectorAll(".top-actions")) {
    ensureOwnerLink(actions, "/admin/escaparate/", "Escaparate");
    ensureOwnerLink(actions, "/admin/pueblo/", "Pueblo");
  }
}

function targetForRole(role) {
  if (role === "PROVIDER_MANAGER") return "/admin/proveedores/";
  if (role === "EDITORIAL_REVIEWER") return "/admin/articulos/";
  return "/admin/proveedores/";
}

async function applyAdminRoleNavigation() {
  try {
    const response = await fetch("/internal/admin/session", {
      credentials: "same-origin",
      headers: { Accept: "application/json" }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.authenticated !== true) {
      window.location.replace("/admin/proveedores/");
      return;
    }

    const role = payload.account?.role;
    document.body.dataset.adminRole = role || "UNKNOWN";

    if (role === "PLATFORM_OWNER") {
      ensurePlatformOwnerLinks();
      return;
    }
    if (isPlatformOwnerSection) {
      window.location.replace(targetForRole(role));
      return;
    }
    if (role === "EDITORIAL_REVIEWER") {
      hideLinks("/admin/proveedores/");
      return;
    }
    if (role === "PROVIDER_MANAGER") {
      hideLinks("/admin/articulos/");
      hideLinks("/admin/publicaciones/");
      hideLinks("/admin/talleres/");
      if (isEditorialSection) window.location.replace(targetForRole(role));
      return;
    }

    window.location.replace(targetForRole(role));
  } catch {
    window.location.replace("/admin/proveedores/");
  }
}

void applyAdminRoleNavigation();

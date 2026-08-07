const currentPath = window.location.pathname;
const isEditorialSection = currentPath.startsWith("/admin/articulos/")
  || currentPath.startsWith("/admin/publicaciones/")
  || currentPath.startsWith("/admin/talleres/");

function hideLinks(path) {
  for (const link of document.querySelectorAll(`a[href="${path}"]`)) link.hidden = true;
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

    if (role === "PLATFORM_OWNER") return;
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

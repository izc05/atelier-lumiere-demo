import { ServiceError } from "./providers-service.mjs";

export const ADMIN_CAPABILITIES = Object.freeze({
  MANAGE_PROVIDERS: "MANAGE_PROVIDERS",
  REVIEW_PRODUCTS: "REVIEW_PRODUCTS",
  REVIEW_BLOG: "REVIEW_BLOG",
  PLATFORM_CONTROL: "PLATFORM_CONTROL"
});

const ROLE_CAPABILITIES = Object.freeze({
  PLATFORM_OWNER: Object.freeze(Object.values(ADMIN_CAPABILITIES)),
  PROVIDER_MANAGER: Object.freeze([ADMIN_CAPABILITIES.MANAGE_PROVIDERS]),
  EDITORIAL_REVIEWER: Object.freeze([
    ADMIN_CAPABILITIES.REVIEW_PRODUCTS,
    ADMIN_CAPABILITIES.REVIEW_BLOG
  ])
});

function pathname(request) {
  return new URL(request?.url ?? "/", "http://localhost").pathname;
}

function capabilityForPath(path) {
  if (path === "/api/admin/providers" || path.startsWith("/api/admin/providers/")) {
    return ADMIN_CAPABILITIES.MANAGE_PROVIDERS;
  }
  if (path === "/api/admin/products" || path.startsWith("/api/admin/products/")) {
    return ADMIN_CAPABILITIES.REVIEW_PRODUCTS;
  }
  if (path === "/api/admin/blog-posts" || path.startsWith("/api/admin/blog-posts/")) {
    return ADMIN_CAPABILITIES.REVIEW_BLOG;
  }
  if (path.startsWith("/api/admin/")) return ADMIN_CAPABILITIES.PLATFORM_CONTROL;
  return null;
}

function effectiveRole(context) {
  if (typeof context?.adminRole === "string") return context.adminRole;
  if (context?.authenticationMode === "development-admin-token") return "PLATFORM_OWNER";
  return null;
}

export function capabilitiesForAdminRole(role) {
  return ROLE_CAPABILITIES[role] ?? Object.freeze([]);
}

export function authorizeAdminRequest(context, request) {
  if (!context || context.role !== "ADMIN") return context;
  const requiredCapability = capabilityForPath(pathname(request));
  if (!requiredCapability) return context;

  const adminRole = effectiveRole(context);
  const capabilities = capabilitiesForAdminRole(adminRole);
  if (!capabilities.includes(requiredCapability)) {
    throw new ServiceError(
      "ADMIN_ROLE_FORBIDDEN",
      "Tu rol administrativo no permite realizar esta operación.",
      403,
      { adminRole, requiredCapability }
    );
  }

  return Object.freeze({
    ...context,
    adminRole,
    capabilities
  });
}

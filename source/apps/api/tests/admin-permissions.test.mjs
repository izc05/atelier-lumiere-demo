import test from "node:test";
import assert from "node:assert/strict";
import {
  ADMIN_CAPABILITIES,
  authorizeAdminRequest,
  capabilitiesForAdminRole
} from "../src/admin-permissions.mjs";
import { createRequestAuthenticator } from "../src/auth-context.mjs";

const USER_ID = "00000000-0000-4000-8000-000000000109";

function context(adminRole, authenticationMode = "admin-session") {
  return {
    role: "ADMIN",
    userId: USER_ID,
    providerId: null,
    adminRole,
    authenticationMode
  };
}

function request(path, token = "session-token-with-at-least-thirty-two-characters") {
  return {
    url: path,
    headers: { authorization: `Bearer ${token}` }
  };
}

function forbidden(role, path, capability) {
  assert.throws(
    () => authorizeAdminRequest(context(role), request(path)),
    (error) => (
      error?.code === "ADMIN_ROLE_FORBIDDEN"
      && error?.statusCode === 403
      && error?.details?.adminRole === role
      && error?.details?.requiredCapability === capability
    )
  );
}

test("PLATFORM_OWNER conserva todas las capacidades administrativas", () => {
  const capabilities = capabilitiesForAdminRole("PLATFORM_OWNER");
  assert.deepEqual(new Set(capabilities), new Set(Object.values(ADMIN_CAPABILITIES)));
  for (const path of [
    "/api/admin/providers",
    "/api/admin/providers/00000000-0000-4000-8000-000000000201/status",
    "/api/admin/products",
    "/api/admin/products/00000000-0000-4000-8000-000000000301/review",
    "/api/admin/blog-posts",
    "/api/admin/blog-posts/00000000-0000-4000-8000-000000000401/publish",
    "/api/admin/future-platform-control"
  ]) {
    const authorized = authorizeAdminRequest(context("PLATFORM_OWNER"), request(path));
    assert.equal(authorized.adminRole, "PLATFORM_OWNER");
    assert.equal(authorized.capabilities.includes(ADMIN_CAPABILITIES.PLATFORM_CONTROL), true);
  }
});

test("PROVIDER_MANAGER solo gestiona talleres", () => {
  const provider = authorizeAdminRequest(
    context("PROVIDER_MANAGER"),
    request("/api/admin/providers")
  );
  assert.deepEqual(provider.capabilities, [ADMIN_CAPABILITIES.MANAGE_PROVIDERS]);
  forbidden("PROVIDER_MANAGER", "/api/admin/products", ADMIN_CAPABILITIES.REVIEW_PRODUCTS);
  forbidden("PROVIDER_MANAGER", "/api/admin/blog-posts", ADMIN_CAPABILITIES.REVIEW_BLOG);
  forbidden("PROVIDER_MANAGER", "/api/admin/future-platform-control", ADMIN_CAPABILITIES.PLATFORM_CONTROL);
});

test("EDITORIAL_REVIEWER revisa catálogo y blog sin acceder a talleres", () => {
  for (const path of ["/api/admin/products", "/api/admin/blog-posts"]) {
    const authorized = authorizeAdminRequest(context("EDITORIAL_REVIEWER"), request(path));
    assert.equal(authorized.capabilities.length, 2);
  }
  forbidden("EDITORIAL_REVIEWER", "/api/admin/providers", ADMIN_CAPABILITIES.MANAGE_PROVIDERS);
  forbidden("EDITORIAL_REVIEWER", "/api/admin/future-platform-control", ADMIN_CAPABILITIES.PLATFORM_CONTROL);
});

test("las rutas no administrativas no cambian el contexto", () => {
  const original = context("PROVIDER_MANAGER");
  assert.equal(authorizeAdminRequest(original, request("/api/admin-auth/me")), original);
  assert.equal(authorizeAdminRequest(original, request("/health")), original);
  assert.equal(authorizeAdminRequest(null, request("/api/admin/providers")), null);
});

test("el autenticador aplica el rol de una sesión real", async () => {
  const authenticator = createRequestAuthenticator({
    environment: "production",
    adminAuthService: {
      async authenticate(token) {
        assert.equal(token, "session-token-with-at-least-thirty-two-characters");
        return context("EDITORIAL_REVIEWER");
      }
    }
  });

  const editorial = await authenticator(request("/api/admin/products"));
  assert.equal(editorial.adminRole, "EDITORIAL_REVIEWER");
  await assert.rejects(
    () => authenticator(request("/api/admin/providers")),
    (error) => error?.code === "ADMIN_ROLE_FORBIDDEN" && error?.statusCode === 403
  );
});

test("el token temporal de desarrollo equivale solo localmente a PLATFORM_OWNER", async () => {
  const token = "development-admin-token-with-at-least-thirty-two-characters";
  const authenticator = createRequestAuthenticator({
    environment: "development",
    allowDevelopmentAdminAuth: true,
    developmentAdminToken: token,
    developmentAdminUserId: USER_ID
  });
  const authorized = await authenticator(request("/api/admin/future-platform-control", token));
  assert.equal(authorized.adminRole, "PLATFORM_OWNER");
  assert.equal(authorized.capabilities.includes(ADMIN_CAPABILITIES.PLATFORM_CONTROL), true);
});

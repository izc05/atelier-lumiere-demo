const LEGACY_ACCOUNT_PATHS = new Set(["/cuenta", "/cuenta/"]);
const PROVIDER_ACCESS_PATH = "/proveedor/acceso/";

function redirectHeaders(location) {
  return {
    Location: location,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer"
  };
}

export function createLegacyRouteRedirectWebHandler({ baseHandler } = {}) {
  if (typeof baseHandler !== "function") {
    throw new TypeError("createLegacyRouteRedirectWebHandler necesita un handler base.");
  }

  return async function legacyRouteRedirectWebHandler(request, response) {
    const url = new URL(request.url ?? "/", "http://localhost");
    const method = request.method ?? "GET";

    if (["GET", "HEAD"].includes(method) && LEGACY_ACCOUNT_PATHS.has(url.pathname)) {
      response.writeHead(308, redirectHeaders(`${PROVIDER_ACCESS_PATH}${url.search}`));
      response.end();
      return;
    }

    return baseHandler(request, response);
  };
}

const PROVIDER_SESSION_COOKIE = "atelier_provider_session";
const PROFILE_PATTERN = /^\/internal\/provider\/profile(?:\/(submit))?$/i;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,180}$/;

function parseCookies(header) {
  const cookies = new Map();
  for (const part of String(header ?? "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    try {
      cookies.set(part.slice(0, separator).trim(), decodeURIComponent(part.slice(separator + 1).trim()));
    } catch {
      // Se ignoran cookies corruptas.
    }
  }
  return cookies;
}

function providerToken(request) {
  const token = parseCookies(request.headers.cookie).get(PROVIDER_SESSION_COOKIE) ?? "";
  return TOKEN_PATTERN.test(token) ? token : null;
}

function securityHeaders(extra = {}) {
  return {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Cross-Origin-Resource-Policy": "same-origin",
    ...extra
  };
}

function expiredCookie(secure) {
  return [
    `${PROVIDER_SESSION_COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Strict", "Max-Age=0",
    secure ? "Secure" : null
  ].filter(Boolean).join("; ");
}

function sendJson(response, statusCode, payload, extra = {}) {
  response.writeHead(statusCode, securityHeaders({ "Content-Type": "application/json; charset=utf-8", ...extra }));
  response.end(JSON.stringify(payload));
}

function redirectToAccess(response, secure) {
  response.writeHead(302, securityHeaders({
    Location: "/proveedor/acceso/",
    "Set-Cookie": expiredCookie(secure)
  }));
  response.end();
}

async function sessionIsValid(apiBase, fetchImpl, request, token) {
  try {
    const response = await fetchImpl(new URL("/api/provider/me", apiBase), {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "User-Agent": String(request.headers["user-agent"] ?? "").slice(0, 500)
      },
      signal: AbortSignal.timeout(6000)
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function createProviderProfileWebHandler({
  baseHandler,
  apiInternalUrl = process.env.API_INTERNAL_URL ?? "http://localhost:4000",
  providerCookieSecure = process.env.PROVIDER_COOKIE_SECURE === "true",
  fetchImpl = fetch,
  logger = console
} = {}) {
  if (typeof baseHandler !== "function") {
    throw new TypeError("createProviderProfileWebHandler necesita un handler base.");
  }
  const apiBase = new URL(apiInternalUrl);

  return async function providerProfileWebHandler(request, response) {
    const url = new URL(request.url ?? "/", "http://localhost");
    const match = url.pathname.match(PROFILE_PATTERN);
    if (match) {
      const method = request.method ?? "GET";
      const allowed = match[1] ? method === "POST" : ["GET", "PATCH"].includes(method);
      if (!allowed) {
        sendJson(response, 405, { error: "METHOD_NOT_ALLOWED", message: "Método no permitido." });
        return;
      }
      const token = providerToken(request);
      if (!token) {
        sendJson(response, 401, { error: "UNAUTHORIZED", message: "La sesión no es válida o ha caducado." }, {
          "Set-Cookie": expiredCookie(providerCookieSecure)
        });
        return;
      }
      const target = new URL(url.pathname.replace(/^\/internal/, "/api"), apiBase);
      try {
        const upstream = await fetchImpl(target, {
          method,
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
            ...(method === "PATCH" ? { "Content-Type": "application/json" } : {}),
            "User-Agent": String(request.headers["user-agent"] ?? "").slice(0, 500)
          },
          ...(!["GET", "HEAD"].includes(method) ? { body: request, duplex: "half" } : {}),
          signal: AbortSignal.timeout(15_000)
        });
        const body = await upstream.text();
        sendJson(response, upstream.status, JSON.parse(body || "{}"), upstream.status === 401 ? {
          "Set-Cookie": expiredCookie(providerCookieSecure)
        } : {});
      } catch (error) {
        logger.error("No se pudo completar el proxy del perfil del taller.", {
          code: typeof error?.code === "string" ? error.code : "PROVIDER_PROFILE_PROXY_FAILED"
        });
        sendJson(response, 502, { error: "API_UNAVAILABLE", message: "El perfil del taller no responde." });
      }
      return;
    }

    if (["GET", "HEAD"].includes(request.method ?? "GET")
      && (url.pathname === "/proveedor/perfil" || url.pathname === "/proveedor/perfil/")) {
      const token = providerToken(request);
      if (!token || !(await sessionIsValid(apiBase, fetchImpl, request, token))) {
        redirectToAccess(response, providerCookieSecure);
        return;
      }
    }

    return baseHandler(request, response);
  };
}

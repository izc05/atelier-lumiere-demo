import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const PROVIDER_SESSION_COOKIE = "atelier_provider_session";
const ROUTE_PATTERN = /^\/internal\/provider\/(orders|custom-requests)(?:\/([0-9a-f-]{36})(?:\/(transitions|messages))?)?$/i;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,180}$/;
const PROTECTED_PAGES = new Set([
  "/proveedor/pedidos",
  "/proveedor/pedidos/",
  "/proveedor/pedidos/detalle",
  "/proveedor/pedidos/detalle/",
  "/proveedor/encargos",
  "/proveedor/encargos/",
  "/proveedor/encargos/detalle",
  "/proveedor/encargos/detalle/"
]);

function parseCookies(header) {
  const cookies = new Map();
  for (const part of String(header ?? "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    try {
      cookies.set(key, decodeURIComponent(value));
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
    `${PROVIDER_SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    "Max-Age=0",
    secure ? "Secure" : null
  ].filter(Boolean).join("; ");
}

function sendJson(response, statusCode, payload, extraHeaders = {}) {
  response.writeHead(statusCode, securityHeaders({
    "Content-Type": "application/json; charset=utf-8",
    ...extraHeaders
  }));
  response.end(JSON.stringify(payload));
}

function redirectToAccess(response, secure) {
  response.writeHead(302, securityHeaders({
    Location: "/proveedor/acceso/",
    "Set-Cookie": expiredCookie(secure)
  }));
  response.end();
}

function routeAllows(method, match) {
  const [, resource, resourceId, action] = match;
  if (!resourceId) return method === "GET";
  if (!action) return method === "GET";
  if (resource === "orders" && action === "transitions") return method === "POST";
  if (resource === "custom-requests" && ["transitions", "messages"].includes(action)) {
    return method === "POST";
  }
  return false;
}

async function pipeUpstream(upstream, response, { clearCookie = false, secure = false } = {}) {
  const headers = securityHeaders({
    "Content-Type": upstream.headers.get("content-type") ?? "application/json; charset=utf-8"
  });
  if (clearCookie) headers["Set-Cookie"] = expiredCookie(secure);
  response.writeHead(upstream.status, headers);
  if (!upstream.body) {
    response.end();
    return;
  }
  await pipeline(Readable.fromWeb(upstream.body), response);
}

export function createProviderOrdersWebHandler({
  baseHandler,
  apiInternalUrl = process.env.API_INTERNAL_URL ?? "http://localhost:4000",
  providerCookieSecure = process.env.PROVIDER_COOKIE_SECURE === "true",
  fetchImpl = fetch,
  logger = console
} = {}) {
  if (typeof baseHandler !== "function") {
    throw new TypeError("createProviderOrdersWebHandler necesita un handler base.");
  }
  const apiBase = new URL(apiInternalUrl);

  async function validateSession(request, token) {
    try {
      const upstream = await fetchImpl(new URL("/api/provider/me", apiBase), {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
          "User-Agent": String(request.headers["user-agent"] ?? "").slice(0, 500)
        },
        signal: AbortSignal.timeout(6000)
      });
      return upstream.ok;
    } catch (error) {
      logger.error("No se pudo validar la sesión para pedidos.", {
        code: typeof error?.code === "string" ? error.code : "ORDER_SESSION_CHECK_FAILED"
      });
      return false;
    }
  }

  return async function providerOrdersWebHandler(request, response) {
    const url = new URL(request.url ?? "/", "http://localhost");
    const match = url.pathname.match(ROUTE_PATTERN);

    if (match) {
      const method = request.method ?? "GET";
      if (!routeAllows(method, match)) {
        sendJson(response, 405, {
          error: "METHOD_NOT_ALLOWED",
          message: "Método no permitido."
        }, { Allow: "GET,POST" });
        return;
      }

      const token = providerToken(request);
      if (!token) {
        sendJson(response, 401, {
          error: "UNAUTHORIZED",
          message: "La sesión no es válida o ha caducado."
        }, { "Set-Cookie": expiredCookie(providerCookieSecure) });
        return;
      }

      const upstreamPath = url.pathname.replace(/^\/internal/, "/api");
      const target = new URL(`${upstreamPath}${url.search}`, apiBase);
      const hasBody = !["GET", "HEAD"].includes(method);
      const headers = new Headers({
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "User-Agent": String(request.headers["user-agent"] ?? "").slice(0, 500)
      });
      if (hasBody) {
        headers.set("Content-Type", String(request.headers["content-type"] ?? "application/json"));
        const length = request.headers["content-length"];
        if (length) headers.set("Content-Length", String(length));
      }

      try {
        const upstream = await fetchImpl(target, {
          method,
          headers,
          ...(hasBody ? { body: request, duplex: "half" } : {}),
          signal: AbortSignal.timeout(15000)
        });
        await pipeUpstream(upstream, response, {
          clearCookie: upstream.status === 401,
          secure: providerCookieSecure
        });
      } catch (error) {
        logger.error("No se pudo completar el proxy privado de pedidos.", {
          code: typeof error?.code === "string" ? error.code : "ORDER_PROXY_FAILED"
        });
        if (!response.headersSent) {
          sendJson(response, 502, {
            error: "API_UNAVAILABLE",
            message: "Los pedidos no responden. Inténtalo de nuevo en unos minutos."
          });
        } else {
          response.destroy(error instanceof Error ? error : undefined);
        }
      }
      return;
    }

    if (["GET", "HEAD"].includes(request.method ?? "GET") && PROTECTED_PAGES.has(url.pathname)) {
      const token = providerToken(request);
      if (!token || !(await validateSession(request, token))) {
        redirectToAccess(response, providerCookieSecure);
        return;
      }
    }

    return baseHandler(request, response);
  };
}

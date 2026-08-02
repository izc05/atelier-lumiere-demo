import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const PROVIDER_SESSION_COOKIE = "atelier_provider_session";
const PRODUCT_PROXY_PATTERN = /^\/internal\/provider\/products(?:\/([0-9a-f-]{36})(?:\/(events|personalizations|submit|media)(?:\/([0-9a-f-]{36})(?:\/(content|preview))?)?)?)?$/i;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,180}$/;
const SAFE_REQUEST_HEADERS = new Set([
  "content-type",
  "content-length",
  "x-file-name",
  "x-alt-text",
  "range",
  "user-agent"
]);
const SAFE_RESPONSE_HEADERS = new Set([
  "content-type",
  "content-length",
  "content-disposition",
  "accept-ranges",
  "content-range",
  "cache-control",
  "x-content-type-options",
  "content-security-policy"
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

function isProtectedProductsPage(pathname) {
  return pathname === "/proveedor/articulos"
    || pathname === "/proveedor/articulos/"
    || pathname.startsWith("/proveedor/articulos/");
}

function routeAllows(method, match) {
  const [, productId, action, mediaId, mediaVariant] = match;
  if (!productId) return ["GET", "POST"].includes(method);
  if (!action) return ["GET", "PATCH"].includes(method);
  if (action === "events" || action === "personalizations") {
    return !mediaId && !mediaVariant && method === "PUT";
  }
  if (action === "submit") return !mediaId && !mediaVariant && method === "POST";
  if (action === "media" && !mediaId) return method === "POST";
  if (action === "media" && mediaId && !mediaVariant) {
    return ["PATCH", "DELETE"].includes(method);
  }
  if (action === "media" && mediaId && mediaVariant) return method === "GET";
  return false;
}

function requestHeaders(request, token) {
  const headers = new Headers({
    Accept: request.headers.accept ?? "application/json",
    Authorization: `Bearer ${token}`
  });
  for (const [name, value] of Object.entries(request.headers)) {
    const normalized = name.toLowerCase();
    if (!SAFE_REQUEST_HEADERS.has(normalized) || value === undefined) continue;
    headers.set(normalized, Array.isArray(value) ? value[0] : String(value));
  }
  return headers;
}

function responseHeaders(upstream, { clearCookie = false, cookieSecure = false } = {}) {
  const headers = securityHeaders();
  for (const [name, value] of upstream.headers) {
    if (SAFE_RESPONSE_HEADERS.has(name.toLowerCase())) headers[name] = value;
  }
  if (clearCookie) headers["Set-Cookie"] = expiredCookie(cookieSecure);
  return headers;
}

async function pipeUpstream(upstream, response, options = {}) {
  response.writeHead(upstream.status, responseHeaders(upstream, options));
  if (!upstream.body) {
    response.end();
    return;
  }
  await pipeline(Readable.fromWeb(upstream.body), response);
}

export function createProviderProductsWebHandler({
  baseHandler,
  apiInternalUrl = process.env.API_INTERNAL_URL ?? "http://localhost:4000",
  providerCookieSecure = process.env.PROVIDER_COOKIE_SECURE === "true",
  fetchImpl = fetch,
  logger = console
} = {}) {
  if (typeof baseHandler !== "function") {
    throw new TypeError("createProviderProductsWebHandler necesita un handler base.");
  }
  const apiBase = new URL(apiInternalUrl);

  async function validateProviderSession(request, token) {
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
      logger.error("No se pudo validar la sesión para el catálogo.", {
        code: typeof error?.code === "string" ? error.code : "PRODUCT_SESSION_CHECK_FAILED"
      });
      return false;
    }
  }

  return async function providerProductsWebHandler(request, response) {
    const url = new URL(request.url ?? "/", "http://localhost");
    const proxyMatch = url.pathname.match(PRODUCT_PROXY_PATTERN);

    if (proxyMatch) {
      const method = request.method ?? "GET";
      if (!routeAllows(method, proxyMatch)) {
        sendJson(response, 405, {
          error: "METHOD_NOT_ALLOWED",
          message: "Método no permitido."
        });
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
      const hasBody = !["GET", "HEAD", "DELETE"].includes(method);
      const isBinaryUpload = proxyMatch[2] === "media" && !proxyMatch[3] && method === "POST";
      const timeoutMs = isBinaryUpload ? 120_000 : proxyMatch[4] ? 60_000 : 15_000;

      try {
        const upstream = await fetchImpl(target, {
          method,
          headers: requestHeaders(request, token),
          ...(hasBody ? { body: request, duplex: "half" } : {}),
          signal: AbortSignal.timeout(timeoutMs)
        });
        await pipeUpstream(upstream, response, {
          clearCookie: upstream.status === 401,
          cookieSecure: providerCookieSecure
        });
      } catch (error) {
        logger.error("No se pudo completar el proxy privado de artículos.", {
          code: typeof error?.code === "string" ? error.code : "PRODUCT_PROXY_FAILED"
        });
        if (!response.headersSent) {
          sendJson(response, 502, {
            error: "API_UNAVAILABLE",
            message: "El catálogo no responde. Inténtalo de nuevo en unos minutos."
          });
        } else {
          response.destroy(error instanceof Error ? error : undefined);
        }
      }
      return;
    }

    if (
      ["GET", "HEAD"].includes(request.method ?? "GET")
      && isProtectedProductsPage(url.pathname)
    ) {
      const token = providerToken(request);
      if (!token || !(await validateProviderSession(request, token))) {
        redirectToAccess(response, providerCookieSecure);
        return;
      }
    }

    return baseHandler(request, response);
  };
}

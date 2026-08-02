import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const PROVIDER_SESSION_COOKIE = "atelier_provider_session";
const BLOG_PROXY_PATTERN = /^\/internal\/provider\/blog-posts(?:\/([0-9a-f-]{36})(?:\/(tags|products|submit))?)?$/i;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,180}$/;
const SAFE_RESPONSE_HEADERS = new Set([
  "content-type",
  "content-length",
  "cache-control",
  "x-content-type-options"
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

function isProtectedBlogPage(pathname) {
  return pathname === "/proveedor/publicaciones"
    || pathname === "/proveedor/publicaciones/"
    || pathname === "/proveedor/publicaciones/editar"
    || pathname === "/proveedor/publicaciones/editar/";
}

function routeAllows(method, match) {
  const [, postId, action] = match;
  if (!postId) return ["GET", "POST"].includes(method);
  if (!action) return ["GET", "PATCH"].includes(method);
  if (action === "tags" || action === "products") return method === "PUT";
  return action === "submit" && method === "POST";
}

function requestHeaders(request, token) {
  const headers = new Headers({
    Accept: request.headers.accept ?? "application/json",
    Authorization: `Bearer ${token}`
  });
  for (const name of ["content-type", "content-length", "user-agent"]) {
    const value = request.headers[name];
    if (value !== undefined) headers.set(name, Array.isArray(value) ? value[0] : String(value));
  }
  return headers;
}

function responseHeaders(upstream, { clearCookie = false, secure = false } = {}) {
  const headers = securityHeaders();
  for (const [name, value] of upstream.headers) {
    if (SAFE_RESPONSE_HEADERS.has(name.toLowerCase())) headers[name] = value;
  }
  if (clearCookie) headers["Set-Cookie"] = expiredCookie(secure);
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

export function createProviderBlogWebHandler({
  baseHandler,
  apiInternalUrl = process.env.API_INTERNAL_URL ?? "http://localhost:4000",
  providerCookieSecure = process.env.PROVIDER_COOKIE_SECURE === "true",
  fetchImpl = fetch,
  logger = console
} = {}) {
  if (typeof baseHandler !== "function") {
    throw new TypeError("createProviderBlogWebHandler necesita un handler base.");
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
      logger.error("No se pudo validar la sesión para el blog.", {
        code: typeof error?.code === "string" ? error.code : "BLOG_SESSION_CHECK_FAILED"
      });
      return false;
    }
  }

  return async function providerBlogWebHandler(request, response) {
    const url = new URL(request.url ?? "/", "http://localhost");
    const match = url.pathname.match(BLOG_PROXY_PATTERN);

    if (match) {
      const method = request.method ?? "GET";
      if (!routeAllows(method, match)) {
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

      const target = new URL(
        `${url.pathname.replace(/^\/internal/, "/api")}${url.search}`,
        apiBase
      );
      const hasBody = !["GET", "HEAD", "DELETE"].includes(method);
      try {
        const upstream = await fetchImpl(target, {
          method,
          headers: requestHeaders(request, token),
          ...(hasBody ? { body: request, duplex: "half" } : {}),
          signal: AbortSignal.timeout(15_000)
        });
        await pipeUpstream(upstream, response, {
          clearCookie: upstream.status === 401,
          secure: providerCookieSecure
        });
      } catch (error) {
        logger.error("No se pudo completar el proxy privado del blog.", {
          code: typeof error?.code === "string" ? error.code : "BLOG_PROXY_FAILED"
        });
        if (!response.headersSent) {
          sendJson(response, 502, {
            error: "API_UNAVAILABLE",
            message: "El blog no responde. Inténtalo de nuevo en unos minutos."
          });
        } else {
          response.destroy(error instanceof Error ? error : undefined);
        }
      }
      return;
    }

    if (
      ["GET", "HEAD"].includes(request.method ?? "GET")
      && isProtectedBlogPage(url.pathname)
    ) {
      const token = providerToken(request);
      if (!token || !(await validateSession(request, token))) {
        redirectToAccess(response, providerCookieSecure);
        return;
      }
    }

    return baseHandler(request, response);
  };
}

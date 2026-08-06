import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const PROVIDER_SESSION_COOKIE = "atelier_provider_session";
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,180}$/;
const FOCAL_PATTERN = /^\/internal\/provider\/products\/([0-9a-f-]{36})\/media-focal(?:\/([0-9a-f-]{36}))?$/i;
const PUBLICATION_PATTERN = /^\/internal\/provider\/products\/([0-9a-f-]{36})\/publication\/(edit|pause|resume)$/i;

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
  const value = parseCookies(request.headers.cookie).get(PROVIDER_SESSION_COOKIE) ?? "";
  return TOKEN_PATTERN.test(value) ? value : null;
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

function crossSiteMutation(request) {
  const method = request.method ?? "GET";
  if (!["PATCH", "POST"].includes(method)) return false;
  return String(request.headers["sec-fetch-site"] ?? "same-origin").toLowerCase() === "cross-site";
}

export function createProviderMediaFocalWebHandler({
  baseHandler,
  apiInternalUrl = process.env.API_INTERNAL_URL ?? "http://localhost:4000",
  providerCookieSecure = process.env.PROVIDER_COOKIE_SECURE === "true",
  fetchImpl = fetch,
  logger = console
} = {}) {
  if (typeof baseHandler !== "function") {
    throw new TypeError("createProviderMediaFocalWebHandler necesita un handler base.");
  }
  const apiBase = new URL(apiInternalUrl);

  return async function providerMediaFocalWebHandler(request, response) {
    const url = new URL(request.url ?? "/", "http://localhost");
    const focalMatch = url.pathname.match(FOCAL_PATTERN);
    const publicationMatch = url.pathname.match(PUBLICATION_PATTERN);
    if (!focalMatch && !publicationMatch) return baseHandler(request, response);

    const method = request.method ?? "GET";
    let allowed = false;
    let allowHeader = "GET";
    if (focalMatch) {
      const mediaId = focalMatch[2];
      allowed = (!mediaId && method === "GET") || (Boolean(mediaId) && method === "PATCH");
      allowHeader = mediaId ? "PATCH" : "GET";
    } else {
      allowed = method === "POST";
      allowHeader = "POST";
    }
    if (!allowed) {
      sendJson(response, 405, {
        error: "METHOD_NOT_ALLOWED",
        message: "Método no permitido."
      }, { Allow: allowHeader });
      return;
    }
    if (crossSiteMutation(request)) {
      sendJson(response, 403, {
        error: "CROSS_SITE_REQUEST",
        message: "La petición debe iniciarse desde Atelier Lumière."
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

    try {
      const upstream = await fetchImpl(
        new URL(url.pathname.replace(/^\/internal/, "/api"), apiBase),
        {
          method,
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
            ...(method === "PATCH" ? { "Content-Type": "application/json" } : {}),
            "User-Agent": String(request.headers["user-agent"] ?? "").slice(0, 500)
          },
          ...(method === "PATCH" ? { body: request, duplex: "half" } : {}),
          signal: AbortSignal.timeout(15_000)
        }
      );

      const headers = securityHeaders({
        "Content-Type": upstream.headers.get("content-type") ?? "application/json; charset=utf-8"
      });
      if (upstream.status === 401) headers["Set-Cookie"] = expiredCookie(providerCookieSecure);
      response.writeHead(upstream.status, headers);
      if (!upstream.body) response.end();
      else await pipeline(Readable.fromWeb(upstream.body), response);
    } catch (error) {
      logger.error("No se pudo completar el proxy de publicación y encuadre.", {
        code: typeof error?.code === "string" ? error.code : "PRODUCT_PUBLICATION_PROXY_FAILED"
      });
      if (!response.headersSent) {
        sendJson(response, 502, {
          error: "API_UNAVAILABLE",
          message: "La gestión del artículo no responde."
        });
      } else {
        response.destroy(error instanceof Error ? error : undefined);
      }
    }
  };
}

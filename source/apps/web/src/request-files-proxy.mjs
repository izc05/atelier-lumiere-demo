import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const PROVIDER_COOKIE = "atelier_provider_session";
const CUSTOMER_COOKIE = "atelier_customer_session";
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,180}$/;
const ROUTE_PATTERN = /^\/internal\/(provider|customer)\/(?:custom-requests\/([0-9a-f-]{36})\/files|request-files\/([0-9a-f-]{36})(?:\/(content))?)$/i;
const SAFE_REQUEST_HEADERS = new Set([
  "accept",
  "content-type",
  "content-length",
  "x-file-name",
  "x-message-id",
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
    try {
      cookies.set(
        part.slice(0, separator).trim(),
        decodeURIComponent(part.slice(separator + 1).trim())
      );
    } catch {
      // Se ignoran cookies corruptas.
    }
  }
  return cookies;
}

function actorCookie(actor) {
  return actor === "provider" ? PROVIDER_COOKIE : CUSTOMER_COOKIE;
}

function sessionToken(request, actor) {
  const token = parseCookies(request.headers.cookie).get(actorCookie(actor)) ?? "";
  return TOKEN_PATTERN.test(token) ? token : null;
}

function expiredCookie(actor, secure) {
  return [
    `${actorCookie(actor)}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    "Max-Age=0",
    secure ? "Secure" : null
  ].filter(Boolean).join("; ");
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

function sendJson(response, statusCode, payload, extra = {}) {
  response.writeHead(statusCode, securityHeaders({
    "Content-Type": "application/json; charset=utf-8",
    ...extra
  }));
  response.end(JSON.stringify(payload));
}

function routeAllows(method, match) {
  const [, , requestId, fileId, action] = match;
  if (requestId) return method === "POST";
  if (fileId && action === "content") return method === "GET";
  if (fileId && !action) return method === "DELETE";
  return false;
}

function upstreamHeaders(request, token) {
  const headers = new Headers({ Authorization: `Bearer ${token}` });
  for (const [name, value] of Object.entries(request.headers)) {
    const normalized = name.toLowerCase();
    if (!SAFE_REQUEST_HEADERS.has(normalized) || value === undefined) continue;
    headers.set(normalized, Array.isArray(value) ? value[0] : String(value));
  }
  if (!headers.has("accept")) headers.set("accept", "application/json");
  return headers;
}

async function pipeUpstream(upstream, response, { clearCookieHeader } = {}) {
  const responseHeaders = securityHeaders();
  for (const name of SAFE_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value !== null) responseHeaders[name] = value;
  }
  if (!responseHeaders["content-type"]) {
    responseHeaders["content-type"] = "application/json; charset=utf-8";
  }
  if (clearCookieHeader) responseHeaders["set-cookie"] = clearCookieHeader;
  response.writeHead(upstream.status, responseHeaders);
  if (!upstream.body) {
    response.end();
    return;
  }
  await pipeline(Readable.fromWeb(upstream.body), response);
}

export function createRequestFilesWebHandler({
  baseHandler,
  apiInternalUrl = process.env.API_INTERNAL_URL ?? "http://localhost:4000",
  providerCookieSecure = process.env.PROVIDER_COOKIE_SECURE === "true",
  customerCookieSecure = process.env.CUSTOMER_COOKIE_SECURE === "true",
  fetchImpl = fetch,
  logger = console
} = {}) {
  if (typeof baseHandler !== "function") {
    throw new TypeError("createRequestFilesWebHandler necesita un handler base.");
  }
  const apiBase = new URL(apiInternalUrl);

  return async function requestFilesWebHandler(request, response) {
    const url = new URL(request.url ?? "/", "http://localhost");
    const match = url.pathname.match(ROUTE_PATTERN);
    if (!match) return baseHandler(request, response);

    const method = request.method ?? "GET";
    if (!routeAllows(method, match)) {
      sendJson(response, 405, {
        error: "METHOD_NOT_ALLOWED",
        message: "Método no permitido."
      }, { Allow: "GET,POST,DELETE" });
      return;
    }

    const actor = match[1].toLowerCase();
    const token = sessionToken(request, actor);
    const secure = actor === "provider" ? providerCookieSecure : customerCookieSecure;
    if (!token) {
      sendJson(response, 401, {
        error: "UNAUTHORIZED",
        message: "La sesión no es válida o ha caducado."
      }, { "Set-Cookie": expiredCookie(actor, secure) });
      return;
    }

    const target = new URL(url.pathname.replace(/^\/internal/, "/api") + url.search, apiBase);
    const hasBody = method === "POST";
    try {
      const upstream = await fetchImpl(target, {
        method,
        headers: upstreamHeaders(request, token),
        ...(hasBody ? { body: request, duplex: "half" } : {}),
        signal: AbortSignal.timeout(hasBody ? 90000 : 30000)
      });
      await pipeUpstream(upstream, response, {
        clearCookieHeader: upstream.status === 401 ? expiredCookie(actor, secure) : null
      });
    } catch (error) {
      logger.error("No se pudo completar el proxy privado de archivos de encargos.", {
        code: typeof error?.code === "string" ? error.code : "REQUEST_FILES_PROXY_FAILED"
      });
      if (!response.headersSent) {
        sendJson(response, 502, {
          error: "API_UNAVAILABLE",
          message: "Los archivos no responden en este momento."
        });
      } else {
        response.destroy(error instanceof Error ? error : undefined);
      }
    }
  };
}

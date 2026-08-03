import { randomBytes } from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const PRIVACY_COOKIE = "atelier_privacy_key";
const DOCUMENT_PATTERN = /^\/internal\/legal\/documents(?:\/([a-z0-9-]{3,80}))?$/;
const PREFERENCES_PATH = "/internal/privacy/preferences";
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,180}$/;
const MAX_BODY_BYTES = 32 * 1024;

function parseCookies(header) {
  const cookies = new Map();
  for (const part of String(header ?? "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    const name = part.slice(0, separator).trim();
    try {
      cookies.set(name, decodeURIComponent(part.slice(separator + 1).trim()));
    } catch {
      // Se ignoran cookies corruptas.
    }
  }
  return cookies;
}

function currentKey(request) {
  const value = parseCookies(request.headers.cookie).get(PRIVACY_COOKIE) ?? "";
  return TOKEN_PATTERN.test(value) ? value : null;
}

function cookie(value, secure) {
  return [
    `${PRIVACY_COOKIE}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    "Max-Age=31536000",
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

function sendJson(response, statusCode, body, extra = {}) {
  response.writeHead(statusCode, securityHeaders({
    "Content-Type": "application/json; charset=utf-8",
    ...extra
  }));
  response.end(JSON.stringify(body));
}

function requestIsSameSite(request) {
  const fetchSite = String(request.headers["sec-fetch-site"] ?? "none").toLowerCase();
  return ["none", "same-origin", "same-site"].includes(fetchSite);
}

function bodyLengthAllowed(request) {
  const raw = request.headers["content-length"];
  if (raw === undefined) return true;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 && value <= MAX_BODY_BYTES;
}

async function pipeResponse(upstream, response, extraHeaders = {}) {
  const contentType = upstream.headers.get("content-type") ?? "application/json; charset=utf-8";
  response.writeHead(upstream.status, securityHeaders({
    "Content-Type": contentType,
    ...extraHeaders
  }));
  if (!upstream.body) response.end();
  else await pipeline(Readable.fromWeb(upstream.body), response);
}

export function createLegalPrivacyWebHandler({
  baseHandler,
  apiInternalUrl = process.env.API_INTERNAL_URL ?? "http://localhost:4000",
  cookieSecure = process.env.WEB_COOKIE_SECURE === "true",
  fetchImpl = fetch,
  logger = console
} = {}) {
  if (typeof baseHandler !== "function") {
    throw new TypeError("createLegalPrivacyWebHandler necesita un handler base.");
  }
  const apiBase = new URL(apiInternalUrl);

  return async function legalPrivacyWebHandler(request, response) {
    const url = new URL(request.url ?? "/", "http://localhost");
    const documentMatch = url.pathname.match(DOCUMENT_PATTERN);
    const preferences = url.pathname === PREFERENCES_PATH;
    if (!documentMatch && !preferences) return baseHandler(request, response);

    const method = request.method ?? "GET";
    if ((documentMatch && method !== "GET") || (preferences && !["GET", "PUT"].includes(method))) {
      sendJson(response, 405, { error: "METHOD_NOT_ALLOWED", message: "Método no permitido." });
      return;
    }
    if (method === "PUT") {
      if (!requestIsSameSite(request)) {
        sendJson(response, 403, { error: "CROSS_SITE_REQUEST", message: "Solicitud no permitida." });
        return;
      }
      if (!bodyLengthAllowed(request)) {
        sendJson(response, 413, { error: "BODY_TOO_LARGE", message: "La solicitud es demasiado grande." });
        return;
      }
      const contentType = String(request.headers["content-type"] ?? "").toLowerCase();
      if (!contentType.startsWith("application/json")) {
        sendJson(response, 415, { error: "CONTENT_TYPE_REQUIRED", message: "Se necesita JSON." });
        return;
      }
    }

    let key = preferences ? currentKey(request) : null;
    let newCookie = false;
    if (preferences && method === "PUT" && !key) {
      key = randomBytes(32).toString("base64url");
      newCookie = true;
    }

    const upstreamPath = documentMatch
      ? url.pathname.replace(/^\/internal/, "/api")
      : "/api/legal/privacy-preferences";
    try {
      const upstream = await fetchImpl(new URL(upstreamPath, apiBase), {
        method,
        headers: {
          Accept: "application/json",
          ...(key ? { "X-Privacy-Key": key } : {}),
          ...(method === "PUT" ? { "Content-Type": "application/json" } : {})
        },
        ...(method === "PUT" ? { body: request, duplex: "half" } : {}),
        signal: AbortSignal.timeout(10_000)
      });
      await pipeResponse(upstream, response, newCookie ? {
        "Set-Cookie": cookie(key, cookieSecure)
      } : {});
    } catch (error) {
      logger.error("No se pudo completar el proxy legal.", {
        code: typeof error?.code === "string" ? error.code : "LEGAL_PROXY_FAILED"
      });
      if (!response.headersSent) {
        sendJson(response, 502, {
          error: "API_UNAVAILABLE",
          message: "El servicio legal no responde."
        });
      } else response.destroy(error instanceof Error ? error : undefined);
    }
  };
}

import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const ADMIN_SESSION_COOKIE = "atelier_admin_session";
const ADMIN_PATTERN = /^\/internal\/admin\/showcase(?:\/([A-Z0-9_]+)(?:\/(preview))?)?$/i;
const PUBLIC_PATTERN = /^\/internal\/showcase(?:\/([A-Z0-9_]+)\/(preview))?$/i;
const SAFE_RESPONSE_HEADERS = new Set([
  "content-type", "content-length", "content-disposition", "accept-ranges", "content-range",
  "cache-control", "x-content-type-options", "content-security-policy", "cross-origin-resource-policy"
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
      // Se ignoran cookies mal formadas.
    }
  }
  return cookies;
}

function adminSessionToken(request) {
  return parseCookies(request.headers.cookie).get(ADMIN_SESSION_COOKIE) ?? null;
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

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, securityHeaders({ "Content-Type": "application/json; charset=utf-8" }));
  response.end(JSON.stringify(payload));
}

function copiedHeaders(upstream) {
  const headers = securityHeaders();
  for (const [name, value] of upstream.headers) {
    if (SAFE_RESPONSE_HEADERS.has(name.toLowerCase())) headers[name] = value;
  }
  return headers;
}

function requestHeader(request, name) {
  const value = request.headers?.[name];
  return Array.isArray(value) ? value[0] : value;
}

function targetPath(pathname) {
  return pathname.replace(/^\/internal/, "/api");
}

function adminMethodAllowed(method, match) {
  const [, slot, preview] = match;
  if (!slot) return method === "GET";
  if (preview === "preview") return method === "GET";
  return ["PUT", "PATCH", "DELETE"].includes(method);
}

function publicMethodAllowed(method, match) {
  const [, slot, preview] = match;
  if (!slot) return method === "GET";
  return preview === "preview" && method === "GET";
}

export function createShowcaseWebHandler({
  baseHandler,
  apiInternalUrl = process.env.API_INTERNAL_URL ?? "http://localhost:4000",
  enableAdminUi = process.env.ENABLE_ADMIN_UI === "true",
  fetchImpl = fetch,
  logger = console
} = {}) {
  if (typeof baseHandler !== "function") throw new TypeError("Se necesita un handler base.");
  const apiBase = new URL(apiInternalUrl);

  return async function showcaseWebHandler(request, response) {
    const url = new URL(request.url ?? "/", "http://localhost");
    const adminMatch = url.pathname.match(ADMIN_PATTERN);
    const publicMatch = url.pathname.match(PUBLIC_PATTERN);
    if (!adminMatch && !publicMatch) return baseHandler(request, response);

    const method = request.method ?? "GET";
    const isAdmin = Boolean(adminMatch);
    const match = adminMatch ?? publicMatch;
    if (isAdmin && !enableAdminUi) {
      sendJson(response, 404, { error: "NOT_FOUND", message: "No encontrado." });
      return;
    }
    if (!(isAdmin ? adminMethodAllowed(method, match) : publicMethodAllowed(method, match))) {
      sendJson(response, 405, { error: "METHOD_NOT_ALLOWED", message: "Método no permitido." });
      return;
    }

    const sessionToken = isAdmin ? adminSessionToken(request) : null;
    if (isAdmin && !sessionToken) {
      sendJson(response, 401, { error: "UNAUTHORIZED", message: "La sesión administrativa ha caducado." });
      return;
    }

    const [, , preview] = match;
    const isPreview = preview === "preview";
    const hasBody = !["GET", "HEAD", "DELETE"].includes(method);
    const target = new URL(`${targetPath(url.pathname)}${url.search}`, apiBase);

    const headers = {
      Accept: request.headers.accept ?? (isPreview ? "*/*" : "application/json"),
      ...(isAdmin ? { Authorization: `Bearer ${sessionToken}` } : {}),
      ...(request.headers.range ? { Range: request.headers.range } : {}),
      "User-Agent": String(request.headers["user-agent"] ?? "").slice(0, 500)
    };

    if (method === "PUT") {
      for (const name of ["content-type", "content-length", "x-file-name", "x-alt-text", "x-focal-x", "x-focal-y"]) {
        const value = requestHeader(request, name);
        if (value !== undefined) headers[name] = value;
      }
    } else if (method === "PATCH") {
      headers["Content-Type"] = "application/json";
      const length = requestHeader(request, "content-length");
      if (length !== undefined) headers["Content-Length"] = length;
    }

    try {
      const upstream = await fetchImpl(target, {
        method,
        headers,
        ...(hasBody ? { body: request, duplex: "half" } : {}),
        signal: AbortSignal.timeout(isPreview || method === "PUT" ? 60_000 : 12_000)
      });
      response.writeHead(upstream.status, copiedHeaders(upstream));
      if (!upstream.body) response.end();
      else await pipeline(Readable.fromWeb(upstream.body), response);
    } catch (error) {
      logger.error("No se pudo completar la gestión del escaparate.", {
        code: typeof error?.code === "string" ? error.code : "SHOWCASE_PROXY_FAILED"
      });
      if (!response.headersSent) {
        sendJson(response, 502, { error: "API_UNAVAILABLE", message: "El escaparate no responde." });
      } else {
        response.destroy(error instanceof Error ? error : undefined);
      }
    }
  };
}

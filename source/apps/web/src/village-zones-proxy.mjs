import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const ADMIN_SESSION_COOKIE = "atelier_admin_session";
const ADMIN_COLLECTION = "/internal/admin/village-zones";
const ADMIN_ZONE = /^\/internal\/admin\/village-zones\/(ZONE_\d{2})$/i;
const PUBLIC_COLLECTION = "/internal/village-zones";

function parseCookies(header) {
  const cookies = new Map();
  for (const part of String(header ?? "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    try {
      cookies.set(part.slice(0, separator).trim(), decodeURIComponent(part.slice(separator + 1).trim()));
    } catch {
      // Cookie mal formada: se ignora.
    }
  }
  return cookies;
}

function securityHeaders() {
  return {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Cross-Origin-Resource-Policy": "same-origin"
  };
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, { ...securityHeaders(), "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

export function createVillageZonesWebHandler({
  baseHandler,
  apiInternalUrl = process.env.API_INTERNAL_URL ?? "http://localhost:4000",
  enableAdminUi = process.env.ENABLE_ADMIN_UI === "true",
  fetchImpl = fetch,
  logger = console
} = {}) {
  if (typeof baseHandler !== "function") throw new TypeError("Se necesita un handler base.");
  const apiBase = new URL(apiInternalUrl);

  return async function villageZonesWebHandler(request, response) {
    const url = new URL(request.url ?? "/", "http://localhost");
    const adminZone = url.pathname.match(ADMIN_ZONE);
    const adminCollection = url.pathname === ADMIN_COLLECTION;
    const publicCollection = url.pathname === PUBLIC_COLLECTION;
    if (!adminZone && !adminCollection && !publicCollection) return baseHandler(request, response);

    const method = request.method ?? "GET";
    const isAdmin = Boolean(adminZone || adminCollection);
    if (isAdmin && !enableAdminUi) {
      sendJson(response, 404, { error: "NOT_FOUND", message: "No encontrado." });
      return;
    }
    if (publicCollection && method !== "GET") {
      sendJson(response, 405, { error: "METHOD_NOT_ALLOWED", message: "Método no permitido." });
      return;
    }
    if (adminCollection && method !== "GET") {
      sendJson(response, 405, { error: "METHOD_NOT_ALLOWED", message: "Método no permitido." });
      return;
    }
    if (adminZone && !["PATCH", "DELETE"].includes(method)) {
      sendJson(response, 405, { error: "METHOD_NOT_ALLOWED", message: "Método no permitido." });
      return;
    }

    const token = isAdmin ? parseCookies(request.headers.cookie).get(ADMIN_SESSION_COOKIE) : null;
    if (isAdmin && !token) {
      sendJson(response, 401, { error: "UNAUTHORIZED", message: "La sesión administrativa ha caducado." });
      return;
    }

    const target = new URL(`${url.pathname.replace(/^\/internal/, "/api")}${url.search}`, apiBase);
    const hasBody = method === "PATCH";
    const headers = {
      Accept: "application/json",
      ...(isAdmin ? { Authorization: `Bearer ${token}` } : {}),
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      "User-Agent": String(request.headers["user-agent"] ?? "").slice(0, 500)
    };
    if (hasBody && request.headers["content-length"] !== undefined) {
      headers["Content-Length"] = request.headers["content-length"];
    }

    try {
      const upstream = await fetchImpl(target, {
        method,
        headers,
        ...(hasBody ? { body: request, duplex: "half" } : {}),
        signal: AbortSignal.timeout(12_000)
      });
      const responseHeaders = { ...securityHeaders() };
      const contentType = upstream.headers.get("content-type");
      if (contentType) responseHeaders["Content-Type"] = contentType;
      response.writeHead(upstream.status, responseHeaders);
      if (!upstream.body) response.end();
      else await pipeline(Readable.fromWeb(upstream.body), response);
    } catch (error) {
      logger.error("No se pudo completar la configuración del Pueblo Atelier.", {
        code: typeof error?.code === "string" ? error.code : "VILLAGE_ZONES_PROXY_FAILED"
      });
      if (!response.headersSent) {
        sendJson(response, 502, { error: "API_UNAVAILABLE", message: "El Pueblo Atelier no responde." });
      } else {
        response.destroy(error instanceof Error ? error : undefined);
      }
    }
  };
}

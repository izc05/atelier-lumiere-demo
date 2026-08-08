import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

// DEV_ADMIN_TOKEN queda reservado al API; este proxy usa exclusivamente la sesión administrativa HttpOnly.
const ADMIN_SESSION_COOKIE = "atelier_admin_session";
const PROFILE_PATTERN = /^\/internal\/admin\/provider-profiles(?:\/([0-9a-f-]{36})(?:\/(review|publish|media)(?:\/([0-9a-f-]{36})\/(preview))?)?)?$/i;
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

function sendNotFound(response) {
  response.writeHead(404, securityHeaders({ "Content-Type": "text/plain; charset=utf-8" }));
  response.end("No encontrado");
}

function copiedHeaders(upstream) {
  const headers = securityHeaders();
  for (const [name, value] of upstream.headers) {
    if (SAFE_RESPONSE_HEADERS.has(name.toLowerCase())) headers[name] = value;
  }
  return headers;
}

async function adminSessionIsActive(baseHandler, request) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const probeResponse = {
      headersSent: false,
      statusCode: 500,
      writeHead(statusCode) { this.statusCode = statusCode; this.headersSent = true; return this; },
      end() { finish(this.statusCode === 200); },
      destroy() { finish(false); }
    };
    Promise.resolve(baseHandler({ method: "GET", url: "/internal/admin/session", headers: request.headers }, probeResponse))
      .catch(() => finish(false));
  });
}

function routeAllows(method, match) {
  const [, providerId, action, mediaId, preview] = match;
  if (!providerId) return method === "GET";
  if (!action) return method === "GET";
  if (action === "review" || action === "publish") return !mediaId && method === "POST";
  if (action === "media" && !mediaId) return method === "GET";
  return action === "media" && Boolean(mediaId) && preview === "preview" && method === "GET";
}

export function createAdminProviderProfilesWebHandler({
  baseHandler,
  apiInternalUrl = process.env.API_INTERNAL_URL ?? "http://localhost:4000",
  enableAdminUi = process.env.ENABLE_ADMIN_UI === "true",
  fetchImpl = fetch,
  logger = console
} = {}) {
  if (typeof baseHandler !== "function") throw new TypeError("Se necesita un handler base.");
  const apiBase = new URL(apiInternalUrl);

  return async function adminProviderProfilesWebHandler(request, response) {
    const url = new URL(request.url ?? "/", "http://localhost");
    const match = url.pathname.match(PROFILE_PATTERN);
    if (match) {
      if (!enableAdminUi) return sendNotFound(response);
      const method = request.method ?? "GET";
      if (!routeAllows(method, match)) return sendJson(response, 405, { error: "METHOD_NOT_ALLOWED", message: "Método no permitido." });
      const sessionToken = adminSessionToken(request);
      if (!sessionToken || !(await adminSessionIsActive(baseHandler, request))) {
        return sendJson(response, 401, { error: "UNAUTHORIZED", message: "La sesión administrativa ha caducado." });
      }

      const [, , action, mediaId, preview] = match;
      const target = new URL(`${url.pathname.replace(/^\/internal/, "/api")}${url.search}`, apiBase);
      const hasBody = !["GET", "HEAD"].includes(method);
      const isPreview = action === "media" && Boolean(mediaId) && preview === "preview";
      try {
        const upstream = await fetchImpl(target, {
          method,
          headers: {
            Accept: request.headers.accept ?? (isPreview ? "*/*" : "application/json"),
            Authorization: `Bearer ${sessionToken}`,
            ...(hasBody ? { "Content-Type": "application/json" } : {}),
            ...(request.headers.range ? { Range: request.headers.range } : {}),
            "User-Agent": String(request.headers["user-agent"] ?? "").slice(0, 500)
          },
          ...(hasBody ? { body: request, duplex: "half" } : {}),
          signal: AbortSignal.timeout(isPreview ? 60_000 : 12_000)
        });
        response.writeHead(upstream.status, copiedHeaders(upstream));
        if (!upstream.body) response.end();
        else await pipeline(Readable.fromWeb(upstream.body), response);
      } catch (error) {
        logger.error("No se pudo completar la revisión de perfiles.", {
          code: typeof error?.code === "string" ? error.code : "ADMIN_PROFILE_PROXY_FAILED"
        });
        if (!response.headersSent) {
          sendJson(response, 502, { error: "API_UNAVAILABLE", message: "La revisión de perfiles no responde." });
        } else response.destroy(error instanceof Error ? error : undefined);
      }
      return;
    }

    if (["GET", "HEAD"].includes(request.method ?? "GET")
      && (url.pathname === "/admin/talleres" || url.pathname === "/admin/talleres/")) {
      if (!enableAdminUi) return sendNotFound(response);
      if (!adminSessionToken(request) || !(await adminSessionIsActive(baseHandler, request))) {
        response.writeHead(302, securityHeaders({ Location: "/admin/proveedores/" }));
        response.end();
        return;
      }
    }

    return baseHandler(request, response);
  };
}

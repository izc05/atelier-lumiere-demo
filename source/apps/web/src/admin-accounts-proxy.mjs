import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const ADMIN_SESSION_COOKIE = "atelier_admin_session";
const COLLECTION_PATH = "/internal/admin/accounts";
const STATUS_PATTERN = /^\/internal\/admin\/accounts\/([0-9a-f-]{36})\/status$/i;
const ROLE_PATTERN = /^\/internal\/admin\/accounts\/([0-9a-f-]{36})\/role$/i;
const SETUP_PATTERN = /^\/internal\/admin\/accounts\/([0-9a-f-]{36})\/setup-link$/i;
const SECURITY_RESET_PATTERN = /^\/internal\/admin\/accounts\/([0-9a-f-]{36})\/security-reset$/i;
const SESSIONS_PATTERN = /^\/internal\/admin\/accounts\/([0-9a-f-]{36})\/sessions$/i;
const SESSION_PATTERN = /^\/internal\/admin\/accounts\/([0-9a-f-]{36})\/sessions\/([0-9a-f-]{36})$/i;
const PROTECTED_PAGES = new Set(["/admin/cuentas", "/admin/cuentas/"]);
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

function token(request) {
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

function expiredCookie(secure) {
  return [
    `${ADMIN_SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    "Max-Age=0",
    secure ? "Secure" : null
  ].filter(Boolean).join("; ");
}

function sendJson(response, statusCode, payload, extra = {}) {
  response.writeHead(statusCode, securityHeaders({
    "Content-Type": "application/json; charset=utf-8",
    ...extra
  }));
  response.end(JSON.stringify(payload));
}

function redirect(response) {
  response.writeHead(302, securityHeaders({ Location: "/admin/proveedores/" }));
  response.end();
}

function matches(pathname) {
  return pathname === COLLECTION_PATH
    || STATUS_PATTERN.test(pathname)
    || ROLE_PATTERN.test(pathname)
    || SETUP_PATTERN.test(pathname)
    || SECURITY_RESET_PATTERN.test(pathname)
    || SESSIONS_PATTERN.test(pathname)
    || SESSION_PATTERN.test(pathname);
}

function methodAllowed(pathname, method) {
  if (pathname === COLLECTION_PATH) return method === "GET" || method === "POST";
  if (STATUS_PATTERN.test(pathname)) return method === "PATCH";
  if (ROLE_PATTERN.test(pathname)) return method === "PATCH";
  if (SETUP_PATTERN.test(pathname)) return method === "POST";
  if (SECURITY_RESET_PATTERN.test(pathname)) return method === "POST";
  if (SESSIONS_PATTERN.test(pathname)) return method === "GET" || method === "DELETE";
  if (SESSION_PATTERN.test(pathname)) return method === "DELETE";
  return false;
}

function copiedHeaders(upstream, extra = {}) {
  const headers = securityHeaders(extra);
  for (const [name, value] of upstream.headers) {
    if (SAFE_RESPONSE_HEADERS.has(name.toLowerCase())) headers[name] = value;
  }
  return headers;
}

function crossSiteMutation(request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method ?? "GET")) return false;
  return String(request.headers["sec-fetch-site"] ?? "same-origin").toLowerCase() === "cross-site";
}

export function createAdminAccountsWebHandler({
  baseHandler,
  apiInternalUrl = process.env.API_INTERNAL_URL ?? "http://localhost:4000",
  enableAdminUi = process.env.ENABLE_ADMIN_UI === "true",
  cookieSecure = process.env.WEB_COOKIE_SECURE === "true",
  fetchImpl = fetch,
  logger = console
} = {}) {
  if (typeof baseHandler !== "function") {
    throw new TypeError("createAdminAccountsWebHandler necesita un handler base.");
  }
  const apiBase = new URL(apiInternalUrl);

  async function sessionActive(request, sessionToken) {
    try {
      const upstream = await fetchImpl(new URL("/api/admin-auth/me", apiBase), {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${sessionToken}`,
          ...(request.headers["user-agent"]
            ? { "User-Agent": String(request.headers["user-agent"]) }
            : {})
        },
        signal: AbortSignal.timeout(6000)
      });
      return upstream.status === 200;
    } catch {
      return false;
    }
  }

  return async function adminAccountsWebHandler(request, response) {
    const url = new URL(request.url ?? "/", "http://localhost");
    const method = request.method ?? "GET";

    if (["GET", "HEAD"].includes(method) && PROTECTED_PAGES.has(url.pathname)) {
      if (!enableAdminUi) {
        response.writeHead(404, securityHeaders({ "Content-Type": "text/plain; charset=utf-8" }));
        response.end("No encontrado");
        return;
      }
      const sessionToken = token(request);
      if (!sessionToken || !(await sessionActive(request, sessionToken))) {
        redirect(response);
        return;
      }
    }

    if (!matches(url.pathname)) return baseHandler(request, response);
    if (!enableAdminUi) {
      response.writeHead(404, securityHeaders({ "Content-Type": "text/plain; charset=utf-8" }));
      response.end("No encontrado");
      return;
    }
    if (crossSiteMutation(request)) {
      sendJson(response, 403, {
        error: "CROSS_SITE_REQUEST",
        message: "La petición administrativa debe iniciarse desde Atelier Lumière."
      });
      return;
    }
    if (!methodAllowed(url.pathname, method)) {
      sendJson(response, 405, { error: "METHOD_NOT_ALLOWED", message: "Método no permitido." });
      return;
    }

    const sessionToken = token(request);
    if (!sessionToken) {
      sendJson(response, 401, { error: "UNAUTHORIZED", message: "La sesión administrativa ha caducado." });
      return;
    }

    const upstreamPath = `${url.pathname.replace(/^\/internal/, "/api")}${url.search}`;
    const headers = new Headers({
      Accept: request.headers.accept ?? "application/json",
      Authorization: `Bearer ${sessionToken}`
    });
    for (const name of ["content-type", "content-length", "user-agent"]) {
      const value = request.headers[name];
      if (value !== undefined) headers.set(name, Array.isArray(value) ? value[0] : String(value));
    }

    try {
      const hasBody = !["GET", "HEAD"].includes(method);
      const upstream = await fetchImpl(new URL(upstreamPath, apiBase), {
        method,
        headers,
        ...(hasBody ? { body: request, duplex: "half" } : {}),
        signal: AbortSignal.timeout(12_000)
      });
      const extra = upstream.status === 401
        ? { "Set-Cookie": expiredCookie(cookieSecure) }
        : {};
      response.writeHead(upstream.status, copiedHeaders(upstream, extra));
      if (!upstream.body) response.end();
      else await pipeline(Readable.fromWeb(upstream.body), response);
    } catch (error) {
      logger.error("No se pudo completar el proxy de cuentas administrativas.", {
        code: typeof error?.code === "string" ? error.code : "ADMIN_ACCOUNTS_PROXY_FAILED"
      });
      if (!response.headersSent) {
        sendJson(response, 502, {
          error: "API_UNAVAILABLE",
          message: "La gestión de cuentas no responde."
        });
      } else response.destroy(error instanceof Error ? error : undefined);
    }
  };
}

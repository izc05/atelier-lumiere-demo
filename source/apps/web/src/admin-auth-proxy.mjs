import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const ADMIN_SESSION_COOKIE = "atelier_admin_session";
const MAX_BODY_BYTES = 64 * 1024;
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
const PROVIDERS_PATTERN = /^\/internal\/admin\/providers(?:\/([0-9a-f-]{36})\/(status|invitations|audit))?$/i;
const PRODUCTS_PATTERN = /^\/internal\/admin\/products(?:\/([0-9a-f-]{36})(?:\/(review|publish)|\/media\/([0-9a-f-]{36})\/(preview))?)?$/i;
const BLOG_PATTERN = /^\/internal\/admin\/blog-posts(?:\/([0-9a-f-]{36})(?:\/(review|publish)|\/media\/([0-9a-f-]{36})\/(preview))?)?$/i;
const PROTECTED_ADMIN_PAGES = new Set([
  "/admin/articulos",
  "/admin/articulos/",
  "/admin/articulos/revisar",
  "/admin/articulos/revisar/",
  "/admin/publicaciones",
  "/admin/publicaciones/",
  "/admin/publicaciones/revisar",
  "/admin/publicaciones/revisar/"
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
      // Se ignoran cookies mal formadas.
    }
  }
  return cookies;
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

function sendNotFound(response) {
  response.writeHead(404, securityHeaders({ "Content-Type": "text/plain; charset=utf-8" }));
  response.end("No encontrado");
}

function redirectToLogin(response) {
  response.writeHead(302, securityHeaders({ Location: "/admin/proveedores/" }));
  response.end();
}

function sessionCookie(value, maxAgeSeconds, secure) {
  return [
    `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`,
    secure ? "Secure" : null
  ].filter(Boolean).join("; ");
}

function expiredCookie(secure) {
  return sessionCookie("", 0, secure);
}

function sessionToken(request) {
  return parseCookies(request.headers.cookie).get(ADMIN_SESSION_COOKIE) ?? null;
}

function crossSiteMutation(request) {
  const method = request.method ?? "GET";
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return false;
  return String(request.headers["sec-fetch-site"] ?? "same-origin").toLowerCase() === "cross-site";
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const error = new Error("El cuerpo supera 64 KB.");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function routeAllowed(pathname, method) {
  const provider = pathname.match(PROVIDERS_PATTERN);
  if (provider) {
    const [, id, action] = provider;
    if (!id) return method === "GET" || method === "POST";
    if (action === "status") return method === "PATCH";
    if (action === "invitations") return method === "POST";
    return action === "audit" && method === "GET";
  }

  for (const pattern of [PRODUCTS_PATTERN, BLOG_PATTERN]) {
    const match = pathname.match(pattern);
    if (!match) continue;
    const [, id, action, mediaId, preview] = match;
    if (!id) return method === "GET";
    if (!action && !mediaId) return method === "GET";
    if (action === "review" || action === "publish") return !mediaId && method === "POST";
    return Boolean(mediaId) && preview === "preview" && method === "GET";
  }
  return false;
}

function copiedHeaders(upstream, extra = {}) {
  const headers = securityHeaders(extra);
  for (const [name, value] of upstream.headers) {
    if (SAFE_RESPONSE_HEADERS.has(name.toLowerCase())) headers[name] = value;
  }
  return headers;
}

function upstreamHeaders(request, token, { includeBearer = true } = {}) {
  const headers = new Headers({
    Accept: request.headers.accept ?? "application/json"
  });
  if (includeBearer && token) headers.set("Authorization", `Bearer ${token}`);
  for (const name of ["content-type", "content-length", "range", "user-agent"]) {
    const value = request.headers[name];
    if (value !== undefined) headers.set(name, Array.isArray(value) ? value[0] : String(value));
  }
  return headers;
}

async function parsePayload(upstream) {
  const text = await upstream.text();
  try {
    return { text, payload: text ? JSON.parse(text) : {} };
  } catch {
    return {
      text,
      payload: { error: "INVALID_RESPONSE", message: "La API ha devuelto una respuesta no válida." }
    };
  }
}

export function createAdminAuthenticationWebHandler({
  baseHandler,
  apiInternalUrl = process.env.API_INTERNAL_URL ?? "http://localhost:4000",
  enableAdminUi = process.env.ENABLE_ADMIN_UI === "true",
  cookieSecure = process.env.WEB_COOKIE_SECURE === "true",
  fetchImpl = fetch,
  now = () => Date.now(),
  logger = console
} = {}) {
  if (typeof baseHandler !== "function") {
    throw new TypeError("createAdminAuthenticationWebHandler necesita un handler base.");
  }
  const apiBase = new URL(apiInternalUrl);

  async function apiRequest(path, request, {
    token,
    method = request.method ?? "GET",
    body,
    includeBearer = true,
    timeoutMs = 12_000
  } = {}) {
    return fetchImpl(new URL(path, apiBase), {
      method,
      headers: upstreamHeaders(request, token, { includeBearer }),
      ...(body?.length ? { body } : {}),
      signal: AbortSignal.timeout(timeoutMs)
    });
  }

  async function sessionIsActive(request) {
    const token = sessionToken(request);
    if (!token) return false;
    try {
      const upstream = await apiRequest("/api/admin-auth/me", request, { token, method: "GET" });
      return upstream.status === 200;
    } catch {
      return false;
    }
  }

  return async function adminAuthenticationWebHandler(request, response) {
    const url = new URL(request.url ?? "/", "http://localhost");
    const method = request.method ?? "GET";
    const isPassword = url.pathname === "/internal/admin-auth/password";
    const isSecondFactor = url.pathname === "/internal/admin-auth/second-factor";
    const isSession = url.pathname === "/internal/admin/session";
    const isAdminProxy = PROVIDERS_PATTERN.test(url.pathname)
      || PRODUCTS_PATTERN.test(url.pathname)
      || BLOG_PATTERN.test(url.pathname);

    if (isPassword || isSecondFactor || isSession || isAdminProxy) {
      if (!enableAdminUi) {
        sendNotFound(response);
        return;
      }
      if (crossSiteMutation(request)) {
        sendJson(response, 403, {
          error: "CROSS_SITE_REQUEST",
          message: "La petición administrativa debe iniciarse desde Atelier Lumière."
        });
        return;
      }
    }

    if (isPassword || isSecondFactor) {
      if (method !== "POST") {
        sendJson(response, 405, { error: "METHOD_NOT_ALLOWED", message: "Método no permitido." }, { Allow: "POST" });
        return;
      }
      try {
        const body = await readBody(request);
        if (!String(request.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) {
          sendJson(response, 415, { error: "UNSUPPORTED_MEDIA_TYPE", message: "El cuerpo debe ser JSON." });
          return;
        }
        const upstream = await apiRequest(
          isPassword ? "/api/admin-auth/password" : "/api/admin-auth/second-factor",
          request,
          { body, method: "POST", includeBearer: false }
        );
        const { payload } = await parsePayload(upstream);

        if (!isSecondFactor || upstream.status !== 200 || typeof payload.sessionToken !== "string") {
          sendJson(response, upstream.status, payload);
          return;
        }

        const expiresAtMs = Date.parse(payload.expiresAt);
        const maxAge = Number.isFinite(expiresAtMs)
          ? Math.max(1, Math.ceil((expiresAtMs - now()) / 1000))
          : 8 * 60 * 60;
        const { sessionToken: privateToken, ...safePayload } = payload;
        sendJson(response, 200, {
          authenticated: true,
          ...safePayload
        }, {
          "Set-Cookie": sessionCookie(privateToken, maxAge, cookieSecure)
        });
      } catch (error) {
        logger.error("No se pudo completar el acceso administrativo web.", {
          code: typeof error?.code === "string" ? error.code : "ADMIN_AUTH_PROXY_FAILED"
        });
        sendJson(response, error?.statusCode ?? 502, {
          error: error?.statusCode ? "INVALID_REQUEST" : "API_UNAVAILABLE",
          message: error?.message ?? "El acceso administrativo no responde."
        });
      }
      return;
    }

    if (isSession) {
      const token = sessionToken(request);
      if (method === "GET") {
        if (!token) {
          sendJson(response, 401, { error: "UNAUTHORIZED", message: "No existe una sesión administrativa activa." });
          return;
        }
        try {
          const upstream = await apiRequest("/api/admin-auth/me", request, { token, method: "GET" });
          const { payload } = await parsePayload(upstream);
          sendJson(response, upstream.status, payload, upstream.status === 401
            ? { "Set-Cookie": expiredCookie(cookieSecure) }
            : {});
        } catch {
          sendJson(response, 502, { error: "API_UNAVAILABLE", message: "No se pudo comprobar la sesión." });
        }
        return;
      }

      if (method === "DELETE") {
        try {
          if (token) await apiRequest("/api/admin-auth/logout", request, { token, method: "POST" });
        } catch {
          // La cookie local se elimina aunque la API no responda.
        }
        sendJson(response, 200, { authenticated: false }, {
          "Set-Cookie": expiredCookie(cookieSecure)
        });
        return;
      }

      sendJson(response, 405, { error: "METHOD_NOT_ALLOWED", message: "Método no permitido." }, { Allow: "GET,DELETE" });
      return;
    }

    if (isAdminProxy) {
      if (!routeAllowed(url.pathname, method)) {
        sendJson(response, 405, { error: "METHOD_NOT_ALLOWED", message: "Método no permitido." });
        return;
      }
      const token = sessionToken(request);
      if (!token) {
        sendJson(response, 401, { error: "UNAUTHORIZED", message: "La sesión administrativa ha caducado." });
        return;
      }

      const upstreamPath = `${url.pathname.replace(/^\/internal/, "/api")}${url.search}`;
      const hasBody = !["GET", "HEAD"].includes(method);
      try {
        const upstream = await fetchImpl(new URL(upstreamPath, apiBase), {
          method,
          headers: upstreamHeaders(request, token),
          ...(hasBody ? { body: request, duplex: "half" } : {}),
          signal: AbortSignal.timeout(url.pathname.endsWith("/preview") ? 60_000 : 12_000)
        });
        const extra = upstream.status === 401
          ? { "Set-Cookie": expiredCookie(cookieSecure) }
          : {};
        response.writeHead(upstream.status, copiedHeaders(upstream, extra));
        if (!upstream.body) response.end();
        else await pipeline(Readable.fromWeb(upstream.body), response);
      } catch (error) {
        logger.error("No se pudo completar el proxy administrativo real.", {
          code: typeof error?.code === "string" ? error.code : "ADMIN_PROXY_FAILED"
        });
        if (!response.headersSent) {
          sendJson(response, 502, {
            error: "API_UNAVAILABLE",
            message: "La Administración no responde."
          });
        } else response.destroy(error instanceof Error ? error : undefined);
      }
      return;
    }

    if (["GET", "HEAD"].includes(method) && PROTECTED_ADMIN_PAGES.has(url.pathname)) {
      if (!enableAdminUi) {
        sendNotFound(response);
        return;
      }
      if (!(await sessionIsActive(request))) {
        redirectToLogin(response);
        return;
      }
    }

    return baseHandler(request, response);
  };
}

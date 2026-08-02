import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const ADMIN_BLOG_PATTERN = /^\/internal\/admin\/blog-posts(?:\/([0-9a-f-]{36})(?:\/(review|publish)|\/media\/([0-9a-f-]{36})\/(preview))?)?$/i;
const SAFE_RESPONSE_HEADERS = new Set([
  "content-type", "content-length", "content-disposition",
  "accept-ranges", "content-range", "cache-control",
  "x-content-type-options", "content-security-policy"
]);

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

function redirectToAdmin(response) {
  response.writeHead(302, securityHeaders({ Location: "/admin/proveedores/" }));
  response.end();
}

function routeAllows(method, match) {
  const [, postId, action, mediaId, preview] = match;
  if (!postId) return method === "GET";
  if (!action && !mediaId) return method === "GET";
  if (action === "review" || action === "publish") return !mediaId && method === "POST";
  return Boolean(mediaId) && preview === "preview" && method === "GET";
}

function isAdminBlogPage(pathname) {
  return pathname === "/admin/publicaciones"
    || pathname === "/admin/publicaciones/"
    || pathname === "/admin/publicaciones/revisar"
    || pathname === "/admin/publicaciones/revisar/";
}

async function adminSessionIsActive(baseHandler, request) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const probeRequest = {
      method: "GET",
      url: "/internal/admin/session",
      headers: request.headers
    };
    const probeResponse = {
      headersSent: false,
      statusCode: 500,
      writeHead(statusCode) {
        this.statusCode = statusCode;
        this.headersSent = true;
        return this;
      },
      end() { finish(this.statusCode === 200); },
      destroy() { finish(false); }
    };
    Promise.resolve(baseHandler(probeRequest, probeResponse)).catch(() => finish(false));
  });
}

function upstreamHeaders(request, token) {
  const headers = new Headers({
    Accept: request.headers.accept ?? "application/json",
    Authorization: `Bearer ${token}`
  });
  for (const name of ["content-type", "content-length", "range", "user-agent"]) {
    const value = request.headers[name];
    if (value !== undefined) headers.set(name, Array.isArray(value) ? value[0] : String(value));
  }
  return headers;
}

function copiedResponseHeaders(upstream) {
  const headers = securityHeaders();
  for (const [name, value] of upstream.headers) {
    if (SAFE_RESPONSE_HEADERS.has(name.toLowerCase())) headers[name] = value;
  }
  return headers;
}

export function createAdminBlogWebHandler({
  baseHandler,
  apiInternalUrl = process.env.API_INTERNAL_URL ?? "http://localhost:4000",
  apiAdminToken = process.env.DEV_ADMIN_TOKEN,
  enableAdminUi = process.env.ENABLE_ADMIN_UI === "true",
  fetchImpl = fetch,
  logger = console
} = {}) {
  if (typeof baseHandler !== "function") {
    throw new TypeError("createAdminBlogWebHandler necesita un handler base.");
  }
  if (enableAdminUi && (typeof apiAdminToken !== "string" || apiAdminToken.length < 32)) {
    throw new TypeError("DEV_ADMIN_TOKEN debe estar configurado para revisar el blog.");
  }
  const apiBase = new URL(apiInternalUrl);

  return async function adminBlogWebHandler(request, response) {
    const url = new URL(request.url ?? "/", "http://localhost");
    const match = url.pathname.match(ADMIN_BLOG_PATTERN);

    if (match) {
      if (!enableAdminUi) {
        sendNotFound(response);
        return;
      }
      if (!routeAllows(request.method ?? "GET", match)) {
        sendJson(response, 405, { error: "METHOD_NOT_ALLOWED", message: "Método no permitido." });
        return;
      }
      if (!(await adminSessionIsActive(baseHandler, request))) {
        sendJson(response, 401, {
          error: "UNAUTHORIZED",
          message: "La sesión administrativa ha caducado."
        });
        return;
      }

      const target = new URL(
        `${url.pathname.replace(/^\/internal/, "/api")}${url.search}`,
        apiBase
      );
      const method = request.method ?? "GET";
      const hasBody = !["GET", "HEAD"].includes(method);
      try {
        const upstream = await fetchImpl(target, {
          method,
          headers: upstreamHeaders(request, apiAdminToken),
          ...(hasBody ? { body: request, duplex: "half" } : {}),
          signal: AbortSignal.timeout(match[4] ? 60_000 : 12_000)
        });
        response.writeHead(upstream.status, copiedResponseHeaders(upstream));
        if (!upstream.body) response.end();
        else await pipeline(Readable.fromWeb(upstream.body), response);
      } catch (error) {
        logger.error("No se pudo completar el proxy administrativo del blog.", {
          code: typeof error?.code === "string" ? error.code : "ADMIN_BLOG_PROXY_FAILED"
        });
        if (!response.headersSent) {
          sendJson(response, 502, {
            error: "API_UNAVAILABLE",
            message: "La revisión del blog no responde."
          });
        } else response.destroy(error instanceof Error ? error : undefined);
      }
      return;
    }

    if (["GET", "HEAD"].includes(request.method ?? "GET") && isAdminBlogPage(url.pathname)) {
      if (!enableAdminUi) {
        sendNotFound(response);
        return;
      }
      if (!(await adminSessionIsActive(baseHandler, request))) {
        redirectToAdmin(response);
        return;
      }
    }

    return baseHandler(request, response);
  };
}

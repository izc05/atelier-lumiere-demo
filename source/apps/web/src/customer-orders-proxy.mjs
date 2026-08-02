import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const COOKIE = "atelier_customer_session";
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,180}$/;
const ROUTE_PATTERN = /^\/internal\/customer\/(session|orders|custom-requests)(?:\/([0-9a-f-]{36})(?:\/(cancel|messages|approve))?)?$/i;
const PROTECTED_PAGES = new Set([
  "/mis-pedidos",
  "/mis-pedidos/",
  "/mis-pedidos/detalle",
  "/mis-pedidos/detalle/",
  "/mis-pedidos/encargo",
  "/mis-pedidos/encargo/"
]);
const MAX_BODY_BYTES = 128 * 1024;

function parseCookies(header) {
  const cookies = new Map();
  for (const item of String(header ?? "").split(";")) {
    const separator = item.indexOf("=");
    if (separator < 1) continue;
    try {
      cookies.set(item.slice(0, separator).trim(), decodeURIComponent(item.slice(separator + 1).trim()));
    } catch {
      // Se ignoran cookies dañadas.
    }
  }
  return cookies;
}
function sessionToken(request) {
  const value = parseCookies(request.headers.cookie).get(COOKIE) ?? "";
  return TOKEN_PATTERN.test(value) ? value : null;
}
function headers(extra = {}) {
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
function cookie(value, expiresAt, secure) {
  const maxAge = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
  return [
    `${COOKIE}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${maxAge}`,
    secure ? "Secure" : null
  ].filter(Boolean).join("; ");
}
function expiredCookie(secure) {
  return [
    `${COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Strict", "Max-Age=0",
    secure ? "Secure" : null
  ].filter(Boolean).join("; ");
}
function sendJson(response, statusCode, payload, extra = {}) {
  response.writeHead(statusCode, headers({
    "Content-Type": "application/json; charset=utf-8",
    ...extra
  }));
  response.end(JSON.stringify(payload));
}
async function readJson(request) {
  const type = String(request.headers["content-type"] ?? "").toLowerCase();
  if (!type.startsWith("application/json")) {
    const error = new Error("UNSUPPORTED_MEDIA_TYPE");
    error.statusCode = 415;
    throw error;
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const error = new Error("BODY_TOO_LARGE");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!body || Array.isArray(body) || typeof body !== "object") throw new Error();
    return body;
  } catch {
    const error = new Error("INVALID_JSON");
    error.statusCode = 400;
    throw error;
  }
}
function routeAllows(method, match) {
  const [, resource, id, action] = match;
  if (resource === "session" && !id) return ["GET", "DELETE"].includes(method);
  if (resource === "orders" && !id) return method === "GET";
  if (resource === "orders" && id && !action) return method === "GET";
  if (resource === "orders" && id && action === "cancel") return method === "POST";
  if (resource === "custom-requests" && id && !action) return method === "GET";
  if (resource === "custom-requests" && id && ["messages", "approve"].includes(action)) return method === "POST";
  return false;
}
async function pipe(upstream, response, { clear = false, secure = false } = {}) {
  const responseHeaders = headers({
    "Content-Type": upstream.headers.get("content-type") ?? "application/json; charset=utf-8"
  });
  if (clear) responseHeaders["Set-Cookie"] = expiredCookie(secure);
  response.writeHead(upstream.status, responseHeaders);
  if (!upstream.body) return response.end();
  await pipeline(Readable.fromWeb(upstream.body), response);
}

export function createCustomerOrdersWebHandler({
  baseHandler,
  apiInternalUrl = process.env.API_INTERNAL_URL ?? "http://localhost:4000",
  customerCookieSecure = process.env.CUSTOMER_COOKIE_SECURE === "true",
  fetchImpl = fetch,
  logger = console
} = {}) {
  if (typeof baseHandler !== "function") {
    throw new TypeError("createCustomerOrdersWebHandler necesita un handler base.");
  }
  const apiBase = new URL(apiInternalUrl);

  async function authenticate(request, tokenValue) {
    try {
      const upstream = await fetchImpl(new URL("/api/customer/session", apiBase), {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${tokenValue}`,
          "User-Agent": String(request.headers["user-agent"] ?? "").slice(0, 500)
        },
        signal: AbortSignal.timeout(6000)
      });
      return upstream.ok;
    } catch (error) {
      logger.error("No se pudo validar la sesión del cliente.", {
        code: typeof error?.code === "string" ? error.code : "CUSTOMER_SESSION_CHECK_FAILED"
      });
      return false;
    }
  }

  return async function customerOrdersWebHandler(request, response) {
    const url = new URL(request.url ?? "/", "http://localhost");

    if (url.pathname === "/internal/customer/access") {
      if (request.method !== "POST") {
        sendJson(response, 405, { error: "METHOD_NOT_ALLOWED", message: "Método no permitido." }, { Allow: "POST" });
        return;
      }
      try {
        const body = await readJson(request);
        const upstream = await fetchImpl(new URL("/api/customer/access/consume", apiBase), {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "User-Agent": String(request.headers["user-agent"] ?? "").slice(0, 500)
          },
          body: JSON.stringify({ token: body.token }),
          signal: AbortSignal.timeout(10000)
        });
        const payload = await upstream.json().catch(() => ({}));
        if (!upstream.ok) {
          sendJson(response, upstream.status, {
            error: payload.error ?? "CUSTOMER_ACCESS_INVALID",
            message: payload.message ?? "El enlace no es válido o ha caducado."
          }, { "Set-Cookie": expiredCookie(customerCookieSecure) });
          return;
        }
        if (!TOKEN_PATTERN.test(payload.sessionToken ?? "") || !payload.session?.expiresAt) {
          throw new Error("CUSTOMER_SESSION_RESPONSE_INVALID");
        }
        sendJson(response, 200, {
          checkoutId: payload.checkoutId,
          user: payload.user,
          session: payload.session
        }, {
          "Set-Cookie": cookie(payload.sessionToken, payload.session.expiresAt, customerCookieSecure)
        });
      } catch (error) {
        const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 502;
        sendJson(response, statusCode, {
          error: statusCode === 502 ? "API_UNAVAILABLE" : error.message,
          message: statusCode === 502
            ? "No se ha podido activar el acceso. Inténtalo de nuevo."
            : "La solicitud de acceso no es válida."
        });
      }
      return;
    }

    const match = url.pathname.match(ROUTE_PATTERN);
    if (match) {
      const method = request.method ?? "GET";
      if (!routeAllows(method, match)) {
        sendJson(response, 405, { error: "METHOD_NOT_ALLOWED", message: "Método no permitido." }, { Allow: "GET,POST,DELETE" });
        return;
      }
      const tokenValue = sessionToken(request);
      if (!tokenValue) {
        sendJson(response, 401, { error: "UNAUTHORIZED", message: "La sesión no es válida o ha caducado." }, {
          "Set-Cookie": expiredCookie(customerCookieSecure)
        });
        return;
      }
      const target = new URL(url.pathname.replace(/^\/internal/, "/api") + url.search, apiBase);
      const hasBody = !["GET", "HEAD", "DELETE"].includes(method);
      const upstreamHeaders = new Headers({
        Accept: "application/json",
        Authorization: `Bearer ${tokenValue}`,
        "User-Agent": String(request.headers["user-agent"] ?? "").slice(0, 500)
      });
      if (hasBody) upstreamHeaders.set("Content-Type", String(request.headers["content-type"] ?? "application/json"));
      try {
        const upstream = await fetchImpl(target, {
          method,
          headers: upstreamHeaders,
          ...(hasBody ? { body: request, duplex: "half" } : {}),
          signal: AbortSignal.timeout(15000)
        });
        await pipe(upstream, response, {
          clear: upstream.status === 401 || method === "DELETE",
          secure: customerCookieSecure
        });
      } catch (error) {
        logger.error("No se pudo completar el proxy de pedidos del cliente.", {
          code: typeof error?.code === "string" ? error.code : "CUSTOMER_ORDER_PROXY_FAILED"
        });
        if (!response.headersSent) {
          sendJson(response, 502, { error: "API_UNAVAILABLE", message: "Los pedidos no responden en este momento." });
        } else {
          response.destroy(error instanceof Error ? error : undefined);
        }
      }
      return;
    }

    if (["GET", "HEAD"].includes(request.method ?? "GET") && PROTECTED_PAGES.has(url.pathname)) {
      const tokenValue = sessionToken(request);
      if (!tokenValue || !(await authenticate(request, tokenValue))) {
        response.writeHead(302, headers({
          Location: "/pedido/acceso/",
          "Set-Cookie": expiredCookie(customerCookieSecure)
        }));
        response.end();
        return;
      }
    }

    return baseHandler(request, response);
  };
}

const PROVIDER_COOKIE = "atelier_provider_session";
const CUSTOMER_COOKIE = "atelier_customer_session";
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,180}$/;
const ROUTE_PATTERN = /^\/internal\/(provider|customer)\/orders\/([0-9a-f-]{36})\/(shipments|incidents)(?:\/([0-9a-f-]{36}))?$/i;
const MAX_BODY_BYTES = 128 * 1024;

function parseCookies(header) {
  const cookies = new Map();
  for (const part of String(header ?? "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    try {
      cookies.set(part.slice(0, separator).trim(), decodeURIComponent(part.slice(separator + 1).trim()));
    } catch {
      // Se ignoran cookies corruptas.
    }
  }
  return cookies;
}

function cookieName(actor) {
  return actor === "provider" ? PROVIDER_COOKIE : CUSTOMER_COOKIE;
}

function tokenFromRequest(request, actor) {
  const token = parseCookies(request.headers.cookie).get(cookieName(actor)) ?? "";
  return TOKEN_PATTERN.test(token) ? token : null;
}

function expiredCookie(actor, secure) {
  return [
    `${cookieName(actor)}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    "Max-Age=0",
    secure ? "Secure" : null
  ].filter(Boolean).join("; ");
}

function headers(extra = {}) {
  return {
    "Content-Type": "application/json; charset=utf-8",
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
  response.writeHead(statusCode, headers(extra));
  response.end(JSON.stringify(payload));
}

function methodAllowed(actor, resource, resourceId, method) {
  if (actor === "customer") return resource === "incidents" && !resourceId && method === "POST";
  if (!resourceId) return method === "POST";
  return method === "PATCH";
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const error = new Error("BODY_TOO_LARGE");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(Buffer.from(chunk));
  }
  return chunks.length ? Buffer.concat(chunks) : Buffer.from("{}");
}

export function createOrderLogisticsWebHandler({
  baseHandler,
  apiInternalUrl = process.env.API_INTERNAL_URL ?? "http://localhost:4000",
  providerCookieSecure = process.env.PROVIDER_COOKIE_SECURE === "true",
  customerCookieSecure = process.env.CUSTOMER_COOKIE_SECURE === "true",
  fetchImpl = fetch,
  logger = console
} = {}) {
  if (typeof baseHandler !== "function") {
    throw new TypeError("createOrderLogisticsWebHandler necesita un handler base.");
  }
  const apiBase = new URL(apiInternalUrl);

  return async function orderLogisticsWebHandler(request, response) {
    const url = new URL(request.url ?? "/", "http://localhost");
    const match = url.pathname.match(ROUTE_PATTERN);
    if (!match) return baseHandler(request, response);

    const [, rawActor, , resource, resourceId] = match;
    const actor = rawActor.toLowerCase();
    const method = request.method ?? "GET";
    if (!methodAllowed(actor, resource, resourceId, method)) {
      sendJson(response, 405, { error: "METHOD_NOT_ALLOWED", message: "Método no permitido." }, {
        Allow: actor === "customer" ? "POST" : "POST,PATCH"
      });
      return;
    }

    const token = tokenFromRequest(request, actor);
    const secure = actor === "provider" ? providerCookieSecure : customerCookieSecure;
    if (!token) {
      sendJson(response, 401, { error: "UNAUTHORIZED", message: "La sesión no es válida o ha caducado." }, {
        "Set-Cookie": expiredCookie(actor, secure)
      });
      return;
    }

    try {
      const body = await readBody(request);
      const upstream = await fetchImpl(new URL(url.pathname.replace(/^\/internal/, "/api"), apiBase), {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          "Content-Length": String(body.length),
          "User-Agent": String(request.headers["user-agent"] ?? "Atelier-Lumiere-Web")
        },
        body,
        signal: AbortSignal.timeout(30000)
      });
      const text = await upstream.text();
      let payload;
      try { payload = text ? JSON.parse(text) : {}; }
      catch { payload = { error: "INVALID_UPSTREAM_RESPONSE", message: "La API no devolvió una respuesta válida." }; }
      sendJson(response, upstream.status, payload, upstream.status === 401 ? {
        "Set-Cookie": expiredCookie(actor, secure)
      } : {});
    } catch (error) {
      if (error?.statusCode === 413) {
        sendJson(response, 413, { error: "BODY_TOO_LARGE", message: "La solicitud es demasiado grande." });
        return;
      }
      logger.error("No se pudo completar el proxy de seguimiento e incidencias.", {
        code: typeof error?.code === "string" ? error.code : "ORDER_LOGISTICS_PROXY_FAILED"
      });
      sendJson(response, 502, { error: "API_UNAVAILABLE", message: "El seguimiento no responde en este momento." });
    }
  };
}

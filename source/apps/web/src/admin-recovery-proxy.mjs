const MAX_BODY_BYTES = 20 * 1024;
const ROUTES = new Map([
  ["/internal/admin-recovery/request", "/api/admin-recovery/request"],
  ["/internal/admin-recovery/begin", "/api/admin-recovery/begin"],
  ["/internal/admin-recovery/confirm", "/api/admin-recovery/confirm"]
]);

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

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, headers({
    "Content-Type": "application/json; charset=utf-8"
  }));
  response.end(JSON.stringify(body));
}

function crossSite(request) {
  return String(request.headers["sec-fetch-site"] ?? "same-origin").toLowerCase() === "cross-site";
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const error = new Error("La petición supera 20 KB.");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export function createAdminRecoveryWebHandler({
  baseHandler,
  apiInternalUrl = process.env.API_INTERNAL_URL ?? "http://localhost:4000",
  enableAdminUi = process.env.ENABLE_ADMIN_UI === "true",
  fetchImpl = fetch,
  logger = console
} = {}) {
  if (typeof baseHandler !== "function") {
    throw new TypeError("createAdminRecoveryWebHandler necesita un handler base.");
  }
  const apiBase = new URL(apiInternalUrl);

  return async function adminRecoveryWebHandler(request, response) {
    const url = new URL(request.url ?? "/", "http://localhost");
    const upstreamPath = ROUTES.get(url.pathname);
    if (!upstreamPath) return baseHandler(request, response);

    if (!enableAdminUi) {
      response.writeHead(404, headers({ "Content-Type": "text/plain; charset=utf-8" }));
      response.end("No encontrado");
      return;
    }
    if (request.method !== "POST") {
      sendJson(response, 405, {
        error: "METHOD_NOT_ALLOWED",
        message: "Método no permitido."
      });
      return;
    }
    if (crossSite(request)) {
      sendJson(response, 403, {
        error: "CROSS_SITE_REQUEST",
        message: "La recuperación debe iniciarse desde Atelier Lumière."
      });
      return;
    }
    if (!String(request.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) {
      sendJson(response, 415, {
        error: "UNSUPPORTED_MEDIA_TYPE",
        message: "El cuerpo debe ser JSON."
      });
      return;
    }

    try {
      const body = await readBody(request);
      const upstream = await fetchImpl(new URL(upstreamPath, apiBase), {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "Content-Length": String(body.length),
          ...(request.headers["user-agent"]
            ? { "User-Agent": String(request.headers["user-agent"]) }
            : {})
        },
        body,
        signal: AbortSignal.timeout(15_000)
      });
      const text = await upstream.text();
      let payload;
      try {
        payload = text ? JSON.parse(text) : {};
      } catch {
        payload = {
          error: "INVALID_RESPONSE",
          message: "La API ha devuelto una respuesta no válida."
        };
      }
      sendJson(response, upstream.status, payload);
    } catch (error) {
      logger.error("No se pudo completar la recuperación administrativa web.", {
        code: typeof error?.code === "string" ? error.code : "ADMIN_RECOVERY_PROXY_FAILED"
      });
      sendJson(response, error?.statusCode ?? 502, {
        error: error?.statusCode ? "INVALID_REQUEST" : "API_UNAVAILABLE",
        message: error?.message ?? "La recuperación administrativa no responde."
      });
    }
  };
}

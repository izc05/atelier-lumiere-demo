const ROUTES = new Map([
  ["/internal/provider-recovery/password/request", "/api/provider-recovery/password/request"],
  ["/internal/provider-recovery/password/confirm", "/api/provider-recovery/password/confirm"],
  ["/internal/provider-recovery/two-factor/request", "/api/provider-recovery/two-factor/request"],
  ["/internal/provider-recovery/two-factor/confirm", "/api/provider-recovery/two-factor/confirm"]
]);
const MAX_BODY_BYTES = 32 * 1024;

async function readBody(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error("BODY_TOO_LARGE"), { statusCode: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function sendJson(response, statusCode, body, headers = {}) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    ...headers
  });
  response.end(typeof body === "string" ? body : JSON.stringify(body));
}

export function createAccountRecoveryWebHandler({
  baseHandler,
  apiUrl = process.env.API_INTERNAL_URL ?? "http://localhost:4000",
  fetchImpl = fetch,
  logger = console
} = {}) {
  if (typeof baseHandler !== "function") {
    throw new TypeError("El proxy de recuperación necesita el handler web principal.");
  }

  return async function accountRecoveryWebHandler(request, response) {
    const url = new URL(request.url ?? "/", "http://localhost");
    const apiPath = ROUTES.get(url.pathname);
    if (!apiPath) return baseHandler(request, response);

    if (request.method !== "POST") {
      sendJson(response, 405, {
        error: "METHOD_NOT_ALLOWED",
        message: "Esta ruta solo admite POST."
      }, { Allow: "POST" });
      return;
    }

    try {
      const contentType = String(request.headers["content-type"] ?? "").split(";", 1)[0].trim();
      if (contentType !== "application/json") {
        sendJson(response, 415, {
          error: "UNSUPPORTED_MEDIA_TYPE",
          message: "El cuerpo debe enviarse como application/json."
        });
        return;
      }
      const body = await readBody(request);
      const upstream = await fetchImpl(new URL(apiPath, apiUrl), {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json"
        },
        body,
        signal: AbortSignal.timeout(10000)
      });
      const payload = await upstream.text();
      sendJson(response, upstream.status, payload || "{}", {
        ...(upstream.headers.get("retry-after")
          ? { "Retry-After": upstream.headers.get("retry-after") }
          : {})
      });
    } catch (error) {
      const statusCode = error?.statusCode === 413 ? 413 : 502;
      logger.error("No se pudo completar el proxy de recuperación.", {
        path: url.pathname,
        errorCode: error?.name ?? "RECOVERY_PROXY_FAILED"
      });
      sendJson(response, statusCode, {
        error: statusCode === 413 ? "BODY_TOO_LARGE" : "UPSTREAM_UNAVAILABLE",
        message: statusCode === 413
          ? "La petición es demasiado grande."
          : "El servicio de recuperación no está disponible."
      });
    }
  };
}

const PATH = "/internal/checkout/submit";
const MAX_BODY_BYTES = 256 * 1024;
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 10;

function headers(extra = {}) {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
    "Cross-Origin-Resource-Policy": "same-origin",
    ...extra
  };
}

function sendJson(response, statusCode, payload, extra = {}) {
  response.writeHead(statusCode, headers(extra));
  response.end(JSON.stringify(payload));
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

function clientKey(request) {
  return String(request.socket?.remoteAddress ?? "unknown").slice(0, 120);
}

export function createPilotCheckoutWebHandler({
  baseHandler,
  apiInternalUrl = process.env.API_INTERNAL_URL ?? "http://localhost:4000",
  fetchImpl = fetch,
  now = () => Date.now(),
  logger = console
} = {}) {
  if (typeof baseHandler !== "function") {
    throw new TypeError("createPilotCheckoutWebHandler necesita un handler base.");
  }
  const apiBase = new URL(apiInternalUrl);
  const attempts = new Map();

  function rateAllowed(request) {
    const key = clientKey(request);
    const current = now();
    const bucket = attempts.get(key);
    if (!bucket || current - bucket.startedAt >= WINDOW_MS) {
      attempts.set(key, { startedAt: current, count: 1 });
      return true;
    }
    bucket.count += 1;
    if (bucket.count > MAX_ATTEMPTS) return false;
    return true;
  }

  return async function pilotCheckoutWebHandler(request, response) {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname !== PATH) return baseHandler(request, response);

    if (request.method !== "POST") {
      sendJson(response, 405, {
        error: "METHOD_NOT_ALLOWED",
        message: "Método no permitido."
      }, { Allow: "POST" });
      return;
    }
    if (!rateAllowed(request)) {
      sendJson(response, 429, {
        error: "CHECKOUT_RATE_LIMITED",
        message: "Se han realizado demasiados intentos. Espera unos minutos."
      }, { "Retry-After": "600" });
      return;
    }

    try {
      const body = await readBody(request);
      const upstream = await fetchImpl(new URL("/api/pilot-checkout/submit", apiBase), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": String(body.length),
          Accept: "application/json",
          "User-Agent": String(request.headers["user-agent"] ?? "Atelier-Lumiere-Web")
        },
        body,
        signal: AbortSignal.timeout(45000)
      });
      const text = await upstream.text();
      let payload;
      try {
        payload = text ? JSON.parse(text) : {};
      } catch {
        payload = {
          error: "INVALID_UPSTREAM_RESPONSE",
          message: "El checkout no devolvió una respuesta válida."
        };
      }
      sendJson(response, upstream.status, payload);
    } catch (error) {
      if (error?.statusCode === 413) {
        sendJson(response, 413, {
          error: "BODY_TOO_LARGE",
          message: "El checkout es demasiado grande."
        });
        return;
      }
      logger.error("No se pudo completar el proxy del checkout piloto.", {
        code: typeof error?.code === "string" ? error.code : "PILOT_CHECKOUT_PROXY_FAILED"
      });
      sendJson(response, 502, {
        error: "API_UNAVAILABLE",
        message: "El checkout no responde en este momento."
      });
    }
  };
}

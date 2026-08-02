import { ServiceError } from "./providers-service.mjs";

const PATH = "/api/pilot-checkout/submit";
const MAX_BODY_BYTES = 256 * 1024;

function sendJson(response, statusCode, payload, extraHeaders = {}) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    "Referrer-Policy": "no-referrer",
    ...extraHeaders
  });
  response.end(JSON.stringify(payload));
}

async function readJson(request) {
  const contentType = String(request.headers?.["content-type"] ?? "").toLowerCase();
  if (!contentType.startsWith("application/json")) {
    throw new ServiceError("UNSUPPORTED_MEDIA_TYPE", "El checkout debe enviarse como JSON.", 415);
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      throw new ServiceError("BODY_TOO_LARGE", "El checkout es demasiado grande.", 413);
    }
    chunks.push(Buffer.from(chunk));
  }
  if (chunks.length === 0) {
    throw new ServiceError("INVALID_JSON", "Faltan los datos del checkout.", 400);
  }
  try {
    const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!payload || Array.isArray(payload) || typeof payload !== "object") throw new Error();
    return payload;
  } catch {
    throw new ServiceError("INVALID_JSON", "El checkout no contiene JSON válido.", 400);
  }
}

function handleError(response, error, logger) {
  if (error instanceof ServiceError) {
    sendJson(response, error.statusCode, {
      error: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details })
    });
    return;
  }
  logger.error("Error no controlado en el checkout piloto.", {
    code: typeof error?.code === "string" ? error.code : "PILOT_CHECKOUT_API_FAILED"
  });
  sendJson(response, 500, {
    error: "INTERNAL_ERROR",
    message: "No se ha podido registrar el pedido."
  });
}

export function createPilotCheckoutApiHandler({
  baseHandler,
  pilotCheckoutService,
  logger = console
} = {}) {
  if (typeof baseHandler !== "function") {
    throw new TypeError("createPilotCheckoutApiHandler necesita un handler base.");
  }

  return async function pilotCheckoutApiHandler(request, response) {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname !== PATH) return baseHandler(request, response);

    try {
      if (!pilotCheckoutService) {
        throw new ServiceError(
          "PILOT_CHECKOUT_DISABLED",
          "El checkout piloto todavía no está activado.",
          503
        );
      }
      if (request.method !== "POST") {
        sendJson(response, 405, {
          error: "METHOD_NOT_ALLOWED",
          message: "Método no permitido."
        }, { Allow: "POST" });
        return;
      }
      const result = await pilotCheckoutService.submit(await readJson(request));
      sendJson(response, result.reused ? 200 : 201, result);
    } catch (error) {
      handleError(response, error, logger);
    }
  };
}

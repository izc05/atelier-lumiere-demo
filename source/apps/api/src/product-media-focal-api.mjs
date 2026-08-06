import { ServiceError } from "./providers-service.mjs";

const FOCAL_PATH = /^\/api\/provider\/products\/([0-9a-f-]{36})\/media-focal(?:\/([0-9a-f-]{36}))?$/i;
const MAX_BODY_BYTES = 16 * 1024;

function sendJson(response, statusCode, body, extraHeaders = {}) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...extraHeaders
  });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      throw new ServiceError("BODY_TOO_LARGE", "La solicitud es demasiado grande.", 413);
    }
    chunks.push(chunk);
  }
  try {
    return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
  } catch {
    throw new ServiceError("INVALID_JSON", "La solicitud no contiene JSON válido.", 400);
  }
}

function bearerToken(request) {
  const authorization = request.headers?.authorization;
  if (typeof authorization !== "string") return null;
  return authorization.match(/^Bearer\s+([A-Za-z0-9_-]{32,180})$/)?.[1] ?? null;
}

function apiError(response, error, logger) {
  if (error instanceof ServiceError) {
    sendJson(response, error.statusCode, {
      error: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details })
    });
    return;
  }
  logger.error("Error no controlado en el encuadre focal.", {
    code: typeof error?.code === "string" ? error.code : "PRODUCT_MEDIA_FOCAL_API_FAILED"
  });
  sendJson(response, 500, {
    error: "INTERNAL_ERROR",
    message: "No se ha podido guardar el encuadre de la fotografía."
  });
}

export function createProductMediaFocalApiHandler({
  baseHandler,
  focalService,
  providerAuthService,
  logger = console
} = {}) {
  if (typeof baseHandler !== "function") {
    throw new TypeError("createProductMediaFocalApiHandler necesita un handler base.");
  }

  return async function productMediaFocalApiHandler(request, response) {
    const url = new URL(request.url ?? "/", "http://localhost");
    const match = url.pathname.match(FOCAL_PATH);
    if (!match) return baseHandler(request, response);

    try {
      if (!focalService || !providerAuthService) {
        throw new ServiceError("SERVICE_UNAVAILABLE", "El ajuste de encuadre no está disponible.", 503);
      }
      const token = bearerToken(request);
      const session = token ? await providerAuthService.authenticate(token) : null;
      if (!session) {
        throw new ServiceError("UNAUTHORIZED", "Necesitas iniciar sesión como proveedor.", 401);
      }

      const [, productId, mediaId] = match;
      if (!mediaId && request.method === "GET") {
        sendJson(response, 200, await focalService.list(session.context, productId));
        return;
      }
      if (mediaId && request.method === "PATCH") {
        const focal = await focalService.update(
          session.context,
          productId,
          mediaId,
          await readJson(request)
        );
        sendJson(response, 200, { focal });
        return;
      }

      sendJson(response, 405, {
        error: "METHOD_NOT_ALLOWED",
        message: "Método no permitido."
      }, { Allow: mediaId ? "PATCH" : "GET" });
    } catch (error) {
      apiError(response, error, logger);
    }
  };
}

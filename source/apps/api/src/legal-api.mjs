import { ServiceError } from "./providers-service.mjs";

const DOCUMENTS_PATH = "/api/legal/documents";
const DOCUMENT_PATTERN = /^\/api\/legal\/documents\/([a-z0-9-]{3,80})$/;
const PREFERENCES_PATH = "/api/legal/privacy-preferences";
const MAX_BODY_BYTES = 32 * 1024;

function sendJson(response, statusCode, body, extraHeaders = {}) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Resource-Policy": "same-origin",
    ...extraHeaders
  });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      throw new ServiceError("BODY_TOO_LARGE", "La solicitud es demasiado grande.", 413);
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!value || Array.isArray(value) || typeof value !== "object") throw new Error();
    return value;
  } catch {
    throw new ServiceError("INVALID_JSON", "La solicitud no contiene JSON válido.", 400);
  }
}

function privacyKey(request) {
  const raw = request.headers["x-privacy-key"];
  return Array.isArray(raw) ? raw[0] : raw;
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
  logger.error("Error no controlado en la API legal.", {
    code: typeof error?.code === "string" ? error.code : "LEGAL_API_FAILED"
  });
  sendJson(response, 500, {
    error: "INTERNAL_ERROR",
    message: "No se ha podido completar la operación."
  });
}

export function createLegalApiHandler({ baseHandler, legalService, logger = console } = {}) {
  if (typeof baseHandler !== "function") {
    throw new TypeError("createLegalApiHandler necesita un handler base.");
  }
  return async function legalApiHandler(request, response) {
    const url = new URL(request.url ?? "/", "http://localhost");
    const documentMatch = url.pathname.match(DOCUMENT_PATTERN);
    const matches = url.pathname === DOCUMENTS_PATH
      || url.pathname === PREFERENCES_PATH
      || documentMatch;
    if (!matches) return baseHandler(request, response);

    try {
      if (!legalService) {
        throw new ServiceError("SERVICE_UNAVAILABLE", "El servicio legal no está disponible.", 503);
      }
      if (url.pathname === DOCUMENTS_PATH && request.method === "GET") {
        sendJson(response, 200, { documents: await legalService.listDocuments() });
        return;
      }
      if (documentMatch && request.method === "GET") {
        sendJson(response, 200, { document: await legalService.getDocument(documentMatch[1]) });
        return;
      }
      if (url.pathname === PREFERENCES_PATH && request.method === "GET") {
        sendJson(response, 200, {
          preferences: await legalService.getPreferences(privacyKey(request))
        });
        return;
      }
      if (url.pathname === PREFERENCES_PATH && request.method === "PUT") {
        sendJson(response, 200, {
          preferences: await legalService.savePreferences(
            privacyKey(request),
            await readJson(request)
          )
        });
        return;
      }
      sendJson(response, 405, {
        error: "METHOD_NOT_ALLOWED",
        message: "Método no permitido."
      });
    } catch (error) {
      handleError(response, error, logger);
    }
  };
}

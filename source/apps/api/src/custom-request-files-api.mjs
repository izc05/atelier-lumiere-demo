import { pipeline } from "node:stream/promises";
import { ServiceError } from "./providers-service.mjs";

const UPLOAD_PATH = /^\/api\/(provider|customer)\/custom-requests\/([0-9a-f-]{36})\/files$/i;
const FILE_PATH = /^\/api\/(provider|customer)\/request-files\/([0-9a-f-]{36})(?:\/(content))?$/i;

function sendJson(response, statusCode, payload, extraHeaders = {}) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    ...extraHeaders
  });
  response.end(JSON.stringify(payload));
}

function bearer(request) {
  const value = request.headers?.authorization;
  if (typeof value !== "string") return null;
  return value.match(/^Bearer\s+([A-Za-z0-9_-]{32,180})$/)?.[1] ?? null;
}

function contentDisposition(filename) {
  const fallback = String(filename ?? "archivo").replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120) || "archivo";
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename ?? fallback)}`;
}

async function authenticate(actor, token, providerAuthService, customerAuthService) {
  const service = actor === "provider" ? providerAuthService : customerAuthService;
  const session = token && service ? await service.authenticate(token) : null;
  if (!session) throw new ServiceError("UNAUTHORIZED", "La sesión no es válida o ha caducado.", 401);
  return session.context;
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
  logger.error("Error no controlado en la API de archivos de encargos.", {
    code: typeof error?.code === "string" ? error.code : "REQUEST_FILES_API_FAILED"
  });
  if (!response.headersSent) sendJson(response, 500, { error: "INTERNAL_ERROR", message: "No se ha podido completar la operación." });
  else response.destroy(error);
}

export function createCustomRequestFilesApiHandler({
  baseHandler,
  filesService,
  providerAuthService,
  customerAuthService,
  logger = console
} = {}) {
  if (typeof baseHandler !== "function") throw new TypeError("createCustomRequestFilesApiHandler necesita un handler base.");

  return async function customRequestFilesApiHandler(request, response) {
    const url = new URL(request.url ?? "/", "http://localhost");
    const uploadMatch = url.pathname.match(UPLOAD_PATH);
    const fileMatch = url.pathname.match(FILE_PATH);
    if (!uploadMatch && !fileMatch) return baseHandler(request, response);

    try {
      if (!filesService) throw new ServiceError("SERVICE_UNAVAILABLE", "Los archivos todavía no están disponibles.", 503);
      const actor = (uploadMatch?.[1] ?? fileMatch?.[1]).toLowerCase();
      const context = await authenticate(actor, bearer(request), providerAuthService, customerAuthService);

      if (uploadMatch) {
        if (request.method !== "POST") {
          sendJson(response, 405, { error: "METHOD_NOT_ALLOWED", message: "Método no permitido." }, { Allow: "POST" });
          return;
        }
        const [, , requestId] = uploadMatch;
        const file = await filesService.upload(context, requestId, {
          messageId: request.headers?.["x-message-id"] || undefined,
          originalFilename: request.headers?.["x-file-name"],
          mimeType: request.headers?.["content-type"],
          expectedBytes: request.headers?.["content-length"],
          stream: request
        });
        sendJson(response, 201, { file });
        return;
      }

      const [, , fileId, action] = fileMatch;
      if (action === "content" && request.method === "GET") {
        const opened = await filesService.open(context, fileId, request.headers?.range);
        const headers = {
          "Content-Type": opened.mimeType,
          "Content-Length": String(opened.end - opened.start + 1),
          "Content-Disposition": contentDisposition(opened.filename),
          "Accept-Ranges": "bytes",
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": "default-src 'none'; sandbox"
        };
        if (opened.statusCode === 206) headers["Content-Range"] = `bytes ${opened.start}-${opened.end}/${opened.sizeBytes}`;
        response.writeHead(opened.statusCode, headers);
        await pipeline(opened.stream, response);
        return;
      }
      if (!action && request.method === "DELETE") {
        sendJson(response, 200, await filesService.remove(context, fileId));
        return;
      }

      sendJson(response, 405, { error: "METHOD_NOT_ALLOWED", message: "Método no permitido." }, { Allow: "GET,POST,DELETE" });
    } catch (error) {
      apiError(response, error, logger);
    }
  };
}

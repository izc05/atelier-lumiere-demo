import { pipeline } from "node:stream/promises";
import { ServiceError } from "./providers-service.mjs";

const ROUTE = /^\/api\/(provider|customer)\/custom-requests\/([0-9a-f-]{36})\/files(?:\/([0-9a-f-]{36})(?:\/(content))?)?$/i;

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
function header(request, name) {
  const value = request.headers?.[name];
  return Array.isArray(value) ? value[0] : value;
}
function attachmentHeader(filename) {
  const fallback = String(filename).replace(/[^a-z0-9._ -]/gi, "-").slice(0, 180) || "archivo";
  return `attachment; filename="${fallback.replaceAll('"', "-")}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
function handleError(response, error, logger) {
  if (error instanceof ServiceError) {
    sendJson(response, error.statusCode, {
      error: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details })
    }, error.statusCode === 416 ? { "Content-Range": "bytes */*" } : {});
    return;
  }
  logger.error("Error no controlado en los archivos de encargos.", {
    code: typeof error?.code === "string" ? error.code : "CUSTOM_FILE_API_FAILED"
  });
  sendJson(response, 500, {
    error: "INTERNAL_ERROR",
    message: "No se ha podido completar la operación."
  });
}

export function createCustomRequestFilesApiHandler({
  baseHandler,
  customRequestFilesService,
  providerAuthService,
  customerAuthService,
  logger = console
} = {}) {
  if (typeof baseHandler !== "function") {
    throw new TypeError("createCustomRequestFilesApiHandler necesita un handler base.");
  }

  return async function customRequestFilesApiHandler(request, response) {
    const url = new URL(request.url ?? "/", "http://localhost");
    const match = url.pathname.match(ROUTE);
    if (!match) return baseHandler(request, response);

    try {
      if (!customRequestFilesService || !providerAuthService || !customerAuthService) {
        throw new ServiceError("SERVICE_UNAVAILABLE", "Los archivos no están disponibles.", 503);
      }
      const [, audience, requestId, fileId, action] = match;
      const token = bearer(request);
      const session = token
        ? audience === "provider"
          ? await providerAuthService.authenticate(token)
          : await customerAuthService.authenticate(token)
        : null;
      if (!session) {
        throw new ServiceError("UNAUTHORIZED", "La sesión no es válida o ha caducado.", 401);
      }

      if (!fileId && request.method === "POST") {
        const uploaded = await customRequestFilesService.upload(
          session.context,
          requestId,
          {
            mimeType: header(request, "content-type"),
            contentLength: header(request, "content-length"),
            originalFilename: header(request, "x-file-name"),
            messageId: header(request, "x-message-id")
          },
          request
        );
        sendJson(response, 201, { file: uploaded });
        return;
      }

      if (fileId && action === "content" && request.method === "GET") {
        const opened = await customRequestFilesService.open(
          session.context,
          requestId,
          fileId,
          header(request, "range")
        );
        const contentLength = opened.end - opened.start + 1;
        response.writeHead(opened.statusCode, {
          "Content-Type": opened.mimeType,
          "Content-Length": String(contentLength),
          "Content-Disposition": attachmentHeader(opened.filename),
          "Cache-Control": "private, no-store",
          "Accept-Ranges": "bytes",
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": "default-src 'none'; sandbox",
          ...(opened.statusCode === 206
            ? { "Content-Range": `bytes ${opened.start}-${opened.end}/${opened.sizeBytes}` }
            : {})
        });
        await pipeline(opened.stream, response);
        return;
      }

      if (fileId && !action && request.method === "DELETE") {
        sendJson(response, 200, {
          file: await customRequestFilesService.remove(session.context, requestId, fileId)
        });
        return;
      }

      sendJson(response, 405, {
        error: "METHOD_NOT_ALLOWED",
        message: "Método no permitido."
      }, { Allow: "POST,GET,DELETE" });
    } catch (error) {
      if (!response.headersSent) handleError(response, error, logger);
      else response.destroy(error instanceof Error ? error : undefined);
    }
  };
}

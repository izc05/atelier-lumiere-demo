import { pipeline } from "node:stream/promises";
import { ServiceError } from "./providers-service.mjs";

const MEDIA_PATH = /^\/api\/provider\/products\/([0-9a-f-]{36})\/media(?:\/([0-9a-f-]{36})(?:\/(content|preview))?)?$/i;
const MAX_JSON_BYTES = 64 * 1024;

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
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_JSON_BYTES) {
      throw new ServiceError("BODY_TOO_LARGE", "La solicitud es demasiado grande.", 413);
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ServiceError("INVALID_JSON", "La solicitud no contiene JSON válido.", 400);
  }
}

function bearerToken(request) {
  const authorization = request.headers?.authorization;
  if (typeof authorization !== "string") return null;
  const match = authorization.match(/^Bearer\s+([A-Za-z0-9_-]{32,180})$/);
  return match?.[1] ?? null;
}

function apiError(response, error, logger) {
  if (response.headersSent) {
    response.destroy(error instanceof Error ? error : undefined);
    return;
  }
  if (error instanceof ServiceError) {
    sendJson(response, error.statusCode, {
      error: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details })
    }, error.statusCode === 416 ? { "Content-Range": "bytes */*" } : {});
    return;
  }
  logger.error("Error no controlado en la API multimedia.", {
    code: typeof error?.code === "string" ? error.code : "MEDIA_API_FAILED"
  });
  sendJson(response, 500, {
    error: "INTERNAL_ERROR",
    message: "No se ha podido completar la operación."
  });
}

function headerValue(request, name) {
  const value = request.headers?.[name];
  return Array.isArray(value) ? value[0] : value;
}

function contentDisposition(filename) {
  const encoded = encodeURIComponent(filename).replaceAll("'", "%27");
  const fallback = filename
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._ -]/g, "_")
    .slice(0, 120) || "archivo";
  return `inline; filename="${fallback.replaceAll('"', "_")}"; filename*=UTF-8''${encoded}`;
}

export function createProductMediaApiHandler({
  baseHandler,
  productMediaService,
  providerAuthService,
  logger = console
} = {}) {
  if (typeof baseHandler !== "function") {
    throw new TypeError("createProductMediaApiHandler necesita un handler base.");
  }

  return async function productMediaApiHandler(request, response) {
    const url = new URL(request.url ?? "/", "http://localhost");
    const match = url.pathname.match(MEDIA_PATH);
    if (!match) return baseHandler(request, response);

    try {
      if (!productMediaService || !providerAuthService) {
        throw new ServiceError("SERVICE_UNAVAILABLE", "Los archivos todavía no están disponibles.", 503);
      }
      const token = bearerToken(request);
      const session = token ? await providerAuthService.authenticate(token) : null;
      if (!session) {
        throw new ServiceError("UNAUTHORIZED", "Necesitas iniciar sesión como proveedor.", 401);
      }

      const [, productId, mediaId, mediaVariant] = match;
      if (!mediaId && request.method === "POST") {
        const declaredLength = headerValue(request, "content-length");
        if (declaredLength === undefined) {
          throw new ServiceError(
            "CONTENT_LENGTH_REQUIRED",
            "La carga debe indicar su tamaño antes de comenzar.",
            411
          );
        }
        const media = await productMediaService.upload(
          session.context,
          productId,
          {
            mimeType: headerValue(request, "content-type"),
            contentLength: declaredLength,
            originalFilename: headerValue(request, "x-file-name"),
            altText: headerValue(request, "x-alt-text")
          },
          request
        );
        sendJson(response, 201, { media });
        return;
      }

      if (mediaId && !mediaVariant && request.method === "PATCH") {
        const media = await productMediaService.updateMetadata(
          session.context,
          productId,
          mediaId,
          await readJson(request)
        );
        sendJson(response, 200, { media });
        return;
      }

      if (mediaId && !mediaVariant && request.method === "DELETE") {
        const result = await productMediaService.remove(session.context, productId, mediaId);
        sendJson(response, 200, result);
        return;
      }

      if (mediaId && mediaVariant && request.method === "GET") {
        const opened = await productMediaService.open(
          session.context,
          productId,
          mediaId,
          mediaVariant,
          headerValue(request, "range")
        );
        const length = opened.end - opened.start + 1;
        const headers = {
          "Content-Type": opened.mimeType,
          "Content-Length": String(length),
          "Content-Disposition": contentDisposition(opened.originalFilename),
          "Accept-Ranges": "bytes",
          "Cache-Control": "private, no-store, max-age=0",
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": "default-src 'none'; sandbox"
        };
        if (opened.statusCode === 206) {
          headers["Content-Range"] = `bytes ${opened.start}-${opened.end}/${opened.sizeBytes}`;
        }
        response.writeHead(opened.statusCode, headers);
        await pipeline(opened.stream, response);
        return;
      }

      sendJson(response, 405, {
        error: "METHOD_NOT_ALLOWED",
        message: "Método no permitido."
      }, { Allow: mediaId ? "PATCH, DELETE, GET" : "POST" });
    } catch (error) {
      apiError(response, error, logger);
    }
  };
}

import { pipeline } from "node:stream/promises";
import { ServiceError } from "./providers-service.mjs";

const COLLECTION_PATTERN = /^\/api\/provider\/blog-posts\/([0-9a-f-]{36})\/media$/i;
const ITEM_PATTERN = /^\/api\/provider\/blog-posts\/([0-9a-f-]{36})\/media\/([0-9a-f-]{36})(?:\/(content|preview))?$/i;
const MAX_BODY_BYTES = 64 * 1024;

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
    if (size > MAX_BODY_BYTES) {
      throw new ServiceError("BODY_TOO_LARGE", "La solicitud es demasiado grande.", 413);
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error();
    return parsed;
  } catch {
    throw new ServiceError("INVALID_JSON", "La solicitud no contiene JSON válido.", 400);
  }
}

function bearerToken(request) {
  const authorization = request.headers?.authorization;
  if (typeof authorization !== "string") return null;
  return authorization.match(/^Bearer\s+([A-Za-z0-9_-]{32,180})$/)?.[1] ?? null;
}

function contentDisposition(filename) {
  const encoded = encodeURIComponent(filename).replaceAll("'", "%27");
  const fallback = filename
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._ -]/g, "_")
    .slice(0, 120) || "imagen";
  return `inline; filename="${fallback.replaceAll('"', "_")}"; filename*=UTF-8''${encoded}`;
}

function handleError(response, error, logger) {
  if (response.headersSent) {
    response.destroy(error instanceof Error ? error : undefined);
    return;
  }
  if (error instanceof ServiceError) {
    sendJson(response, error.statusCode, {
      error: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details })
    });
    return;
  }
  logger.error("Error no controlado en las imágenes del blog.", {
    code: typeof error?.code === "string" ? error.code : "BLOG_MEDIA_API_FAILED"
  });
  sendJson(response, 500, {
    error: "INTERNAL_ERROR",
    message: "No se ha podido completar la operación."
  });
}

export function createBlogMediaApiHandler({
  baseHandler,
  blogMediaService,
  providerAuthService,
  logger = console
} = {}) {
  if (typeof baseHandler !== "function") {
    throw new TypeError("createBlogMediaApiHandler necesita un handler base.");
  }

  return async function blogMediaApiHandler(request, response) {
    const url = new URL(request.url ?? "/", "http://localhost");
    const collectionMatch = url.pathname.match(COLLECTION_PATTERN);
    const itemMatch = url.pathname.match(ITEM_PATTERN);
    if (!collectionMatch && !itemMatch) return baseHandler(request, response);

    try {
      if (!blogMediaService || !providerAuthService) {
        throw new ServiceError("SERVICE_UNAVAILABLE", "Las imágenes del blog no están disponibles.", 503);
      }
      const token = bearerToken(request);
      const session = token ? await providerAuthService.authenticate(token) : null;
      if (!session) {
        throw new ServiceError("UNAUTHORIZED", "Necesitas iniciar sesión como proveedor.", 401);
      }
      const context = session.context;

      if (collectionMatch && request.method === "POST") {
        const media = await blogMediaService.upload(
          context,
          collectionMatch[1],
          {
            mimeType: request.headers["content-type"],
            contentLength: request.headers["content-length"],
            originalFilename: request.headers["x-file-name"],
            altText: request.headers["x-alt-text"],
            placement: request.headers["x-media-placement"]
          },
          request
        );
        sendJson(response, 201, { media });
        return;
      }

      if (itemMatch) {
        const [, postId, mediaId, variant] = itemMatch;
        if (!variant && request.method === "PATCH") {
          const media = await blogMediaService.updateMetadata(
            context,
            postId,
            mediaId,
            await readJson(request)
          );
          sendJson(response, 200, { media });
          return;
        }
        if (!variant && request.method === "DELETE") {
          sendJson(response, 200, await blogMediaService.remove(context, postId, mediaId));
          return;
        }
        if (variant && request.method === "GET") {
          const opened = await blogMediaService.open(
            context,
            postId,
            mediaId,
            variant,
            request.headers.range
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

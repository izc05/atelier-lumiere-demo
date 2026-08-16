import { pipeline } from "node:stream/promises";
import { ServiceError } from "./providers-service.mjs";

const ADMIN_COLLECTION = "/api/admin/showcase";
const ADMIN_SLOT = /^\/api\/admin\/showcase\/([A-Z0-9_]+)(?:\/(preview))?$/i;
const PUBLIC_COLLECTION = "/api/showcase";
const PUBLIC_SLOT = /^\/api\/showcase\/([A-Z0-9_]+)\/(preview)$/i;
const MAX_JSON_BYTES = 16 * 1024;

function sendJson(response, statusCode, body, { publicCache = false } = {}) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": publicCache ? "public, max-age=60, stale-while-revalidate=300" : "no-store",
    "X-Content-Type-Options": "nosniff"
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
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error();
    return parsed;
  } catch {
    throw new ServiceError("INVALID_JSON", "La solicitud no contiene JSON válido.", 400);
  }
}

function headerValue(request, name) {
  const value = request.headers?.[name];
  return Array.isArray(value) ? value[0] : value;
}

function requestedWidth(url) {
  const raw = url.searchParams.get("width");
  if (raw === null || raw === "") return null;
  if (!/^\d{2,4}$/.test(raw)) {
    throw new ServiceError("MEDIA_PREVIEW_WIDTH_INVALID", "La anchura de imagen solicitada no es válida.", 422);
  }
  return Number(raw);
}

function contentDisposition(filename) {
  const encoded = encodeURIComponent(filename).replaceAll("'", "%27");
  const fallback = filename
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._ -]/g, "_")
    .slice(0, 120) || "preview.webp";
  return `inline; filename="${fallback.replaceAll('"', "_")}"; filename*=UTF-8''${encoded}`;
}

async function sendPreview(response, opened, { publicCache = false } = {}) {
  const length = opened.end - opened.start + 1;
  const headers = {
    "Content-Type": opened.mimeType,
    "Content-Length": String(length),
    "Content-Disposition": contentDisposition(opened.originalFilename),
    "Accept-Ranges": "bytes",
    "Cache-Control": publicCache
      ? "public, max-age=300, stale-while-revalidate=1800"
      : "private, no-store, max-age=0",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Cross-Origin-Resource-Policy": "same-origin"
  };
  if (opened.statusCode === 206) {
    headers["Content-Range"] = `bytes ${opened.start}-${opened.end}/${opened.sizeBytes}`;
  }
  response.writeHead(opened.statusCode, headers);
  await pipeline(opened.stream, response);
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
  logger.error("Error no controlado en el escaparate editorial.", {
    code: typeof error?.code === "string" ? error.code : "SHOWCASE_MEDIA_API_FAILED"
  });
  sendJson(response, 500, {
    error: "INTERNAL_ERROR",
    message: "No se ha podido completar la operación."
  });
}

export function createShowcaseMediaApiHandler({
  baseHandler,
  showcaseMediaService,
  authenticateRequest,
  logger = console
} = {}) {
  if (typeof baseHandler !== "function") {
    throw new TypeError("createShowcaseMediaApiHandler necesita un handler base.");
  }

  return async function showcaseMediaApiHandler(request, response) {
    const url = new URL(request.url ?? "/", "http://localhost");
    const adminMatch = url.pathname.match(ADMIN_SLOT);
    const publicMatch = url.pathname.match(PUBLIC_SLOT);
    const isAdminCollection = url.pathname === ADMIN_COLLECTION;
    const isPublicCollection = url.pathname === PUBLIC_COLLECTION;
    if (!adminMatch && !publicMatch && !isAdminCollection && !isPublicCollection) {
      return baseHandler(request, response);
    }

    try {
      if (!showcaseMediaService) {
        throw new ServiceError("SERVICE_UNAVAILABLE", "El escaparate editorial no está disponible.", 503);
      }

      if (isPublicCollection) {
        if (request.method !== "GET") {
          sendJson(response, 405, { error: "METHOD_NOT_ALLOWED", message: "Método no permitido." });
          return;
        }
        sendJson(response, 200, { slots: await showcaseMediaService.listPublic() }, { publicCache: true });
        return;
      }

      if (publicMatch) {
        if (request.method !== "GET") {
          sendJson(response, 405, { error: "METHOD_NOT_ALLOWED", message: "Método no permitido." });
          return;
        }
        await sendPreview(
          response,
          await showcaseMediaService.openPublicPreview(
            publicMatch[1],
            headerValue(request, "range"),
            requestedWidth(url)
          ),
          { publicCache: true }
        );
        return;
      }

      if (typeof authenticateRequest !== "function") {
        throw new ServiceError("SERVICE_UNAVAILABLE", "La administración del escaparate no está disponible.", 503);
      }
      const context = await authenticateRequest(request);
      if (!context || context.role !== "ADMIN") {
        throw new ServiceError("UNAUTHORIZED", "Necesitas una sesión administrativa.", 401);
      }

      if (isAdminCollection) {
        if (request.method !== "GET") {
          sendJson(response, 405, { error: "METHOD_NOT_ALLOWED", message: "Método no permitido." });
          return;
        }
        sendJson(response, 200, { slots: await showcaseMediaService.listAdmin(context) });
        return;
      }

      const [, slot, variant] = adminMatch;
      if (variant === "preview") {
        if (request.method !== "GET") {
          sendJson(response, 405, { error: "METHOD_NOT_ALLOWED", message: "Método no permitido." });
          return;
        }
        await sendPreview(
          response,
          await showcaseMediaService.openAdminPreview(
            context,
            slot,
            headerValue(request, "range"),
            requestedWidth(url)
          )
        );
        return;
      }

      if (request.method === "PUT") {
        const declaredLength = headerValue(request, "content-length");
        if (declaredLength === undefined) {
          throw new ServiceError("CONTENT_LENGTH_REQUIRED", "La carga debe indicar su tamaño.", 411);
        }
        const media = await showcaseMediaService.upload(context, slot, {
          mimeType: headerValue(request, "content-type"),
          contentLength: declaredLength,
          originalFilename: headerValue(request, "x-file-name"),
          altText: headerValue(request, "x-alt-text"),
          focalX: headerValue(request, "x-focal-x"),
          focalY: headerValue(request, "x-focal-y")
        }, request);
        sendJson(response, 201, { media });
        return;
      }

      if (request.method === "PATCH") {
        sendJson(response, 200, {
          media: await showcaseMediaService.updateMetadata(context, slot, await readJson(request))
        });
        return;
      }

      if (request.method === "DELETE") {
        sendJson(response, 200, await showcaseMediaService.remove(context, slot));
        return;
      }

      sendJson(response, 405, { error: "METHOD_NOT_ALLOWED", message: "Método no permitido." });
    } catch (error) {
      handleError(response, error, logger);
    }
  };
}

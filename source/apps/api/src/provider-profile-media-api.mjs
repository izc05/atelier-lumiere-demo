import { pipeline } from "node:stream/promises";
import { ServiceError } from "./providers-service.mjs";

const PROVIDER_MEDIA = /^\/api\/provider\/profile\/media(?:\/([0-9a-f-]{36})(?:\/(preview))?)?$/i;
const ADMIN_MEDIA = /^\/api\/admin\/provider-profiles\/([0-9a-f-]{36})\/media(?:\/([0-9a-f-]{36})\/(preview))?$/i;
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
    if (size > MAX_JSON_BYTES) throw new ServiceError("BODY_TOO_LARGE", "La solicitud es demasiado grande.", 413);
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
  const value = String(request.headers.authorization ?? "");
  return value.match(/^Bearer\s+([A-Za-z0-9_-]{32,180})$/)?.[1] ?? null;
}

function headerValue(request, name) {
  const value = request.headers?.[name];
  return Array.isArray(value) ? value[0] : value;
}

function contentDisposition(filename) {
  const encoded = encodeURIComponent(filename).replaceAll("'", "%27");
  const fallback = filename.normalize("NFKD").replace(/[^A-Za-z0-9._ -]/g, "_").slice(0, 120) || "preview.webp";
  return `inline; filename="${fallback.replaceAll('"', "_")}"; filename*=UTF-8''${encoded}`;
}

async function sendPreview(response, opened) {
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
  if (opened.statusCode === 206) headers["Content-Range"] = `bytes ${opened.start}-${opened.end}/${opened.sizeBytes}`;
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
  logger.error("Error no controlado en multimedia del perfil.", {
    code: typeof error?.code === "string" ? error.code : "PROVIDER_PROFILE_MEDIA_API_FAILED"
  });
  sendJson(response, 500, { error: "INTERNAL_ERROR", message: "No se ha podido completar la operación." });
}

export function createProviderProfileMediaApiHandler({
  baseHandler,
  profileMediaService,
  providerAuthService,
  authenticateRequest,
  logger = console
} = {}) {
  if (typeof baseHandler !== "function") throw new TypeError("Se necesita un handler base para multimedia de perfil.");

  return async function providerProfileMediaApiHandler(request, response) {
    const url = new URL(request.url ?? "/", "http://localhost");
    const providerMatch = url.pathname.match(PROVIDER_MEDIA);
    const adminMatch = url.pathname.match(ADMIN_MEDIA);
    if (!providerMatch && !adminMatch) return baseHandler(request, response);

    try {
      if (!profileMediaService) throw new ServiceError("SERVICE_UNAVAILABLE", "Las imágenes del taller no están disponibles.", 503);

      if (providerMatch) {
        if (!providerAuthService) throw new ServiceError("SERVICE_UNAVAILABLE", "El acceso del taller no está disponible.", 503);
        const token = bearerToken(request);
        const session = token ? await providerAuthService.authenticate(token) : null;
        if (!session) throw new ServiceError("UNAUTHORIZED", "Necesitas iniciar sesión como proveedor.", 401);
        const [, mediaId, variant] = providerMatch;

        if (!mediaId && request.method === "GET") {
          sendJson(response, 200, { media: await profileMediaService.list(session.context) });
          return;
        }
        if (!mediaId && request.method === "POST") {
          const declaredLength = headerValue(request, "content-length");
          if (declaredLength === undefined) throw new ServiceError("CONTENT_LENGTH_REQUIRED", "La carga debe indicar su tamaño.", 411);
          const media = await profileMediaService.upload(session.context, {
            mimeType: headerValue(request, "content-type"),
            contentLength: declaredLength,
            originalFilename: headerValue(request, "x-file-name"),
            altText: headerValue(request, "x-alt-text"),
            kind: headerValue(request, "x-media-kind")
          }, request);
          sendJson(response, 201, { media });
          return;
        }
        if (mediaId && !variant && request.method === "PATCH") {
          sendJson(response, 200, { media: await profileMediaService.updateMetadata(session.context, mediaId, await readJson(request)) });
          return;
        }
        if (mediaId && !variant && request.method === "DELETE") {
          sendJson(response, 200, await profileMediaService.remove(session.context, mediaId));
          return;
        }
        if (mediaId && variant === "preview" && request.method === "GET") {
          await sendPreview(response, await profileMediaService.open(session.context, mediaId, headerValue(request, "range")));
          return;
        }
        sendJson(response, 405, { error: "METHOD_NOT_ALLOWED", message: "Método no permitido." });
        return;
      }

      if (typeof authenticateRequest !== "function") throw new ServiceError("SERVICE_UNAVAILABLE", "La revisión administrativa no está disponible.", 503);
      const context = await authenticateRequest(request);
      if (!context || context.role !== "ADMIN") throw new ServiceError("UNAUTHORIZED", "Necesitas una sesión administrativa.", 401);
      const [, providerId, mediaId, variant] = adminMatch;

      if (!mediaId && request.method === "GET") {
        sendJson(response, 200, { media: await profileMediaService.listAdmin(context, providerId) });
        return;
      }
      if (mediaId && variant === "preview" && request.method === "GET") {
        await sendPreview(response, await profileMediaService.openAdmin(context, providerId, mediaId, headerValue(request, "range")));
        return;
      }
      sendJson(response, 405, { error: "METHOD_NOT_ALLOWED", message: "Método no permitido." });
    } catch (error) {
      handleError(response, error, logger);
    }
  };
}

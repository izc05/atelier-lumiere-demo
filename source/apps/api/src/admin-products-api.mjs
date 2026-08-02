import { pipeline } from "node:stream/promises";
import { ServiceError } from "./providers-service.mjs";

const COLLECTION_PATH = "/api/admin/products";
const DETAIL_PATTERN = /^\/api\/admin\/products\/([0-9a-f-]{36})$/i;
const ACTION_PATTERN = /^\/api\/admin\/products\/([0-9a-f-]{36})\/(review|publish)$/i;
const PREVIEW_PATTERN = /^\/api\/admin\/products\/([0-9a-f-]{36})\/media\/([0-9a-f-]{36})\/preview$/i;
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
  logger.error("Error no controlado en revisión administrativa.", {
    code: typeof error?.code === "string" ? error.code : "ADMIN_PRODUCT_API_FAILED"
  });
  sendJson(response, 500, {
    error: "INTERNAL_ERROR",
    message: "No se ha podido completar la operación."
  });
}

function contentDisposition(filename) {
  const encoded = encodeURIComponent(filename).replaceAll("'", "%27");
  const fallback = filename
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._ -]/g, "_")
    .slice(0, 120) || "preview.webp";
  return `inline; filename="${fallback.replaceAll('"', "_")}"; filename*=UTF-8''${encoded}`;
}

export function createAdminProductsApiHandler({
  baseHandler,
  adminProductsService,
  authenticateRequest,
  logger = console
} = {}) {
  if (typeof baseHandler !== "function") {
    throw new TypeError("createAdminProductsApiHandler necesita un handler base.");
  }
  if (typeof authenticateRequest !== "function") {
    throw new TypeError("createAdminProductsApiHandler necesita autenticación administrativa.");
  }

  return async function adminProductsApiHandler(request, response) {
    const url = new URL(request.url ?? "/", "http://localhost");
    const detailMatch = url.pathname.match(DETAIL_PATTERN);
    const actionMatch = url.pathname.match(ACTION_PATTERN);
    const previewMatch = url.pathname.match(PREVIEW_PATTERN);
    const matches = url.pathname === COLLECTION_PATH || detailMatch || actionMatch || previewMatch;
    if (!matches) return baseHandler(request, response);

    try {
      if (!adminProductsService) {
        throw new ServiceError("SERVICE_UNAVAILABLE", "La revisión de artículos no está disponible.", 503);
      }
      const context = await authenticateRequest(request);
      if (!context || context.role !== "ADMIN") {
        throw new ServiceError("UNAUTHORIZED", "Necesitas una sesión administrativa.", 401);
      }

      if (url.pathname === COLLECTION_PATH && request.method === "GET") {
        const products = await adminProductsService.list(context, {
          status: url.searchParams.get("status") ?? "ALL",
          query: url.searchParams.get("q") ?? ""
        });
        sendJson(response, 200, { products });
        return;
      }

      if (detailMatch && request.method === "GET") {
        const product = await adminProductsService.get(context, detailMatch[1]);
        sendJson(response, 200, { product });
        return;
      }

      if (actionMatch && request.method === "POST") {
        const [, productId, action] = actionMatch;
        const result = action === "review"
          ? await adminProductsService.decide(context, productId, await readJson(request))
          : await adminProductsService.publish(context, productId);
        sendJson(response, 200, result);
        return;
      }

      if (previewMatch && request.method === "GET") {
        const opened = await adminProductsService.openPreview(
          context,
          previewMatch[1],
          previewMatch[2],
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

      sendJson(response, 405, {
        error: "METHOD_NOT_ALLOWED",
        message: "Método no permitido."
      });
    } catch (error) {
      handleError(response, error, logger);
    }
  };
}

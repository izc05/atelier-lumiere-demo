import { pipeline } from "node:stream/promises";
import { ServiceError } from "./providers-service.mjs";

const COLLECTION_PATH = "/api/catalog/products";
const DETAIL_PATTERN = /^\/api\/catalog\/products\/([a-z0-9-]+)\/([a-z0-9-]+)$/i;
const MEDIA_PATTERN = /^\/api\/catalog\/products\/([0-9a-f-]{36})\/media\/([0-9a-f-]{36})\/(preview|content)$/i;
const PREVIEW_WIDTHS = new Set([320, 640, 960]);

function sendJson(response, statusCode, body, cacheControl = "public, max-age=60") {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": cacheControl,
    "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Resource-Policy": "same-origin"
  });
  response.end(JSON.stringify(body));
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
    }, "no-store");
    return;
  }
  logger.error("Error no controlado en el catálogo público.", {
    code: typeof error?.code === "string" ? error.code : "PUBLIC_CATALOG_FAILED"
  });
  sendJson(response, 500, {
    error: "INTERNAL_ERROR",
    message: "No se ha podido abrir el catálogo."
  }, "no-store");
}

function contentDisposition(filename) {
  const encoded = encodeURIComponent(filename).replaceAll("'", "%27");
  const fallback = filename
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._ -]/g, "_")
    .slice(0, 120) || "archivo";
  return `inline; filename="${fallback.replaceAll('"', "_")}"; filename*=UTF-8''${encoded}`;
}

function previewWidth(value) {
  if (value === null || value === "") return null;
  const width = Number(value);
  if (!Number.isInteger(width) || !PREVIEW_WIDTHS.has(width)) {
    throw new ServiceError(
      "MEDIA_PREVIEW_WIDTH_INVALID",
      "La anchura de imagen solicitada no es válida.",
      422,
      { allowedWidths: [...PREVIEW_WIDTHS] }
    );
  }
  return width;
}

export function createPublicCatalogApiHandler({
  baseHandler,
  publicCatalogService,
  logger = console
} = {}) {
  if (typeof baseHandler !== "function") {
    throw new TypeError("createPublicCatalogApiHandler necesita un handler base.");
  }

  return async function publicCatalogApiHandler(request, response) {
    const url = new URL(request.url ?? "/", "http://localhost");
    const detailMatch = url.pathname.match(DETAIL_PATTERN);
    const mediaMatch = url.pathname.match(MEDIA_PATTERN);
    const matches = url.pathname === COLLECTION_PATH || detailMatch || mediaMatch;
    if (!matches) return baseHandler(request, response);

    try {
      if (!publicCatalogService) {
        throw new ServiceError("SERVICE_UNAVAILABLE", "La tienda todavía no está disponible.", 503);
      }
      if (request.method !== "GET") {
        sendJson(response, 405, {
          error: "METHOD_NOT_ALLOWED",
          message: "Método no permitido."
        }, "no-store");
        return;
      }

      if (url.pathname === COLLECTION_PATH) {
        const products = await publicCatalogService.list({
          query: url.searchParams.get("q") ?? "",
          category: url.searchParams.get("category") ?? "",
          event: url.searchParams.get("event") ?? ""
        });
        sendJson(response, 200, { products }, "public, max-age=60, stale-while-revalidate=300");
        return;
      }

      if (detailMatch) {
        const product = await publicCatalogService.get(detailMatch[1], detailMatch[2]);
        sendJson(response, 200, { product }, "public, max-age=60, stale-while-revalidate=300");
        return;
      }

      if (mediaMatch) {
        const width = mediaMatch[3] === "preview"
          ? previewWidth(url.searchParams.get("width"))
          : null;
        const opened = await publicCatalogService.openMedia(
          mediaMatch[1],
          mediaMatch[2],
          mediaMatch[3],
          request.headers.range,
          width
        );
        const length = opened.end - opened.start + 1;
        const headers = {
          "Content-Type": opened.mimeType,
          "Content-Length": String(length),
          "Content-Disposition": contentDisposition(opened.filename),
          "Accept-Ranges": "bytes",
          "Cache-Control": "public, max-age=31536000, immutable",
          "X-Content-Type-Options": "nosniff",
          "Cross-Origin-Resource-Policy": "same-origin",
          "Content-Security-Policy": "default-src 'none'; sandbox"
        };
        if (opened.statusCode === 206) {
          headers["Content-Range"] = `bytes ${opened.start}-${opened.end}/${opened.sizeBytes}`;
        }
        response.writeHead(opened.statusCode, headers);
        await pipeline(opened.stream, response);
        return;
      }
    } catch (error) {
      handleError(response, error, logger);
    }
  };
}

import { pipeline } from "node:stream/promises";
import { ServiceError } from "./providers-service.mjs";

const COLLECTION_PATH = "/api/blog/posts";
const DETAIL_PATTERN = /^\/api\/blog\/posts\/([a-z0-9-]+)\/([a-z0-9-]+)$/i;
const MEDIA_PATTERN = /^\/api\/blog\/posts\/([0-9a-f-]{36})\/media\/([0-9a-f-]{36})\/preview$/i;
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
function contentDisposition(filename) {
  const encoded = encodeURIComponent(filename).replaceAll("'", "%27");
  const fallback = filename.normalize("NFKD").replace(/[^A-Za-z0-9._ -]/g, "_").slice(0, 120) || "imagen.webp";
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
function handleError(response, error, logger) {
  if (response.headersSent) return response.destroy(error instanceof Error ? error : undefined);
  if (error instanceof ServiceError) {
    sendJson(response, error.statusCode, {
      error: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details })
    }, "no-store");
    return;
  }
  logger.error("Error no controlado en el blog público.", {
    code: typeof error?.code === "string" ? error.code : "PUBLIC_BLOG_FAILED"
  });
  sendJson(response, 500, { error: "INTERNAL_ERROR", message: "No se ha podido abrir el blog." }, "no-store");
}

export function createPublicBlogApiHandler({ baseHandler, publicBlogService, logger = console } = {}) {
  if (typeof baseHandler !== "function") throw new TypeError("createPublicBlogApiHandler necesita un handler base.");
  return async function publicBlogApiHandler(request, response) {
    const url = new URL(request.url ?? "/", "http://localhost");
    const detail = url.pathname.match(DETAIL_PATTERN);
    const media = url.pathname.match(MEDIA_PATTERN);
    if (url.pathname !== COLLECTION_PATH && !detail && !media) return baseHandler(request, response);
    try {
      if (!publicBlogService) throw new ServiceError("SERVICE_UNAVAILABLE", "El blog todavía no está disponible.", 503);
      if (request.method !== "GET") {
        sendJson(response, 405, { error: "METHOD_NOT_ALLOWED", message: "Método no permitido." }, "no-store");
        return;
      }
      if (url.pathname === COLLECTION_PATH) {
        const posts = await publicBlogService.list({
          query: url.searchParams.get("q") ?? "",
          category: url.searchParams.get("category") ?? "",
          tag: url.searchParams.get("tag") ?? ""
        });
        sendJson(response, 200, { posts }, "public, max-age=60, stale-while-revalidate=300");
        return;
      }
      if (detail) {
        const post = await publicBlogService.get(detail[1], detail[2]);
        sendJson(response, 200, { post }, "public, max-age=60, stale-while-revalidate=300");
        return;
      }
      const width = previewWidth(url.searchParams.get("width"));
      const rangeRequest = width === null
        ? request.headers.range
        : { range: request.headers.range, width };
      const opened = await publicBlogService.openPreview(media[1], media[2], rangeRequest);
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
      if (opened.statusCode === 206) headers["Content-Range"] = `bytes ${opened.start}-${opened.end}/${opened.sizeBytes}`;
      response.writeHead(opened.statusCode, headers);
      await pipeline(opened.stream, response);
    } catch (error) {
      handleError(response, error, logger);
    }
  };
}

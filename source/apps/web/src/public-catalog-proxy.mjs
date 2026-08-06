import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const CATALOG_PATTERN = /^\/internal\/catalog\/products(?:\/([a-z0-9-]+)\/([a-z0-9-]+)|\/([0-9a-f-]{36})\/media\/([0-9a-f-]{36})\/(preview|content))?$/i;
const SAFE_RESPONSE_HEADERS = new Set([
  "content-type", "content-length", "content-disposition",
  "accept-ranges", "content-range", "cache-control",
  "x-content-type-options", "content-security-policy",
  "cross-origin-resource-policy"
]);

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(JSON.stringify(body));
}

function copiedHeaders(upstream) {
  const headers = {};
  for (const [name, value] of upstream.headers) {
    if (SAFE_RESPONSE_HEADERS.has(name.toLowerCase())) headers[name] = value;
  }
  return headers;
}

export function createPublicCatalogWebHandler({
  baseHandler,
  apiInternalUrl = process.env.API_INTERNAL_URL ?? "http://localhost:4000",
  fetchImpl = fetch,
  logger = console
} = {}) {
  if (typeof baseHandler !== "function") {
    throw new TypeError("createPublicCatalogWebHandler necesita un handler base.");
  }
  const apiBase = new URL(apiInternalUrl);

  return async function publicCatalogWebHandler(request, response) {
    const url = new URL(request.url ?? "/", "http://localhost");
    const match = url.pathname.match(CATALOG_PATTERN);
    if (!match) return baseHandler(request, response);

    if (request.method !== "GET") {
      sendJson(response, 405, {
        error: "METHOD_NOT_ALLOWED",
        message: "Método no permitido."
      });
      return;
    }

    const targetPath = url.pathname.replace(/^\/internal/, "/api");
    const target = new URL(`${targetPath}${url.search}`, apiBase);
    const isMedia = Boolean(match[3]);
    try {
      const upstream = await fetchImpl(target, {
        method: "GET",
        headers: {
          Accept: request.headers.accept ?? (isMedia ? "*/*" : "application/json"),
          ...(request.headers.range ? { Range: request.headers.range } : {}),
          "User-Agent": String(request.headers["user-agent"] ?? "").slice(0, 500)
        },
        signal: AbortSignal.timeout(isMedia ? 60_000 : 10_000)
      });
      const headers = copiedHeaders(upstream);
      if (!isMedia) headers["Cache-Control"] = "no-store";
      response.writeHead(upstream.status, headers);
      if (!upstream.body) response.end();
      else await pipeline(Readable.fromWeb(upstream.body), response);
    } catch (error) {
      logger.error("No se pudo abrir el catálogo público.", {
        code: typeof error?.code === "string" ? error.code : "PUBLIC_CATALOG_PROXY_FAILED"
      });
      if (!response.headersSent) {
        sendJson(response, 502, {
          error: "CATALOG_UNAVAILABLE",
          message: "La tienda no responde en este momento."
        });
      } else response.destroy(error instanceof Error ? error : undefined);
    }
  };
}

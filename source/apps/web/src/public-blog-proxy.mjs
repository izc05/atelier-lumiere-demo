import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const BLOG_PATTERN = /^\/internal\/blog\/posts(?:\/([a-z0-9-]+)\/([a-z0-9-]+)|\/([0-9a-f-]{36})\/media\/([0-9a-f-]{36})\/preview)?$/i;
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

export function createPublicBlogWebHandler({
  baseHandler,
  apiInternalUrl = process.env.API_INTERNAL_URL ?? "http://localhost:4000",
  fetchImpl = fetch,
  logger = console
} = {}) {
  if (typeof baseHandler !== "function") {
    throw new TypeError("createPublicBlogWebHandler necesita un handler base.");
  }
  const apiBase = new URL(apiInternalUrl);
  return async function publicBlogWebHandler(request, response) {
    const url = new URL(request.url ?? "/", "http://localhost");
    const match = url.pathname.match(BLOG_PATTERN);
    if (!match) return baseHandler(request, response);
    if (request.method !== "GET") {
      sendJson(response, 405, { error: "METHOD_NOT_ALLOWED", message: "Método no permitido." });
      return;
    }
    const targetPath = url.pathname.replace(/^\/internal/, "/api");
    const target = new URL(`${targetPath}${url.search}`, apiBase);
    const isMedia = Boolean(match[3]);
    try {
      const upstream = await fetchImpl(target, {
        headers: {
          Accept: request.headers.accept ?? (isMedia ? "*/*" : "application/json"),
          ...(request.headers.range ? { Range: request.headers.range } : {}),
          "User-Agent": String(request.headers["user-agent"] ?? "").slice(0, 500)
        },
        signal: AbortSignal.timeout(isMedia ? 60_000 : 10_000)
      });
      response.writeHead(upstream.status, copiedHeaders(upstream));
      if (!upstream.body) response.end();
      else await pipeline(Readable.fromWeb(upstream.body), response);
    } catch (error) {
      logger.error("No se pudo abrir el blog público.", {
        code: typeof error?.code === "string" ? error.code : "PUBLIC_BLOG_PROXY_FAILED"
      });
      if (!response.headersSent) {
        sendJson(response, 502, {
          error: "BLOG_UNAVAILABLE",
          message: "El blog no responde en este momento."
        });
      } else response.destroy(error instanceof Error ? error : undefined);
    }
  };
}

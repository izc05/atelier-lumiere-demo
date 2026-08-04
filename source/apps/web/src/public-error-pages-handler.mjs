import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DEFAULT_PUBLIC_DIRECTORY = fileURLToPath(new URL("../public/", import.meta.url));

function errorHeaders() {
  return {
    "Cache-Control": "no-store",
    "Content-Type": "text/html; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Content-Security-Policy": "default-src 'self'; connect-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; form-action 'self'; base-uri 'none'"
  };
}

function isHtmlNavigation(request, url) {
  if (!["GET", "HEAD"].includes(request.method ?? "GET")) return false;
  if (url.pathname.startsWith("/internal/")) return false;
  const accept = String(request.headers.accept ?? "").toLowerCase();
  if (accept.includes("text/html")) return true;
  if (accept && !accept.includes("*/*")) return false;
  return extname(url.pathname) === "";
}

function normalizeHeaders(input) {
  if (!input) return [];
  if (typeof input.entries === "function") return [...input.entries()];
  return Object.entries(input);
}

function createBufferedResponse() {
  const headers = new Map();
  const chunks = [];
  let statusCode = 200;
  let headersSent = false;
  let writableEnded = false;

  const response = {
    get statusCode() {
      return statusCode;
    },
    set statusCode(value) {
      if (Number.isInteger(value)) statusCode = value;
    },
    get headersSent() {
      return headersSent;
    },
    get writableEnded() {
      return writableEnded;
    },
    setHeader(name, value) {
      headers.set(String(name).toLowerCase(), { name: String(name), value });
      return response;
    },
    getHeader(name) {
      return headers.get(String(name).toLowerCase())?.value;
    },
    getHeaders() {
      return Object.fromEntries([...headers.values()].map(({ name, value }) => [name, value]));
    },
    hasHeader(name) {
      return headers.has(String(name).toLowerCase());
    },
    removeHeader(name) {
      headers.delete(String(name).toLowerCase());
    },
    writeHead(code, statusMessageOrHeaders, maybeHeaders) {
      statusCode = code;
      const selectedHeaders = typeof statusMessageOrHeaders === "string"
        ? maybeHeaders
        : statusMessageOrHeaders;
      for (const [name, value] of normalizeHeaders(selectedHeaders)) response.setHeader(name, value);
      headersSent = true;
      return response;
    },
    write(chunk, encoding) {
      if (chunk !== undefined && chunk !== null) {
        const selectedEncoding = typeof encoding === "string" ? encoding : undefined;
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), selectedEncoding));
      }
      return true;
    },
    end(chunk, encoding) {
      if (chunk !== undefined && chunk !== null) response.write(chunk, encoding);
      writableEnded = true;
      return response;
    },
    destroy(error) {
      if (error) throw error;
      writableEnded = true;
    },
    snapshot() {
      return {
        statusCode,
        headers: response.getHeaders(),
        body: Buffer.concat(chunks),
        writableEnded
      };
    }
  };
  return response;
}

function fallbackPage(statusCode) {
  const title = statusCode === 404 ? "Página no encontrada" : "Servicio temporalmente no disponible";
  return Buffer.from(`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>${title}</title><main><h1>${title}</h1><p><a href="/">Volver al inicio</a></p></main></html>`);
}

export function createPublicErrorPagesWebHandler({
  baseHandler,
  publicDirectory = DEFAULT_PUBLIC_DIRECTORY,
  logger = console
} = {}) {
  if (typeof baseHandler !== "function") {
    throw new TypeError("createPublicErrorPagesWebHandler necesita un handler base.");
  }
  if (typeof publicDirectory !== "string" || !publicDirectory.trim()) {
    throw new TypeError("La carpeta pública no es válida.");
  }

  const root = resolve(publicDirectory);
  const pageUrls = {
    404: pathToFileURL(resolve(root, "404/index.html")),
    500: pathToFileURL(resolve(root, "500/index.html"))
  };
  const pageCache = new Map();

  async function loadErrorPage(statusCode) {
    if (!pageCache.has(statusCode)) {
      pageCache.set(statusCode, readFile(pageUrls[statusCode]).catch(() => fallbackPage(statusCode)));
    }
    return pageCache.get(statusCode);
  }

  async function sendErrorPage(request, response, statusCode) {
    const body = await loadErrorPage(statusCode);
    response.writeHead(statusCode, errorHeaders());
    response.end(request.method === "HEAD" ? undefined : body);
  }

  return async function publicErrorPagesWebHandler(request, response) {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (!isHtmlNavigation(request, url)) return baseHandler(request, response);

    if (["/404", "/404/"].includes(url.pathname)) {
      await sendErrorPage(request, response, 404);
      return;
    }
    if (["/500", "/500/"].includes(url.pathname)) {
      await sendErrorPage(request, response, 500);
      return;
    }

    const buffered = createBufferedResponse();
    try {
      await baseHandler(request, buffered);
      const captured = buffered.snapshot();
      if (captured.statusCode === 404) {
        await sendErrorPage(request, response, 404);
        return;
      }
      if (captured.statusCode >= 500) {
        await sendErrorPage(request, response, 500);
        return;
      }
      response.writeHead(captured.statusCode, captured.headers);
      response.end(request.method === "HEAD" ? undefined : captured.body);
    } catch (error) {
      logger.error("Error no controlado durante una navegación pública.", {
        code: typeof error?.code === "string" ? error.code : "PUBLIC_NAVIGATION_FAILED"
      });
      await sendErrorPage(request, response, 500);
    }
  };
}

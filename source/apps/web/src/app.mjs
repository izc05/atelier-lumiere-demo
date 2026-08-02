import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_PUBLIC_DIRECTORY = fileURLToPath(new URL("../public/", import.meta.url));
const MAX_BODY_BYTES = 64 * 1024;
const SESSION_COOKIE = "atelier_admin_session";
const ADMIN_PROXY_PATTERN = /^\/internal\/admin\/providers(?:\/[0-9a-f-]+\/(?:status|invitations|audit))?$/i;
const PROVIDER_PROXY_ROUTES = new Map([
  ["/internal/provider/invitation-preview", "/api/provider-invitations/preview"],
  ["/internal/provider/invitation-accept", "/api/provider-invitations/accept"],
  ["/internal/provider/email-verify", "/api/email-verifications/verify"],
  ["/internal/provider/email-resend", "/api/email-verifications/resend"],
  ["/internal/provider/two-factor-setup", "/api/two-factor/setup"],
  ["/internal/provider/two-factor-confirm", "/api/two-factor/confirm"]
]);

const CONTENT_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".webp", "image/webp"]
]);

function secureEquals(received, expected) {
  const receivedBuffer = Buffer.from(received ?? "", "utf8");
  const expectedBuffer = Buffer.from(expected ?? "", "utf8");
  if (receivedBuffer.length !== expectedBuffer.length || expectedBuffer.length === 0) return false;
  return timingSafeEqual(receivedBuffer, expectedBuffer);
}

function parseCookies(header) {
  const cookies = new Map();
  for (const part of String(header ?? "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    try {
      cookies.set(key, decodeURIComponent(value));
    } catch {
      // Se ignoran cookies mal formadas.
    }
  }
  return cookies;
}

function securityHeaders(extra = {}) {
  return {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Cross-Origin-Resource-Policy": "same-origin",
    ...extra
  };
}

function sendJson(response, statusCode, payload, extraHeaders = {}) {
  response.writeHead(statusCode, securityHeaders({
    "Content-Type": "application/json; charset=utf-8",
    ...extraHeaders
  }));
  response.end(JSON.stringify(payload));
}

function sendText(response, statusCode, text) {
  response.writeHead(statusCode, securityHeaders({
    "Content-Type": "text/plain; charset=utf-8"
  }));
  response.end(text);
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const error = new Error("El cuerpo supera 64 KB.");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJson(request) {
  if (!String(request.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) {
    const error = new Error("El cuerpo debe ser JSON.");
    error.statusCode = 415;
    throw error;
  }
  const body = await readBody(request);
  if (body.length === 0) return {};
  try {
    const parsed = JSON.parse(body.toString("utf8"));
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error();
    return parsed;
  } catch {
    const error = new Error("El JSON no es válido.");
    error.statusCode = 400;
    throw error;
  }
}

function safeStaticPath(publicDirectory, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  let relative = decoded.replace(/^\/+/, "");
  if (!relative || decoded.endsWith("/")) relative += "index.html";
  if (relative.split("/").some((part) => part.startsWith("."))) return null;

  const root = resolve(publicDirectory);
  const candidate = resolve(root, relative);
  if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) return null;
  return candidate;
}

function adminCookie(sessionId, ttlMs, secure) {
  const maxAge = Math.floor(ttlMs / 1000);
  return [
    `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${maxAge}`,
    secure ? "Secure" : null
  ].filter(Boolean).join("; ");
}

function expiredCookie(secure) {
  return [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    "Max-Age=0",
    secure ? "Secure" : null
  ].filter(Boolean).join("; ");
}

export function createWebHandler({
  publicDirectory = DEFAULT_PUBLIC_DIRECTORY,
  apiInternalUrl = process.env.API_INTERNAL_URL ?? "http://localhost:4000",
  apiAdminToken = process.env.DEV_ADMIN_TOKEN,
  enableAdminUi = process.env.ENABLE_ADMIN_UI === "true",
  adminAccessKey = process.env.WEB_ADMIN_ACCESS_KEY,
  sessionTtlMs = Number.parseInt(process.env.WEB_ADMIN_SESSION_TTL_MINUTES ?? "480", 10) * 60 * 1000,
  secureCookie = process.env.WEB_COOKIE_SECURE === "true",
  fetchImpl = fetch,
  now = () => Date.now(),
  logger = console
} = {}) {
  if (enableAdminUi) {
    if (typeof adminAccessKey !== "string" || adminAccessKey.length < 24) {
      throw new Error("WEB_ADMIN_ACCESS_KEY debe tener al menos 24 caracteres.");
    }
    if (typeof apiAdminToken !== "string" || apiAdminToken.length < 32) {
      throw new Error("DEV_ADMIN_TOKEN debe tener al menos 32 caracteres para el proxy privado.");
    }
  }
  if (!Number.isFinite(sessionTtlMs) || sessionTtlMs < 5 * 60 * 1000 || sessionTtlMs > 24 * 60 * 60 * 1000) {
    throw new Error("La sesión administrativa debe durar entre 5 minutos y 24 horas.");
  }

  const sessions = new Map();

  function cleanSessions() {
    const current = now();
    for (const [id, session] of sessions) {
      if (session.expiresAt <= current) sessions.delete(id);
    }
  }

  function currentSession(request) {
    cleanSessions();
    const id = parseCookies(request.headers.cookie).get(SESSION_COOKIE);
    if (!id) return null;
    const session = sessions.get(id);
    if (!session || session.expiresAt <= now()) {
      sessions.delete(id);
      return null;
    }
    return { id, ...session };
  }

  async function proxyHealth(response) {
    try {
      const upstream = await fetchImpl(`${apiInternalUrl}/health`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(2500)
      });
      const body = await upstream.text();
      response.writeHead(upstream.status, securityHeaders({
        "Content-Type": "application/json; charset=utf-8"
      }));
      response.end(body);
    } catch {
      sendJson(response, 503, { status: "unavailable" });
    }
  }

  async function proxyProvider(request, response, upstreamPath) {
    if (request.method !== "POST") {
      sendJson(response, 405, { error: "METHOD_NOT_ALLOWED" }, { Allow: "POST" });
      return;
    }

    const body = await readBody(request);
    if (!String(request.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) {
      sendJson(response, 415, { error: "UNSUPPORTED_MEDIA_TYPE", message: "El cuerpo debe ser JSON." });
      return;
    }

    try {
      const upstream = await fetchImpl(new URL(upstreamPath, apiInternalUrl), {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json"
        },
        body,
        signal: AbortSignal.timeout(10000)
      });
      const responseBody = await upstream.text();
      response.writeHead(upstream.status, securityHeaders({
        "Content-Type": "application/json; charset=utf-8"
      }));
      response.end(responseBody);
    } catch (error) {
      logger.error("No se pudo contactar con la API de incorporación.", error);
      sendJson(response, 502, {
        error: "API_UNAVAILABLE",
        message: "El servicio de activación no responde. Inténtalo de nuevo en unos minutos."
      });
    }
  }

  async function proxyAdmin(request, response, url) {
    if (!currentSession(request)) {
      sendJson(response, 401, { error: "UNAUTHORIZED", message: "La sesión administrativa ha caducado." });
      return;
    }

    const upstreamPath = url.pathname.replace(/^\/internal\/admin/, "/api/admin");
    const target = new URL(`${upstreamPath}${url.search}`, apiInternalUrl);
    let body;
    if (!["GET", "HEAD"].includes(request.method ?? "GET")) body = await readBody(request);

    try {
      const upstream = await fetchImpl(target, {
        method: request.method,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${apiAdminToken}`,
          ...(body?.length ? { "Content-Type": "application/json" } : {})
        },
        ...(body?.length ? { body } : {}),
        signal: AbortSignal.timeout(6000)
      });
      const responseBody = await upstream.text();
      response.writeHead(upstream.status, securityHeaders({
        "Content-Type": "application/json; charset=utf-8"
      }));
      response.end(responseBody);
    } catch (error) {
      logger.error("No se pudo contactar con la API interna.", error);
      sendJson(response, 502, { error: "API_UNAVAILABLE", message: "La API interna no responde." });
    }
  }

  return async function webHandler(request, response) {
    const url = new URL(request.url ?? "/", "http://localhost");

    try {
      if (request.method === "GET" && url.pathname === "/internal/api-health") {
        await proxyHealth(response);
        return;
      }

      const providerUpstreamPath = PROVIDER_PROXY_ROUTES.get(url.pathname);
      if (providerUpstreamPath) {
        await proxyProvider(request, response, providerUpstreamPath);
        return;
      }

      if (url.pathname === "/internal/admin/session") {
        if (!enableAdminUi) {
          sendJson(response, 404, { error: "NOT_FOUND" });
          return;
        }

        if (request.method === "GET") {
          const session = currentSession(request);
          sendJson(response, session ? 200 : 401, {
            authenticated: Boolean(session),
            expiresAt: session ? new Date(session.expiresAt).toISOString() : null
          });
          return;
        }

        if (request.method === "POST") {
          const input = await readJson(request);
          if (!secureEquals(input.accessKey, adminAccessKey)) {
            sendJson(response, 401, { error: "INVALID_ACCESS", message: "La clave de acceso no es correcta." });
            return;
          }

          cleanSessions();
          const sessionId = randomBytes(32).toString("base64url");
          sessions.set(sessionId, { expiresAt: now() + sessionTtlMs });
          sendJson(response, 201, {
            authenticated: true,
            expiresAt: new Date(now() + sessionTtlMs).toISOString()
          }, { "Set-Cookie": adminCookie(sessionId, sessionTtlMs, secureCookie) });
          return;
        }

        if (request.method === "DELETE") {
          const session = currentSession(request);
          if (session) sessions.delete(session.id);
          sendJson(response, 200, { authenticated: false }, {
            "Set-Cookie": expiredCookie(secureCookie)
          });
          return;
        }

        sendJson(response, 405, { error: "METHOD_NOT_ALLOWED" }, { Allow: "GET,POST,DELETE" });
        return;
      }

      if (ADMIN_PROXY_PATTERN.test(url.pathname)) {
        if (!enableAdminUi) {
          sendJson(response, 404, { error: "NOT_FOUND" });
          return;
        }
        await proxyAdmin(request, response, url);
        return;
      }

      if (url.pathname.startsWith("/admin/") && !enableAdminUi) {
        sendText(response, 404, "No encontrado");
        return;
      }

      if (!["GET", "HEAD"].includes(request.method ?? "GET")) {
        sendText(response, 404, "No encontrado");
        return;
      }

      const filePath = safeStaticPath(publicDirectory, url.pathname);
      if (!filePath) {
        sendText(response, 404, "No encontrado");
        return;
      }

      try {
        const content = await readFile(filePath);
        response.writeHead(200, securityHeaders({
          "Content-Type": CONTENT_TYPES.get(extname(filePath)) ?? "application/octet-stream",
          "Content-Security-Policy": "default-src 'self'; connect-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; form-action 'self'; base-uri 'none'",
          "Cross-Origin-Opener-Policy": "same-origin"
        }));
        response.end(request.method === "HEAD" ? undefined : content);
      } catch {
        sendText(response, 404, "No encontrado");
      }
    } catch (error) {
      const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;
      if (statusCode >= 500) logger.error("Error atendiendo la web fuente.", error);
      sendJson(response, statusCode, {
        error: statusCode >= 500 ? "INTERNAL_ERROR" : "INVALID_REQUEST",
        message: statusCode >= 500 ? "No se pudo completar la operación." : error.message
      });
    }
  };
}

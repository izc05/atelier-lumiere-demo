import { DatabaseUnavailableError } from "./database.mjs";
import { ServiceError } from "./providers-service.mjs";

const MAX_JSON_BODY_BYTES = 16 * 1024;
const ROUTES = new Set([
  "/api/admin-auth/password",
  "/api/admin-auth/second-factor",
  "/api/admin-auth/me",
  "/api/admin-auth/logout"
]);

function sendJson(response, statusCode, body, headers = {}) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    ...headers
  });
  response.end(JSON.stringify(body));
}

function bearerToken(request) {
  const authorization = request.headers.authorization;
  if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) return null;
  return authorization.slice(7).trim();
}

async function readJson(request) {
  const contentType = String(request.headers["content-type"] ?? "").split(";", 1)[0].trim();
  if (contentType !== "application/json") {
    throw new ServiceError("UNSUPPORTED_MEDIA_TYPE", "El cuerpo debe enviarse como application/json.", 415);
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_JSON_BODY_BYTES) {
      throw new ServiceError("BODY_TOO_LARGE", "La petición supera 16 KB.", 413);
    }
    chunks.push(chunk);
  }
  try {
    const value = size ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
    if (!value || Array.isArray(value) || typeof value !== "object") throw new Error();
    return value;
  } catch {
    throw new ServiceError("INVALID_JSON", "El cuerpo JSON no es válido.", 400);
  }
}

function errorPayload(error) {
  if (error instanceof ServiceError) {
    return {
      statusCode: error.statusCode,
      body: {
        error: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {})
      }
    };
  }
  if (error instanceof DatabaseUnavailableError) {
    return { statusCode: 503, body: { error: error.code, message: error.message } };
  }
  return {
    statusCode: 500,
    body: { error: "INTERNAL_ERROR", message: "No se pudo completar el acceso administrativo." }
  };
}

export function createAdminAuthApiHandler({
  baseHandler,
  adminAuthService,
  logger = console
} = {}) {
  if (typeof baseHandler !== "function") {
    throw new TypeError("La API administrativa necesita el handler principal.");
  }

  return async function adminAuthApiHandler(request, response) {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (!ROUTES.has(url.pathname)) return baseHandler(request, response);

    try {
      if (request.method === "OPTIONS") {
        response.writeHead(204, {
          Allow: "GET,POST,OPTIONS",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff"
        });
        response.end();
        return;
      }
      if (!adminAuthService) {
        throw new DatabaseUnavailableError("La autenticación administrativa no está habilitada.");
      }

      if (url.pathname === "/api/admin-auth/password") {
        if (request.method !== "POST") {
          sendJson(response, 405, { error: "METHOD_NOT_ALLOWED", message: "Esta ruta solo admite POST." }, { Allow: "POST,OPTIONS" });
          return;
        }
        const result = await adminAuthService.start(await readJson(request));
        sendJson(response, 200, result);
        return;
      }

      if (url.pathname === "/api/admin-auth/second-factor") {
        if (request.method !== "POST") {
          sendJson(response, 405, { error: "METHOD_NOT_ALLOWED", message: "Esta ruta solo admite POST." }, { Allow: "POST,OPTIONS" });
          return;
        }
        const result = await adminAuthService.complete(await readJson(request), {
          userAgent: request.headers["user-agent"]
        });
        sendJson(response, 200, result);
        return;
      }

      const token = bearerToken(request);
      if (url.pathname === "/api/admin-auth/me") {
        if (request.method !== "GET") {
          sendJson(response, 405, { error: "METHOD_NOT_ALLOWED", message: "Esta ruta solo admite GET." }, { Allow: "GET,OPTIONS" });
          return;
        }
        const context = await adminAuthService.authenticate(token);
        if (!context) {
          sendJson(response, 401, { error: "UNAUTHORIZED", message: "La sesión administrativa no es válida o ha caducado." });
          return;
        }
        sendJson(response, 200, {
          authenticated: true,
          account: {
            id: context.userId,
            email: context.email,
            displayName: context.displayName,
            role: context.adminRole
          },
          expiresAt: context.expiresAt
        });
        return;
      }

      if (request.method !== "POST") {
        sendJson(response, 405, { error: "METHOD_NOT_ALLOWED", message: "Esta ruta solo admite POST." }, { Allow: "POST,OPTIONS" });
        return;
      }
      await adminAuthService.logout(token);
      sendJson(response, 200, { authenticated: false });
    } catch (error) {
      const payload = errorPayload(error);
      if (payload.statusCode >= 500) {
        logger.error("Error en una ruta de autenticación administrativa.", {
          method: request.method,
          path: url.pathname,
          errorCode: typeof error?.code === "string" ? error.code : "INTERNAL_ERROR"
        });
      }
      sendJson(response, payload.statusCode, payload.body);
    }
  };
}

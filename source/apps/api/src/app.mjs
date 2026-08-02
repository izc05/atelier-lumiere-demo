import { DatabaseUnavailableError } from "./database.mjs";
import { ServiceError } from "./providers-service.mjs";

const BRAND = "Atelier Lumière";
const MAX_JSON_BODY_BYTES = 64 * 1024;
const PROVIDER_ROUTE = /^\/api\/admin\/providers\/([0-9a-f-]+)\/(status|invitations|audit)$/i;

function sendJson(response, statusCode, body, extraHeaders = {}) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    ...extraHeaders
  });
  response.end(JSON.stringify(body));
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
      throw new ServiceError("BODY_TOO_LARGE", "El cuerpo de la petición supera 64 KB.", 413);
    }
    chunks.push(chunk);
  }

  if (size === 0) return {};
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!value || Array.isArray(value) || typeof value !== "object") {
      throw new Error("El JSON debe ser un objeto.");
    }
    return value;
  } catch {
    throw new ServiceError("INVALID_JSON", "El cuerpo JSON no es válido.", 400);
  }
}

function adminOnly(context) {
  if (!context) {
    throw new ServiceError("UNAUTHORIZED", "Debes iniciar sesión.", 401);
  }
  if (context.role !== "ADMIN") {
    throw new ServiceError("FORBIDDEN", "Esta operación requiere administración.", 403);
  }
  return context;
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
    return {
      statusCode: 503,
      body: { error: error.code, message: error.message }
    };
  }

  return {
    statusCode: 500,
    body: {
      error: "INTERNAL_ERROR",
      message: "No se pudo completar la operación."
    }
  };
}

export function createApiHandler({
  version = "0.2.0",
  environment = process.env.NODE_ENV ?? "development",
  now = () => new Date(),
  database,
  providersService,
  authenticateRequest = async () => null,
  logger = console
} = {}) {
  return async function apiHandler(request, response) {
    const url = new URL(request.url ?? "/", "http://localhost");

    try {
      if (request.method === "OPTIONS") {
        response.writeHead(204, {
          Allow: "GET,POST,PATCH,OPTIONS",
          "Cache-Control": "no-store"
        });
        response.end();
        return;
      }

      if (request.method === "GET" && url.pathname === "/health") {
        const databaseReady = Boolean(database?.enabled) && (await database.ping());
        sendJson(response, databaseReady ? 200 : 503, {
          status: databaseReady ? "ok" : "degraded",
          service: "atelier-lumiere-api",
          version,
          environment,
          database: databaseReady ? "connected" : "unavailable",
          timestamp: now().toISOString()
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/meta") {
        sendJson(response, 200, {
          brand: BRAND,
          mode: "source-runtime",
          publicDemoProtected: true,
          capabilities: {
            database: Boolean(database?.enabled),
            authentication: false,
            developmentAdminAccess: environment !== "production",
            providerIsolation: Boolean(database?.enabled),
            providerManagementApi: Boolean(providersService),
            mediaStorage: false,
            editorialBlog: false
          }
        });
        return;
      }

      if (!url.pathname.startsWith("/api/admin/")) {
        sendJson(response, 404, {
          error: "NOT_FOUND",
          message: "Ruta no disponible."
        });
        return;
      }

      if (!providersService) {
        throw new DatabaseUnavailableError("El servicio de proveedores no está configurado.");
      }

      const context = adminOnly(await authenticateRequest(request));

      if (url.pathname === "/api/admin/providers" && request.method === "GET") {
        const providers = await providersService.list(context);
        sendJson(response, 200, { providers });
        return;
      }

      if (url.pathname === "/api/admin/providers" && request.method === "POST") {
        const input = await readJson(request);
        const created = await providersService.create(context, input);
        const responseBody = {
          provider: created.provider,
          invitation: created.invitation,
          delivery: environment === "production" ? "pending-email-service" : "manual-development"
        };
        if (environment !== "production") {
          responseBody.activationToken = created.token;
          responseBody.activationPath = `/proveedor/activar?token=${encodeURIComponent(created.token)}`;
        }
        sendJson(response, 201, responseBody);
        return;
      }

      const routeMatch = url.pathname.match(PROVIDER_ROUTE);
      if (routeMatch) {
        const [, providerId, action] = routeMatch;

        if (action === "status" && request.method === "PATCH") {
          const input = await readJson(request);
          const provider = await providersService.setStatus(context, providerId, input.status);
          sendJson(response, 200, { provider });
          return;
        }

        if (action === "invitations" && request.method === "POST") {
          const input = await readJson(request);
          const renewed = await providersService.renewInvitation(context, providerId, input);
          const responseBody = {
            invitation: renewed.invitation,
            delivery: environment === "production" ? "pending-email-service" : "manual-development"
          };
          if (environment !== "production") {
            responseBody.activationToken = renewed.token;
            responseBody.activationPath = `/proveedor/activar?token=${encodeURIComponent(renewed.token)}`;
          }
          sendJson(response, 201, responseBody);
          return;
        }

        if (action === "audit" && request.method === "GET") {
          const events = await providersService.audit(context, providerId, url.searchParams.get("limit") ?? "50");
          sendJson(response, 200, { events });
          return;
        }
      }

      sendJson(
        response,
        405,
        { error: "METHOD_NOT_ALLOWED", message: "Método no permitido para esta ruta." },
        { Allow: "GET,POST,PATCH,OPTIONS" }
      );
    } catch (error) {
      const payload = errorPayload(error);
      if (payload.statusCode >= 500) {
        logger.error("Error atendiendo una petición de la API.", {
          method: request.method,
          path: url.pathname,
          error
        });
      }
      sendJson(response, payload.statusCode, payload.body);
    }
  };
}

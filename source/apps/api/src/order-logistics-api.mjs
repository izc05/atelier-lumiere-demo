import { ServiceError } from "./providers-service.mjs";

const ROUTE_PATTERN = /^\/api\/(provider|customer)\/orders\/([0-9a-f-]{36})\/(shipments|incidents)(?:\/([0-9a-f-]{36}))?$/i;
const MAX_BODY_BYTES = 128 * 1024;

function sendJson(response, statusCode, payload, extraHeaders = {}) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    ...extraHeaders
  });
  response.end(JSON.stringify(payload));
}

async function readJson(request) {
  const contentType = String(request.headers?.["content-type"] ?? "").toLowerCase();
  if (!contentType.startsWith("application/json")) {
    throw new ServiceError("UNSUPPORTED_MEDIA_TYPE", "El cuerpo debe enviarse como JSON.", 415);
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      throw new ServiceError("BODY_TOO_LARGE", "La solicitud es demasiado grande.", 413);
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!body || Array.isArray(body) || typeof body !== "object") throw new Error();
    return body;
  } catch {
    throw new ServiceError("INVALID_JSON", "La solicitud no contiene JSON válido.", 400);
  }
}

function bearer(request) {
  const authorization = request.headers?.authorization;
  if (typeof authorization !== "string") return null;
  return authorization.match(/^Bearer\s+([A-Za-z0-9_-]{32,180})$/)?.[1] ?? null;
}

function handleError(response, error, logger) {
  if (error instanceof ServiceError) {
    sendJson(response, error.statusCode, {
      error: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details })
    });
    return;
  }
  logger.error("Error no controlado en seguimiento e incidencias.", {
    code: typeof error?.code === "string" ? error.code : "ORDER_LOGISTICS_API_FAILED"
  });
  sendJson(response, 500, {
    error: "INTERNAL_ERROR",
    message: "No se ha podido completar la operación."
  });
}

export function createOrderLogisticsApiHandler({
  baseHandler,
  orderLogisticsService,
  providerAuthService,
  customerAuthService,
  logger = console
} = {}) {
  if (typeof baseHandler !== "function") {
    throw new TypeError("createOrderLogisticsApiHandler necesita un handler base.");
  }

  return async function orderLogisticsApiHandler(request, response) {
    const url = new URL(request.url ?? "/", "http://localhost");
    const match = url.pathname.match(ROUTE_PATTERN);
    if (!match) return baseHandler(request, response);

    try {
      if (!orderLogisticsService || !providerAuthService || !customerAuthService) {
        throw new ServiceError("SERVICE_UNAVAILABLE", "El seguimiento todavía no está disponible.", 503);
      }

      const [, rawActor, orderId, resource, resourceId] = match;
      const actor = rawActor.toLowerCase();
      const token = bearer(request);
      const authService = actor === "provider" ? providerAuthService : customerAuthService;
      const session = token ? await authService.authenticate(token) : null;
      if (!session) {
        throw new ServiceError("UNAUTHORIZED", "La sesión no es válida o ha caducado.", 401);
      }
      const context = session.context;
      const method = request.method ?? "GET";

      if (!resourceId && method === "GET") {
        if (resource === "shipments") {
          sendJson(response, 200, {
            shipments: await orderLogisticsService.listShipments(context, orderId)
          });
          return;
        }
        sendJson(response, 200, {
          incidents: await orderLogisticsService.listIncidents(context, orderId)
        });
        return;
      }

      if (actor === "provider" && resource === "shipments") {
        if (!resourceId && method === "POST") {
          sendJson(response, 201, {
            shipment: await orderLogisticsService.createShipment(
              context,
              orderId,
              await readJson(request)
            )
          });
          return;
        }
        if (resourceId && method === "PATCH") {
          sendJson(response, 200, {
            shipment: await orderLogisticsService.updateShipment(
              context,
              orderId,
              resourceId,
              await readJson(request)
            )
          });
          return;
        }
      }

      if (resource === "incidents") {
        if (!resourceId && method === "POST") {
          sendJson(response, 201, {
            incident: await orderLogisticsService.createIncident(
              context,
              orderId,
              await readJson(request)
            )
          });
          return;
        }
        if (actor === "provider" && resourceId && method === "PATCH") {
          sendJson(response, 200, {
            incident: await orderLogisticsService.updateIncident(
              context,
              orderId,
              resourceId,
              await readJson(request)
            )
          });
          return;
        }
      }

      sendJson(response, 405, {
        error: "METHOD_NOT_ALLOWED",
        message: "Método no permitido."
      }, { Allow: actor === "provider" ? "GET,POST,PATCH" : "GET,POST" });
    } catch (error) {
      handleError(response, error, logger);
    }
  };
}

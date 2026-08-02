import { ServiceError } from "./providers-service.mjs";

const ORDER_PATH = /^\/api\/provider\/orders\/([0-9a-f-]{36})(?:\/(transitions))?$/i;
const CUSTOM_PATH = /^\/api\/provider\/custom-requests\/([0-9a-f-]{36})(?:\/(messages|transitions))?$/i;
const MAX_BODY_BYTES = 128 * 1024;

function sendJson(response, statusCode, body, extraHeaders = {}) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    ...extraHeaders
  });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const contentType = String(request.headers?.["content-type"] ?? "").toLowerCase();
  if (!contentType.startsWith("application/json")) {
    throw new ServiceError(
      "UNSUPPORTED_MEDIA_TYPE",
      "El cuerpo debe enviarse como JSON.",
      415
    );
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
    const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!payload || Array.isArray(payload) || typeof payload !== "object") throw new Error();
    return payload;
  } catch {
    throw new ServiceError("INVALID_JSON", "La solicitud no contiene JSON válido.", 400);
  }
}

function bearerToken(request) {
  const authorization = request.headers?.authorization;
  if (typeof authorization !== "string") return null;
  const match = authorization.match(/^Bearer\s+([A-Za-z0-9_-]{32,180})$/);
  return match?.[1] ?? null;
}

function apiError(response, error, logger) {
  if (error instanceof ServiceError) {
    sendJson(response, error.statusCode, {
      error: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details })
    });
    return;
  }
  logger.error("Error no controlado en la API de pedidos del proveedor.", {
    code: typeof error?.code === "string" ? error.code : "PROVIDER_ORDERS_API_FAILED"
  });
  sendJson(response, 500, {
    error: "INTERNAL_ERROR",
    message: "No se ha podido completar la operación."
  });
}

export function createProviderOrdersApiHandler({
  baseHandler,
  providerOrdersService,
  providerAuthService,
  logger = console
} = {}) {
  if (typeof baseHandler !== "function") {
    throw new TypeError("createProviderOrdersApiHandler necesita un handler base.");
  }

  return async function providerOrdersApiHandler(request, response) {
    const url = new URL(request.url ?? "/", "http://localhost");
    const orderCollection = url.pathname === "/api/provider/orders";
    const customCollection = url.pathname === "/api/provider/custom-requests";
    const orderMatch = url.pathname.match(ORDER_PATH);
    const customMatch = url.pathname.match(CUSTOM_PATH);

    if (!orderCollection && !customCollection && !orderMatch && !customMatch) {
      return baseHandler(request, response);
    }

    try {
      if (!providerOrdersService || !providerAuthService) {
        throw new ServiceError(
          "SERVICE_UNAVAILABLE",
          "Los pedidos todavía no están disponibles.",
          503
        );
      }

      const token = bearerToken(request);
      const session = token ? await providerAuthService.authenticate(token) : null;
      if (!session) {
        throw new ServiceError(
          "UNAUTHORIZED",
          "Necesitas iniciar sesión como proveedor.",
          401
        );
      }
      const context = session.context;

      if (orderCollection && request.method === "GET") {
        sendJson(response, 200, {
          orders: await providerOrdersService.list(context, {
            status: url.searchParams.get("status") || undefined,
            query: url.searchParams.get("query") || undefined
          })
        });
        return;
      }

      if (customCollection && request.method === "GET") {
        sendJson(response, 200, {
          requests: await providerOrdersService.listCustomRequests(context, {
            status: url.searchParams.get("status") || undefined,
            query: url.searchParams.get("query") || undefined
          })
        });
        return;
      }

      if (orderMatch) {
        const [, orderId, action] = orderMatch;
        if (!action && request.method === "GET") {
          sendJson(response, 200, await providerOrdersService.get(context, orderId));
          return;
        }
        if (action === "transitions" && request.method === "POST") {
          sendJson(response, 200, {
            order: await providerOrdersService.transition(
              context,
              orderId,
              await readJson(request)
            )
          });
          return;
        }
      }

      if (customMatch) {
        const [, requestId, action] = customMatch;
        if (!action && request.method === "GET") {
          sendJson(response, 200, await providerOrdersService.getCustomRequest(context, requestId));
          return;
        }
        if (action === "messages" && request.method === "POST") {
          sendJson(response, 201, {
            message: await providerOrdersService.addCustomMessage(
              context,
              requestId,
              await readJson(request)
            )
          });
          return;
        }
        if (action === "transitions" && request.method === "POST") {
          sendJson(response, 200, {
            request: await providerOrdersService.transitionCustomRequest(
              context,
              requestId,
              await readJson(request)
            )
          });
          return;
        }
      }

      sendJson(response, 405, {
        error: "METHOD_NOT_ALLOWED",
        message: "Método no permitido."
      }, { Allow: "GET,POST" });
    } catch (error) {
      apiError(response, error, logger);
    }
  };
}

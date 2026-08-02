import { ServiceError } from "./providers-service.mjs";

const ORDER_PATH = /^\/api\/customer\/orders\/([0-9a-f-]{36})(?:\/(cancel))?$/i;
const REQUEST_PATH = /^\/api\/customer\/custom-requests\/([0-9a-f-]{36})(?:\/(messages|approve))?$/i;
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
  const type = String(request.headers?.["content-type"] ?? "").toLowerCase();
  if (!type.startsWith("application/json")) {
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
  const value = request.headers?.authorization;
  if (typeof value !== "string") return null;
  return value.match(/^Bearer\s+([A-Za-z0-9_-]{32,180})$/)?.[1] ?? null;
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
  logger.error("Error no controlado en la API de pedidos del cliente.", {
    code: typeof error?.code === "string" ? error.code : "CUSTOMER_ORDERS_API_FAILED"
  });
  sendJson(response, 500, {
    error: "INTERNAL_ERROR",
    message: "No se ha podido completar la operación."
  });
}

export function createCustomerOrdersApiHandler({
  baseHandler,
  customerAuthService,
  customerOrdersService,
  logger = console
} = {}) {
  if (typeof baseHandler !== "function") {
    throw new TypeError("createCustomerOrdersApiHandler necesita un handler base.");
  }

  return async function customerOrdersApiHandler(request, response) {
    const url = new URL(request.url ?? "/", "http://localhost");
    const accessConsume = url.pathname === "/api/customer/access/consume";
    const sessionPath = url.pathname === "/api/customer/session";
    const orderCollection = url.pathname === "/api/customer/orders";
    const orderMatch = url.pathname.match(ORDER_PATH);
    const requestMatch = url.pathname.match(REQUEST_PATH);

    if (!accessConsume && !sessionPath && !orderCollection && !orderMatch && !requestMatch) {
      return baseHandler(request, response);
    }

    try {
      if (!customerAuthService || !customerOrdersService) {
        throw new ServiceError(
          "SERVICE_UNAVAILABLE",
          "El acceso a pedidos no está disponible.",
          503
        );
      }

      if (accessConsume) {
        if (request.method !== "POST") {
          sendJson(response, 405, { error: "METHOD_NOT_ALLOWED", message: "Método no permitido." }, { Allow: "POST" });
          return;
        }
        const body = await readJson(request);
        const result = await customerAuthService.consumeAccess(body.token, {
          userAgent: String(request.headers?.["user-agent"] ?? "")
        });
        sendJson(response, 200, result);
        return;
      }

      const sessionToken = bearer(request);
      const session = sessionToken ? await customerAuthService.authenticate(sessionToken) : null;
      if (!session) {
        throw new ServiceError("UNAUTHORIZED", "La sesión no es válida o ha caducado.", 401);
      }
      const context = session.context;

      if (sessionPath) {
        if (request.method === "GET") {
          sendJson(response, 200, { user: session.user, session: session.session });
          return;
        }
        if (request.method === "DELETE") {
          await customerAuthService.revoke(sessionToken);
          sendJson(response, 200, { revoked: true });
          return;
        }
      }

      if (orderCollection && request.method === "GET") {
        sendJson(response, 200, { orders: await customerOrdersService.list(context) });
        return;
      }

      if (orderMatch) {
        const [, orderId, action] = orderMatch;
        if (!action && request.method === "GET") {
          sendJson(response, 200, await customerOrdersService.get(context, orderId));
          return;
        }
        if (action === "cancel" && request.method === "POST") {
          sendJson(response, 200, {
            order: await customerOrdersService.cancelOrder(context, orderId, await readJson(request))
          });
          return;
        }
      }

      if (requestMatch) {
        const [, requestId, action] = requestMatch;
        if (!action && request.method === "GET") {
          sendJson(response, 200, await customerOrdersService.getCustomRequest(context, requestId));
          return;
        }
        if (action === "messages" && request.method === "POST") {
          sendJson(response, 201, {
            message: await customerOrdersService.addCustomMessage(context, requestId, await readJson(request))
          });
          return;
        }
        if (action === "approve" && request.method === "POST") {
          sendJson(response, 200, {
            request: await customerOrdersService.approveQuote(context, requestId, await readJson(request))
          });
          return;
        }
      }

      sendJson(response, 405, {
        error: "METHOD_NOT_ALLOWED",
        message: "Método no permitido."
      }, { Allow: "GET,POST,DELETE" });
    } catch (error) {
      handleError(response, error, logger);
    }
  };
}

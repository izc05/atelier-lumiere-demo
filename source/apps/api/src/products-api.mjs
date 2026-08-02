import { ServiceError } from "./providers-service.mjs";

const PRODUCT_PATH = /^\/api\/provider\/products\/([0-9a-f-]{36})(?:\/(events|personalizations|submit))?$/i;
const MAX_BODY_BYTES = 1024 * 1024;

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      throw new ServiceError("BODY_TOO_LARGE", "La solicitud es demasiado grande.", 413);
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
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
  logger.error("Error no controlado en la API de artículos.", {
    code: typeof error?.code === "string" ? error.code : "PRODUCT_API_FAILED"
  });
  sendJson(response, 500, {
    error: "INTERNAL_ERROR",
    message: "No se ha podido completar la operación."
  });
}

export function createProductsApiHandler({
  baseHandler,
  productsService,
  providerAuthService,
  logger = console
} = {}) {
  if (typeof baseHandler !== "function") {
    throw new TypeError("createProductsApiHandler necesita un handler base.");
  }

  return async function productsApiHandler(request, response) {
    const url = new URL(request.url ?? "/", "http://localhost");
    const isCollection = url.pathname === "/api/provider/products";
    const match = url.pathname.match(PRODUCT_PATH);

    if (!isCollection && !match) {
      return baseHandler(request, response);
    }

    try {
      if (!productsService || !providerAuthService) {
        throw new ServiceError("SERVICE_UNAVAILABLE", "El catálogo todavía no está disponible.", 503);
      }

      const token = bearerToken(request);
      const session = token ? await providerAuthService.authenticate(token) : null;
      if (!session) {
        throw new ServiceError("UNAUTHORIZED", "Necesitas iniciar sesión como proveedor.", 401);
      }
      const context = session.context;

      if (isCollection && request.method === "GET") {
        const products = await productsService.list(context);
        sendJson(response, 200, { products });
        return;
      }

      if (isCollection && request.method === "POST") {
        const product = await productsService.create(context, await readJson(request));
        sendJson(response, 201, { product });
        return;
      }

      const [, productId, action] = match;
      if (!action && request.method === "GET") {
        const product = await productsService.get(context, productId);
        sendJson(response, 200, { product });
        return;
      }

      if (!action && request.method === "PATCH") {
        const product = await productsService.update(context, productId, await readJson(request));
        sendJson(response, 200, { product });
        return;
      }

      if (action === "events" && request.method === "PUT") {
        const events = await productsService.replaceEvents(context, productId, await readJson(request));
        sendJson(response, 200, { events });
        return;
      }

      if (action === "personalizations" && request.method === "PUT") {
        const personalizations = await productsService.replacePersonalizations(
          context,
          productId,
          await readJson(request)
        );
        sendJson(response, 200, { personalizations });
        return;
      }

      if (action === "submit" && request.method === "POST") {
        const result = await productsService.submit(context, productId, await readJson(request));
        sendJson(response, 200, result);
        return;
      }

      sendJson(response, 405, {
        error: "METHOD_NOT_ALLOWED",
        message: "Método no permitido."
      });
    } catch (error) {
      apiError(response, error, logger);
    }
  };
}

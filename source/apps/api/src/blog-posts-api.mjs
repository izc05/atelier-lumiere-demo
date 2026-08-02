import { ServiceError } from "./providers-service.mjs";

const POST_PATH = /^\/api\/provider\/blog-posts\/([0-9a-f-]{36})(?:\/(tags|products|submit))?$/i;
const MAX_BODY_BYTES = 2 * 1024 * 1024;

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
  logger.error("Error no controlado en la API editorial del proveedor.", {
    code: typeof error?.code === "string" ? error.code : "BLOG_POST_API_FAILED"
  });
  sendJson(response, 500, {
    error: "INTERNAL_ERROR",
    message: "No se ha podido completar la operación."
  });
}

export function createBlogPostsApiHandler({
  baseHandler,
  blogPostsService,
  providerAuthService,
  logger = console
} = {}) {
  if (typeof baseHandler !== "function") {
    throw new TypeError("createBlogPostsApiHandler necesita un handler base.");
  }

  return async function blogPostsApiHandler(request, response) {
    const url = new URL(request.url ?? "/", "http://localhost");
    const isCollection = url.pathname === "/api/provider/blog-posts";
    const match = url.pathname.match(POST_PATH);
    if (!isCollection && !match) return baseHandler(request, response);

    try {
      if (!blogPostsService || !providerAuthService) {
        throw new ServiceError("SERVICE_UNAVAILABLE", "El blog todavía no está disponible.", 503);
      }
      const token = bearerToken(request);
      const session = token ? await providerAuthService.authenticate(token) : null;
      if (!session) {
        throw new ServiceError("UNAUTHORIZED", "Necesitas iniciar sesión como proveedor.", 401);
      }
      const context = session.context;

      if (isCollection && request.method === "GET") {
        sendJson(response, 200, { posts: await blogPostsService.list(context) });
        return;
      }
      if (isCollection && request.method === "POST") {
        sendJson(response, 201, { post: await blogPostsService.create(context, await readJson(request)) });
        return;
      }

      const [, postId, action] = match;
      if (!action && request.method === "GET") {
        sendJson(response, 200, { post: await blogPostsService.get(context, postId) });
        return;
      }
      if (!action && request.method === "PATCH") {
        sendJson(response, 200, {
          post: await blogPostsService.update(context, postId, await readJson(request))
        });
        return;
      }
      if (action === "tags" && request.method === "PUT") {
        sendJson(response, 200, {
          tags: await blogPostsService.replaceTags(context, postId, await readJson(request))
        });
        return;
      }
      if (action === "products" && request.method === "PUT") {
        sendJson(response, 200, {
          productIds: await blogPostsService.replaceProducts(context, postId, await readJson(request))
        });
        return;
      }
      if (action === "submit" && request.method === "POST") {
        sendJson(response, 200, await blogPostsService.submit(context, postId, await readJson(request)));
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

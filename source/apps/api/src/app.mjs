const BRAND = "Atelier Lumière";

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer"
  });
  response.end(JSON.stringify(body));
}

export function createApiHandler({
  version = "0.1.0",
  environment = process.env.NODE_ENV ?? "development",
  now = () => new Date()
} = {}) {
  return function apiHandler(request, response) {
    const url = new URL(request.url ?? "/", "http://localhost");

    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        Allow: "GET,OPTIONS",
        "Cache-Control": "no-store"
      });
      response.end();
      return;
    }

    if (request.method === "GET" && url.pathname === "/health") {
      sendJson(response, 200, {
        status: "ok",
        service: "atelier-lumiere-api",
        version,
        environment,
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
          database: false,
          authentication: false,
          providerIsolation: false,
          mediaStorage: false,
          editorialBlog: false
        }
      });
      return;
    }

    sendJson(response, 404, {
      error: "NOT_FOUND",
      message: "Ruta no disponible."
    });
  };
}

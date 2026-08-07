const PROFILE_PATTERN = /^\/internal\/admin\/provider-profiles(?:\/([0-9a-f-]{36})(?:\/(review|publish))?)?$/i;

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

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, securityHeaders({ "Content-Type": "application/json; charset=utf-8" }));
  response.end(JSON.stringify(payload));
}

function sendNotFound(response) {
  response.writeHead(404, securityHeaders({ "Content-Type": "text/plain; charset=utf-8" }));
  response.end("No encontrado");
}

async function adminSessionIsActive(baseHandler, request) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const probeResponse = {
      headersSent: false,
      statusCode: 500,
      writeHead(statusCode) { this.statusCode = statusCode; this.headersSent = true; return this; },
      end() { finish(this.statusCode === 200); },
      destroy() { finish(false); }
    };
    Promise.resolve(baseHandler({ method: "GET", url: "/internal/admin/session", headers: request.headers }, probeResponse))
      .catch(() => finish(false));
  });
}

export function createAdminProviderProfilesWebHandler({
  baseHandler,
  apiInternalUrl = process.env.API_INTERNAL_URL ?? "http://localhost:4000",
  apiAdminToken = process.env.DEV_ADMIN_TOKEN,
  enableAdminUi = process.env.ENABLE_ADMIN_UI === "true",
  fetchImpl = fetch,
  logger = console
} = {}) {
  if (typeof baseHandler !== "function") throw new TypeError("Se necesita un handler base.");
  if (enableAdminUi && (typeof apiAdminToken !== "string" || apiAdminToken.length < 32)) {
    throw new TypeError("DEV_ADMIN_TOKEN debe estar configurado para revisar perfiles.");
  }
  const apiBase = new URL(apiInternalUrl);

  return async function adminProviderProfilesWebHandler(request, response) {
    const url = new URL(request.url ?? "/", "http://localhost");
    const match = url.pathname.match(PROFILE_PATTERN);
    if (match) {
      if (!enableAdminUi) return sendNotFound(response);
      const method = request.method ?? "GET";
      const [, providerId, action] = match;
      const allowed = !providerId ? method === "GET"
        : action ? method === "POST" : method === "GET";
      if (!allowed) return sendJson(response, 405, { error: "METHOD_NOT_ALLOWED", message: "Método no permitido." });
      if (!(await adminSessionIsActive(baseHandler, request))) {
        return sendJson(response, 401, { error: "UNAUTHORIZED", message: "La sesión administrativa ha caducado." });
      }

      const target = new URL(`${url.pathname.replace(/^\/internal/, "/api")}${url.search}`, apiBase);
      try {
        const upstream = await fetchImpl(target, {
          method,
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${apiAdminToken}`,
            ...(!["GET", "HEAD"].includes(method) ? { "Content-Type": "application/json" } : {}),
            "User-Agent": String(request.headers["user-agent"] ?? "").slice(0, 500)
          },
          ...(!["GET", "HEAD"].includes(method) ? { body: request, duplex: "half" } : {}),
          signal: AbortSignal.timeout(12_000)
        });
        const text = await upstream.text();
        response.writeHead(upstream.status, securityHeaders({ "Content-Type": "application/json; charset=utf-8" }));
        response.end(text);
      } catch (error) {
        logger.error("No se pudo completar la revisión de perfiles.", {
          code: typeof error?.code === "string" ? error.code : "ADMIN_PROFILE_PROXY_FAILED"
        });
        sendJson(response, 502, { error: "API_UNAVAILABLE", message: "La revisión de perfiles no responde." });
      }
      return;
    }

    if (["GET", "HEAD"].includes(request.method ?? "GET")
      && (url.pathname === "/admin/talleres" || url.pathname === "/admin/talleres/")) {
      if (!enableAdminUi) return sendNotFound(response);
      if (!(await adminSessionIsActive(baseHandler, request))) {
        response.writeHead(302, securityHeaders({ Location: "/admin/proveedores/" }));
        response.end();
        return;
      }
    }

    return baseHandler(request, response);
  };
}

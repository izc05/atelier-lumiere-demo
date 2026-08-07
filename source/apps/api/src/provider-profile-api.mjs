import { ServiceError } from "./providers-service.mjs";

const ADMIN_DETAIL = /^\/api\/admin\/provider-profiles\/([0-9a-f-]{36})$/i;
const ADMIN_ACTION = /^\/api\/admin\/provider-profiles\/([0-9a-f-]{36})\/(review|publish)$/i;
const MAX_BODY_BYTES = 96 * 1024;

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
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error();
    return parsed;
  } catch {
    throw new ServiceError("INVALID_JSON", "La solicitud no contiene JSON válido.", 400);
  }
}

function bearerToken(request) {
  const value = String(request.headers.authorization ?? "");
  const match = value.match(/^Bearer\s+([A-Za-z0-9_-]{32,180})$/);
  return match?.[1] ?? null;
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
  logger.error("Error no controlado en perfiles editoriales.", {
    code: typeof error?.code === "string" ? error.code : "PROVIDER_PROFILE_API_FAILED"
  });
  sendJson(response, 500, { error: "INTERNAL_ERROR", message: "No se ha podido completar la operación." });
}

export function createProviderProfileApiHandler({
  baseHandler,
  profileService,
  providerAuthService,
  authenticateRequest,
  logger = console
} = {}) {
  if (typeof baseHandler !== "function") {
    throw new TypeError("createProviderProfileApiHandler necesita un handler base.");
  }

  return async function providerProfileApiHandler(request, response) {
    const url = new URL(request.url ?? "/", "http://localhost");
    const providerProfile = url.pathname === "/api/provider/profile";
    const providerSubmit = url.pathname === "/api/provider/profile/submit";
    const adminCollection = url.pathname === "/api/admin/provider-profiles";
    const adminDetail = url.pathname.match(ADMIN_DETAIL);
    const adminAction = url.pathname.match(ADMIN_ACTION);
    if (!providerProfile && !providerSubmit && !adminCollection && !adminDetail && !adminAction) {
      return baseHandler(request, response);
    }

    try {
      if (!profileService) {
        throw new ServiceError("SERVICE_UNAVAILABLE", "El perfil del taller todavía no está disponible.", 503);
      }

      if (providerProfile || providerSubmit) {
        if (!providerAuthService) {
          throw new ServiceError("SERVICE_UNAVAILABLE", "El acceso del taller no está disponible.", 503);
        }
        const token = bearerToken(request);
        const session = token ? await providerAuthService.authenticate(token) : null;
        if (!session) throw new ServiceError("UNAUTHORIZED", "Necesitas iniciar sesión como proveedor.", 401);

        if (providerProfile && request.method === "GET") {
          sendJson(response, 200, { profile: await profileService.get(session.context) });
          return;
        }
        if (providerProfile && request.method === "PATCH") {
          sendJson(response, 200, { profile: await profileService.update(session.context, await readJson(request)) });
          return;
        }
        if (providerSubmit && request.method === "POST") {
          sendJson(response, 200, { profile: await profileService.submit(session.context) });
          return;
        }
        sendJson(response, 405, { error: "METHOD_NOT_ALLOWED", message: "Método no permitido." });
        return;
      }

      if (typeof authenticateRequest !== "function") {
        throw new ServiceError("SERVICE_UNAVAILABLE", "La revisión administrativa no está disponible.", 503);
      }
      const context = await authenticateRequest(request);
      if (!context || context.role !== "ADMIN") {
        throw new ServiceError("UNAUTHORIZED", "Necesitas una sesión administrativa.", 401);
      }

      if (adminCollection && request.method === "GET") {
        const profiles = await profileService.listAdmin(context, {
          status: url.searchParams.get("status") ?? "ALL",
          query: url.searchParams.get("q") ?? ""
        });
        sendJson(response, 200, { profiles });
        return;
      }
      if (adminDetail && request.method === "GET") {
        sendJson(response, 200, { profile: await profileService.getAdmin(context, adminDetail[1]) });
        return;
      }
      if (adminAction && request.method === "POST") {
        const [, providerId, action] = adminAction;
        const profile = action === "review"
          ? await profileService.decide(context, providerId, await readJson(request))
          : await profileService.publish(context, providerId);
        sendJson(response, 200, { profile });
        return;
      }

      sendJson(response, 405, { error: "METHOD_NOT_ALLOWED", message: "Método no permitido." });
    } catch (error) {
      handleError(response, error, logger);
    }
  };
}

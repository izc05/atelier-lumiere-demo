import { ServiceError } from "./providers-service.mjs";

const ADMIN_COLLECTION = "/api/admin/village-zones";
const ADMIN_ZONE = /^\/api\/admin\/village-zones\/(ZONE_\d{2})$/i;
const PUBLIC_COLLECTION = "/api/village-zones";
const MAX_JSON_BYTES = 12 * 1024;

function sendJson(response, statusCode, body, { publicCache = false } = {}) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": publicCache ? "public, max-age=30, stale-while-revalidate=180" : "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_JSON_BYTES) {
      throw new ServiceError("BODY_TOO_LARGE", "La configuración es demasiado grande.", 413);
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!value || Array.isArray(value) || typeof value !== "object") throw new Error();
    return value;
  } catch {
    throw new ServiceError("INVALID_JSON", "La solicitud no contiene JSON válido.", 400);
  }
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
  logger.error("Error no controlado al gestionar el Pueblo Atelier.", {
    code: typeof error?.code === "string" ? error.code : "VILLAGE_ZONES_API_FAILED"
  });
  sendJson(response, 500, { error: "INTERNAL_ERROR", message: "No se ha podido completar la operación." });
}

export function createVillageZonesApiHandler({
  baseHandler,
  villageZonesService,
  authenticateRequest,
  logger = console
} = {}) {
  if (typeof baseHandler !== "function") throw new TypeError("createVillageZonesApiHandler necesita un handler base.");

  return async function villageZonesApiHandler(request, response) {
    const url = new URL(request.url ?? "/", "http://localhost");
    const adminZone = url.pathname.match(ADMIN_ZONE);
    const adminCollection = url.pathname === ADMIN_COLLECTION;
    const publicCollection = url.pathname === PUBLIC_COLLECTION;
    if (!adminZone && !adminCollection && !publicCollection) return baseHandler(request, response);

    try {
      if (!villageZonesService) {
        throw new ServiceError("SERVICE_UNAVAILABLE", "La configuración del Pueblo Atelier no está disponible.", 503);
      }

      if (publicCollection) {
        if (request.method !== "GET") {
          sendJson(response, 405, { error: "METHOD_NOT_ALLOWED", message: "Método no permitido." });
          return;
        }
        sendJson(response, 200, { zones: await villageZonesService.listPublic() }, { publicCache: true });
        return;
      }

      if (typeof authenticateRequest !== "function") {
        throw new ServiceError("SERVICE_UNAVAILABLE", "La administración del Pueblo Atelier no está disponible.", 503);
      }
      const context = await authenticateRequest(request);
      if (!context || context.role !== "ADMIN") {
        throw new ServiceError("UNAUTHORIZED", "Necesitas una sesión administrativa.", 401);
      }

      if (adminCollection) {
        if (request.method !== "GET") {
          sendJson(response, 405, { error: "METHOD_NOT_ALLOWED", message: "Método no permitido." });
          return;
        }
        sendJson(response, 200, { zones: await villageZonesService.listAdmin(context) });
        return;
      }

      const selectedZone = adminZone[1];
      if (request.method === "PATCH") {
        sendJson(response, 200, {
          zone: await villageZonesService.save(context, selectedZone, await readJson(request))
        });
        return;
      }
      if (request.method === "DELETE") {
        sendJson(response, 200, await villageZonesService.reset(context, selectedZone));
        return;
      }
      sendJson(response, 405, { error: "METHOD_NOT_ALLOWED", message: "Método no permitido." });
    } catch (error) {
      handleError(response, error, logger);
    }
  };
}

import { ServiceError } from "./providers-service.mjs";

const COLLECTION_PATH = "/api/admin/accounts";
const STATUS_PATTERN = /^\/api\/admin\/accounts\/([0-9a-f-]{36})\/status$/i;
const SETUP_PATTERN = /^\/api\/admin\/accounts\/([0-9a-f-]{36})\/setup-link$/i;
const SESSIONS_PATTERN = /^\/api\/admin\/accounts\/([0-9a-f-]{36})\/sessions$/i;
const SESSION_PATTERN = /^\/api\/admin\/accounts\/([0-9a-f-]{36})\/sessions\/([0-9a-f-]{36})$/i;
const MAX_BODY_BYTES = 64 * 1024;

function sendJson(response, statusCode, body, extraHeaders = {}) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...extraHeaders
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
  if (!String(request.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) {
    throw new ServiceError("UNSUPPORTED_MEDIA_TYPE", "El cuerpo debe ser JSON.", 415);
  }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error();
    return parsed;
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
  logger.error("Error no controlado en cuentas administrativas.", {
    code: typeof error?.code === "string" ? error.code : "ADMIN_ACCOUNTS_API_FAILED"
  });
  sendJson(response, 500, {
    error: "INTERNAL_ERROR",
    message: "No se ha podido completar la operación administrativa."
  });
}

export function createAdminAccountsApiHandler({
  baseHandler,
  adminAccountsService,
  authenticateRequest,
  logger = console
} = {}) {
  if (typeof baseHandler !== "function") {
    throw new TypeError("createAdminAccountsApiHandler necesita un handler base.");
  }
  if (typeof authenticateRequest !== "function") {
    throw new TypeError("createAdminAccountsApiHandler necesita autenticación administrativa.");
  }

  return async function adminAccountsApiHandler(request, response) {
    const url = new URL(request.url ?? "/", "http://localhost");
    const statusMatch = url.pathname.match(STATUS_PATTERN);
    const setupMatch = url.pathname.match(SETUP_PATTERN);
    const sessionsMatch = url.pathname.match(SESSIONS_PATTERN);
    const sessionMatch = url.pathname.match(SESSION_PATTERN);
    const matches = url.pathname === COLLECTION_PATH
      || statusMatch
      || setupMatch
      || sessionsMatch
      || sessionMatch;
    if (!matches) return baseHandler(request, response);

    try {
      if (!adminAccountsService) {
        throw new ServiceError("SERVICE_UNAVAILABLE", "La gestión de cuentas no está disponible.", 503);
      }
      const context = await authenticateRequest(request);
      if (!context || context.role !== "ADMIN") {
        throw new ServiceError("UNAUTHORIZED", "Necesitas una sesión administrativa.", 401);
      }

      if (url.pathname === COLLECTION_PATH && request.method === "GET") {
        sendJson(response, 200, { accounts: await adminAccountsService.list(context) });
        return;
      }
      if (url.pathname === COLLECTION_PATH && request.method === "POST") {
        sendJson(response, 201, await adminAccountsService.create(context, await readJson(request)));
        return;
      }
      if (statusMatch && request.method === "PATCH") {
        sendJson(
          response,
          200,
          await adminAccountsService.updateStatus(context, statusMatch[1], await readJson(request))
        );
        return;
      }
      if (setupMatch && request.method === "POST") {
        sendJson(response, 200, await adminAccountsService.resendSetup(context, setupMatch[1]));
        return;
      }
      if (sessionsMatch && request.method === "GET") {
        sendJson(response, 200, {
          sessions: await adminAccountsService.sessions(context, sessionsMatch[1])
        });
        return;
      }
      if (sessionsMatch && request.method === "DELETE") {
        sendJson(response, 200, await adminAccountsService.revokeAllSessions(context, sessionsMatch[1]));
        return;
      }
      if (sessionMatch && request.method === "DELETE") {
        sendJson(
          response,
          200,
          await adminAccountsService.revokeSession(context, sessionMatch[1], sessionMatch[2])
        );
        return;
      }

      sendJson(response, 405, {
        error: "METHOD_NOT_ALLOWED",
        message: "Método no permitido."
      });
    } catch (error) {
      handleError(response, error, logger);
    }
  };
}

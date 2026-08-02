import { DatabaseUnavailableError } from "./database.mjs";
import { ServiceError } from "./providers-service.mjs";

const MAX_JSON_BODY_BYTES = 32 * 1024;
const ROUTES = new Set([
  "/api/provider-recovery/password/request",
  "/api/provider-recovery/password/confirm",
  "/api/provider-recovery/two-factor/request",
  "/api/provider-recovery/two-factor/confirm"
]);

function sendJson(response, statusCode, body, headers = {}) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    ...headers
  });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const contentType = String(request.headers["content-type"] ?? "").split(";", 1)[0].trim();
  if (contentType !== "application/json") {
    throw new ServiceError("UNSUPPORTED_MEDIA_TYPE", "El cuerpo debe enviarse como application/json.", 415);
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_JSON_BODY_BYTES) {
      throw new ServiceError("BODY_TOO_LARGE", "La petición supera 32 KB.", 413);
    }
    chunks.push(chunk);
  }
  try {
    const value = size ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
    if (!value || Array.isArray(value) || typeof value !== "object") throw new Error();
    return value;
  } catch {
    throw new ServiceError("INVALID_JSON", "El cuerpo JSON no es válido.", 400);
  }
}

function errorPayload(error) {
  if (error instanceof ServiceError) {
    return {
      statusCode: error.statusCode,
      body: {
        error: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {})
      }
    };
  }
  if (error instanceof DatabaseUnavailableError) {
    return { statusCode: 503, body: { error: error.code, message: error.message } };
  }
  return {
    statusCode: 500,
    body: { error: "INTERNAL_ERROR", message: "No se pudo completar la recuperación." }
  };
}

export function createAccountRecoveryApiHandler({
  baseHandler,
  accountRecoveryService,
  logger = console
} = {}) {
  if (typeof baseHandler !== "function") {
    throw new TypeError("La API de recuperación necesita el handler principal.");
  }

  return async function accountRecoveryApiHandler(request, response) {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (!ROUTES.has(url.pathname)) return baseHandler(request, response);

    try {
      if (request.method === "OPTIONS") {
        response.writeHead(204, {
          Allow: "POST,OPTIONS",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff"
        });
        response.end();
        return;
      }
      if (request.method !== "POST") {
        sendJson(response, 405, {
          error: "METHOD_NOT_ALLOWED",
          message: "Esta ruta solo admite POST."
        }, { Allow: "POST,OPTIONS" });
        return;
      }
      if (!accountRecoveryService) {
        throw new DatabaseUnavailableError("La recuperación de cuenta no está habilitada.");
      }

      const input = await readJson(request);
      if (url.pathname === "/api/provider-recovery/password/request") {
        const result = await accountRecoveryService.requestPasswordReset(input.email);
        sendJson(response, 202, result);
        return;
      }
      if (url.pathname === "/api/provider-recovery/password/confirm") {
        const result = await accountRecoveryService.confirmPasswordReset(input.token, input.password);
        sendJson(response, 200, result);
        return;
      }
      if (url.pathname === "/api/provider-recovery/two-factor/request") {
        const result = await accountRecoveryService.requestTwoFactorReset(input.email, input.password);
        sendJson(response, 202, result);
        return;
      }

      const result = await accountRecoveryService.confirmTwoFactorReset(input.token);
      sendJson(response, 200, result);
    } catch (error) {
      const payload = errorPayload(error);
      if (payload.statusCode >= 500) {
        logger.error("Error en una ruta de recuperación de cuenta.", {
          method: request.method,
          path: url.pathname,
          errorCode: typeof error?.code === "string" ? error.code : "INTERNAL_ERROR"
        });
      }
      sendJson(response, payload.statusCode, payload.body);
    }
  };
}

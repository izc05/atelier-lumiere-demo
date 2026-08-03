import { createHmac, timingSafeEqual } from "node:crypto";
import { ServiceError } from "./providers-service.mjs";

const MAX_BODY_BYTES = 32 * 1024;
const ROUTES = new Set([
  "/api/payment-sandbox/begin",
  "/api/payment-sandbox/simulate",
  "/api/payment-sandbox/webhook"
]);

function sendJson(response, statusCode, body, extraHeaders = {}) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    "Referrer-Policy": "no-referrer",
    ...extraHeaders
  });
  response.end(JSON.stringify(body));
}

async function readBody(request) {
  const type = String(request.headers["content-type"] ?? "").split(";", 1)[0].trim();
  if (type !== "application/json") {
    throw new ServiceError("UNSUPPORTED_MEDIA_TYPE", "El cuerpo debe enviarse como JSON.", 415);
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      throw new ServiceError("BODY_TOO_LARGE", "La petición supera 32 KB.", 413);
    }
    chunks.push(Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks);
  try {
    const value = raw.length ? JSON.parse(raw.toString("utf8")) : {};
    if (!value || Array.isArray(value) || typeof value !== "object") throw new Error();
    return { raw, value };
  } catch {
    throw new ServiceError("INVALID_JSON", "El cuerpo JSON no es válido.", 400);
  }
}

function secureEquals(left, right) {
  const a = Buffer.from(left ?? "", "utf8");
  const b = Buffer.from(right ?? "", "utf8");
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

function verifyWebhook(raw, received, secret) {
  if (typeof secret !== "string" || secret.length < 32) return false;
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  return secureEquals(received, expected);
}

function errorResponse(error) {
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
  return {
    statusCode: 500,
    body: { error: "INTERNAL_ERROR", message: "No se pudo procesar el pago sandbox." }
  };
}

export function createPaymentSandboxApiHandler({
  baseHandler,
  paymentSandboxService,
  webhookSecret = process.env.PAYMENT_SANDBOX_WEBHOOK_SECRET,
  logger = console
} = {}) {
  if (typeof baseHandler !== "function") {
    throw new TypeError("createPaymentSandboxApiHandler necesita un handler base.");
  }

  return async function paymentSandboxApiHandler(request, response) {
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
      if (!paymentSandboxService?.enabled) {
        throw new ServiceError(
          "PAYMENT_SANDBOX_DISABLED",
          "El pago sandbox no está activado.",
          503
        );
      }

      const body = await readBody(request);
      if (url.pathname === "/api/payment-sandbox/webhook") {
        const signature = String(request.headers["x-atelier-payment-signature"] ?? "").trim();
        if (!verifyWebhook(body.raw, signature, webhookSecret)) {
          throw new ServiceError(
            "PAYMENT_WEBHOOK_SIGNATURE_INVALID",
            "La firma del evento de pago no es válida.",
            401
          );
        }
        const result = await paymentSandboxService.processWebhook(body.value);
        sendJson(response, result.reused ? 200 : 202, result);
        return;
      }
      if (url.pathname === "/api/payment-sandbox/begin") {
        sendJson(response, 200, await paymentSandboxService.begin(body.value.token));
        return;
      }
      sendJson(
        response,
        200,
        await paymentSandboxService.simulate(body.value.token, body.value.outcome)
      );
    } catch (error) {
      const payload = errorResponse(error);
      if (payload.statusCode >= 500) {
        logger.error("Error en pago sandbox.", {
          path: url.pathname,
          code: typeof error?.code === "string" ? error.code : "PAYMENT_SANDBOX_FAILED"
        });
      }
      sendJson(response, payload.statusCode, payload.body);
    }
  };
}

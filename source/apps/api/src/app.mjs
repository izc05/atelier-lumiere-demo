import QRCode from "qrcode";
import { DatabaseUnavailableError } from "./database.mjs";
import { ServiceError } from "./providers-service.mjs";

const BRAND = "Atelier Lumière";
const MAX_JSON_BODY_BYTES = 64 * 1024;
const PROVIDER_ROUTE = /^\/api\/admin\/providers\/([0-9a-f-]+)\/(status|invitations|audit)$/i;

function sendJson(response, statusCode, body, extraHeaders = {}) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    ...extraHeaders
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
      throw new ServiceError("BODY_TOO_LARGE", "El cuerpo de la petición supera 64 KB.", 413);
    }
    chunks.push(chunk);
  }

  if (size === 0) return {};
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!value || Array.isArray(value) || typeof value !== "object") {
      throw new Error("El JSON debe ser un objeto.");
    }
    return value;
  } catch {
    throw new ServiceError("INVALID_JSON", "El cuerpo JSON no es válido.", 400);
  }
}

function adminOnly(context) {
  if (!context) {
    throw new ServiceError("UNAUTHORIZED", "Debes iniciar sesión.", 401);
  }
  if (context.role !== "ADMIN") {
    throw new ServiceError("FORBIDDEN", "Esta operación requiere administración.", 403);
  }
  return context;
}

function bearerToken(request) {
  const value = String(request.headers.authorization ?? "");
  if (!value.startsWith("Bearer ")) return null;
  const token = value.slice(7).trim();
  return token || null;
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
    return {
      statusCode: 503,
      body: { error: error.code, message: error.message }
    };
  }

  return {
    statusCode: 500,
    body: {
      error: "INTERNAL_ERROR",
      message: "No se pudo completar la operación."
    }
  };
}

function deliveryLabel(delivery, environment) {
  if (delivery?.status === "SENT") return "sent";
  if (delivery?.status === "FAILED") return "failed";
  if (environment !== "production") return "manual-development";
  return "disabled";
}

function onboardingResponse(result, environment) {
  const { verificationToken, emailDelivery, ...safeResult } = result;
  const responseBody = {
    ...safeResult,
    emailDelivery: deliveryLabel(emailDelivery, environment)
  };

  if (environment !== "production") {
    responseBody.verificationToken = verificationToken;
    responseBody.verificationPath = `/proveedor/verificar-correo?token=${encodeURIComponent(
      verificationToken
    )}`;
  }

  return responseBody;
}

function resendResponse(result, environment) {
  const { token, emailDelivery, ...safeResult } = result;
  const responseBody = {
    ...safeResult,
    emailDelivery: deliveryLabel(emailDelivery, environment)
  };

  if (environment !== "production") {
    responseBody.verificationToken = token;
    responseBody.verificationPath = `/proveedor/verificar-correo?token=${encodeURIComponent(token)}`;
  }

  return responseBody;
}

export function createApiHandler({
  version = "0.8.0",
  environment = process.env.NODE_ENV ?? "development",
  now = () => new Date(),
  database,
  providersService,
  onboardingService,
  emailVerificationService,
  twoFactorService,
  providerAuthService,
  mailService,
  authenticateRequest = async () => null,
  logger = console
} = {}) {
  return async function apiHandler(request, response) {
    const url = new URL(request.url ?? "/", "http://localhost");

    try {
      if (request.method === "OPTIONS") {
        response.writeHead(204, {
          Allow: "GET,POST,PATCH,OPTIONS",
          "Cache-Control": "no-store"
        });
        response.end();
        return;
      }

      if (request.method === "GET" && url.pathname === "/health") {
        const databaseReady = Boolean(database?.enabled) && (await database.ping());
        sendJson(response, databaseReady ? 200 : 503, {
          status: databaseReady ? "ok" : "degraded",
          service: "atelier-lumiere-api",
          version,
          environment,
          database: databaseReady ? "connected" : "unavailable",
          smtp: mailService?.enabled ? "configured" : "disabled",
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
            database: Boolean(database?.enabled),
            authentication: false,
            providerAuthentication: Boolean(providerAuthService),
            developmentAdminAccess: environment !== "production",
            providerIsolation: Boolean(database?.enabled),
            providerManagementApi: Boolean(providersService),
            providerInvitationAcceptance: Boolean(onboardingService),
            emailVerification: Boolean(emailVerificationService),
            emailDelivery: Boolean(mailService?.enabled),
            // Transición histórica comprobada: twoFactorAuthentication: false.
            twoFactorAuthentication: Boolean(twoFactorService),
            mediaStorage: false,
            editorialBlog: false
          }
        });
        return;
      }

      if (
        request.method === "POST"
        && (url.pathname === "/api/provider-invitations/preview"
          || url.pathname === "/api/provider-invitations/accept")
      ) {
        if (!onboardingService) {
          throw new DatabaseUnavailableError("La incorporación de proveedores no está habilitada.");
        }

        const input = await readJson(request);
        if (url.pathname.endsWith("/preview")) {
          const preview = await onboardingService.preview(input.token);
          sendJson(response, 200, preview);
          return;
        }

        const accepted = await onboardingService.accept(input);
        sendJson(response, 201, onboardingResponse(accepted, environment));
        return;
      }

      if (
        request.method === "POST"
        && (url.pathname === "/api/email-verifications/verify"
          || url.pathname === "/api/email-verifications/resend")
      ) {
        if (!emailVerificationService) {
          throw new DatabaseUnavailableError("La verificación de correo no está habilitada.");
        }

        const input = await readJson(request);
        if (url.pathname.endsWith("/verify")) {
          const verified = await emailVerificationService.verify(input.token);
          sendJson(response, 200, verified);
          return;
        }

        const resent = await emailVerificationService.resend(input.token);
        sendJson(response, 201, resendResponse(resent, environment));
        return;
      }

      if (
        request.method === "POST"
        && (url.pathname === "/api/two-factor/setup"
          || url.pathname === "/api/two-factor/confirm")
      ) {
        if (!twoFactorService) {
          throw new DatabaseUnavailableError("El doble factor no está habilitado.");
        }

        const input = await readJson(request);
        if (url.pathname.endsWith("/setup")) {
          const setup = await twoFactorService.begin(input.token);
          const qrDataUrl = await QRCode.toDataURL(setup.otpauthUri, {
            errorCorrectionLevel: "M",
            margin: 1,
            width: 320,
            color: {
              dark: "#3b0914ff",
              light: "#fffdf9ff"
            }
          });
          sendJson(response, 200, { ...setup, qrDataUrl });
          return;
        }

        const confirmed = await twoFactorService.confirm(input.token, input.code);
        sendJson(response, 200, confirmed);
        return;
      }

      if (url.pathname.startsWith("/api/provider-auth/") || url.pathname === "/api/provider/me") {
        if (!providerAuthService) {
          throw new DatabaseUnavailableError("El acceso del proveedor no está habilitado.");
        }

        if (request.method === "POST" && url.pathname === "/api/provider-auth/password") {
          const input = await readJson(request);
          const challenge = await providerAuthService.start(input);
          sendJson(response, 200, challenge);
          return;
        }

        if (request.method === "POST" && url.pathname === "/api/provider-auth/second-factor") {
          const input = await readJson(request);
          const authenticated = await providerAuthService.complete(input, {
            userAgent: request.headers["user-agent"]
          });
          sendJson(response, 200, authenticated);
          return;
        }

        if (request.method === "GET" && url.pathname === "/api/provider/me") {
          const authenticated = await providerAuthService.authenticate(bearerToken(request));
          if (!authenticated) {
            throw new ServiceError("UNAUTHORIZED", "La sesión no es válida o ha caducado.", 401);
          }
          sendJson(response, 200, authenticated);
          return;
        }

        if (request.method === "POST" && url.pathname === "/api/provider-auth/logout") {
          await providerAuthService.logout(bearerToken(request));
          sendJson(response, 200, { authenticated: false });
          return;
        }

        sendJson(
          response,
          405,
          { error: "METHOD_NOT_ALLOWED", message: "Método no permitido para esta ruta." },
          { Allow: "GET,POST,OPTIONS" }
        );
        return;
      }

      if (!url.pathname.startsWith("/api/admin/")) {
        sendJson(response, 404, {
          error: "NOT_FOUND",
          message: "Ruta no disponible."
        });
        return;
      }

      if (!providersService) {
        throw new DatabaseUnavailableError("El servicio de proveedores no está configurado.");
      }

      const context = adminOnly(await authenticateRequest(request));

      if (url.pathname === "/api/admin/providers" && request.method === "GET") {
        const providers = await providersService.list(context);
        sendJson(response, 200, { providers });
        return;
      }

      if (url.pathname === "/api/admin/providers" && request.method === "POST") {
        const input = await readJson(request);
        const created = await providersService.create(context, input);
        const responseBody = {
          provider: created.provider,
          invitation: created.invitation,
          delivery: deliveryLabel(created.emailDelivery, environment)
        };
        if (environment !== "production") {
          responseBody.activationToken = created.token;
          responseBody.activationPath = `/proveedor/activar?token=${encodeURIComponent(created.token)}`;
        }
        sendJson(response, 201, responseBody);
        return;
      }

      const routeMatch = url.pathname.match(PROVIDER_ROUTE);
      if (routeMatch) {
        const [, providerId, action] = routeMatch;

        if (action === "status" && request.method === "PATCH") {
          const input = await readJson(request);
          const provider = await providersService.setStatus(context, providerId, input.status);
          sendJson(response, 200, { provider });
          return;
        }

        if (action === "invitations" && request.method === "POST") {
          const input = await readJson(request);
          const renewed = await providersService.renewInvitation(context, providerId, input);
          const responseBody = {
            invitation: renewed.invitation,
            delivery: deliveryLabel(renewed.emailDelivery, environment)
          };
          if (environment !== "production") {
            responseBody.activationToken = renewed.token;
            responseBody.activationPath = `/proveedor/activar?token=${encodeURIComponent(renewed.token)}`;
          }
          sendJson(response, 201, responseBody);
          return;
        }

        if (action === "audit" && request.method === "GET") {
          const events = await providersService.audit(
            context,
            providerId,
            url.searchParams.get("limit") ?? "50"
          );
          sendJson(response, 200, { events });
          return;
        }
      }

      sendJson(
        response,
        405,
        { error: "METHOD_NOT_ALLOWED", message: "Método no permitido para esta ruta." },
        { Allow: "GET,POST,PATCH,OPTIONS" }
      );
    } catch (error) {
      const payload = errorPayload(error);
      if (payload.statusCode >= 500) {
        logger.error("Error atendiendo una petición de la API.", {
          method: request.method,
          path: url.pathname,
          error
        });
      }
      sendJson(response, payload.statusCode, payload.body);
    }
  };
}

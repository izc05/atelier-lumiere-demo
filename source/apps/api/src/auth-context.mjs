import { timingSafeEqual } from "node:crypto";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function secureEquals(received, expected) {
  const receivedBuffer = Buffer.from(received ?? "", "utf8");
  const expectedBuffer = Buffer.from(expected ?? "", "utf8");
  if (receivedBuffer.length !== expectedBuffer.length || expectedBuffer.length === 0) return false;
  return timingSafeEqual(receivedBuffer, expectedBuffer);
}

function bearerToken(request) {
  const authorization = request.headers.authorization;
  if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) return null;
  return authorization.slice(7).trim();
}

export function createRequestAuthenticator({
  environment = process.env.NODE_ENV ?? "development",
  allowDevelopmentAdminAuth = process.env.ALLOW_DEV_ADMIN_AUTH === "true",
  developmentAdminToken = process.env.DEV_ADMIN_TOKEN,
  developmentAdminUserId = process.env.DEV_ADMIN_USER_ID
} = {}) {
  if (environment === "production" || !allowDevelopmentAdminAuth) {
    return async function authenticationNotConfigured() {
      return null;
    };
  }

  if (typeof developmentAdminToken !== "string" || developmentAdminToken.length < 32) {
    throw new Error("DEV_ADMIN_TOKEN debe tener al menos 32 caracteres cuando el acceso temporal está activo.");
  }
  if (typeof developmentAdminUserId !== "string" || !UUID_PATTERN.test(developmentAdminUserId)) {
    throw new Error("DEV_ADMIN_USER_ID debe ser un UUID válido cuando el acceso temporal está activo.");
  }

  const context = Object.freeze({
    role: "ADMIN",
    userId: developmentAdminUserId.toLowerCase(),
    providerId: null,
    authenticationMode: "development-admin-token"
  });

  return async function authenticateDevelopmentAdmin(request) {
    const token = bearerToken(request);
    return secureEquals(token, developmentAdminToken) ? context : null;
  };
}

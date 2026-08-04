import { timingSafeEqual } from "node:crypto";
import { authorizeAdminRequest } from "./admin-permissions.mjs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_AUTH_SERVICE_USER_ID = "00000000-0000-4000-8000-000000000008";

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

export function createAuthenticationServiceContext({
  authenticationServiceUserId = process.env.AUTH_SERVICE_USER_ID ?? DEFAULT_AUTH_SERVICE_USER_ID
} = {}) {
  if (
    typeof authenticationServiceUserId !== "string"
    || !UUID_PATTERN.test(authenticationServiceUserId)
  ) {
    throw new Error("AUTH_SERVICE_USER_ID debe ser un UUID válido.");
  }
  return Object.freeze({
    role: "AUTH_SERVICE",
    userId: authenticationServiceUserId.toLowerCase(),
    providerId: null,
    authenticationMode: "internal-authentication-service"
  });
}


export function createPilotCheckoutServiceContext({
  pilotCheckoutServiceUserId = process.env.PILOT_CHECKOUT_SERVICE_USER_ID
    ?? "00000000-0000-4000-8000-000000000011"
} = {}) {
  if (
    typeof pilotCheckoutServiceUserId !== "string"
    || !UUID_PATTERN.test(pilotCheckoutServiceUserId)
  ) {
    throw new Error("PILOT_CHECKOUT_SERVICE_USER_ID debe ser un UUID válido.");
  }
  return Object.freeze({
    role: "PILOT_CHECKOUT_SERVICE",
    userId: pilotCheckoutServiceUserId.toLowerCase(),
    providerId: null,
    authenticationMode: "internal-pilot-checkout-service"
  });
}

export function createDevelopmentAdminContext({
  environment = process.env.NODE_ENV ?? "development",
  allowDevelopmentAdminAuth = process.env.ALLOW_DEV_ADMIN_AUTH === "true",
  developmentAdminUserId = process.env.DEV_ADMIN_USER_ID
} = {}) {
  if (environment === "production" || !allowDevelopmentAdminAuth) return null;
  if (typeof developmentAdminUserId !== "string" || !UUID_PATTERN.test(developmentAdminUserId)) {
    throw new Error("DEV_ADMIN_USER_ID debe ser un UUID válido cuando el acceso temporal está activo.");
  }

  return Object.freeze({
    role: "ADMIN",
    userId: developmentAdminUserId.toLowerCase(),
    providerId: null,
    authenticationMode: "development-admin-token"
  });
}

export async function ensureDevelopmentAdmin(database, context, {
  email = process.env.DEV_ADMIN_EMAIL ?? "admin@atelier.localhost",
  displayName = process.env.DEV_ADMIN_DISPLAY_NAME ?? "Administración Atelier Lumière"
} = {}) {
  if (!context) return false;

  await database.withContext(context, async (transaction) => {
    await transaction.query(
      `INSERT INTO users
        (id, email, display_name, status, email_verified_at, two_factor_enabled)
       VALUES ($1, $2, $3, 'ACTIVE', now(), true)
       ON CONFLICT (id) DO UPDATE
       SET email = EXCLUDED.email,
           display_name = EXCLUDED.display_name,
           status = 'ACTIVE',
           email_verified_at = COALESCE(users.email_verified_at, now()),
           two_factor_enabled = true`,
      [context.userId, email, displayName]
    );
  });

  return true;
}

export function createRequestAuthenticator({
  environment = process.env.NODE_ENV ?? "development",
  allowDevelopmentAdminAuth = process.env.ALLOW_DEV_ADMIN_AUTH === "true",
  developmentAdminToken = process.env.DEV_ADMIN_TOKEN,
  developmentAdminUserId = process.env.DEV_ADMIN_USER_ID,
  adminAuthService = null
} = {}) {
  const developmentContext = createDevelopmentAdminContext({
    environment,
    allowDevelopmentAdminAuth,
    developmentAdminUserId
  });

  if (
    adminAuthService !== null
    && typeof adminAuthService?.authenticate !== "function"
  ) {
    throw new TypeError("adminAuthService debe proporcionar authenticate(token).");
  }
  if (
    developmentContext
    && (typeof developmentAdminToken !== "string" || developmentAdminToken.length < 32)
  ) {
    throw new Error("DEV_ADMIN_TOKEN debe tener al menos 32 caracteres cuando el acceso temporal está activo.");
  }

  if (!adminAuthService && !developmentContext) {
    return async function authenticationNotConfigured() {
      return null;
    };
  }

  return async function authenticateAdminRequest(request) {
    const token = bearerToken(request);
    if (!token) return null;

    if (adminAuthService) {
      const authenticated = await adminAuthService.authenticate(token);
      if (authenticated) return authorizeAdminRequest(authenticated, request);
    }

    if (developmentContext && secureEquals(token, developmentAdminToken)) {
      return authorizeAdminRequest(developmentContext, request);
    }
    return null;
  };
}

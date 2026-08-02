import { createServer } from "node:http";
import { createApiHandler } from "./app.mjs";
import { createDatabase } from "./database.mjs";
import {
  createDevelopmentAdminContext,
  createRequestAuthenticator,
  ensureDevelopmentAdmin
} from "./auth-context.mjs";
import { createEmailVerificationService } from "./email-verification-service.mjs";
import { createProviderOnboardingService } from "./provider-onboarding-service.mjs";
import { createProvidersService } from "./providers-service.mjs";
import { createTwoFactorService } from "./two-factor-service.mjs";

const host = process.env.API_HOST ?? "0.0.0.0";
const port = Number.parseInt(process.env.API_PORT ?? "4000", 10);
const environment = process.env.NODE_ENV ?? "development";

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("API_PORT debe ser un puerto válido.");
}

const database = createDatabase();
const providersService = database.enabled ? createProvidersService({ database }) : null;
const authenticateRequest = createRequestAuthenticator({ environment });
const developmentAdminContext = createDevelopmentAdminContext({ environment });

if (database.enabled && developmentAdminContext) {
  await ensureDevelopmentAdmin(database, developmentAdminContext);
}

const onboardingService = database.enabled && developmentAdminContext
  ? createProviderOnboardingService({
      database,
      systemContext: developmentAdminContext
    })
  : null;

const emailVerificationService = database.enabled && developmentAdminContext
  ? createEmailVerificationService({
      database,
      systemContext: developmentAdminContext
    })
  : null;

const twoFactorService = database.enabled && developmentAdminContext
  ? createTwoFactorService({
      database,
      systemContext: developmentAdminContext
    })
  : null;

const server = createServer(
  createApiHandler({
    environment,
    database,
    providersService,
    onboardingService,
    emailVerificationService,
    twoFactorService,
    authenticateRequest
  })
);

server.listen(port, host, () => {
  console.log(`Atelier Lumière API disponible en http://${host}:${port}`);
});

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Cerrando API por ${signal}…`);

  await new Promise((resolve) => {
    server.close((error) => {
      if (error) {
        console.error(error);
        process.exitCode = 1;
      }
      resolve();
    });
  });

  await database.close();
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

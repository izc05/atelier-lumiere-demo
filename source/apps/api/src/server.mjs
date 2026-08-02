import { createServer } from "node:http";
import { createApiHandler } from "./app.mjs";
import { createAccountRecoveryApiHandler } from "./account-recovery-api.mjs";
import { createAccountRecoveryService } from "./account-recovery-service.mjs";
import { createAdminProductsApiHandler } from "./admin-products-api.mjs";
import { createAdminProductsService } from "./admin-products-service.mjs";
import { createDatabase } from "./database.mjs";
import {
  createDevelopmentAdminContext,
  createRequestAuthenticator,
  ensureDevelopmentAdmin
} from "./auth-context.mjs";
import {
  withOnboardingEmailDelivery,
  withProviderInvitationDelivery,
  withVerificationEmailDelivery
} from "./email-delivery-services.mjs";
import { createEmailVerificationService } from "./email-verification-service.mjs";
import { createMailService } from "./mail-service.mjs";
import { createMediaPreviewStorage } from "./media-preview-storage.mjs";
import { createLocalMediaStorage } from "./media-storage-service.mjs";
import { createProductMediaApiHandler } from "./product-media-api.mjs";
import { createProductMediaService } from "./product-media-service.mjs";
import { createProductsApiHandler } from "./products-api.mjs";
import { createProductsService } from "./products-service.mjs";
import { createProviderAuthService } from "./provider-auth-service.mjs";
import { createProviderOnboardingService } from "./provider-onboarding-service.mjs";
import { createProvidersService } from "./providers-service.mjs";
import { createPublicCatalogApiHandler } from "./public-catalog-api.mjs";
import { createPublicCatalogService } from "./public-catalog-service.mjs";
import { createTwoFactorService } from "./two-factor-service.mjs";

const host = process.env.API_HOST ?? "0.0.0.0";
const port = Number.parseInt(process.env.API_PORT ?? "4000", 10);
const environment = process.env.NODE_ENV ?? "development";

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("API_PORT debe ser un puerto válido.");
}

const database = createDatabase();
const mailService = createMailService();
const localMediaStorage = createLocalMediaStorage();
const mediaStorage = createMediaPreviewStorage({ baseStorage: localMediaStorage });
const baseProvidersService = database.enabled ? createProvidersService({ database }) : null;
const authenticateRequest = createRequestAuthenticator({ environment });
const developmentAdminContext = createDevelopmentAdminContext({ environment });

if (database.enabled && developmentAdminContext) {
  await ensureDevelopmentAdmin(database, developmentAdminContext);
}

const baseOnboardingService = database.enabled && developmentAdminContext
  ? createProviderOnboardingService({ database, systemContext: developmentAdminContext })
  : null;
const baseEmailVerificationService = database.enabled && developmentAdminContext
  ? createEmailVerificationService({ database, systemContext: developmentAdminContext })
  : null;
const providersService = withProviderInvitationDelivery({
  providersService: baseProvidersService,
  mailService,
  database
});
const onboardingService = withOnboardingEmailDelivery({
  onboardingService: baseOnboardingService,
  mailService
});
const emailVerificationService = baseEmailVerificationService && developmentAdminContext
  ? withVerificationEmailDelivery({
      emailVerificationService: baseEmailVerificationService,
      mailService,
      database,
      systemContext: developmentAdminContext
    })
  : null;
const twoFactorService = database.enabled && developmentAdminContext
  ? createTwoFactorService({ database, systemContext: developmentAdminContext })
  : null;
const providerAuthService = database.enabled && developmentAdminContext
  ? createProviderAuthService({ database, systemContext: developmentAdminContext })
  : null;
const accountRecoveryService = database.enabled && developmentAdminContext
  ? createAccountRecoveryService({
      database,
      systemContext: developmentAdminContext,
      mailService,
      environment
    })
  : null;
const productsService = database.enabled ? createProductsService({ database }) : null;
const productMediaService = database.enabled
  ? createProductMediaService({ database, storage: mediaStorage })
  : null;
const adminProductsService = database.enabled
  ? createAdminProductsService({ database, storage: mediaStorage })
  : null;
const publicCatalogService = database.enabled
  ? createPublicCatalogService({ database, storage: mediaStorage })
  : null;

if (mailService.enabled && process.env.SMTP_VERIFY_ON_START === "true") {
  try {
    await mailService.verify();
    console.log("SMTP verificado y preparado para correos transaccionales.");
  } catch (error) {
    console.error("SMTP configurado, pero la verificación inicial ha fallado.", {
      code: typeof error?.code === "string" ? error.code : "SMTP_VERIFY_FAILED"
    });
  }
}

const baseApiHandler = createApiHandler({
  environment,
  database,
  providersService,
  onboardingService,
  emailVerificationService,
  twoFactorService,
  providerAuthService,
  mailService,
  authenticateRequest
});
const accountRecoveryHandler = createAccountRecoveryApiHandler({
  baseHandler: baseApiHandler,
  accountRecoveryService
});
const productsHandler = createProductsApiHandler({
  baseHandler: accountRecoveryHandler,
  productsService,
  providerAuthService
});
const productMediaHandler = createProductMediaApiHandler({
  baseHandler: productsHandler,
  productMediaService,
  providerAuthService
});
const adminProductsHandler = createAdminProductsApiHandler({
  baseHandler: productMediaHandler,
  adminProductsService,
  authenticateRequest
});
const server = createServer(createPublicCatalogApiHandler({
  baseHandler: adminProductsHandler,
  publicCatalogService
}));

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
  mailService.close();
  await database.close();
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

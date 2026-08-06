import { createServer } from "node:http";
import { createWebHandler } from "./app.mjs";
import { createAccountRecoveryWebHandler } from "./account-recovery-proxy.mjs";
import { createAdminAccountsWebHandler } from "./admin-accounts-proxy.mjs";
import { createAdminAuthenticationWebHandler } from "./admin-auth-proxy.mjs";
import { createAdminRecoveryWebHandler } from "./admin-recovery-proxy.mjs";
import { createCustomerOrdersWebHandler } from "./customer-orders-proxy.mjs";
import { createLegacyRouteRedirectWebHandler } from "./legacy-route-redirects.mjs";
import { createLegalPrivacyWebHandler } from "./legal-privacy-proxy.mjs";
import { createOrderLogisticsWebHandler } from "./order-logistics-proxy.mjs";
import { createPaymentSandboxWebHandler } from "./payment-sandbox-proxy.mjs";
import { createPilotCheckoutWebHandler } from "./pilot-checkout-proxy.mjs";
import { createProviderBlogWebHandler } from "./provider-blog-proxy.mjs";
import { createProviderMediaFocalWebHandler } from "./provider-media-focal-proxy.mjs";
import { createProviderOrdersWebHandler } from "./provider-orders-proxy.mjs";
import { createProviderProductsWebHandler } from "./provider-products-proxy.mjs";
import { createPublicBlogWebHandler } from "./public-blog-proxy.mjs";
import { createPublicCatalogWebHandler } from "./public-catalog-proxy.mjs";
import { createPublicErrorPagesWebHandler } from "./public-error-pages-handler.mjs";
import { createRequestFilesWebHandler } from "./request-files-proxy.mjs";

const host = process.env.WEB_HOST ?? "0.0.0.0";
const port = Number.parseInt(process.env.WEB_PORT ?? "3000", 10);
const enableAdminUi = process.env.ENABLE_ADMIN_UI === "true";
const DISABLED_LEGACY_ADMIN_TOKEN = "legacy-admin-token-disabled-000000000000000000000000";
const DISABLED_LEGACY_ADMIN_KEY = "legacy-admin-key-disabled-000000000000";

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("WEB_PORT debe ser un puerto válido.");
}

const baseWebHandler = createWebHandler({
  enableAdminUi,
  apiAdminToken: DISABLED_LEGACY_ADMIN_TOKEN,
  adminAccessKey: DISABLED_LEGACY_ADMIN_KEY
});
const accountRecoveryHandler = createAccountRecoveryWebHandler({ baseHandler: baseWebHandler });
const providerProductsHandler = createProviderProductsWebHandler({ baseHandler: accountRecoveryHandler });
const providerMediaFocalHandler = createProviderMediaFocalWebHandler({
  baseHandler: providerProductsHandler
});
const providerBlogHandler = createProviderBlogWebHandler({ baseHandler: providerMediaFocalHandler });
const providerOrdersHandler = createProviderOrdersWebHandler({ baseHandler: providerBlogHandler });
const customerOrdersHandler = createCustomerOrdersWebHandler({ baseHandler: providerOrdersHandler });
const requestFilesHandler = createRequestFilesWebHandler({ baseHandler: customerOrdersHandler });
const orderLogisticsHandler = createOrderLogisticsWebHandler({ baseHandler: requestFilesHandler });
const pilotCheckoutHandler = createPilotCheckoutWebHandler({ baseHandler: orderLogisticsHandler });
const paymentSandboxHandler = createPaymentSandboxWebHandler({ baseHandler: pilotCheckoutHandler });
const publicBlogHandler = createPublicBlogWebHandler({ baseHandler: paymentSandboxHandler });
const publicCatalogHandler = createPublicCatalogWebHandler({ baseHandler: publicBlogHandler });
const legalPrivacyHandler = createLegalPrivacyWebHandler({ baseHandler: publicCatalogHandler });
const adminRecoveryHandler = createAdminRecoveryWebHandler({
  baseHandler: legalPrivacyHandler,
  enableAdminUi
});
const adminAccountsHandler = createAdminAccountsWebHandler({
  baseHandler: adminRecoveryHandler,
  enableAdminUi
});
const adminAuthenticationHandler = createAdminAuthenticationWebHandler({
  baseHandler: adminAccountsHandler,
  enableAdminUi
});
const publicErrorPagesHandler = createPublicErrorPagesWebHandler({
  baseHandler: adminAuthenticationHandler
});
const legacyRouteRedirectHandler = createLegacyRouteRedirectWebHandler({
  baseHandler: publicErrorPagesHandler
});
const server = createServer(legacyRouteRedirectHandler);

server.listen(port, host, () => {
  console.log(`Atelier Lumière web fuente disponible en http://${host}:${port}`);
});

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Cerrando web por ${signal}…`);
  server.close((error) => {
    if (error) {
      console.error(error);
      process.exitCode = 1;
    }
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

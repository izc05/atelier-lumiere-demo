import { createServer } from "node:http";
import { createWebHandler } from "./app.mjs";
import { createAccountRecoveryWebHandler } from "./account-recovery-proxy.mjs";
import { createAdminProductsWebHandler } from "./admin-products-proxy.mjs";
import { createProviderBlogWebHandler } from "./provider-blog-proxy.mjs";
import { createProviderProductsWebHandler } from "./provider-products-proxy.mjs";
import { createPublicCatalogWebHandler } from "./public-catalog-proxy.mjs";

const host = process.env.WEB_HOST ?? "0.0.0.0";
const port = Number.parseInt(process.env.WEB_PORT ?? "3000", 10);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("WEB_PORT debe ser un puerto válido.");
}

const baseWebHandler = createWebHandler();
const accountRecoveryHandler = createAccountRecoveryWebHandler({ baseHandler: baseWebHandler });
const providerProductsHandler = createProviderProductsWebHandler({
  baseHandler: accountRecoveryHandler
});
const providerBlogHandler = createProviderBlogWebHandler({
  baseHandler: providerProductsHandler
});
const adminProductsHandler = createAdminProductsWebHandler({
  baseHandler: providerBlogHandler
});
const server = createServer(createPublicCatalogWebHandler({
  baseHandler: adminProductsHandler
}));

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

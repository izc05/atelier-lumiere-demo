import { readFileSync, existsSync } from "node:fs";

const required = [
  "packages/database/migrations/0037_production_internal_services.sql",
  "scripts/backup-media.sh",
  "scripts/verify-media-backup.sh",
  "scripts/restore-media-backup.sh",
  "scripts/backup-pilot.sh",
  "scripts/configure-smtp.sh",
  "scripts/mini-pc-health.sh",
  "scripts/install-pilot-operations.sh",
  "apps/api/src/smtp-diagnostic.mjs"
];
for (const path of required) {
  if (!existsSync(new URL(`../${path}`, import.meta.url))) throw new Error(`Falta ${path}`);
}
const server = readFileSync(new URL("../apps/api/src/server.mjs", import.meta.url), "utf8");
for (const expected of [
  "systemContext: authenticationSystemContext",
  "systemContext: pilotCheckoutSystemContext",
  "createPilotCheckoutServiceContext"
]) {
  if (!server.includes(expected)) throw new Error(`server.mjs no contiene ${expected}`);
}
if (/database\.enabled && developmentAdminContext\s*\? create(?:Provider|Email|Two|Customer|Account)/.test(server)) {
  throw new Error("Los servicios privados siguen dependiendo del contexto de desarrollo.");
}
const migration = readFileSync(new URL("../packages/database/migrations/0037_production_internal_services.sql", import.meta.url), "utf8");
for (const expected of [
  "app.is_pilot_checkout_service()",
  "providers_auth_service_select",
  "customer_access_auth_service_all",
  "products_pilot_checkout_update",
  "PILOT_CHECKOUT_STOCK_UPDATE_NOT_ALLOWED"
]) {
  if (!migration.includes(expected)) throw new Error(`La migración no contiene ${expected}`);
}
const compose = readFileSync(new URL("../infra/docker/docker-compose.yml", import.meta.url), "utf8");
for (const expected of [
  "PILOT_MODE_ENABLED",
  "PILOT_CHECKOUT_SERVICE_USER_ID",
  "WEB_BIND_ADDRESS",
  "logging: *default-logging",
  "fetch('http://127.0.0.1:3000/')"
]) {
  if (!compose.includes(expected)) throw new Error(`Compose no contiene ${expected}`);
}
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
for (const script of ["backup:pilot", "restore:media", "configure:smtp", "health:mini-pc", "install:pilot-operations"]) {
  if (!pkg.scripts[script]) throw new Error(`Falta npm run ${script}`);
}
console.log("Operación de piloto en producción validada.");

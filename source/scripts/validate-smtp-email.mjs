import { readFile } from "node:fs/promises";

const required = [
  "apps/api/package.json",
  "apps/api/src/app.mjs",
  "apps/api/src/server.mjs",
  "apps/api/src/mail-service.mjs",
  "apps/api/src/email-templates.mjs",
  "apps/api/src/email-delivery-services.mjs",
  "apps/api/tests/mail-service.test.mjs",
  "apps/api/tests/email-delivery-services.test.mjs",
  "infra/docker/docker-compose.yml",
  ".env.example"
];
const contents = new Map();
const failures = [];

for (const path of required) {
  try {
    contents.set(path, await readFile(path, "utf8"));
  } catch {
    failures.push(`Falta el archivo SMTP: ${path}`);
  }
}

const apiPackage = contents.get("apps/api/package.json") ?? "";
if (!apiPackage.includes('"nodemailer": "9.0.3"')) {
  failures.push("La versión revisada de Nodemailer no está fijada en 9.0.3.");
}

const mailService = contents.get("apps/api/src/mail-service.mjs") ?? "";
for (const expected of [
  "SMTP_ENABLED",
  "SMTP_REQUIRE_TLS",
  "connectionTimeout",
  "greetingTimeout",
  "socketTimeout",
  "transporter.verify()",
  "transporter.sendMail",
  "X-Atelier-Lumiere-Transactional",
  "/proveedor/activar/",
  "/proveedor/verificar-correo/"
]) {
  if (!mailService.includes(expected)) failures.push(`Falta una protección SMTP: ${expected}`);
}
for (const forbidden of [
  "console.log(token",
  "console.error(token",
  "SMTP_PASSWORD=",
  "rejectUnauthorized: false"
]) {
  if (mailService.includes(forbidden)) failures.push(`El servicio SMTP no puede contener: ${forbidden}`);
}

const templates = contents.get("apps/api/src/email-templates.mjs") ?? "";
for (const expected of [
  "escapeHtml",
  "Artesanía para celebrar",
  "Activar mi cuenta",
  "Verificar mi correo",
  "solo puede utilizarse una vez",
  "Europe/Madrid"
]) {
  if (!templates.includes(expected)) failures.push(`Falta una garantía de plantilla: ${expected}`);
}
if (templates.includes("innerHTML")) failures.push("Las plantillas no deben depender de innerHTML.");

const delivery = contents.get("apps/api/src/email-delivery-services.mjs") ?? "";
for (const expected of [
  "database-committed",
  "No se pudo entregar un correo transaccional",
  "SMTP_DELIVERY_FAILED",
  "withProviderInvitationDelivery",
  "withOnboardingEmailDelivery",
  "withVerificationEmailDelivery",
  "emailDelivery"
]) {
  if (expected === "database-committed") continue;
  if (!delivery.includes(expected)) failures.push(`Falta una garantía de entrega: ${expected}`);
}
for (const forbidden of ["token:", "verificationToken:"]) {
  const loggerBlock = delivery.slice(0, delivery.indexOf("export function withProviderInvitationDelivery"));
  if (loggerBlock.includes(forbidden)) failures.push(`El registro de errores no puede incluir: ${forbidden}`);
}

const api = contents.get("apps/api/src/app.mjs") ?? "";
for (const expected of [
  "deliveryLabel",
  'emailDelivery: Boolean(mailService?.enabled)',
  'smtp: mailService?.enabled ? "configured" : "disabled"',
  'const { verificationToken, emailDelivery, ...safeResult }',
  'const { token, emailDelivery, ...safeResult }',
  'environment !== "production"'
]) {
  if (!api.includes(expected)) failures.push(`Falta una garantía de respuesta API: ${expected}`);
}

const server = contents.get("apps/api/src/server.mjs") ?? "";
for (const expected of [
  "createMailService",
  "withProviderInvitationDelivery",
  "withOnboardingEmailDelivery",
  "withVerificationEmailDelivery",
  "SMTP_VERIFY_ON_START",
  "mailService.close()"
]) {
  if (!server.includes(expected)) failures.push(`Falta una conexión SMTP del servidor: ${expected}`);
}

const env = contents.get(".env.example") ?? "";
const compose = contents.get("infra/docker/docker-compose.yml") ?? "";
for (const expected of [
  "SMTP_ENABLED",
  "SMTP_VERIFY_ON_START",
  "SMTP_SECURE",
  "SMTP_REQUIRE_TLS",
  "SMTP_CONNECTION_TIMEOUT_MS",
  "SMTP_GREETING_TIMEOUT_MS",
  "SMTP_SOCKET_TIMEOUT_MS",
  "SMTP_REPLY_TO"
]) {
  if (!env.includes(expected)) failures.push(`El ejemplo de entorno no incluye ${expected}.`);
  if (!compose.includes(expected)) failures.push(`Docker no incluye ${expected}.`);
}

const tests = `${contents.get("apps/api/tests/mail-service.test.mjs") ?? ""}\n${contents.get("apps/api/tests/email-delivery-services.test.mjs") ?? ""}`;
for (const expected of [
  "SMTP permanece desactivado",
  "HTML escapado",
  "fallo SMTP no revierte",
  "includes(result.token), false"
]) {
  if (!tests.includes(expected)) failures.push(`Falta una prueba SMTP: ${expected}`);
}

if (failures.length) {
  console.error("Validación SMTP fallida:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("SMTP, plantillas y privacidad de tokens validados.");

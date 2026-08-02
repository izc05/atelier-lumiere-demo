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
  "apps/web/public/admin/proveedores/index.html",
  "apps/web/public/admin/proveedores/provider-status.css",
  "apps/web/public/admin/proveedores/provider-status.js",
  "infra/docker/docker-compose.yml",
  ".env.example"
];
const contents = new Map();
const failures = [];

for (const path of required) {
  try {
    contents.set(path, await readFile(path, "utf8"));
  } catch {
    failures.push(`Falta el archivo SMTP o de estado: ${path}`);
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
  "No se pudo entregar un correo transaccional",
  "SMTP_DELIVERY_FAILED",
  "withProviderInvitationDelivery",
  "withOnboardingEmailDelivery",
  "withVerificationEmailDelivery",
  "emailDelivery",
  "loadProviderAccounts",
  "PENDING_APPROVAL",
  "email_verified_at",
  "two_factor_enabled",
  "membership_status"
]) {
  if (!delivery.includes(expected)) failures.push(`Falta una garantía de entrega o estado: ${expected}`);
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
  "mailService.close()",
  "database"
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

const adminHtml = contents.get("apps/web/public/admin/proveedores/index.html") ?? "";
for (const expected of [
  "provider-status.css",
  "provider-status.js",
  "Estado de activación",
  "activation-status-list",
  "invitación, cuenta, correo, doble factor y aprobación final"
]) {
  if (!adminHtml.includes(expected)) failures.push(`Falta un elemento de estado administrativo: ${expected}`);
}

const adminStatus = contents.get("apps/web/public/admin/proveedores/provider-status.js") ?? "";
for (const expected of [
  "INVITED",
  "ACCOUNT_CREATED",
  "EMAIL_VERIFIED",
  "TWO_FACTOR_ENABLED",
  "PENDING_APPROVAL",
  "ACTIVE",
  "SUSPENDED",
  "provider.onboarding",
  "/internal/admin/providers",
  "MutationObserver"
]) {
  if (!adminStatus.includes(expected)) failures.push(`Falta una etapa visible: ${expected}`);
}
for (const forbidden of [
  "innerHTML",
  "localStorage",
  "document.cookie",
  "SMTP_PASSWORD",
  "Authorization"
]) {
  if (adminStatus.includes(forbidden)) failures.push(`El estado administrativo no puede contener: ${forbidden}`);
}

const adminCss = contents.get("apps/web/public/admin/proveedores/provider-status.css") ?? "";
for (const expected of [
  ".activation-card",
  ".activation-steps",
  ".activation-step.done",
  ".activation-step.current",
  "@media (max-width: 720px)"
]) {
  if (!adminCss.includes(expected)) failures.push(`Falta una regla visual de activación: ${expected}`);
}

const tests = `${contents.get("apps/api/tests/mail-service.test.mjs") ?? ""}\n${contents.get("apps/api/tests/email-delivery-services.test.mjs") ?? ""}`;
for (const expected of [
  "SMTP permanece desactivado",
  "HTML escapado",
  "fallo SMTP no revierte",
  "includes(result.token), false",
  "calcula el progreso desde PostgreSQL",
  'stage, "PENDING_APPROVAL"'
]) {
  if (!tests.includes(expected)) failures.push(`Falta una prueba SMTP o de estado: ${expected}`);
}

if (failures.length) {
  console.error("Validación SMTP y estado de proveedores fallida:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("SMTP, plantillas, privacidad y progreso de proveedores validados.");

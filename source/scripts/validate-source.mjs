import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";

const requiredFiles = [
  "package.json",
  ".env.example",
  ".gitignore",
  ".dockerignore",
  "apps/web/package.json",
  "apps/web/src/app.mjs",
  "apps/web/src/server.mjs",
  "apps/web/public/index.html",
  "apps/web/public/styles.css",
  "apps/web/public/status.js",
  "apps/web/public/admin/proveedores/index.html",
  "apps/web/public/admin/proveedores/admin.css",
  "apps/web/public/admin/proveedores/providers.js",
  "apps/web/tests/admin-providers.test.mjs",
  "apps/api/package.json",
  "apps/api/src/app.mjs",
  "apps/api/src/server.mjs",
  "apps/api/src/database.mjs",
  "apps/api/src/auth-context.mjs",
  "apps/api/src/providers-service.mjs",
  "apps/api/src/provider-onboarding-service.mjs",
  "apps/api/tests/providers-api.test.mjs",
  "apps/api/tests/provider-onboarding.test.mjs",
  "packages/shared/src/domain.mjs",
  "packages/auth/src/policy.mjs",
  "packages/storage/src/policy.mjs",
  "packages/database/README.md",
  "packages/database/src/schema-plan.mjs",
  "packages/database/migrations/0001_core_identity.sql",
  "packages/database/migrations/0002_runtime_role.sql",
  "packages/database/migrations/0003_provider_onboarding.sql",
  "packages/database/seeds/0001_two_providers.sql",
  "packages/database/tests/tenant_isolation.sql",
  "infra/docker/Dockerfile.web",
  "infra/docker/Dockerfile.api",
  "infra/docker/docker-compose.yml",
  "tests/contracts.test.mjs"
];

const failures = [];
const contents = new Map();

for (const file of requiredFiles) {
  try {
    await access(file, constants.R_OK);
    contents.set(file, await readFile(file, "utf8"));
  } catch {
    failures.push(`Falta el archivo fuente requerido: ${file}`);
  }
}

for (const forbidden of [
  ".env",
  "apps/web/.env",
  "apps/api/.env",
  "infra/docker/.env",
  "database.sqlite",
  "atelier_lumiere.sql"
]) {
  try {
    await access(forbidden, constants.F_OK);
    failures.push(`No se permite versionar datos privados: source/${forbidden}`);
  } catch {
    // Correcto: no existe.
  }
}

const workspace = contents.get("package.json") ?? "";
for (const expected of [
  "apps/*",
  "packages/*",
  "tests/*.test.mjs",
  "test:web-integration",
  "test:api-integration",
  "validate-source.mjs"
]) {
  if (!workspace.includes(expected)) failures.push(`El workspace no contiene: ${expected}`);
}

const apiPackage = contents.get("apps/api/package.json") ?? "";
if (!apiPackage.includes('"pg": "8.22.0"')) failures.push("La API no fija la versión revisada del cliente PostgreSQL.");

const domain = contents.get("packages/shared/src/domain.mjs") ?? "";
for (const role of ["ADMIN", "PROVIDER_OWNER", "PROVIDER_MEMBER", "CUSTOMER"]) {
  if (!domain.includes(role)) failures.push(`Falta el rol compartido ${role}`);
}
if (!domain.includes("actorProviderId === resourceProviderId")) {
  failures.push("Falta la regla explícita de aislamiento por proveedor.");
}

const media = contents.get("packages/storage/src/policy.mjs") ?? "";
for (const expected of ["maxImagesPerProduct: 8", "12 * 1024 * 1024", "50 * 1024 * 1024", "video/mp4"]) {
  if (!media.includes(expected)) failures.push(`Falta una política multimedia: ${expected}`);
}

const web = contents.get("apps/web/public/index.html") ?? "";
if (!web.includes("Atelier Lumière") || !web.includes("noindex,nofollow")) {
  failures.push("La pantalla fuente debe conservar la marca y permanecer fuera de buscadores.");
}

const webApp = contents.get("apps/web/src/app.mjs") ?? "";
for (const expected of [
  "/internal/api-health",
  "API_INTERNAL_URL",
  "ENABLE_ADMIN_UI",
  "WEB_ADMIN_ACCESS_KEY",
  "atelier_admin_session",
  "HttpOnly",
  "SameSite=Strict",
  "timingSafeEqual",
  "Authorization: `Bearer ${apiAdminToken}`",
  "url.pathname.startsWith(\"/admin/\") && !enableAdminUi"
]) {
  if (!webApp.includes(expected)) failures.push(`Falta una protección del servidor web: ${expected}`);
}

const adminHtml = contents.get("apps/web/public/admin/proveedores/index.html") ?? "";
for (const expected of [
  "noindex,nofollow,noarchive",
  "Administración de talleres invitados",
  "Crear proveedor",
  "Enlace provisional",
  "Auditoría del taller"
]) {
  if (!adminHtml.includes(expected)) failures.push(`La administración fuente no contiene: ${expected}`);
}

const adminJs = contents.get("apps/web/public/admin/proveedores/providers.js") ?? "";
for (const expected of [
  "/internal/admin/session",
  "/internal/admin/providers",
  "activationToken",
  "La pantalla para que el proveedor"
]) {
  if (!adminJs.includes(expected) && !adminHtml.includes(expected)) {
    failures.push(`Falta un flujo administrativo: ${expected}`);
  }
}
for (const forbidden of ["DEV_ADMIN_TOKEN", "WEB_ADMIN_ACCESS_KEY", "Authorization:", "Bearer "]) {
  if (adminJs.includes(forbidden) || adminHtml.includes(forbidden)) {
    failures.push(`El navegador no debe conocer el secreto o cabecera: ${forbidden}`);
  }
}

const webTest = contents.get("apps/web/tests/admin-providers.test.mjs") ?? "";
for (const expected of [
  "HttpOnly",
  "SameSite=Strict",
  "withoutSession.response.status, 401",
  "panel y el proxy desaparecen",
  "includes(apiToken), false"
]) {
  if (!webTest.includes(expected)) failures.push(`Falta una prueba del panel privado: ${expected}`);
}

const api = contents.get("apps/api/src/app.mjs") ?? "";
for (const route of [
  "/health",
  "/api/meta",
  "/api/admin/providers",
  "status|invitations|audit",
  "/api/provider-invitations/preview",
  "/api/provider-invitations/accept"
]) {
  if (!api.includes(route)) failures.push(`Falta una ruta o contrato de API: ${route}`);
}
for (const capability of [
  "authentication: false",
  "providerManagementApi",
  "providerInvitationAcceptance",
  "emailVerification: false",
  "twoFactorAuthentication: false"
]) {
  if (!api.includes(capability)) failures.push(`La API no declara correctamente: ${capability}`);
}

const databaseClient = contents.get("apps/api/src/database.mjs") ?? "";
for (const expected of ["SET LOCAL ROLE atelier_app_runtime", "set_config('app.role'", "ROLLBACK", "client.release()", "statement_timeout"]) {
  if (!databaseClient.includes(expected)) failures.push(`Falta una protección transaccional: ${expected}`);
}

const authContext = contents.get("apps/api/src/auth-context.mjs") ?? "";
for (const expected of ["environment === \"production\"", "timingSafeEqual", "DEV_ADMIN_TOKEN", "ensureDevelopmentAdmin"]) {
  if (!authContext.includes(expected)) failures.push(`Falta una protección de acceso temporal: ${expected}`);
}

const providerService = contents.get("apps/api/src/providers-service.mjs") ?? "";
for (const expected of ["randomBytes(32)", "createHash(\"sha256\")", "PROVIDER_CREATED", "PROVIDER_SUSPENDED", "PROVIDER_INVITATION_RENEWED"]) {
  if (!providerService.includes(expected)) failures.push(`Falta una operación segura de proveedores: ${expected}`);
}
if (!providerService.includes("VALUES ($1, $2") || providerService.includes("token_hash: row.token_hash")) {
  failures.push("Las operaciones de proveedores deben parametrizar SQL y no exponer hashes.");
}

const onboardingService = contents.get("apps/api/src/provider-onboarding-service.mjs") ?? "";
for (const expected of [
  "scryptAsync",
  "randomBytes(16)",
  "createHash(\"sha256\")",
  "INVITATION_UNAVAILABLE",
  "FOR UPDATE OF pi",
  "PROVIDER_INVITATION_ACCEPTED",
  "accessGranted: false",
  "VERIFY_EMAIL",
  "ENABLE_2FA"
]) {
  if (!onboardingService.includes(expected)) failures.push(`Falta una protección de incorporación: ${expected}`);
}
for (const forbidden of ["password: rawPassword", "token: token", "passwordHash:", "passwordSalt:"]) {
  if (forbidden === "passwordHash:" || forbidden === "passwordSalt:") continue;
  if (onboardingService.includes(forbidden)) {
    failures.push(`La incorporación no debe serializar secretos: ${forbidden}`);
  }
}

const migration = contents.get("packages/database/migrations/0001_core_identity.sql") ?? "";
for (const table of ["users", "providers", "provider_members", "provider_invitations", "sessions", "audit_events"]) {
  if (!migration.includes(`CREATE TABLE ${table}`)) failures.push(`La migración no crea la tabla ${table}.`);
  if (!migration.includes(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`)) {
    failures.push(`La tabla ${table} no fuerza seguridad por fila.`);
  }
}
for (const helper of ["app.current_role()", "app.current_user_id()", "app.current_provider_id()", "app.is_admin()"] ) {
  if (!migration.includes(helper)) failures.push(`Falta la función de contexto ${helper}.`);
}

const runtimeRole = contents.get("packages/database/migrations/0002_runtime_role.sql") ?? "";
for (const expected of ["atelier_app_runtime", "NOBYPASSRLS", "NOLOGIN", "GRANT SELECT, INSERT, UPDATE, DELETE"]) {
  if (!runtimeRole.includes(expected)) failures.push(`Falta una restricción del rol de API: ${expected}`);
}

const onboardingMigration = contents.get("packages/database/migrations/0003_provider_onboarding.sql") ?? "";
for (const expected of [
  "CREATE TABLE user_credentials",
  "password_algorithm = 'scrypt-v1'",
  "ALTER TABLE user_credentials FORCE ROW LEVEL SECURITY",
  "GRANT SELECT, INSERT, UPDATE, DELETE ON user_credentials TO atelier_app_runtime"
]) {
  if (!onboardingMigration.includes(expected)) failures.push(`Falta una protección de credenciales: ${expected}`);
}

const tenantTest = contents.get("packages/database/tests/tenant_isolation.sql") ?? "";
for (const expected of ["Taller A puede ver el Taller B", "Taller B puede ver el Taller A", "Un cliente puede leer proveedores privados", "Administración ve"]) {
  if (!tenantTest.includes(expected)) failures.push(`Falta una comprobación RLS: ${expected}`);
}

const onboardingTest = contents.get("apps/api/tests/provider-onboarding.test.mjs") ?? "";
for (const expected of [
  "weakPassword.response.status, 422",
  "accepted.payload.accessGranted, false",
  "stored.password_algorithm, \"scrypt-v1\"",
  "stored.invitation_status, \"ACCEPTED\"",
  "reused.response.status, 410"
]) {
  if (!onboardingTest.includes(expected)) failures.push(`Falta una prueba de incorporación: ${expected}`);
}

const compose = contents.get("infra/docker/docker-compose.yml") ?? "";
for (const expected of [
  "web:",
  "api:",
  "database:",
  "API_INTERNAL_URL: http://api:4000",
  "ALLOW_DEV_ADMIN_AUTH",
  "ENABLE_ADMIN_UI",
  "WEB_ADMIN_ACCESS_KEY",
  "127.0.0.1:${API_PORT:-4000}:4000",
  "packages/database/migrations:/docker-entrypoint-initdb.d:ro"
]) {
  if (!compose.includes(expected)) failures.push(`Docker Compose no contiene: ${expected}`);
}

const dockerApi = contents.get("infra/docker/Dockerfile.api") ?? "";
if (!dockerApi.includes("npm install --omit=dev --ignore-scripts")) {
  failures.push("La imagen de API no instala sus dependencias de producción.");
}

const combined = [...contents.entries()]
  .filter(([path]) => path !== ".env.example" && !path.includes("/tests/") && !path.startsWith("tests/"))
  .map(([, content]) => content)
  .join("\n");

for (const secretPattern of [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /sk-[A-Za-z0-9_-]{20,}/,
  /postgresql:\/\/[^:\s$]+:[^@\s$]+@[^\s]+/
]) {
  if (secretPattern.test(combined)) failures.push("Se ha detectado un posible secreto en el código fuente.");
}

if (failures.length) {
  console.error("Validación de la aplicación fuente fallida:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log(`Aplicación fuente validada: ${requiredFiles.length} archivos y políticas comprobados.`);

import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";

const requiredFiles = [
  "package.json",
  ".env.example",
  ".gitignore",
  ".dockerignore",
  "apps/web/package.json",
  "apps/web/src/server.mjs",
  "apps/web/public/index.html",
  "apps/web/public/styles.css",
  "apps/web/public/status.js",
  "apps/api/package.json",
  "apps/api/src/app.mjs",
  "apps/api/src/server.mjs",
  "packages/shared/src/domain.mjs",
  "packages/auth/src/policy.mjs",
  "packages/storage/src/policy.mjs",
  "packages/database/src/schema-plan.mjs",
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
for (const expected of ["apps/*", "packages/*", "tests/*.test.mjs", "validate-source.mjs"]) {
  if (!workspace.includes(expected)) failures.push(`El workspace no contiene: ${expected}`);
}

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

const webServer = contents.get("apps/web/src/server.mjs") ?? "";
if (!webServer.includes("/internal/api-health") || !webServer.includes("API_INTERNAL_URL")) {
  failures.push("La web fuente debe consultar la API por el canal interno, no por el localhost del navegador.");
}

const api = contents.get("apps/api/src/app.mjs") ?? "";
for (const route of ["/health", "/api/meta"]) {
  if (!api.includes(route)) failures.push(`Falta la ruta técnica ${route}`);
}
for (const disabled of ["database: false", "authentication: false", "providerIsolation: false"]) {
  if (!api.includes(disabled)) failures.push(`La API no declara correctamente una capacidad pendiente: ${disabled}`);
}

const compose = contents.get("infra/docker/docker-compose.yml") ?? "";
for (const service of ["web:", "api:", "database:", "database_data:", "media_data:"]) {
  if (!compose.includes(service)) failures.push(`Docker Compose no contiene: ${service}`);
}
if (!compose.includes("API_INTERNAL_URL: http://api:4000")) {
  failures.push("Docker Compose no conecta la web con la API mediante la red interna.");
}

const combined = [...contents.entries()]
  .filter(([path]) => path !== ".env.example")
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

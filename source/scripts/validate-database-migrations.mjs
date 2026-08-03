import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

const paths = [
  "apps/api/src/migrate-database.mjs",
  "apps/api/tests/migrate-database.test.mjs",
  "apps/api/package.json",
  "package.json",
  ".env.example",
  "infra/docker/Dockerfile.api",
  "infra/docker/docker-compose.yml",
  "packages/database/README.md",
  "docs/MINI_PC_INSTALL.md"
];
const files = Object.fromEntries(await Promise.all(paths.map(async (path) => [
  path,
  await readFile(new URL(`../${path}`, import.meta.url), "utf8")
])));

const runner = files["apps/api/src/migrate-database.mjs"];
const tests = files["apps/api/tests/migrate-database.test.mjs"];
const apiPackage = files["apps/api/package.json"];
const rootPackage = files["package.json"];
const env = files[".env.example"];
const dockerfile = files["infra/docker/Dockerfile.api"];
const compose = files["infra/docker/docker-compose.yml"];
const databaseReadme = files["packages/database/README.md"];
const installGuide = files["docs/MINI_PC_INSTALL.md"];

for (const expected of [
  "schema_migrations",
  "checksum_sha256",
  "pg_advisory_lock",
  "APPLIED_MIGRATION_CHANGED",
  "APPLIED_MIGRATION_MISSING",
  "MIGRATION_HISTORY_GAP",
  "UNTRACKED_EXISTING_SCHEMA",
  "SELECT set_config('statement_timeout'",
  "ROLLBACK",
  "pg_advisory_unlock"
]) {
  assert.match(runner, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}
assert.doesNotMatch(runner, /DUPLICATE_MIGRATION_VERSION/);
assert.doesNotMatch(runner, /console\.(?:log|info)[^\n]*(?:DATABASE_URL|connectionString)/);

for (const expected of [
  "aplica solo las pendientes",
  "acepta prefijos numéricos repetidos",
  "bloquea una migración aplicada cuyo contenido cambió",
  "rechaza una base antigua con tablas pero sin historial",
  "libera el bloqueo incluso cuando falla una migración"
]) {
  assert.match(tests, new RegExp(expected));
}

assert.match(apiPackage, /"migrate": "node src\/migrate-database\.mjs"/);
assert.match(rootPackage, /"migrate": "npm --workspace @atelier-lumiere\/api run migrate"/);
assert.match(env, /MIGRATION_STATEMENT_TIMEOUT_MS=120000/);
assert.match(env, /MIGRATION_LOCK_TIMEOUT_MS=10000/);
assert.match(dockerfile, /COPY packages\/database\/migrations \.\/migrations/);
assert.match(dockerfile, /ENV MIGRATIONS_PATH=\/app\/migrations/);

for (const expected of [
  "migrate:",
  'command: ["node", "src/migrate-database.mjs"]',
  "MIGRATIONS_PATH: /app/migrations",
  "condition: service_completed_successfully"
]) {
  assert.match(compose, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

const activeComposeLines = compose
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("#"))
  .join("\n");
assert.doesNotMatch(activeComposeLines, /docker-entrypoint-initdb\.d/);

for (const expected of [
  "SHA-256",
  "misma transacción",
  "UNTRACKED_EXISTING_SCHEMA",
  "orden de nombre"
]) {
  assert.match(databaseReadme, new RegExp(expected));
}
for (const expected of [
  "logs --tail=100 migrate",
  "run --rm migrate",
  "Nunca se debe borrar `database_data`"
]) {
  assert.match(installGuide, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

const migrationDirectory = new URL("../packages/database/migrations/", import.meta.url);
const migrationNames = (await readdir(migrationDirectory))
  .filter((filename) => filename.endsWith(".sql"))
  .sort();
assert.ok(migrationNames.length >= 31, "Deben conservarse todas las migraciones existentes.");

const filenames = new Set();
for (const filename of migrationNames) {
  assert.match(filename, /^(\d{4})_[a-z0-9_]+\.sql$/);
  assert.equal(filenames.has(filename), false, `Nombre repetido: ${filename}`);
  filenames.add(filename);

  const sql = (await readFile(new URL(filename, migrationDirectory), "utf8"))
    .replace(/^\uFEFF/, "")
    .trim();
  assert.match(sql, /^BEGIN;\s*/i, `${filename} debe comenzar con BEGIN;`);
  assert.match(sql, /\s*COMMIT;\s*$/i, `${filename} debe terminar con COMMIT;`);
}

console.log(`Migraciones incrementales validadas: ${migrationNames.length} archivos SQL.`);

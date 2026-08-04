import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const paths = [
  "scripts/backup-database.sh",
  "scripts/verify-database-backup.sh",
  "scripts/restore-database-backup.sh",
  "package.json",
  ".gitignore",
  "infra/docker/docker-compose.yml",
  "docs/MINI_PC_INSTALL.md"
];
const files = Object.fromEntries(await Promise.all(paths.map(async (path) => [
  path,
  await readFile(new URL(`../${path}`, import.meta.url), "utf8")
])));

for (const shellScript of paths.filter((path) => path.endsWith(".sh"))) {
  const result = spawnSync("bash", ["-n", shellScript], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8"
  });
  assert.equal(
    result.status,
    0,
    `${shellScript} no supera bash -n:\n${result.stderr || result.stdout}`
  );
}

const backup = files["scripts/backup-database.sh"];
const verify = files["scripts/verify-database-backup.sh"];
const restore = files["scripts/restore-database-backup.sh"];
const packageJson = files["package.json"];
const gitignore = files[".gitignore"];
const compose = files["infra/docker/docker-compose.yml"];
const guide = files["docs/MINI_PC_INSTALL.md"];

for (const expected of [
  "set -Eeuo pipefail",
  "umask 077",
  "pg_dump",
  "--format=custom",
  "--no-owner",
  "--no-privileges",
  "pg_restore --list",
  "sha256sum",
  ".part",
  ".atelier-backup.lock",
  "chmod 600"
]) {
  assert.match(backup, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}
assert.doesNotMatch(backup, /POSTGRES_PASSWORD|DATABASE_URL/);

for (const expected of [
  "sha256sum --check",
  "createdb",
  "pg_restore",
  "--exit-on-error",
  "schema_migrations",
  "dropdb --if-exists --force",
  "La base activa no ha sido modificada"
]) {
  assert.match(verify, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

for (const expected of [
  "RESTORE_ACTIVE_DATABASE",
  "verify-database-backup.sh",
  "stop web api",
  "ALTER DATABASE",
  "ROLLBACK_DATABASE",
  "SWAP_COMPLETED",
  "run --rm migrate",
  "Base anterior conservada",
  "Reiniciando la aplicación con la base original"
]) {
  assert.match(restore, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}
assert.doesNotMatch(restore, /dropdb[^\n]*ROLLBACK_DATABASE/);
assert.doesNotMatch(restore, /POSTGRES_PASSWORD|DATABASE_URL/);

assert.match(packageJson, /"backup:database"/);
assert.match(packageJson, /"verify:backup"/);
assert.match(packageJson, /"restore:database"/);
assert.match(gitignore, /\/backups\/\*/);

assert.match(compose, /fetch\('http:\/\/127\.0\.0\.1:4000\/health'\)/);
assert.match(compose, /process\.exit\(response\.ok \? 0 : 1\)/);
assert.doesNotMatch(compose, /test:\s*\["CMD",\s*"wget"/);

for (const expected of [
  "backup:pilot",
  "conjunto verificado",
  "RESTORE_ACTIVE_DATABASE",
  "base anterior",
  "prueba de restauración"
]) {
  assert.match(guide.toLocaleLowerCase("es"), new RegExp(
    expected.toLocaleLowerCase("es").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  ));
}

console.log("Copias, verificación y restauración segura validadas.");

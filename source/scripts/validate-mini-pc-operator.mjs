import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const paths = [
  "scripts/mini-pc-init-env.sh",
  "scripts/mini-pc-preflight.sh",
  "scripts/mini-pc-deploy.sh",
  "package.json",
  "docs/MINI_PC_OPERATOR.md"
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

const initEnv = files["scripts/mini-pc-init-env.sh"];
const preflight = files["scripts/mini-pc-preflight.sh"];
const deploy = files["scripts/mini-pc-deploy.sh"];
const packageJson = files["package.json"];
const guide = files["docs/MINI_PC_OPERATOR.md"];

for (const expected of [
  "umask 077",
  "openssl rand -hex 32",
  "openssl rand -base64 32",
  "No se sobrescribirá",
  "chmod 600",
  "ALLOW_DEV_ADMIN_AUTH=false",
  "DEV_ADMIN_TOKEN=",
  "SMTP_ENABLED=false",
  "Los secretos no se han mostrado"
]) {
  assert.match(initEnv, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}
assert.doesNotMatch(initEnv, /printf[^\n]*(?:POSTGRES_PASSWORD|AUTH_SECRET|AUTH_LOGIN_PEPPER|TWO_FACTOR_ENCRYPTION_KEY_BASE64|TWO_FACTOR_RECOVERY_PEPPER)/);
assert.doesNotMatch(initEnv, /(?:^|\n)\s*(?:source|\.)\s+/);

for (const expected of [
  "docker info",
  "docker compose version",
  "NODE_ENV debe ser production",
  "ALLOW_DEV_ADMIN_AUTH debe ser false",
  "TWO_FACTOR_ENCRYPTION_KEY_BASE64",
  "openssl base64 -d -A",
  "status --porcelain",
  "branch --show-current",
  "config --quiet",
  "PRECHECK FALLIDO",
  "PRECHECK CORRECTO"
]) {
  assert.match(preflight, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}
assert.doesNotMatch(preflight, /(?:^|\n)\s*(?:source|\.)\s+["']?\$?\{?ENV_FILE/);
assert.doesNotMatch(preflight, /cat\s+["']?\$?\{?ENV_FILE/);

for (const expected of [
  '"install"',
  '"update"',
  "--dry-run",
  "mini-pc-preflight.sh",
  "backup:pilot",
  "git -C",
  "merge --ff-only origin/main",
  "La base ya contiene",
  "Usa el modo update",
  "run --rm migrate",
  "wait_for_healthy",
  "wait_for_healthy database 60",
  "deployments",
  "bootstrap:platform-owner",
  "DESPLIEGUE COMPLETADO CORRECTAMENTE"
]) {
  assert.match(deploy, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

const backupIndex = deploy.indexOf("run backup:pilot");
const fetchIndex = deploy.indexOf("fetch --prune origin main");
assert.ok(backupIndex >= 0, "El despliegue debe crear una copia completa antes de actualizar.");
assert.ok(fetchIndex > backupIndex, "Git no debe actualizarse antes de verificar la copia completa.");

const databaseStartIndex = deploy.indexOf('up -d database');
const databaseWaitIndex = deploy.indexOf('wait_for_healthy database 60');
const databaseInspectionIndex = deploy.indexOf('EXISTING_TABLES=');
assert.ok(databaseStartIndex >= 0, "El despliegue debe arrancar PostgreSQL.");
assert.ok(databaseWaitIndex > databaseStartIndex, "El despliegue debe esperar a PostgreSQL después de arrancarlo.");
assert.ok(databaseInspectionIndex > databaseWaitIndex, "No se debe consultar PostgreSQL antes de que esté saludable.");

for (const forbidden of [
  "git reset --hard",
  "git clean -fd",
  "docker compose down -v",
  "docker volume rm",
  "restore:database",
  "RESTORE_ACTIVE_DATABASE"
]) {
  assert.equal(deploy.includes(forbidden), false, `El deploy no debe contener: ${forbidden}`);
}
assert.doesNotMatch(deploy, /(?:POSTGRES_PASSWORD|AUTH_LOGIN_PEPPER|TWO_FACTOR_RECOVERY_PEPPER)[^\n]*printf/);

assert.match(packageJson, /"init:mini-pc"/);
assert.match(packageJson, /"preflight:mini-pc"/);
assert.match(packageJson, /"deploy:mini-pc"/);

for (const expected of [
  "Codex puede ejecutar",
  "Requiere a la persona responsable",
  "init:mini-pc",
  "--mode install",
  "update --dry-run",
  "copia se crea **antes**",
  "No ejecuta `git reset --hard`",
  "no borra volúmenes",
  "No muestres ni modifiques secretos"
]) {
  assert.match(guide, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

console.log("Asistentes seguros de configuración, instalación y actualización del mini PC validados.");

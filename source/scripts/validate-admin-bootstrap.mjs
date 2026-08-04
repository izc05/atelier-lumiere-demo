import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = Object.fromEntries(await Promise.all([
  "apps/api/src/admin-bootstrap-service.mjs",
  "apps/api/src/bootstrap-platform-owner.mjs",
  "apps/api/tests/admin-bootstrap.test.mjs",
  "apps/api/package.json",
  "package.json",
  "infra/docker/Dockerfile.api",
  "docs/MINI_PC_INSTALL.md"
].map(async (path) => [path, await readFile(new URL(`../${path}`, import.meta.url), "utf8")])));

const service = files["apps/api/src/admin-bootstrap-service.mjs"];
const cli = files["apps/api/src/bootstrap-platform-owner.mjs"];
const test = files["apps/api/tests/admin-bootstrap.test.mjs"];
const apiPackage = files["apps/api/package.json"];
const rootPackage = files["package.json"];
const dockerfile = files["infra/docker/Dockerfile.api"];
const guide = files["docs/MINI_PC_INSTALL.md"];

for (const expected of [
  "pg_advisory_xact_lock",
  "PLATFORM_OWNER_ALREADY_EXISTS",
  "scrypt-v1",
  "aes-256-gcm",
  "PLATFORM_OWNER_BOOTSTRAPPED",
  "LOCAL_INTERACTIVE_TTY",
  "user_recovery_codes"
]) {
  assert.match(service, new RegExp(expected));
}
assert.doesNotMatch(service, /password:\s*(?:input|prepared)\.password/);
assert.doesNotMatch(service, /totpSecret[^\n]*metadata/);
assert.doesNotMatch(service, /recoveryCodes[^\n]*metadata/);

for (const expected of [
  "process.stdin.isTTY",
  "readHiddenLine",
  "QRCode.toString",
  "docker compose exec -it api",
  "CÓDIGOS DE RECUPERACIÓN"
]) {
  assert.match(cli + guide, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}
assert.doesNotMatch(cli, /process\.argv[^\n]*(?:password|secret|recovery)/i);
assert.match(apiPackage, /bootstrap:platform-owner/);
assert.match(rootPackage, /bootstrap:platform-owner/);
assert.match(dockerfile, /COPY apps\/api\/src \.\/src/);

for (const expected of [
  "un código incorrecto no inicia ninguna transacción",
  "bloquea el bootstrap cuando ya existe cualquier PLATFORM_OWNER",
  "includes(PASSWORD), false"
]) {
  assert.match(test, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

assert.match(guide, /deploy:mini-pc -- update/);
assert.match(guide, /ENABLE_ADMIN_UI=true/);
assert.match(guide, /Nunca ejecutar/);
assert.match(guide, /contraseñas, TOTP o códigos de recuperación/);

console.log("Bootstrap administrativo y guía del mini PC validados.");

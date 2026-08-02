import { readFile } from "node:fs/promises";

const files = new Map();
for (const path of [
  ".env.example",
  "apps/api/src/app.mjs",
  "apps/api/src/server.mjs",
  "apps/api/src/email-verification-service.mjs",
  "apps/api/src/two-factor-service.mjs",
  "apps/api/tests/two-factor.test.mjs",
  "packages/database/migrations/0005_two_factor_authentication.sql",
  "packages/database/src/schema-plan.mjs",
  "infra/docker/docker-compose.yml"
]) {
  files.set(path, await readFile(path, "utf8"));
}

const failures = [];
function requireText(path, values) {
  const content = files.get(path) ?? "";
  for (const value of values) {
    if (!content.includes(value)) failures.push(`${path} no contiene: ${value}`);
  }
}

requireText(".env.example", [
  "TWO_FACTOR_SETUP_TTL_MINUTES=15",
  "TWO_FACTOR_ENCRYPTION_KEY_BASE64",
  "TWO_FACTOR_RECOVERY_PEPPER",
  "REQUIRE_PROVIDER_2FA=true"
]);

requireText("apps/api/src/app.mjs", [
  "/api/two-factor/setup",
  "/api/two-factor/confirm",
  "twoFactorAuthentication: Boolean(twoFactorService)"
]);

requireText("apps/api/src/server.mjs", [
  "createTwoFactorService",
  "twoFactorService"
]);

requireText("apps/api/src/email-verification-service.mjs", [
  "issueTwoFactorContinuation",
  "twoFactorSetupToken",
  "twoFactorSetupExpiresAt",
  "accessGranted: false"
]);

requireText("apps/api/src/two-factor-service.mjs", [
  "aes-256-gcm",
  "createHmac(\"sha256\", pepper)",
  "randomBytes(20)",
  "MAX_SETUP_ATTEMPTS = 5",
  "PROVIDER_2FA_CODE_REJECTED",
  "TWO_FACTOR_SETUP_LOCKED",
  "PROVIDER_2FA_ENABLED",
  "recoveryCodes",
  "publicationEnabled",
  "ADMIN_PROVIDER_ACTIVATION"
]);

requireText("packages/database/migrations/0005_two_factor_authentication.sql", [
  "CREATE TABLE onboarding_continuations",
  "failed_attempts integer NOT NULL DEFAULT 0",
  "CREATE TABLE user_totp_credentials",
  "secret_ciphertext",
  "secret_auth_tag",
  "CREATE TABLE user_recovery_codes",
  "FORCE ROW LEVEL SECURITY",
  "TO atelier_app_runtime"
]);

requireText("packages/database/src/schema-plan.mjs", [
  "onboarding_continuations",
  "user_totp_credentials",
  "user_recovery_codes",
  "totpSecretsEncryptedWithAuthenticatedEncryption: true",
  "recoveryCodesStoredAsKeyedHashes: true",
  "twoFactorSetupHasLimitedAttempts: true"
]);

requireText("infra/docker/docker-compose.yml", [
  "TWO_FACTOR_SETUP_TTL_MINUTES",
  "TWO_FACTOR_ENCRYPTION_KEY_BASE64",
  "TWO_FACTOR_RECOVERY_PEPPER"
]);

requireText("apps/api/tests/two-factor.test.mjs", [
  "setup.payload.attemptsRemaining, 5",
  "incorrect.payload.details.attemptsRemaining, 4",
  "confirmed.payload.recoveryCodes.length, 10",
  "confirmed.payload.provider.publicationEnabled, false",
  "storedAfterConfirm.account.user_status, \"ACTIVE\"",
  "PROVIDER_2FA_CODE_REJECTED"
]);

const service = files.get("apps/api/src/two-factor-service.mjs") ?? "";
for (const forbidden of [
  "secret_plaintext",
  "recovery_code text",
  "metadata: { secret",
  "metadata: { recoveryCodes"
]) {
  if (service.includes(forbidden)) failures.push(`El servicio 2FA contiene un patrón prohibido: ${forbidden}`);
}

if (failures.length) {
  console.error("Validación 2FA fallida:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("Doble factor validado: cifrado, intentos, recuperación y activación controlada.");

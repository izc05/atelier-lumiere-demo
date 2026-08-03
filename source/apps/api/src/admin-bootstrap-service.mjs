import {
  createCipheriv,
  createHmac,
  randomBytes,
  scrypt,
  timingSafeEqual
} from "node:crypto";
import { promisify } from "node:util";
import { ServiceError } from "./providers-service.mjs";

const scryptAsync = promisify(scrypt);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOTP_PATTERN = /^\d{6}$/;
const RECOVERY_PATTERN = /^[A-Z2-7]{4}(?:-[A-Z2-7]{4}){3}$/;
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const ISSUER = "Atelier Lumière";
const RECOVERY_CODE_COUNT = 10;
const COMMON_PASSWORDS = new Set([
  "password1234",
  "contraseña1234",
  "atelierlumiere",
  "qwerty123456",
  "12345678901234"
]);

function normalizeEmail(value) {
  const email = typeof value === "string" ? value.trim().toLocaleLowerCase("es") : "";
  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    throw new ServiceError("VALIDATION_ERROR", "Introduce un correo válido.", 422, { field: "email" });
  }
  return email;
}

function normalizeDisplayName(value) {
  const displayName = typeof value === "string" ? value.trim() : "";
  if (displayName.length < 2 || displayName.length > 120) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "El nombre debe tener entre 2 y 120 caracteres.",
      422,
      { field: "displayName" }
    );
  }
  return displayName;
}

function validatePassword(value, { email, displayName }) {
  if (typeof value !== "string" || value.length < 14 || value.length > 128) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "La contraseña administrativa debe tener entre 14 y 128 caracteres.",
      422,
      { field: "password" }
    );
  }

  const lower = value.toLocaleLowerCase("es");
  const compact = lower.replace(/\s+/g, "");
  const emailLocalPart = email.split("@", 1)[0].toLocaleLowerCase("es");
  const normalizedName = displayName.toLocaleLowerCase("es").replace(/\s+/g, "");

  if (
    COMMON_PASSWORDS.has(lower)
    || (emailLocalPart.length >= 4 && lower.includes(emailLocalPart))
    || (normalizedName.length >= 4 && compact.includes(normalizedName))
  ) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "La contraseña es demasiado fácil de relacionar con la cuenta.",
      422,
      { field: "password" }
    );
  }

  return value;
}

function parseEncryptionKey(value) {
  const key = typeof value === "string" ? Buffer.from(value, "base64") : Buffer.alloc(0);
  if (key.length !== 32) {
    throw new TypeError("TWO_FACTOR_ENCRYPTION_KEY_BASE64 debe contener exactamente 32 bytes.");
  }
  return key;
}

function parseRecoveryPepper(value) {
  if (typeof value !== "string" || value.length < 32) {
    throw new TypeError("TWO_FACTOR_RECOVERY_PEPPER debe tener al menos 32 caracteres.");
  }
  return value;
}

function secureEquals(left, right) {
  const a = Buffer.from(left ?? "", "utf8");
  const b = Buffer.from(right ?? "", "utf8");
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

export function encodeBase32(buffer) {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

function decodeBase32(value) {
  const normalized = String(value).replace(/=+$/g, "").toUpperCase();
  let bits = 0;
  let accumulator = 0;
  const bytes = [];
  for (const character of normalized) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index < 0) throw new TypeError("Secreto TOTP no válido.");
    accumulator = (accumulator << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((accumulator >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function generateTotpCode(secretBase32, currentTime = new Date(), stepSeconds = 30) {
  const step = Math.floor(new Date(currentTime).getTime() / 1000 / stepSeconds);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac("sha1", decodeBase32(secretBase32)).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  const binary = (
    ((digest[offset] & 127) << 24)
    | (digest[offset + 1] << 16)
    | (digest[offset + 2] << 8)
    | digest[offset + 3]
  );
  return String(binary % 1_000_000).padStart(6, "0");
}

function matchedTotpStep(secret, code, currentTime) {
  const currentStep = Math.floor(currentTime.getTime() / 1000 / 30);
  for (const offset of [-1, 0, 1]) {
    const step = currentStep + offset;
    const candidateTime = new Date(step * 30 * 1000);
    if (secureEquals(code, generateTotpCode(secret, candidateTime))) return step;
  }
  return null;
}

async function hashPassword(password) {
  const salt = randomBytes(16).toString("base64url");
  const derivedKey = await scryptAsync(password, salt, 64, {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024
  });
  return {
    passwordHash: Buffer.from(derivedKey).toString("base64url"),
    passwordSalt: salt,
    passwordAlgorithm: "scrypt-v1"
  };
}

function encryptTotpSecret(secret, encryptionKey) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64url"),
    iv: iv.toString("base64url"),
    authTag: cipher.getAuthTag().toString("base64url")
  };
}

function createRecoveryCode() {
  const compact = encodeBase32(randomBytes(10));
  return compact.match(/.{1,4}/g).join("-");
}

function createRecoveryCodes() {
  const codes = new Set();
  while (codes.size < RECOVERY_CODE_COUNT) codes.add(createRecoveryCode());
  return [...codes];
}

function recoveryHash(code, pepper) {
  return createHmac("sha256", pepper).update(code.replace(/-/g, "")).digest("hex");
}

function validatePrepared(prepared) {
  if (!prepared || typeof prepared !== "object") {
    throw new TypeError("La activación necesita una preparación válida.");
  }
  if (!prepared.totpSecret || !Array.isArray(prepared.recoveryCodes)) {
    throw new TypeError("La preparación de seguridad está incompleta.");
  }
  if (
    prepared.recoveryCodes.length !== RECOVERY_CODE_COUNT
    || prepared.recoveryCodes.some((code) => !RECOVERY_PATTERN.test(code))
  ) {
    throw new TypeError("Los códigos de recuperación no son válidos.");
  }
  return prepared;
}

export function createAdminBootstrapService({
  database,
  systemContext,
  encryptionKey = process.env.TWO_FACTOR_ENCRYPTION_KEY_BASE64,
  recoveryPepper = process.env.TWO_FACTOR_RECOVERY_PEPPER,
  now = () => new Date()
} = {}) {
  if (!database || typeof database.withContext !== "function") {
    throw new TypeError("createAdminBootstrapService necesita una base de datos.");
  }
  if (!systemContext || systemContext.role !== "ADMIN" || systemContext.providerId) {
    throw new TypeError("El bootstrap necesita un contexto ADMIN sin taller.");
  }

  const parsedEncryptionKey = parseEncryptionKey(encryptionKey);
  const parsedRecoveryPepper = parseRecoveryPepper(recoveryPepper);

  return Object.freeze({
    async prepare(input = {}) {
      const email = normalizeEmail(input.email);
      const displayName = normalizeDisplayName(input.displayName);
      const password = validatePassword(input.password, { email, displayName });
      const credential = await hashPassword(password);
      const totpSecret = encodeBase32(randomBytes(20));
      const recoveryCodes = createRecoveryCodes();
      const label = `${ISSUER}:${email}`;
      const otpauthUri = `otpauth://totp/${encodeURIComponent(label)}?secret=${totpSecret}`
        + `&issuer=${encodeURIComponent(ISSUER)}&algorithm=SHA1&digits=6&period=30`;

      return Object.freeze({
        email,
        displayName,
        credential: Object.freeze(credential),
        totpSecret,
        otpauthUri,
        recoveryCodes: Object.freeze(recoveryCodes)
      });
    },

    async activate(rawPrepared, rawCode) {
      const prepared = validatePrepared(rawPrepared);
      const code = typeof rawCode === "string" ? rawCode.trim() : "";
      if (!TOTP_PATTERN.test(code)) {
        throw new ServiceError("INVALID_TOTP_CODE", "El código debe contener seis cifras.", 422);
      }

      const currentTime = now();
      const matchedStep = matchedTotpStep(prepared.totpSecret, code, currentTime);
      if (matchedStep === null) {
        throw new ServiceError(
          "INVALID_TOTP_CODE",
          "El código del autenticador no es correcto. Comprueba la hora del dispositivo.",
          422
        );
      }

      const encrypted = encryptTotpSecret(prepared.totpSecret, parsedEncryptionKey);
      const recoveryHashes = prepared.recoveryCodes.map((item) => (
        recoveryHash(item, parsedRecoveryPepper)
      ));

      try {
        return await database.withContext(systemContext, async (transaction) => {
          await transaction.query(
            "SELECT pg_advisory_xact_lock(hashtext($1))",
            ["atelier-lumiere:platform-owner-bootstrap"]
          );

          const existingOwner = await transaction.query(
            "SELECT user_id FROM admin_memberships WHERE role = 'PLATFORM_OWNER' LIMIT 1"
          );
          if (existingOwner.rowCount > 0) {
            throw new ServiceError(
              "PLATFORM_OWNER_ALREADY_EXISTS",
              "Ya existe una cuenta PLATFORM_OWNER. El bootstrap inicial queda bloqueado.",
              409
            );
          }

          const existingEmail = await transaction.query(
            "SELECT id FROM users WHERE email = $1 LIMIT 1",
            [prepared.email]
          );
          if (existingEmail.rowCount > 0) {
            throw new ServiceError(
              "ACCOUNT_ALREADY_EXISTS",
              "Ya existe una cuenta asociada a ese correo.",
              409
            );
          }

          const userResult = await transaction.query(
            `INSERT INTO users
              (email, display_name, status, email_verified_at, two_factor_enabled)
             VALUES ($1, $2, 'ACTIVE', $3, true)
             RETURNING id, email, display_name, status, email_verified_at,
                       two_factor_enabled, created_at`,
            [prepared.email, prepared.displayName, currentTime]
          );
          const user = userResult.rows[0];

          await transaction.query(
            `INSERT INTO user_credentials
              (user_id, password_hash, password_salt, password_algorithm)
             VALUES ($1, $2, $3, $4)`,
            [
              user.id,
              prepared.credential.passwordHash,
              prepared.credential.passwordSalt,
              prepared.credential.passwordAlgorithm
            ]
          );

          await transaction.query(
            `INSERT INTO admin_memberships
              (user_id, role, status, created_by, created_at, updated_at)
             VALUES ($1, 'PLATFORM_OWNER', 'ACTIVE', $2, $3, $3)`,
            [user.id, systemContext.userId, currentTime]
          );

          await transaction.query(
            `INSERT INTO admin_totp_credentials
              (user_id, secret_ciphertext, secret_iv, secret_auth_tag,
               status, last_used_step, activated_at, created_at, updated_at)
             VALUES ($1, $2, $3, $4, 'ACTIVE', $5, $6, $6, $6)`,
            [
              user.id,
              encrypted.ciphertext,
              encrypted.iv,
              encrypted.authTag,
              matchedStep,
              currentTime
            ]
          );

          for (const codeHash of recoveryHashes) {
            await transaction.query(
              `INSERT INTO user_recovery_codes (user_id, code_hash, created_at)
               VALUES ($1, $2, $3)`,
              [user.id, codeHash, currentTime]
            );
          }

          await transaction.query(
            `INSERT INTO audit_events
              (actor_user_id, provider_id, action, entity_type, entity_id, metadata)
             VALUES ($1, NULL, 'PLATFORM_OWNER_BOOTSTRAPPED',
                     'user', $2, $3::jsonb)`,
            [
              systemContext.userId,
              user.id,
              JSON.stringify({
                email: user.email,
                role: "PLATFORM_OWNER",
                recoveryCodeCount: recoveryHashes.length,
                activationMethod: "LOCAL_INTERACTIVE_TTY"
              })
            ]
          );

          return Object.freeze({
            id: user.id,
            email: user.email,
            displayName: user.display_name,
            status: user.status,
            role: "PLATFORM_OWNER",
            emailVerified: Boolean(user.email_verified_at),
            twoFactorEnabled: user.two_factor_enabled,
            createdAt: user.created_at
          });
        });
      } catch (error) {
        if (error?.code === "23505") {
          throw new ServiceError(
            "ACCOUNT_ALREADY_EXISTS",
            "La cuenta ya existe o el bootstrap se ejecutó simultáneamente.",
            409
          );
        }
        throw error;
      }
    }
  });
}

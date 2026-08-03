import assert from "node:assert/strict";
import test from "node:test";
import {
  createAdminBootstrapService,
  generateTotpCode
} from "../src/admin-bootstrap-service.mjs";

const NOW = new Date("2026-08-03T11:30:00.000Z");
const USER_ID = "11111111-1111-4111-8111-111111111111";
const AUTH_SERVICE_USER_ID = "00000000-0000-4000-8000-000000000008";
const PASSWORD = "Marea-Cobre-Volcan-2026";

function createFakeDatabase({ existingOwner = false } = {}) {
  const calls = [];
  return {
    calls,
    async withContext(context, callback) {
      assert.equal(context.role, "ADMIN");
      assert.equal(context.providerId, null);
      return callback({
        async query(text, values = []) {
          calls.push({ text, values });
          if (text.includes("FROM admin_memberships WHERE role = 'PLATFORM_OWNER'")) {
            return existingOwner
              ? { rowCount: 1, rows: [{ user_id: USER_ID }] }
              : { rowCount: 0, rows: [] };
          }
          if (text.includes("FROM users WHERE email")) return { rowCount: 0, rows: [] };
          if (text.includes("INSERT INTO users")) {
            return {
              rowCount: 1,
              rows: [{
                id: USER_ID,
                email: values[0],
                display_name: values[1],
                status: "ACTIVE",
                email_verified_at: NOW,
                two_factor_enabled: true,
                created_at: NOW
              }]
            };
          }
          return { rowCount: 1, rows: [] };
        }
      });
    }
  };
}

function createService(database) {
  return createAdminBootstrapService({
    database,
    systemContext: {
      role: "ADMIN",
      userId: AUTH_SERVICE_USER_ID,
      providerId: null
    },
    encryptionKey: Buffer.alloc(32, 7).toString("base64"),
    recoveryPepper: "recovery-pepper-for-tests-1234567890",
    now: () => NOW
  });
}

test("prepara TOTP y diez códigos sin conservar la contraseña en claro", async () => {
  const database = createFakeDatabase();
  const prepared = await createService(database).prepare({
    email: "owner@example.com",
    displayName: "Propietaria Principal",
    password: PASSWORD
  });

  assert.equal(prepared.email, "owner@example.com");
  assert.equal(prepared.recoveryCodes.length, 10);
  assert.match(prepared.otpauthUri, /^otpauth:\/\/totp\//);
  assert.equal(Object.hasOwn(prepared, "password"), false);
  assert.notEqual(prepared.credential.passwordHash, PASSWORD);
});

test("activa PLATFORM_OWNER en una sola transacción y no envía la contraseña a SQL", async () => {
  const database = createFakeDatabase();
  const service = createService(database);
  const prepared = await service.prepare({
    email: "owner@example.com",
    displayName: "Propietaria Principal",
    password: PASSWORD
  });
  const code = generateTotpCode(prepared.totpSecret, NOW);
  const account = await service.activate(prepared, code);

  assert.equal(account.role, "PLATFORM_OWNER");
  assert.equal(account.twoFactorEnabled, true);
  assert.ok(database.calls.some(({ text }) => text.includes("pg_advisory_xact_lock")));
  assert.ok(database.calls.some(({ text }) => text.includes("PLATFORM_OWNER_BOOTSTRAPPED")));
  assert.ok(database.calls.some(({ text }) => text.includes("INSERT INTO admin_totp_credentials")));
  assert.equal(JSON.stringify(database.calls).includes(PASSWORD), false);
});

test("un código incorrecto no inicia ninguna transacción", async () => {
  const database = createFakeDatabase();
  const service = createService(database);
  const prepared = await service.prepare({
    email: "owner@example.com",
    displayName: "Propietaria Principal",
    password: PASSWORD
  });

  await assert.rejects(
    service.activate(prepared, "000000"),
    (error) => error.code === "INVALID_TOTP_CODE"
  );
  assert.equal(database.calls.length, 0);
});

test("bloquea el bootstrap cuando ya existe cualquier PLATFORM_OWNER", async () => {
  const database = createFakeDatabase({ existingOwner: true });
  const service = createService(database);
  const prepared = await service.prepare({
    email: "owner@example.com",
    displayName: "Propietaria Principal",
    password: PASSWORD
  });

  await assert.rejects(
    service.activate(prepared, generateTotpCode(prepared.totpSecret, NOW)),
    (error) => error.code === "PLATFORM_OWNER_ALREADY_EXISTS"
  );
  assert.equal(database.calls.some(({ text }) => text.includes("INSERT INTO users")), false);
});

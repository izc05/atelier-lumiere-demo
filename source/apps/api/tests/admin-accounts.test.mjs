import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createAdminAccountsService } from "../src/admin-accounts-service.mjs";
import { createDatabase } from "../src/database.mjs";

const connectionString = process.env.DATABASE_URL;
const OWNER = Object.freeze({
  role: "ADMIN",
  userId: "00000000-0000-4000-8000-000000000001",
  providerId: null,
  adminRole: "PLATFORM_OWNER"
});
const MANAGER = Object.freeze({
  ...OWNER,
  adminRole: "PROVIDER_MANAGER"
});

function tokenHash() {
  return randomBytes(32).toString("hex");
}

function setupService(calls) {
  return {
    async request(email, options) {
      calls.push({ email, options });
      return {
        accepted: true,
        delivery: "manual-development",
        recoveryPath: `/admin/recuperar/?token=${"A".repeat(43)}`
      };
    }
  };
}

test("el propietario crea, suspende y cierra sesiones administrativas", { skip: !connectionString }, async (t) => {
  const database = createDatabase({
    connectionString,
    maxConnections: 4,
    statementTimeoutMs: 5000,
    logger: { error() {} }
  });
  const calls = [];
  const service = createAdminAccountsService({
    database,
    adminRecoveryService: setupService(calls),
    logger: { error() {} }
  });
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const email = `admin-${suffix}@example.test`;
  let userId;

  t.after(async () => {
    if (userId) {
      await database.withContext(OWNER, async (tx) => {
        await tx.query(
          "DELETE FROM audit_events WHERE entity_id=$1 OR metadata->>'targetUserId'=$1::text",
          [userId]
        );
        await tx.query("DELETE FROM admin_memberships WHERE user_id=$1", [userId]);
        await tx.query("DELETE FROM users WHERE id=$1", [userId]);
      });
    }
    await database.close();
  });

  const created = await service.create(OWNER, {
    displayName: "Gestora de talleres",
    email,
    role: "PROVIDER_MANAGER"
  });
  userId = created.account.id;

  assert.equal(created.account.email, email);
  assert.equal(created.account.role, "PROVIDER_MANAGER");
  assert.equal(created.account.securityReady, false);
  assert.equal(created.setup.delivery, "manual-development");
  assert.deepEqual(calls, [{ email, options: { purpose: "INVITATION" } }]);

  const stored = await database.withContext(OWNER, async (tx) => {
    const result = await tx.query(
      `SELECT u.two_factor_enabled, c.password_algorithm, t.status AS totp_status
       FROM users u
       INNER JOIN user_credentials c ON c.user_id=u.id
       INNER JOIN admin_totp_credentials t ON t.user_id=u.id
       WHERE u.id=$1`,
      [userId]
    );
    return result.rows[0];
  });
  assert.equal(stored.two_factor_enabled, false);
  assert.equal(stored.password_algorithm, "scrypt-v1");
  assert.equal(stored.totp_status, "PENDING");

  const sessionId = randomUUID();
  await database.withContext(OWNER, async (tx) => {
    await tx.query(
      `INSERT INTO sessions
        (id,user_id,token_hash,provider_id,role,user_agent,expires_at,last_seen_at)
       VALUES($1,$2,$3,NULL,'PROVIDER_MANAGER','Prueba remota',now()+interval '8 hours',now())`,
      [sessionId, userId, tokenHash()]
    );
  });

  const sessions = await service.sessions(OWNER, userId);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].id, sessionId);
  assert.equal(sessions[0].userAgent, "Prueba remota");

  assert.deepEqual(await service.revokeSession(OWNER, userId, sessionId), {
    revoked: true,
    sessionId
  });
  assert.equal((await service.sessions(OWNER, userId)).length, 0);

  await database.withContext(OWNER, async (tx) => {
    for (let index = 0; index < 2; index += 1) {
      await tx.query(
        `INSERT INTO sessions
          (user_id,token_hash,provider_id,role,user_agent,expires_at,last_seen_at)
         VALUES($1,$2,NULL,'PROVIDER_MANAGER','Otra sesión',now()+interval '8 hours',now())`,
        [userId, tokenHash()]
      );
    }
  });
  assert.equal((await service.revokeAllSessions(OWNER, userId)).revoked, 2);

  await database.withContext(OWNER, async (tx) => {
    await tx.query(
      `INSERT INTO sessions
        (user_id,token_hash,provider_id,role,user_agent,expires_at,last_seen_at)
       VALUES($1,$2,NULL,'PROVIDER_MANAGER','Sesión a suspender',now()+interval '8 hours',now())`,
      [userId, tokenHash()]
    );
  });
  const suspended = await service.updateStatus(OWNER, userId, { status: "SUSPENDED" });
  assert.equal(suspended.account.status, "SUSPENDED");
  assert.equal(suspended.revokedSessions, 1);
  assert.equal((await service.sessions(OWNER, userId)).length, 0);

  const reactivated = await service.updateStatus(OWNER, userId, { status: "ACTIVE" });
  assert.equal(reactivated.account.status, "ACTIVE");

  await assert.rejects(
    service.list(MANAGER),
    (error) => error?.code === "ADMIN_ROLE_FORBIDDEN" && error?.statusCode === 403
  );
  await assert.rejects(
    service.updateStatus(OWNER, OWNER.userId, { status: "SUSPENDED" }),
    (error) => error?.code === "ADMIN_SELF_SUSPEND_FORBIDDEN"
  );
});

test("el trigger administrativo sincroniza el indicador 2FA", { skip: !connectionString }, async (t) => {
  const database = createDatabase({ connectionString, logger: { error() {} } });
  const userId = randomUUID();
  const email = `two-factor-${userId.slice(0, 8)}@example.test`;

  t.after(async () => {
    await database.withContext(OWNER, async (tx) => {
      await tx.query("DELETE FROM users WHERE id=$1", [userId]);
    });
    await database.close();
  });

  await database.withContext(OWNER, async (tx) => {
    await tx.query(
      `INSERT INTO users(id,email,display_name,status,email_verified_at,two_factor_enabled)
       VALUES($1,$2,'Cuenta trigger','ACTIVE',now(),false)`,
      [userId, email]
    );
    await tx.query(
      `INSERT INTO admin_memberships(user_id,role,status,created_by)
       VALUES($1,'EDITORIAL_REVIEWER','ACTIVE',$2)`,
      [userId, OWNER.userId]
    );
    await tx.query(
      `INSERT INTO admin_totp_credentials
        (user_id,secret_ciphertext,secret_iv,secret_auth_tag,status,activated_at)
       VALUES($1,'cipher','iv','tag','ACTIVE',now())`,
      [userId]
    );
  });

  const enabled = await database.withContext(OWNER, async (tx) => {
    const result = await tx.query("SELECT two_factor_enabled FROM users WHERE id=$1", [userId]);
    return result.rows[0].two_factor_enabled;
  });
  assert.equal(enabled, true);
});

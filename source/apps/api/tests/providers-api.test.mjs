import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { createApiHandler } from "../src/app.mjs";
import { createDatabase } from "../src/database.mjs";
import {
  createDevelopmentAdminContext,
  createRequestAuthenticator,
  ensureDevelopmentAdmin
} from "../src/auth-context.mjs";
import { createProvidersService } from "../src/providers-service.mjs";

const connectionString = process.env.DATABASE_URL;

async function jsonRequest(baseUrl, path, {
  method = "GET",
  token,
  body
} = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const payload = await response.json();
  return { response, payload };
}

test("la API administra proveedores sin filtrar secretos ni saltarse RLS", {
  skip: !connectionString
}, async (t) => {
  const developmentAdminToken = "api-test-token-atelier-lumiere-0000000000000001";
  const developmentAdminUserId = "00000000-0000-4000-8000-000000000001";
  const authOptions = {
    environment: "test",
    allowDevelopmentAdminAuth: true,
    developmentAdminToken,
    developmentAdminUserId
  };

  const database = createDatabase({
    connectionString,
    maxConnections: 4,
    statementTimeoutMs: 5000,
    logger: { error() {} }
  });
  const adminContext = createDevelopmentAdminContext(authOptions);
  await ensureDevelopmentAdmin(database, adminContext, {
    email: "admin-api@atelier.example",
    displayName: "Administración de prueba API"
  });

  const providersService = createProvidersService({
    database,
    invitationTtlHours: 48,
    now: () => new Date("2026-08-02T10:00:00.000Z")
  });
  const handler = createApiHandler({
    environment: "test",
    database,
    providersService,
    authenticateRequest: createRequestAuthenticator(authOptions),
    logger: { error() {} }
  });
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await database.close();
  });

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const unauthorized = await jsonRequest(baseUrl, "/api/admin/providers");
  assert.equal(unauthorized.response.status, 401);
  assert.equal(unauthorized.payload.error, "UNAUTHORIZED");

  const suffix = randomUUID().slice(0, 8);
  const createResult = await jsonRequest(baseUrl, "/api/admin/providers", {
    method: "POST",
    token: developmentAdminToken,
    body: {
      slug: `taller-api-${suffix}`,
      displayName: `Taller API ${suffix}`,
      contactName: "Artesana de prueba",
      contactEmail: `artesana-${suffix}@atelier.example`,
      specialty: "Cerámica artesanal"
    }
  });

  assert.equal(createResult.response.status, 201);
  assert.equal(createResult.payload.provider.status, "INVITED");
  assert.equal(createResult.payload.invitation.status, "PENDING");
  assert.equal(createResult.payload.delivery, "manual-development");
  assert.ok(createResult.payload.activationToken.length >= 32);
  assert.match(createResult.payload.activationPath, /^\/proveedor\/activar\?token=/);

  const providerId = createResult.payload.provider.id;
  const firstToken = createResult.payload.activationToken;

  const duplicate = await jsonRequest(baseUrl, "/api/admin/providers", {
    method: "POST",
    token: developmentAdminToken,
    body: {
      slug: `taller-api-${suffix}`,
      displayName: "Taller repetido",
      contactName: "Otra artesana",
      contactEmail: `otra-${suffix}@atelier.example`,
      specialty: "Papelería"
    }
  });
  assert.equal(duplicate.response.status, 409);
  assert.equal(duplicate.payload.error, "PROVIDER_ALREADY_EXISTS");

  const listResult = await jsonRequest(baseUrl, "/api/admin/providers", {
    token: developmentAdminToken
  });
  assert.equal(listResult.response.status, 200);
  const listed = listResult.payload.providers.find((provider) => provider.id === providerId);
  assert.equal(listed.displayName, `Taller API ${suffix}`);
  assert.equal(JSON.stringify(listResult.payload).includes(firstToken), false);
  assert.equal(JSON.stringify(listResult.payload).includes("token_hash"), false);

  const suspended = await jsonRequest(baseUrl, `/api/admin/providers/${providerId}/status`, {
    method: "PATCH",
    token: developmentAdminToken,
    body: { status: "SUSPENDED" }
  });
  assert.equal(suspended.response.status, 200);
  assert.equal(suspended.payload.provider.status, "SUSPENDED");

  const renewal = await jsonRequest(baseUrl, `/api/admin/providers/${providerId}/invitations`, {
    method: "POST",
    token: developmentAdminToken,
    body: { role: "PROVIDER_OWNER" }
  });
  assert.equal(renewal.response.status, 201);
  assert.notEqual(renewal.payload.activationToken, firstToken);

  const invitationRows = await database.withContext(adminContext, async (transaction) => {
    const result = await transaction.query(
      `SELECT status, token_hash
       FROM provider_invitations
       WHERE provider_id = $1
       ORDER BY created_at ASC`,
      [providerId]
    );
    return result.rows;
  });
  assert.equal(invitationRows.filter((row) => row.status === "PENDING").length, 1);
  assert.equal(invitationRows.filter((row) => row.status === "REVOKED").length, 1);
  assert.equal(invitationRows.some((row) => row.token_hash === firstToken), false);

  const audit = await jsonRequest(baseUrl, `/api/admin/providers/${providerId}/audit`, {
    token: developmentAdminToken
  });
  assert.equal(audit.response.status, 200);
  const actions = new Set(audit.payload.events.map((event) => event.action));
  assert.ok(actions.has("PROVIDER_CREATED"));
  assert.ok(actions.has("PROVIDER_SUSPENDED"));
  assert.ok(actions.has("PROVIDER_INVITATION_RENEWED"));

  const ownerView = await providersService.list({
    role: "PROVIDER_OWNER",
    userId: randomUUID(),
    providerId
  });
  assert.equal(ownerView.length, 1);
  assert.equal(ownerView[0].id, providerId);
});

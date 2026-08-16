import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { createDatabase } from "../src/database.mjs";
import { createRequestAuthenticator } from "../src/auth-context.mjs";
import { createVillageZonesApiHandler } from "../src/village-zones-api.mjs";
import { createVillageZonesService } from "../src/village-zones-service.mjs";
import { VILLAGE_ZONE_KEYS } from "../src/village-zones.mjs";

const connectionString = process.env.DATABASE_URL;
const ADMIN_TOKEN = "village-owner-token-with-at-least-thirty-two-characters";
const ADMIN_CONTEXT = {
  role: "ADMIN",
  userId: "00000000-0000-4000-8000-000000000001",
  providerId: null
};

async function json(baseUrl, path, { method = "GET", body, bearer = ADMIN_TOKEN } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {})
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

test("las zonas del Pueblo se configuran, reservan, ocultan y no duplican taller", {
  skip: !connectionString
}, async (t) => {
  const database = createDatabase({
    connectionString,
    maxConnections: 4,
    statementTimeoutMs: 5000,
    logger: { error() {} }
  });
  const service = createVillageZonesService({ database });
  const authenticateRequest = createRequestAuthenticator({
    environment: "test",
    allowDevelopmentAdminAuth: true,
    developmentAdminToken: ADMIN_TOKEN,
    developmentAdminUserId: ADMIN_CONTEXT.userId
  });
  const baseHandler = (_request, response) => {
    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "NOT_FOUND" }));
  };
  const server = createServer(createVillageZonesApiHandler({
    baseHandler,
    villageZonesService: service,
    authenticateRequest,
    logger: { error() {} }
  }));

  await database.withContext(ADMIN_CONTEXT, async (transaction) => {
    await transaction.query("DELETE FROM site_village_zones");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    await database.withContext(ADMIN_CONTEXT, async (transaction) => {
      await transaction.query("DELETE FROM site_village_zones");
    });
    await new Promise((resolve) => server.close(resolve));
    await database.close();
  });

  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const unauthorized = await json(baseUrl, "/api/admin/village-zones", { bearer: null });
  assert.equal(unauthorized.response.status, 401);

  const initial = await json(baseUrl, "/api/admin/village-zones");
  assert.equal(initial.response.status, 200);
  assert.equal(initial.payload.zones.length, VILLAGE_ZONE_KEYS.length);
  assert.ok(initial.payload.zones.every((zone) => zone.configured === false));

  const configured = await json(baseUrl, "/api/admin/village-zones/ZONE_05", {
    method: "PATCH",
    body: {
      workshopType: "Cerámica",
      displayLabel: "Casa de la Arcilla",
      providerSlug: "taller-ceramica",
      status: "ACTIVE"
    }
  });
  assert.equal(configured.response.status, 200);
  assert.equal(configured.payload.zone.workshopType, "Cerámica");
  assert.equal(configured.payload.zone.displayLabel, "Casa de la Arcilla");
  assert.equal(configured.payload.zone.providerSlug, "taller-ceramica");
  assert.equal(configured.payload.zone.status, "ACTIVE");

  const duplicate = await json(baseUrl, "/api/admin/village-zones/ZONE_06", {
    method: "PATCH",
    body: {
      workshopType: "Joyería",
      providerSlug: "taller-ceramica",
      status: "ACTIVE"
    }
  });
  assert.equal(duplicate.response.status, 409);
  assert.equal(duplicate.payload.error, "VILLAGE_PROVIDER_ALREADY_ASSIGNED");

  const reserved = await json(baseUrl, "/api/admin/village-zones/ZONE_07", {
    method: "PATCH",
    body: {
      workshopType: "Bordado",
      displayLabel: "Futuro estudio textil",
      providerSlug: null,
      status: "RESERVED"
    }
  });
  assert.equal(reserved.response.status, 200);
  assert.equal(reserved.payload.zone.providerSlug, null);
  assert.equal(reserved.payload.zone.status, "RESERVED");

  const hidden = await json(baseUrl, "/api/admin/village-zones/ZONE_08", {
    method: "PATCH",
    body: {
      workshopType: "Madera",
      displayLabel: "Carpintería",
      providerSlug: null,
      status: "HIDDEN"
    }
  });
  assert.equal(hidden.response.status, 200);

  const publicList = await json(baseUrl, "/api/village-zones", { bearer: null });
  assert.equal(publicList.response.status, 200);
  assert.equal(publicList.payload.zones.length, 3);
  assert.equal(publicList.payload.zones.find((zone) => zone.zoneKey === "ZONE_08").status, "HIDDEN");
  assert.ok(publicList.payload.zones.every((zone) => !Object.hasOwn(zone, "updatedBy")));

  const changedType = await json(baseUrl, "/api/admin/village-zones/ZONE_07", {
    method: "PATCH",
    body: {
      workshopType: "Joyería contemporánea",
      displayLabel: "Casa de Metal",
      providerSlug: null,
      status: "RESERVED"
    }
  });
  assert.equal(changedType.response.status, 200);
  assert.equal(changedType.payload.zone.workshopType, "Joyería contemporánea");

  const reset = await json(baseUrl, "/api/admin/village-zones/ZONE_05", { method: "DELETE" });
  assert.equal(reset.response.status, 200);
  assert.equal(reset.payload.reset, true);

  const afterReset = await json(baseUrl, "/api/admin/village-zones");
  assert.equal(afterReset.payload.zones.find((zone) => zone.zoneKey === "ZONE_05").configured, false);

  const audits = await database.withContext(ADMIN_CONTEXT, async (transaction) => {
    const result = await transaction.query(
      `SELECT action
       FROM audit_events
       WHERE entity_type = 'site_village_zone'
         AND action IN ('VILLAGE_ZONE_CONFIGURED','VILLAGE_ZONE_RESET')
       ORDER BY created_at DESC
       LIMIT 20`
    );
    return result.rows;
  });
  assert.ok(audits.some((item) => item.action === "VILLAGE_ZONE_CONFIGURED"));
  assert.ok(audits.some((item) => item.action === "VILLAGE_ZONE_RESET"));
});

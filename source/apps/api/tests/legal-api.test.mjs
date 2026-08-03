import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { createHash, randomBytes } from "node:crypto";
import { createDatabase } from "../src/database.mjs";
import { createLegalApiHandler } from "../src/legal-api.mjs";
import { createLegalService } from "../src/legal-service.mjs";

const connectionString = process.env.DATABASE_URL;
const LEGAL = {
  role: "LEGAL_SERVICE",
  userId: "00000000-0000-4000-8000-000000000007",
  providerId: null
};
const CUSTOMER = {
  role: "CUSTOMER",
  userId: "00000000-0000-4000-8000-000000000103",
  providerId: null
};

async function start(handler) {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return {
    server,
    baseUrl: `http://127.0.0.1:${server.address().port}`
  };
}

async function json(response) {
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

test("los borradores legales y preferencias están versionados y aislados", {
  skip: !connectionString
}, async (t) => {
  const database = createDatabase({
    connectionString,
    maxConnections: 4,
    statementTimeoutMs: 5000,
    logger: { error() {} }
  });
  t.after(() => database.close());

  const developmentService = createLegalService({
    database,
    systemContext: LEGAL,
    environment: "development"
  });
  const productionService = createLegalService({
    database,
    systemContext: LEGAL,
    environment: "production"
  });

  const documents = await developmentService.listDocuments();
  assert.equal(documents.length, 8);
  assert.ok(documents.every((item) => item.status === "DRAFT"));
  assert.ok(documents.every((item) => item.professionalReviewRequired === true));
  assert.ok(documents.every((item) => /^[a-f0-9]{64}$/.test(item.contentSha256)));
  assert.ok(documents.every((item) => item.contentSha256 !== "0".repeat(64)));
  assert.ok(documents.some((item) => item.contentMd.includes("[NIF PENDIENTE]")));
  assert.deepEqual(await productionService.listDocuments(), []);

  const cookieDocument = await developmentService.getDocument("cookies");
  assert.equal(cookieDocument.type, "COOKIE_POLICY");
  await assert.rejects(
    () => developmentService.getDocument("documento-inexistente"),
    (error) => error?.code === "LEGAL_DOCUMENT_NOT_FOUND"
  );

  const preferenceKey = randomBytes(32).toString("base64url");
  const first = await developmentService.savePreferences(preferenceKey, {
    preferences: false,
    analytics: false,
    marketing: false
  });
  assert.equal(first.necessary, true);
  assert.equal(first.analytics, false);
  assert.equal(first.version, 1);

  const second = await developmentService.savePreferences(preferenceKey, {
    preferences: true,
    analytics: true,
    marketing: false
  });
  assert.equal(second.version, 2);
  assert.equal(second.preferences, true);
  assert.equal(second.analytics, true);
  assert.equal(second.marketing, false);

  const restored = await developmentService.getPreferences(preferenceKey);
  assert.equal(restored.version, 2);
  assert.equal(restored.keyExists, true);
  assert.equal(restored.optionalServicesConfigured, false);

  const keyHash = createHash("sha256").update(preferenceKey).digest("hex");
  await database.withContext(LEGAL, async (transaction) => {
    const current = await transaction.query(
      `SELECT preference_key_hash, necessary, preferences, analytics, marketing, version
       FROM privacy_preference_records
       WHERE preference_key_hash = $1`,
      [keyHash]
    );
    assert.equal(current.rowCount, 1);
    assert.equal(current.rows[0].necessary, true);
    assert.equal(current.rows[0].version, 2);

    const events = await transaction.query(
      `SELECT decision, categories, evidence
       FROM legal_consent_events
       WHERE preference_key_hash = $1
       ORDER BY occurred_at`,
      [keyHash]
    );
    assert.equal(events.rowCount, 2);
    assert.equal(events.rows[0].decision, "DENIED");
    assert.equal(events.rows[1].decision, "GRANTED");
    assert.equal(events.rows[1].categories.analytics, true);
    assert.equal(events.rows[1].evidence.source, "privacy-center");
    assert.equal(JSON.stringify(events.rows).includes(preferenceKey), false);

    await assert.rejects(
      () => transaction.query(
        "UPDATE legal_consent_events SET decision='WITHDRAWN' WHERE preference_key_hash=$1",
        [keyHash]
      ),
      (error) => error?.code === "42501"
    );
  });

  await database.withContext(CUSTOMER, async (transaction) => {
    const documentsResult = await transaction.query("SELECT id FROM legal_documents");
    const preferencesResult = await transaction.query("SELECT preference_key_hash FROM privacy_preference_records");
    const eventsResult = await transaction.query("SELECT id FROM legal_consent_events");
    assert.equal(documentsResult.rowCount, 0);
    assert.equal(preferencesResult.rowCount, 0);
    assert.equal(eventsResult.rowCount, 0);
  });
});

test("la API legal publica documentos y guarda preferencias sin autenticación", {
  skip: !connectionString
}, async (t) => {
  const database = createDatabase({
    connectionString,
    maxConnections: 3,
    statementTimeoutMs: 5000,
    logger: { error() {} }
  });
  const service = createLegalService({
    database,
    systemContext: LEGAL,
    environment: "development"
  });
  const app = await start(createLegalApiHandler({
    legalService: service,
    logger: { error() {} },
    baseHandler(_request, response) {
      response.writeHead(404, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "NOT_FOUND" }));
    }
  }));
  t.after(async () => {
    await new Promise((resolve) => app.server.close(resolve));
    await database.close();
  });

  const listResponse = await fetch(`${app.baseUrl}/api/legal/documents`);
  const listPayload = await json(listResponse);
  assert.equal(listResponse.status, 200);
  assert.equal(listPayload.documents.length, 8);
  assert.equal(JSON.stringify(listPayload).includes("created_by"), false);

  const documentResponse = await fetch(`${app.baseUrl}/api/legal/documents/privacidad`);
  const documentPayload = await json(documentResponse);
  assert.equal(documentResponse.status, 200);
  assert.equal(documentPayload.document.type, "PRIVACY_POLICY");

  const noKey = await fetch(`${app.baseUrl}/api/legal/privacy-preferences`);
  assert.equal((await json(noKey)).preferences.keyExists, false);

  const preferenceKey = randomBytes(32).toString("base64url");
  const saved = await fetch(`${app.baseUrl}/api/legal/privacy-preferences`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Privacy-Key": preferenceKey
    },
    body: JSON.stringify({ preferences: true, analytics: false, marketing: false })
  });
  const savedPayload = await json(saved);
  assert.equal(saved.status, 200);
  assert.equal(savedPayload.preferences.preferences, true);
  assert.equal(JSON.stringify(savedPayload).includes(preferenceKey), false);

  const restored = await fetch(`${app.baseUrl}/api/legal/privacy-preferences`, {
    headers: { "X-Privacy-Key": preferenceKey }
  });
  assert.equal((await json(restored)).preferences.version, 1);
});

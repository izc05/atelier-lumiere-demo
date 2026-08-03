import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { once } from "node:events";
import { createDatabase } from "../src/database.mjs";
import { createLegalApiHandler } from "../src/legal-api.mjs";
import { createLegalService } from "../src/legal-service.mjs";

const connectionString = process.env.DATABASE_URL;
const LEGAL = { role: "LEGAL_SERVICE", userId: "00000000-0000-4000-8000-000000000007", providerId: null };
const ADMIN = { role: "ADMIN", userId: "00000000-0000-4000-8000-000000000001", providerId: null };
const CUSTOMER = { role: "CUSTOMER", userId: "00000000-0000-4000-8000-000000000103", providerId: null };

function openDatabase(maxConnections = 3) {
  return createDatabase({
    connectionString,
    maxConnections,
    statementTimeoutMs: 5000,
    logger: { error() {} }
  });
}

async function start(handler) {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}` };
}

async function readJson(response) {
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

test("documentos y preferencias permanecen versionados y aislados", { skip: !connectionString }, async (t) => {
  const database = openDatabase(4);
  t.after(() => database.close());

  const development = createLegalService({ database, systemContext: LEGAL, environment: "development" });
  const production = createLegalService({ database, systemContext: LEGAL, environment: "production" });
  const documents = await development.listDocuments();

  assert.equal(documents.length, 8);
  assert.ok(documents.every((document) => document.status === "DRAFT"));
  assert.ok(documents.every((document) => document.professionalReviewRequired));
  assert.ok(documents.every((document) => /^[a-f0-9]{64}$/.test(document.contentSha256)));
  assert.ok(documents.some((document) => document.contentMd.includes("[NIF PENDIENTE]")));
  assert.deepEqual(await production.listDocuments(), []);
  assert.equal((await development.getDocument("cookies")).type, "COOKIE_POLICY");

  const preferenceKey = randomBytes(32).toString("base64url");
  assert.equal((await development.savePreferences(preferenceKey, {})).version, 1);
  const saved = await development.savePreferences(preferenceKey, {
    preferences: true,
    analytics: true,
    marketing: false
  });
  assert.equal(saved.version, 2);
  assert.equal(saved.analytics, true);

  const keyHash = createHash("sha256").update(preferenceKey).digest("hex");
  await database.withContext(LEGAL, async (transaction) => {
    const before = await transaction.query(
      "SELECT decision, evidence FROM legal_consent_events WHERE anonymous_id_hash=$1 ORDER BY occurred_at",
      [keyHash]
    );
    assert.deepEqual(before.rows.map((row) => row.decision), ["REJECTED", "ACCEPTED"]);
    assert.equal(before.rows[1].evidence.categories.analytics, true);
    assert.equal(JSON.stringify(before.rows).includes(preferenceKey), false);

    const blocked = await transaction.query(
      "UPDATE legal_consent_events SET decision='WITHDRAWN' WHERE anonymous_id_hash=$1",
      [keyHash]
    );
    assert.equal(blocked.rowCount, 0);

    const after = await transaction.query(
      "SELECT decision FROM legal_consent_events WHERE anonymous_id_hash=$1 ORDER BY occurred_at",
      [keyHash]
    );
    assert.deepEqual(after.rows.map((row) => row.decision), ["REJECTED", "ACCEPTED"]);
  });

  await database.withContext(CUSTOMER, async (transaction) => {
    assert.equal((await transaction.query("SELECT id FROM legal_documents")).rowCount, 0);
    assert.equal((await transaction.query("SELECT preference_key_hash FROM privacy_preference_records")).rowCount, 0);
    assert.equal((await transaction.query("SELECT id FROM legal_consent_events")).rowCount, 0);
  });
});

test("un documento activo o retirado no puede reescribirse", { skip: !connectionString }, async (t) => {
  const database = openDatabase(2);
  t.after(() => database.close());
  const id = "70000000-0000-4000-8000-000000000099";

  await database.withContext(ADMIN, (transaction) => transaction.query(
    `INSERT INTO legal_documents (
       id, document_type, locale, version, title, summary, content_markdown,
       content_sha256, status, review_status, created_by
     ) VALUES ($1, 'LEGAL_NOTICE', 'es-ES', '9.9.9', 'Documento de prueba',
       'Ciclo legal.', '# Documento de prueba\n\nContenido suficiente para validar el ciclo.',
       $2, 'DRAFT', 'TECHNICAL_DRAFT', $3)`,
    [id, "a".repeat(64), LEGAL.userId]
  ));

  await assert.rejects(
    () => database.withContext(ADMIN, (transaction) => transaction.query(
      "UPDATE legal_documents SET status='ACTIVE' WHERE id=$1", [id]
    )),
    (error) => error?.code === "23514"
  );

  await database.withContext(ADMIN, (transaction) => transaction.query(
    `UPDATE legal_documents SET review_status='PROFESSIONAL_REVIEWED',
       reviewed_by='Revisión profesional de prueba', reviewed_at=now(), status='ACTIVE'
     WHERE id=$1`,
    [id]
  ));

  for (const sql of [
    "UPDATE legal_documents SET title='Alterado' WHERE id=$1",
    "UPDATE legal_documents SET status='DRAFT' WHERE id=$1"
  ]) {
    await assert.rejects(
      () => database.withContext(ADMIN, (transaction) => transaction.query(sql, [id])),
      (error) => error?.code === "23514"
    );
  }

  await database.withContext(ADMIN, (transaction) => transaction.query(
    "UPDATE legal_documents SET status='RETIRED' WHERE id=$1", [id]
  ));
  await assert.rejects(
    () => database.withContext(ADMIN, (transaction) => transaction.query(
      "UPDATE legal_documents SET title='Alterado tras retirada' WHERE id=$1", [id]
    )),
    (error) => error?.code === "42501"
  );
  await database.withContext(ADMIN, (transaction) => transaction.query(
    "DELETE FROM legal_documents WHERE id=$1", [id]
  ));
});

test("la API legal expone documentos y preferencias sin filtrar secretos", { skip: !connectionString }, async (t) => {
  const database = openDatabase();
  const service = createLegalService({ database, systemContext: LEGAL, environment: "development" });
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

  const list = await readJson(await fetch(`${app.baseUrl}/api/legal/documents`));
  assert.equal(list.documents.length, 8);
  assert.equal(JSON.stringify(list).includes("created_by"), false);

  const privacyKey = randomBytes(32).toString("base64url");
  const response = await fetch(`${app.baseUrl}/api/legal/privacy-preferences`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "X-Privacy-Key": privacyKey },
    body: JSON.stringify({ preferences: true, analytics: false, marketing: false })
  });
  const payload = await readJson(response);
  assert.equal(response.status, 200);
  assert.equal(payload.preferences.preferences, true);
  assert.equal(JSON.stringify(payload).includes(privacyKey), false);
});
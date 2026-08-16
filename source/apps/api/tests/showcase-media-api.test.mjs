import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { Readable } from "node:stream";
import { createDatabase } from "../src/database.mjs";
import { createRequestAuthenticator } from "../src/auth-context.mjs";
import { createShowcaseMediaApiHandler } from "../src/showcase-media-api.mjs";
import { createShowcaseMediaService } from "../src/showcase-media-service.mjs";
import { SHOWCASE_SLOTS } from "../src/showcase-slots.mjs";

const connectionString = process.env.DATABASE_URL;
const ADMIN_TOKEN = "showcase-owner-token-with-at-least-thirty-two-characters";
const ADMIN_CONTEXT = {
  role: "ADMIN",
  userId: "00000000-0000-4000-8000-000000000001",
  providerId: null
};
const PREVIEW_BYTES = Buffer.from("RIFF1234WEBPshowcase-preview", "ascii");

function memoryStorage() {
  const writes = [];
  const removed = [];
  return {
    writes,
    removed,
    async write({ stream, storageKey, expectedBytes, mimeType }) {
      const chunks = [];
      for await (const chunk of stream) chunks.push(Buffer.from(chunk));
      const body = Buffer.concat(chunks);
      assert.equal(body.length, expectedBytes);
      writes.push({ storageKey, mimeType, body });
      const marker = writes.length.toString(16).padStart(2, "0");
      return {
        storageKey,
        mimeType,
        sizeBytes: body.length,
        checksumSha256: marker.repeat(32),
        width: 1440,
        height: 900,
        previewStorageKey: `${storageKey}.preview.webp`,
        previewMimeType: "image/webp",
        previewSizeBytes: PREVIEW_BYTES.length,
        previewChecksumSha256: "b".repeat(64),
        previewWidth: 960,
        previewHeight: 600
      };
    },
    async remove(storageKey) {
      removed.push(storageKey);
    },
    async openPreview(_storageKey, _rangeHeader, _width) {
      return {
        stream: Readable.from(PREVIEW_BYTES),
        statusCode: 200,
        sizeBytes: PREVIEW_BYTES.length,
        start: 0,
        end: PREVIEW_BYTES.length - 1
      };
    }
  };
}

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

async function upload(baseUrl, slot, mimeType, filename, body, { alt = "", focalX = 50, focalY = 50 } = {}) {
  const response = await fetch(`${baseUrl}/api/admin/showcase/${slot}`, {
    method: "PUT",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${ADMIN_TOKEN}`,
      "Content-Type": mimeType,
      "Content-Length": String(body.length),
      "X-File-Name": encodeURIComponent(filename),
      "X-Alt-Text": encodeURIComponent(alt),
      "X-Focal-X": String(focalX),
      "X-Focal-Y": String(focalY)
    },
    body
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

test("el escaparate conserva slots, permisos, metadatos, lectura pública y retirada", {
  skip: !connectionString
}, async (t) => {
  const database = createDatabase({
    connectionString,
    maxConnections: 4,
    statementTimeoutMs: 5000,
    logger: { error() {} }
  });
  const storage = memoryStorage();
  const service = createShowcaseMediaService({ database, storage, logger: { warn() {} } });
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
  const server = createServer(createShowcaseMediaApiHandler({
    baseHandler,
    showcaseMediaService: service,
    authenticateRequest,
    logger: { error() {} }
  }));

  await database.withContext(ADMIN_CONTEXT, async (transaction) => {
    await transaction.query("DELETE FROM site_showcase_media");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    await database.withContext(ADMIN_CONTEXT, async (transaction) => {
      await transaction.query("DELETE FROM site_showcase_media");
    });
    await new Promise((resolve) => server.close(resolve));
    await database.close();
  });

  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const unauthorized = await json(baseUrl, "/api/admin/showcase", { bearer: null });
  assert.equal(unauthorized.response.status, 401);

  const initial = await json(baseUrl, "/api/admin/showcase");
  assert.equal(initial.response.status, 200);
  assert.equal(initial.payload.slots.length, SHOWCASE_SLOTS.length);
  assert.ok(initial.payload.slots.every((slot) => slot.media === null));

  const fixtures = [
    ["HOME_HERO_DESKTOP", "image/jpeg", "home.jpg", Buffer.from("jpeg-showcase-body"), "Portada de Atelier", 42, 35],
    ["STORE_HERO_DESKTOP", "image/png", "tienda.png", Buffer.from("png-showcase-body"), "Selección de piezas", 55, 48],
    ["STORIES_HERO_MOBILE", "image/webp", "historias.webp", Buffer.from("webp-showcase-body"), "Historias del taller", 61, 40]
  ];

  for (const [slot, mime, filename, body, alt, focalX, focalY] of fixtures) {
    const created = await upload(baseUrl, slot, mime, filename, body, { alt, focalX, focalY });
    assert.equal(created.response.status, 201);
    assert.equal(created.payload.media.slotKey, slot);
    assert.equal(created.payload.media.mimeType, mime);
    assert.equal(created.payload.media.altText, alt);
    assert.equal(created.payload.media.focalX, focalX);
    assert.equal(created.payload.media.focalY, focalY);
  }
  assert.deepEqual(storage.writes.map((item) => item.mimeType), ["image/jpeg", "image/png", "image/webp"]);

  const configured = await json(baseUrl, "/api/admin/showcase");
  assert.equal(configured.response.status, 200);
  assert.equal(configured.payload.slots.filter((slot) => slot.media).length, 3);
  assert.equal(configured.payload.slots.find((slot) => slot.slotKey === "WORKSHOPS_HERO_DESKTOP").media, null);

  const publicList = await json(baseUrl, "/api/showcase", { bearer: null });
  assert.equal(publicList.response.status, 200);
  assert.equal(publicList.payload.slots.length, 3);
  assert.ok(publicList.payload.slots.every((slot) => !Object.hasOwn(slot, "storageKey")));
  assert.match(
    publicList.payload.slots.find((slot) => slot.slotKey === "HOME_HERO_DESKTOP").previewPath,
    /^\/api\/showcase\/HOME_HERO_DESKTOP\/preview$/
  );

  const updated = await json(baseUrl, "/api/admin/showcase/HOME_HERO_DESKTOP", {
    method: "PATCH",
    body: { altText: "Nueva portada de Atelier", focalX: 72, focalY: 29 }
  });
  assert.equal(updated.response.status, 200);
  assert.equal(updated.payload.media.altText, "Nueva portada de Atelier");
  assert.equal(updated.payload.media.focalX, 72);
  assert.equal(updated.payload.media.focalY, 29);

  const publicPreview = await fetch(`${baseUrl}/api/showcase/HOME_HERO_DESKTOP/preview?width=640`);
  assert.equal(publicPreview.status, 200);
  assert.equal(publicPreview.headers.get("content-type"), "image/webp");
  assert.deepEqual(Buffer.from(await publicPreview.arrayBuffer()), PREVIEW_BYTES);

  const invalidSlot = await upload(
    baseUrl,
    "NOT_A_REAL_SLOT",
    "image/jpeg",
    "no.jpg",
    Buffer.from("bad-slot")
  );
  assert.equal(invalidSlot.response.status, 422);
  assert.equal(invalidSlot.payload.error, "SHOWCASE_SLOT_INVALID");

  const removed = await json(baseUrl, "/api/admin/showcase/HOME_HERO_DESKTOP", { method: "DELETE" });
  assert.equal(removed.response.status, 200);
  assert.equal(removed.payload.removed, true);

  const afterRemoval = await json(baseUrl, "/api/admin/showcase");
  assert.equal(afterRemoval.payload.slots.find((slot) => slot.slotKey === "HOME_HERO_DESKTOP").media, null);
  const publicAfterRemoval = await json(baseUrl, "/api/showcase", { bearer: null });
  assert.equal(publicAfterRemoval.payload.slots.some((slot) => slot.slotKey === "HOME_HERO_DESKTOP"), false);
  assert.ok(storage.removed.some((key) => key.includes("home_hero_desktop")));

  const audits = await database.withContext(ADMIN_CONTEXT, async (transaction) => {
    const result = await transaction.query(
      `SELECT action, metadata
       FROM audit_events
       WHERE entity_type = 'site_showcase_media'
         AND action IN ('SHOWCASE_MEDIA_REPLACED','SHOWCASE_MEDIA_METADATA_UPDATED','SHOWCASE_MEDIA_REMOVED')
       ORDER BY created_at DESC
       LIMIT 12`
    );
    return result.rows;
  });
  assert.ok(audits.some((item) => item.action === "SHOWCASE_MEDIA_METADATA_UPDATED"));
  assert.ok(audits.some((item) => item.action === "SHOWCASE_MEDIA_REMOVED"));
  assert.ok(audits.filter((item) => item.action === "SHOWCASE_MEDIA_REPLACED").length >= 3);
});

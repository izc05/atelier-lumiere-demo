import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import { createAdminProductsApiHandler } from "../src/admin-products-api.mjs";
import { createAdminProductsService } from "../src/admin-products-service.mjs";
import { createRequestAuthenticator } from "../src/auth-context.mjs";
import { createDatabase } from "../src/database.mjs";
import { createProductsService } from "../src/products-service.mjs";

const connectionString = process.env.DATABASE_URL;
const ADMIN_TOKEN = "admin-products-review-token-atelier-000000000001";
const ADMIN_CONTEXT = {
  role: "ADMIN",
  userId: "00000000-0000-4000-8000-000000000001",
  providerId: null
};
const PROVIDER_CONTEXT = {
  role: "PROVIDER_OWNER",
  userId: "00000000-0000-4000-8000-000000000101",
  providerId: "00000000-0000-4000-8000-000000000201"
};
const PREVIEW_BYTES = Buffer.from("RIFF1234WEBPadmin-preview", "ascii");

async function requestJson(baseUrl, path, { method = "GET", body, bearer = ADMIN_TOKEN } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function createSubmittedProduct(database, productsService, suffix, name) {
  const product = await productsService.create(PROVIDER_CONTEXT, {
    name: `${name} ${suffix}`,
    shortDescription: "Pieza artesanal completa y preparada para la revisión editorial de Atelier Lumière.",
    story: "Creada a mano en varias fases con materiales seleccionados para cada encargo.",
    category: "Decoración artesanal",
    priceCents: 6200,
    stockMode: "MADE_TO_ORDER",
    preparationMinDays: 4,
    preparationMaxDays: 8,
    customizable: true,
    personalizationNotes: "Nombre y fecha opcionales.",
    shippingNotes: "Embalaje rígido y protegido."
  });
  const mediaId = randomUUID();
  await database.withContext(ADMIN_CONTEXT, async (transaction) => {
    await transaction.query(
      `INSERT INTO product_media (
         id, provider_id, product_id, kind, mime_type, original_filename,
         storage_key, size_bytes, checksum_sha256, status, alt_text,
         width, height, preview_storage_key, preview_mime_type,
         preview_size_bytes, preview_checksum_sha256, preview_width,
         preview_height, uploaded_by, ready_at
       ) VALUES (
         $1, $2, $3, 'IMAGE', 'image/png', 'portada.png',
         $4, 68, repeat('a', 64), 'READY', 'Vista principal',
         1, 1, $5, 'image/webp',
         $6, repeat('b', 64), 1, 1, $7, now()
       )`,
      [
        mediaId,
        PROVIDER_CONTEXT.providerId,
        product.id,
        `providers/${PROVIDER_CONTEXT.providerId}/products/${product.id}/${mediaId}/original.png`,
        `providers/${PROVIDER_CONTEXT.providerId}/products/${product.id}/${mediaId}/preview.webp`,
        PREVIEW_BYTES.length,
        PROVIDER_CONTEXT.userId
      ]
    );
  });
  const submitted = await productsService.submit(PROVIDER_CONTEXT, product.id, {
    expectedVersion: product.version,
    providerNote: "Ficha terminada y lista para comprobar."
  });
  return { product: submitted.product, mediaId };
}

test("Administración aprueba, publica o devuelve artículos con observaciones", {
  skip: !connectionString
}, async (t) => {
  const database = createDatabase({
    connectionString,
    maxConnections: 5,
    statementTimeoutMs: 5000,
    logger: { error() {} }
  });
  const productsService = createProductsService({ database });
  const storage = {
    async openPreview(_key, range) {
      const start = range ? 0 : 0;
      const end = PREVIEW_BYTES.length - 1;
      return {
        stream: Readable.from(PREVIEW_BYTES),
        statusCode: range ? 206 : 200,
        sizeBytes: PREVIEW_BYTES.length,
        start,
        end
      };
    }
  };
  const adminProductsService = createAdminProductsService({ database, storage });
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
  const server = createServer(createAdminProductsApiHandler({
    baseHandler,
    adminProductsService,
    authenticateRequest,
    logger: { error() {} }
  }));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await database.close();
  });

  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const suffix = randomUUID().slice(0, 8);
  const approvedCandidate = await createSubmittedProduct(
    database,
    productsService,
    suffix,
    "Caja aprobable"
  );
  const returnedCandidate = await createSubmittedProduct(
    database,
    productsService,
    `${suffix}-b`,
    "Lámina a corregir"
  );

  const unauthorized = await requestJson(baseUrl, "/api/admin/products", { bearer: null });
  assert.equal(unauthorized.response.status, 401);

  const list = await requestJson(baseUrl, "/api/admin/products?status=IN_REVIEW");
  assert.equal(list.response.status, 200);
  assert.ok(list.payload.products.some((item) => item.id === approvedCandidate.product.id));
  assert.ok(list.payload.products.some((item) => item.id === returnedCandidate.product.id));
  assert.ok(list.payload.products.every((item) => item.provider.displayName));

  const detail = await requestJson(
    baseUrl,
    `/api/admin/products/${approvedCandidate.product.id}`
  );
  assert.equal(detail.response.status, 200);
  assert.equal(detail.payload.product.status, "IN_REVIEW");
  assert.equal(detail.payload.product.media.length, 1);
  assert.match(detail.payload.product.media[0].previewPath, /\/preview$/);
  assert.equal(detail.payload.product.reviews[0].status, "PENDING");
  assert.equal(detail.payload.product.reviews[0].providerNote, "Ficha terminada y lista para comprobar.");

  const noPreviewAuth = await fetch(
    `${baseUrl}/api/admin/products/${approvedCandidate.product.id}/media/${approvedCandidate.mediaId}/preview`
  );
  assert.equal(noPreviewAuth.status, 401);

  const preview = await fetch(
    `${baseUrl}/api/admin/products/${approvedCandidate.product.id}/media/${approvedCandidate.mediaId}/preview`,
    {
      headers: {
        Authorization: `Bearer ${ADMIN_TOKEN}`,
        Range: `bytes=0-${PREVIEW_BYTES.length - 1}`
      }
    }
  );
  assert.equal(preview.status, 206);
  assert.equal(preview.headers.get("content-type"), "image/webp");
  assert.deepEqual(Buffer.from(await preview.arrayBuffer()), PREVIEW_BYTES);

  const approved = await requestJson(
    baseUrl,
    `/api/admin/products/${approvedCandidate.product.id}/review`,
    {
      method: "POST",
      body: { decision: "APPROVED", reviewerNote: "Ficha correcta y lista para publicar." }
    }
  );
  assert.equal(approved.response.status, 200);
  assert.equal(approved.payload.status, "APPROVED");
  assert.equal(approved.payload.review.status, "APPROVED");

  const repeatedDecision = await requestJson(
    baseUrl,
    `/api/admin/products/${approvedCandidate.product.id}/review`,
    { method: "POST", body: { decision: "APPROVED" } }
  );
  assert.equal(repeatedDecision.response.status, 409);
  assert.equal(repeatedDecision.payload.error, "PRODUCT_NOT_IN_REVIEW");

  const published = await requestJson(
    baseUrl,
    `/api/admin/products/${approvedCandidate.product.id}/publish`,
    { method: "POST" }
  );
  assert.equal(published.response.status, 200);
  assert.equal(published.payload.status, "PUBLISHED");
  assert.ok(published.payload.publishedAt);

  const returned = await requestJson(
    baseUrl,
    `/api/admin/products/${returnedCandidate.product.id}/review`,
    {
      method: "POST",
      body: {
        decision: "CHANGES_REQUESTED",
        reviewerNote: "Añade una fotografía más clara y concreta mejor el tiempo de preparación."
      }
    }
  );
  assert.equal(returned.response.status, 200);
  assert.equal(returned.payload.status, "CHANGES_REQUESTED");

  const shortNote = await createSubmittedProduct(
    database,
    productsService,
    `${suffix}-c`,
    "Objeto con nota corta"
  );
  const rejectedShortNote = await requestJson(
    baseUrl,
    `/api/admin/products/${shortNote.product.id}/review`,
    {
      method: "POST",
      body: { decision: "CHANGES_REQUESTED", reviewerNote: "Muy corto" }
    }
  );
  assert.equal(rejectedShortNote.response.status, 422);

  const stored = await database.withContext(ADMIN_CONTEXT, async (transaction) => {
    const statuses = await transaction.query(
      "SELECT id, status FROM products WHERE id = ANY($1::uuid[]) ORDER BY id",
      [[approvedCandidate.product.id, returnedCandidate.product.id]]
    );
    const audits = await transaction.query(
      `SELECT action, metadata::text AS metadata
       FROM audit_events
       WHERE entity_id = ANY($1::uuid[])
         AND action IN ('PRODUCT_REVIEW_APPROVED', 'PRODUCT_CHANGES_REQUESTED', 'PRODUCT_PUBLISHED')`,
      [[approvedCandidate.product.id, returnedCandidate.product.id]]
    );
    return { statuses: statuses.rows, audits: audits.rows };
  });
  assert.equal(
    stored.statuses.find((item) => item.id === approvedCandidate.product.id).status,
    "PUBLISHED"
  );
  assert.equal(
    stored.statuses.find((item) => item.id === returnedCandidate.product.id).status,
    "CHANGES_REQUESTED"
  );
  assert.ok(stored.audits.some((item) => item.action === "PRODUCT_REVIEW_APPROVED"));
  assert.ok(stored.audits.some((item) => item.action === "PRODUCT_CHANGES_REQUESTED"));
  assert.ok(stored.audits.some((item) => item.action === "PRODUCT_PUBLISHED"));
  assert.equal(JSON.stringify(stored.audits).includes("preview_storage_key"), false);
});

import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import { createAdminProductsService } from "../src/admin-products-service.mjs";
import { createDatabase } from "../src/database.mjs";
import { createProductsService } from "../src/products-service.mjs";
import { createPublicCatalogApiHandler } from "../src/public-catalog-api.mjs";
import { createPublicCatalogService } from "../src/public-catalog-service.mjs";

const connectionString = process.env.DATABASE_URL;
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
const PREVIEW_BYTES = Buffer.from("RIFF1234WEBPpublic-preview", "ascii");
const VIDEO_BYTES = Buffer.from("public-video-mp4-bytes", "ascii");

async function json(response) {
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

async function publishProduct(database, productsService, adminService, suffix) {
  const created = await productsService.create(PROVIDER_CONTEXT, {
    name: `Caja pública ${suffix}`,
    shortDescription: "Caja artesanal personalizada para una celebración especial y llena de recuerdos.",
    story: "La pieza se corta, monta y decora a mano en el taller siguiendo un proceso pausado.",
    category: "Decoración artesanal",
    priceCents: 6900,
    stockMode: "MADE_TO_ORDER",
    preparationMinDays: 5,
    preparationMaxDays: 9,
    customizable: true,
    personalizationNotes: "Se puede añadir nombre y fecha.",
    shippingNotes: "Se envía protegida en una caja rígida."
  });
  const imageId = randomUUID();
  const videoId = randomUUID();
  await database.withContext(ADMIN_CONTEXT, async (transaction) => {
    await transaction.query("UPDATE providers SET status = 'ACTIVE' WHERE id = $1", [PROVIDER_CONTEXT.providerId]);
    await transaction.query(
      `INSERT INTO product_media (
         id, provider_id, product_id, kind, mime_type, original_filename,
         storage_key, size_bytes, checksum_sha256, status, sort_order, alt_text,
         width, height, preview_storage_key, preview_mime_type,
         preview_size_bytes, preview_checksum_sha256, preview_width,
         preview_height, uploaded_by, ready_at
       ) VALUES (
         $1, $2, $3, 'IMAGE', 'image/png', 'caja.png',
         $4, 68, repeat('a',64), 'READY', 0, 'Caja artesanal terminada',
         1, 1, $5, 'image/webp', $6, repeat('b',64), 1, 1, $7, now()
       )`,
      [
        imageId,
        PROVIDER_CONTEXT.providerId,
        created.id,
        `providers/${PROVIDER_CONTEXT.providerId}/products/${created.id}/${imageId}/original.png`,
        `providers/${PROVIDER_CONTEXT.providerId}/products/${created.id}/${imageId}/preview.webp`,
        PREVIEW_BYTES.length,
        PROVIDER_CONTEXT.userId
      ]
    );
    await transaction.query(
      `INSERT INTO product_media (
         id, provider_id, product_id, kind, mime_type, original_filename,
         storage_key, size_bytes, checksum_sha256, status, sort_order, alt_text,
         duration_seconds, uploaded_by, ready_at
       ) VALUES (
         $1, $2, $3, 'VIDEO', 'video/mp4', 'proceso.mp4',
         $4, $5, repeat('c',64), 'READY', 0, 'Proceso de elaboración',
         12.5, $6, now()
       )`,
      [
        videoId,
        PROVIDER_CONTEXT.providerId,
        created.id,
        `providers/${PROVIDER_CONTEXT.providerId}/products/${created.id}/${videoId}/original.mp4`,
        VIDEO_BYTES.length,
        PROVIDER_CONTEXT.userId
      ]
    );
    await transaction.query(
      `INSERT INTO product_events (provider_id, product_id, event_slug)
       VALUES ($1, $2, 'boda')`,
      [PROVIDER_CONTEXT.providerId, created.id]
    );
    await transaction.query(
      `INSERT INTO product_personalization_options (
         provider_id, product_id, name, option_type, required,
         choices, price_delta_cents, sort_order
       ) VALUES ($1, $2, 'Color', 'SELECT', true, '["burdeos","marfil"]'::jsonb, 500, 0)`,
      [PROVIDER_CONTEXT.providerId, created.id]
    );
  });
  const submitted = await productsService.submit(PROVIDER_CONTEXT, created.id, {
    expectedVersion: created.version,
    providerNote: "Artículo listo para la tienda pública."
  });
  await adminService.decide(ADMIN_CONTEXT, created.id, {
    decision: "APPROVED",
    reviewerNote: "Contenido correcto."
  });
  await adminService.publish(ADMIN_CONTEXT, created.id);
  return { product: submitted.product, imageId, videoId };
}

test("el catálogo público muestra solo artículos publicados y protege archivos privados", {
  skip: !connectionString
}, async (t) => {
  const database = createDatabase({
    connectionString,
    maxConnections: 5,
    statementTimeoutMs: 5000,
    logger: { error() {} }
  });
  const storage = {
    async openPreview(_key, range) {
      return {
        stream: Readable.from(PREVIEW_BYTES),
        statusCode: range ? 206 : 200,
        sizeBytes: PREVIEW_BYTES.length,
        start: 0,
        end: PREVIEW_BYTES.length - 1
      };
    },
    async openRead(_key, range) {
      return {
        stream: Readable.from(VIDEO_BYTES),
        statusCode: range ? 206 : 200,
        sizeBytes: VIDEO_BYTES.length,
        start: 0,
        end: VIDEO_BYTES.length - 1
      };
    }
  };
  const productsService = createProductsService({ database });
  const adminService = createAdminProductsService({ database, storage });
  const publicService = createPublicCatalogService({ database, storage });
  const handler = createPublicCatalogApiHandler({
    baseHandler(_request, response) {
      response.writeHead(404, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "NOT_FOUND" }));
    },
    publicCatalogService: publicService,
    logger: { error() {} }
  });
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await database.close();
  });

  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const suffix = randomUUID().slice(0, 8);
  const published = await publishProduct(database, productsService, adminService, suffix);
  const draft = await productsService.create(PROVIDER_CONTEXT, {
    name: `Borrador invisible ${suffix}`,
    shortDescription: "Este artículo no debe salir nunca en la tienda pública.",
    category: "Pruebas",
    priceCents: 1000,
    stockMode: "FINITE",
    stockQuantity: 1,
    preparationMinDays: 1,
    preparationMaxDays: 2
  });

  const provider = await database.withContext(ADMIN_CONTEXT, async (transaction) => {
    const result = await transaction.query(
      "SELECT slug, display_name, contact_email FROM providers WHERE id = $1",
      [PROVIDER_CONTEXT.providerId]
    );
    return result.rows[0];
  });

  const listResponse = await fetch(`${baseUrl}/api/catalog/products`);
  const listPayload = await json(listResponse);
  assert.equal(listResponse.status, 200);
  assert.ok(listPayload.products.some((item) => item.id === published.product.id));
  assert.equal(listPayload.products.some((item) => item.id === draft.id), false);
  const publicItem = listPayload.products.find((item) => item.id === published.product.id);
  assert.equal(publicItem.provider.displayName, provider.display_name);
  assert.equal(publicItem.provider.contactEmail, undefined);
  assert.equal(publicItem.events.includes("boda"), true);
  assert.match(publicItem.cover.path, /\/preview$/);
  assert.equal(JSON.stringify(listPayload).includes(provider.contact_email), false);
  assert.equal(JSON.stringify(listPayload).includes("storage_key"), false);
  assert.match(listResponse.headers.get("cache-control"), /public/);

  const filteredResponse = await fetch(`${baseUrl}/api/catalog/products?event=boda&q=Caja`);
  const filteredPayload = await json(filteredResponse);
  assert.equal(filteredResponse.status, 200);
  assert.ok(filteredPayload.products.some((item) => item.id === published.product.id));

  const detailResponse = await fetch(
    `${baseUrl}/api/catalog/products/${provider.slug}/${published.product.slug}`
  );
  const detailPayload = await json(detailResponse);
  assert.equal(detailResponse.status, 200);
  assert.equal(detailPayload.product.id, published.product.id);
  assert.equal(detailPayload.product.personalizations[0].name, "Color");
  assert.equal(detailPayload.product.media.some((item) => item.kind === "VIDEO"), true);
  assert.equal(JSON.stringify(detailPayload).includes(provider.contact_email), false);
  assert.equal(JSON.stringify(detailPayload).includes("original_filename"), false);

  const hiddenDraft = await fetch(`${baseUrl}/api/catalog/products/${provider.slug}/${draft.slug}`);
  assert.equal(hiddenDraft.status, 404);

  const preview = await fetch(
    `${baseUrl}/api/catalog/products/${published.product.id}/media/${published.imageId}/preview`,
    { headers: { Range: `bytes=0-${PREVIEW_BYTES.length - 1}` } }
  );
  assert.equal(preview.status, 206);
  assert.equal(preview.headers.get("content-type"), "image/webp");
  assert.deepEqual(Buffer.from(await preview.arrayBuffer()), PREVIEW_BYTES);

  const originalPhoto = await fetch(
    `${baseUrl}/api/catalog/products/${published.product.id}/media/${published.imageId}/content`
  );
  assert.equal(originalPhoto.status, 404);

  const video = await fetch(
    `${baseUrl}/api/catalog/products/${published.product.id}/media/${published.videoId}/content`,
    { headers: { Range: `bytes=0-${VIDEO_BYTES.length - 1}` } }
  );
  assert.equal(video.status, 206);
  assert.equal(video.headers.get("content-type"), "video/mp4");
  assert.deepEqual(Buffer.from(await video.arrayBuffer()), VIDEO_BYTES);
});

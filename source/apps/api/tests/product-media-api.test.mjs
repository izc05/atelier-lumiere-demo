import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDatabase } from "../src/database.mjs";
import { createMediaPreviewStorage } from "../src/media-preview-storage.mjs";
import { createLocalMediaStorage } from "../src/media-storage-service.mjs";
import { createProductMediaApiHandler } from "../src/product-media-api.mjs";
import { createProductMediaService } from "../src/product-media-service.mjs";
import { createProductsService } from "../src/products-service.mjs";

const connectionString = process.env.DATABASE_URL;
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

function minimalMp4() {
  const ftyp = Buffer.alloc(24);
  ftyp.writeUInt32BE(24, 0);
  ftyp.write("ftyp", 4, "ascii");
  ftyp.write("isom", 8, "ascii");
  ftyp.writeUInt32BE(0, 12);
  ftyp.write("isom", 16, "ascii");
  ftyp.write("mp42", 20, "ascii");
  const mdat = Buffer.alloc(8);
  mdat.writeUInt32BE(8, 0);
  mdat.write("mdat", 4, "ascii");
  return Buffer.concat([ftyp, mdat]);
}

async function jsonResponse(response) {
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

async function upload(baseUrl, productId, bearer, buffer, {
  mimeType = "image/png",
  filename = "imagen.png",
  altText = ""
} = {}) {
  const response = await fetch(`${baseUrl}/api/provider/products/${productId}/media`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${bearer}`,
      "Content-Type": mimeType,
      "Content-Length": String(buffer.length),
      "X-File-Name": encodeURIComponent(filename),
      "X-Alt-Text": encodeURIComponent(altText)
    },
    body: buffer
  });
  return { response, payload: await jsonResponse(response) };
}

test("los medios generan previews, se aíslan y se sirven de forma privada", {
  skip: !connectionString
}, async (t) => {
  const storageRoot = await mkdtemp(join(tmpdir(), "atelier-media-"));
  const database = createDatabase({
    connectionString,
    maxConnections: 5,
    statementTimeoutMs: 5000,
    logger: { error() {} }
  });
  const localStorage = createLocalMediaStorage({ rootPath: storageRoot });
  const storage = createMediaPreviewStorage({
    baseStorage: localStorage,
    previewMaxWidth: 640,
    previewMaxHeight: 640,
    previewQuality: 82
  });
  const mediaService = createProductMediaService({
    database,
    storage,
    uploadTtlMinutes: 15,
    logger: { error() {} }
  });
  const productsService = createProductsService({ database });
  const tokenA = "provider-media-session-a-0000000000000000000001";
  const tokenB = "provider-media-session-b-0000000000000000000002";
  const contextA = {
    userId: "00000000-0000-4000-8000-000000000101",
    providerId: "00000000-0000-4000-8000-000000000201",
    role: "PROVIDER_OWNER"
  };
  const contextB = {
    userId: "00000000-0000-4000-8000-000000000102",
    providerId: "00000000-0000-4000-8000-000000000202",
    role: "PROVIDER_OWNER"
  };
  const providerAuthService = {
    async authenticate(token) {
      if (token === tokenA) return { context: contextA };
      if (token === tokenB) return { context: contextB };
      return null;
    }
  };
  const baseHandler = (_request, response) => {
    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "NOT_FOUND" }));
  };
  const handler = createProductMediaApiHandler({
    baseHandler,
    productMediaService: mediaService,
    providerAuthService,
    logger: { error() {} }
  });
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await database.close();
    await rm(storageRoot, { recursive: true, force: true });
  });

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const suffix = randomUUID().slice(0, 8);
  const product = await productsService.create(contextA, {
    name: `Caja de recuerdos ${suffix}`,
    shortDescription: "Caja artesanal personalizada para conservar recuerdos de una celebración especial.",
    story: "Se corta, monta y decora a mano en el taller para cada pedido.",
    category: "Decoración artesanal",
    priceCents: 5900,
    stockMode: "MADE_TO_ORDER",
    preparationMinDays: 4,
    preparationMaxDays: 9,
    customizable: true,
    personalizationNotes: "Nombre, fecha y combinación de colores.",
    shippingNotes: "Se envía protegida dentro de una caja rígida."
  });

  const unauthorized = await fetch(`${baseUrl}/api/provider/products/${product.id}/media`, {
    method: "POST",
    headers: {
      "Content-Type": "image/png",
      "Content-Length": String(PNG_1X1.length),
      "X-File-Name": "sin-sesion.png"
    },
    body: PNG_1X1
  });
  assert.equal(unauthorized.status, 401);

  const disguised = await upload(
    baseUrl,
    product.id,
    tokenA,
    Buffer.from("esto no es una imagen"),
    { mimeType: "image/jpeg", filename: "disfraz.jpg" }
  );
  assert.equal(disguised.response.status, 422);
  assert.equal(disguised.payload.error, "MEDIA_CONTENT_INVALID");

  const first = await upload(baseUrl, product.id, tokenA, PNG_1X1, {
    filename: "portada celebración.png",
    altText: "Caja artesanal abierta con recuerdos"
  });
  assert.equal(first.response.status, 201);
  assert.equal(first.payload.media.status, "READY");
  assert.equal(first.payload.media.kind, "IMAGE");
  assert.equal(first.payload.media.width, 1);
  assert.equal(first.payload.media.height, 1);
  assert.equal(
    first.payload.media.checksumSha256,
    createHash("sha256").update(PNG_1X1).digest("hex")
  );
  assert.match(first.payload.media.previewPath, /\/preview$/);
  assert.equal(first.payload.media.preview.mimeType, "image/webp");
  assert.equal(first.payload.media.preview.width, 1);
  assert.equal(first.payload.media.preview.height, 1);
  assert.ok(first.payload.media.preview.sizeBytes > 0);
  const firstMediaId = first.payload.media.id;

  const foreignRead = await fetch(
    `${baseUrl}/api/provider/products/${product.id}/media/${firstMediaId}/content`,
    { headers: { Authorization: `Bearer ${tokenB}` } }
  );
  assert.equal(foreignRead.status, 404);
  assert.equal((await jsonResponse(foreignRead)).error, "MEDIA_NOT_FOUND");

  const foreignPreview = await fetch(
    `${baseUrl}/api/provider/products/${product.id}/media/${firstMediaId}/preview`,
    { headers: { Authorization: `Bearer ${tokenB}` } }
  );
  assert.equal(foreignPreview.status, 404);
  assert.equal((await jsonResponse(foreignPreview)).error, "MEDIA_NOT_FOUND");

  const fullRead = await fetch(
    `${baseUrl}/api/provider/products/${product.id}/media/${firstMediaId}/content`,
    { headers: { Authorization: `Bearer ${tokenA}` } }
  );
  assert.equal(fullRead.status, 200);
  assert.equal(fullRead.headers.get("content-type"), "image/png");
  assert.match(fullRead.headers.get("cache-control"), /private/);
  assert.equal(fullRead.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(Buffer.from(await fullRead.arrayBuffer()), PNG_1X1);

  const previewRead = await fetch(
    `${baseUrl}/api/provider/products/${product.id}/media/${firstMediaId}/preview`,
    { headers: { Authorization: `Bearer ${tokenA}` } }
  );
  assert.equal(previewRead.status, 200);
  assert.equal(previewRead.headers.get("content-type"), "image/webp");
  assert.match(previewRead.headers.get("cache-control"), /private/);
  const previewBytes = Buffer.from(await previewRead.arrayBuffer());
  assert.equal(previewBytes.toString("ascii", 0, 4), "RIFF");
  assert.equal(previewBytes.toString("ascii", 8, 12), "WEBP");
  assert.equal(previewBytes.length, first.payload.media.preview.sizeBytes);

  const ranged = await fetch(
    `${baseUrl}/api/provider/products/${product.id}/media/${firstMediaId}/content`,
    {
      headers: {
        Authorization: `Bearer ${tokenA}`,
        Range: "bytes=0-7"
      }
    }
  );
  assert.equal(ranged.status, 206);
  assert.equal(ranged.headers.get("content-range"), `bytes 0-7/${PNG_1X1.length}`);
  assert.deepEqual(Buffer.from(await ranged.arrayBuffer()), PNG_1X1.subarray(0, 8));

  const metadataResponse = await fetch(
    `${baseUrl}/api/provider/products/${product.id}/media/${firstMediaId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${tokenA}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ altText: "Vista principal de la caja", sortOrder: 2 })
    }
  );
  const metadataPayload = await jsonResponse(metadataResponse);
  assert.equal(metadataResponse.status, 200);
  assert.equal(metadataPayload.media.altText, "Vista principal de la caja");
  assert.equal(metadataPayload.media.sortOrder, 2);
  assert.match(metadataPayload.media.previewPath, /\/preview$/);

  const orderOnlyResponse = await fetch(
    `${baseUrl}/api/provider/products/${product.id}/media/${firstMediaId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${tokenA}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ sortOrder: 3 })
    }
  );
  const orderOnlyPayload = await jsonResponse(orderOnlyResponse);
  assert.equal(orderOnlyResponse.status, 200);
  assert.equal(orderOnlyPayload.media.altText, "Vista principal de la caja");
  assert.equal(orderOnlyPayload.media.sortOrder, 3);

  const mismatch = await upload(baseUrl, product.id, tokenA, PNG_1X1, {
    mimeType: "image/jpeg",
    filename: "extension-falsa.jpg"
  });
  assert.equal(mismatch.response.status, 422);
  assert.equal(mismatch.payload.error, "MEDIA_TYPE_MISMATCH");

  for (let index = 2; index <= 8; index += 1) {
    const item = await upload(baseUrl, product.id, tokenA, PNG_1X1, {
      filename: `detalle-${index}.png`,
      altText: `Detalle ${index} de la caja`
    });
    assert.equal(item.response.status, 201);
    assert.match(item.payload.media.previewPath, /\/preview$/);
  }

  const ninth = await upload(baseUrl, product.id, tokenA, PNG_1X1, {
    filename: "novena-imagen.png"
  });
  assert.equal(ninth.response.status, 409);
  assert.equal(ninth.payload.error, "MEDIA_LIMIT_REACHED");
  assert.equal(ninth.payload.details.maximum, 8);

  const mp4 = minimalMp4();
  const video = await upload(baseUrl, product.id, tokenA, mp4, {
    mimeType: "video/mp4",
    filename: "proceso-artesanal.mp4"
  });
  assert.equal(video.response.status, 201);
  assert.equal(video.payload.media.kind, "VIDEO");
  assert.equal(video.payload.media.status, "READY");
  assert.equal(video.payload.media.previewPath, null);
  assert.equal(video.payload.media.preview, null);

  const videoPreview = await fetch(
    `${baseUrl}/api/provider/products/${product.id}/media/${video.payload.media.id}/preview`,
    { headers: { Authorization: `Bearer ${tokenA}` } }
  );
  assert.equal(videoPreview.status, 404);
  assert.equal((await jsonResponse(videoPreview)).error, "MEDIA_PREVIEW_NOT_AVAILABLE");

  const secondVideo = await upload(baseUrl, product.id, tokenA, mp4, {
    mimeType: "video/mp4",
    filename: "otro-video.mp4"
  });
  assert.equal(secondVideo.response.status, 409);
  assert.equal(secondVideo.payload.error, "MEDIA_LIMIT_REACHED");
  assert.equal(secondVideo.payload.details.kind, "VIDEO");

  const deleted = await fetch(
    `${baseUrl}/api/provider/products/${product.id}/media/${firstMediaId}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${tokenA}` }
    }
  );
  assert.equal(deleted.status, 200);
  assert.equal((await jsonResponse(deleted)).deleted, true);

  for (const variant of ["content", "preview"]) {
    const afterDelete = await fetch(
      `${baseUrl}/api/provider/products/${product.id}/media/${firstMediaId}/${variant}`,
      { headers: { Authorization: `Bearer ${tokenA}` } }
    );
    assert.equal(afterDelete.status, 404);
  }

  const replacement = await upload(baseUrl, product.id, tokenA, PNG_1X1, {
    filename: "portada-sustituta.png"
  });
  assert.equal(replacement.response.status, 201);
  assert.match(replacement.payload.media.previewPath, /\/preview$/);

  const submitted = await productsService.submit(contextA, product.id, {
    expectedVersion: 1,
    providerNote: "Ficha e imágenes preparadas para revisión."
  });
  assert.equal(submitted.product.status, "IN_REVIEW");

  const lockedUpload = await upload(baseUrl, product.id, tokenA, PNG_1X1, {
    filename: "cambio-durante-revision.png"
  });
  assert.equal(lockedUpload.response.status, 409);
  assert.equal(lockedUpload.payload.error, "PRODUCT_LOCKED");

  const stored = await database.withContext({
    userId: "00000000-0000-4000-8000-000000000001",
    providerId: null,
    role: "ADMIN"
  }, async (transaction) => {
    const media = await transaction.query(
      `SELECT kind, status, checksum_sha256, storage_key,
              preview_storage_key, preview_mime_type, preview_size_bytes,
              preview_checksum_sha256, preview_width, preview_height
       FROM product_media
       WHERE product_id = $1
       ORDER BY created_at`,
      [product.id]
    );
    const audits = await transaction.query(
      `SELECT action, metadata::text AS metadata
       FROM audit_events
       WHERE provider_id = $1 AND entity_type = 'product_media'`,
      [contextA.providerId]
    );
    return { media: media.rows, audits: audits.rows };
  });

  const readyImages = stored.media.filter((item) => item.kind === "IMAGE" && item.status === "READY");
  const readyVideos = stored.media.filter((item) => item.kind === "VIDEO" && item.status === "READY");
  assert.equal(readyImages.length, 8);
  assert.equal(readyVideos.length, 1);
  assert.ok(stored.media.filter((item) => item.status === "REJECTED").length >= 2);
  assert.ok(
    stored.media
      .filter((item) => item.status === "READY")
      .every((item) => item.checksum_sha256 !== "0".repeat(64))
  );
  assert.ok(readyImages.every((item) => item.preview_storage_key));
  assert.ok(readyImages.every((item) => item.preview_mime_type === "image/webp"));
  assert.ok(readyImages.every((item) => Number(item.preview_size_bytes) > 0));
  assert.ok(readyImages.every((item) => /^[a-f0-9]{64}$/.test(item.preview_checksum_sha256)));
  assert.ok(readyImages.every((item) => item.preview_width === 1 && item.preview_height === 1));
  assert.ok(readyVideos.every((item) => item.preview_storage_key === null));
  assert.ok(stored.audits.some((item) => item.action === "PRODUCT_MEDIA_UPLOADED"));
  assert.ok(stored.audits.some((item) => item.metadata.includes('"previewGenerated":true')));
  assert.equal(JSON.stringify(stored.audits).includes("storage_key"), false);
  assert.equal(JSON.stringify(stored.audits).includes(storageRoot), false);

  const temporaryFiles = await readdir(join(storageRoot, ".tmp"));
  assert.deepEqual(temporaryFiles, []);
});

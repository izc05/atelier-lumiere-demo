import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createBlogMediaApiHandler } from "../src/blog-media-api.mjs";
import { createBlogMediaService } from "../src/blog-media-service.mjs";
import { createBlogPostsService } from "../src/blog-posts-service.mjs";
import { createDatabase } from "../src/database.mjs";
import { createMediaPreviewStorage } from "../src/media-preview-storage.mjs";
import { createLocalMediaStorage } from "../src/media-storage-service.mjs";

const connectionString = process.env.DATABASE_URL;
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);
const TOKEN_A = "blog-media-provider-a-session-0000000000000001";
const TOKEN_B = "blog-media-provider-b-session-0000000000000002";
const CONTEXT_A = Object.freeze({
  role: "PROVIDER_OWNER",
  userId: "00000000-0000-4000-8000-000000000101",
  providerId: "00000000-0000-4000-8000-000000000201"
});
const CONTEXT_B = Object.freeze({
  role: "PROVIDER_OWNER",
  userId: "00000000-0000-4000-8000-000000000102",
  providerId: "00000000-0000-4000-8000-000000000202"
});
const ADMIN_CONTEXT = Object.freeze({
  role: "ADMIN",
  userId: "00000000-0000-4000-8000-000000000001",
  providerId: null
});

async function jsonResponse(response) {
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

async function upload(baseUrl, postId, token, buffer, {
  mimeType = "image/png",
  filename = "imagen.png",
  altText = "",
  placement = "INLINE"
} = {}) {
  const response = await fetch(`${baseUrl}/api/provider/blog-posts/${postId}/media`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": mimeType,
      "Content-Length": String(buffer.length),
      "X-File-Name": encodeURIComponent(filename),
      "X-Alt-Text": encodeURIComponent(altText),
      "X-Media-Placement": placement
    },
    body: buffer
  });
  return { response, payload: await jsonResponse(response) };
}

test("el blog genera portada y previews privadas con límite e aislamiento", {
  skip: !connectionString
}, async (t) => {
  const storageRoot = await mkdtemp(join(tmpdir(), "atelier-blog-media-"));
  const database = createDatabase({
    connectionString,
    maxConnections: 6,
    statementTimeoutMs: 5000,
    logger: { error() {} }
  });
  const storage = createMediaPreviewStorage({
    baseStorage: createLocalMediaStorage({ rootPath: storageRoot }),
    previewMaxWidth: 640,
    previewMaxHeight: 640,
    previewQuality: 82
  });
  const mediaService = createBlogMediaService({
    database,
    storage,
    uploadTtlMinutes: 15,
    logger: { error() {} }
  });
  const postsService = createBlogPostsService({ database });
  const providerAuthService = {
    async authenticate(token) {
      if (token === TOKEN_A) return { context: CONTEXT_A };
      if (token === TOKEN_B) return { context: CONTEXT_B };
      return null;
    }
  };
  const handler = createBlogMediaApiHandler({
    baseHandler(_request, response) {
      response.writeHead(404, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "NOT_FOUND" }));
    },
    blogMediaService: mediaService,
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

  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const suffix = randomUUID().slice(0, 8);
  const created = await postsService.create(CONTEXT_A, {
    title: `El oficio detrás del bordado ${suffix}`,
    excerpt: "",
    bodyMarkdown: "",
    category: "Procesos artesanales"
  });
  const bodyMarkdown = [
    "## La idea inicial",
    "Cada encargo comienza con una conversación sobre la celebración y la persona que recibirá la pieza.",
    "Seleccionamos los tejidos y preparamos el dibujo antes de comenzar el bordado manual.",
    "## El trabajo en el taller",
    "Cada puntada se revisa, se remata y se protege para que la pieza llegue en perfectas condiciones.",
    "El acabado final se realiza lentamente y se documenta antes de preparar el envío."
  ].join("\n\n");
  const updated = await postsService.update(CONTEXT_A, created.id, {
    expectedVersion: created.version,
    title: created.title,
    excerpt: "Un recorrido por la elección de materiales, el bordado y el acabado de una pieza artesanal creada para celebrar.",
    bodyMarkdown,
    category: "Procesos artesanales"
  });

  const unauthorized = await fetch(`${baseUrl}/api/provider/blog-posts/${created.id}/media`, {
    method: "POST",
    headers: {
      "Content-Type": "image/png",
      "Content-Length": String(PNG_1X1.length),
      "X-File-Name": "sin-sesion.png",
      "X-Media-Placement": "COVER"
    },
    body: PNG_1X1
  });
  assert.equal(unauthorized.status, 401);

  const disguised = await upload(
    baseUrl,
    created.id,
    TOKEN_A,
    Buffer.from("no es una imagen"),
    { mimeType: "image/jpeg", filename: "disfraz.jpg", placement: "INLINE" }
  );
  assert.equal(disguised.response.status, 422);
  assert.equal(disguised.payload.error, "MEDIA_CONTENT_INVALID");

  const cover = await upload(baseUrl, created.id, TOKEN_A, PNG_1X1, {
    filename: "portada del taller.png",
    altText: "Manos bordando una pieza artesanal",
    placement: "COVER"
  });
  assert.equal(cover.response.status, 201);
  assert.equal(cover.payload.media.status, "READY");
  assert.equal(cover.payload.media.placement, "COVER");
  assert.equal(cover.payload.media.width, 1);
  assert.equal(cover.payload.media.height, 1);
  assert.equal(
    cover.payload.media.checksumSha256,
    createHash("sha256").update(PNG_1X1).digest("hex")
  );
  assert.equal(cover.payload.media.preview.mimeType, "image/webp");
  assert.match(cover.payload.media.previewPath, /\/preview$/);
  const coverId = cover.payload.media.id;

  const secondCover = await upload(baseUrl, created.id, TOKEN_A, PNG_1X1, {
    filename: "segunda-portada.png",
    placement: "COVER"
  });
  assert.equal(secondCover.response.status, 409);
  assert.equal(secondCover.payload.error, "BLOG_COVER_ALREADY_EXISTS");

  for (const variant of ["content", "preview"]) {
    const foreign = await fetch(
      `${baseUrl}/api/provider/blog-posts/${created.id}/media/${coverId}/${variant}`,
      { headers: { Authorization: `Bearer ${TOKEN_B}` } }
    );
    assert.equal(foreign.status, 404);
  }

  const preview = await fetch(
    `${baseUrl}/api/provider/blog-posts/${created.id}/media/${coverId}/preview`,
    { headers: { Authorization: `Bearer ${TOKEN_A}` } }
  );
  assert.equal(preview.status, 200);
  assert.equal(preview.headers.get("content-type"), "image/webp");
  const previewBytes = Buffer.from(await preview.arrayBuffer());
  assert.equal(previewBytes.toString("ascii", 0, 4), "RIFF");
  assert.equal(previewBytes.toString("ascii", 8, 12), "WEBP");

  const inlineIds = [];
  for (let index = 1; index <= 11; index += 1) {
    const item = await upload(baseUrl, created.id, TOKEN_A, PNG_1X1, {
      filename: `detalle-${index}.png`,
      altText: `Detalle ${index} del proceso`,
      placement: "INLINE"
    });
    assert.equal(item.response.status, 201);
    inlineIds.push(item.payload.media.id);
  }

  const thirteenth = await upload(baseUrl, created.id, TOKEN_A, PNG_1X1, {
    filename: "imagen-trece.png",
    placement: "INLINE"
  });
  assert.equal(thirteenth.response.status, 409);
  assert.equal(thirteenth.payload.error, "BLOG_MEDIA_LIMIT_REACHED");

  const conflictingPlacement = await fetch(
    `${baseUrl}/api/provider/blog-posts/${created.id}/media/${inlineIds[0]}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${TOKEN_A}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ placement: "COVER", altText: "Nueva portada" })
    }
  );
  assert.equal(conflictingPlacement.status, 409);
  assert.equal((await jsonResponse(conflictingPlacement)).error, "BLOG_COVER_ALREADY_EXISTS");

  const removed = await fetch(
    `${baseUrl}/api/provider/blog-posts/${created.id}/media/${coverId}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${TOKEN_A}` } }
  );
  assert.equal(removed.status, 200);

  const promoted = await fetch(
    `${baseUrl}/api/provider/blog-posts/${created.id}/media/${inlineIds[0]}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${TOKEN_A}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        placement: "COVER",
        altText: "Portada definitiva del proceso artesanal",
        sortOrder: 0
      })
    }
  );
  const promotedPayload = await jsonResponse(promoted);
  assert.equal(promoted.status, 200);
  assert.equal(promotedPayload.media.placement, "COVER");

  const submitted = await postsService.submit(CONTEXT_A, created.id, {
    expectedVersion: updated.version,
    providerNote: "Historia e imágenes preparadas para revisión."
  });
  assert.equal(submitted.post.status, "IN_REVIEW");

  const lockedUpload = await upload(baseUrl, created.id, TOKEN_A, PNG_1X1, {
    filename: "cambio-durante-revision.png",
    placement: "INLINE"
  });
  assert.equal(lockedUpload.response.status, 409);
  assert.equal(lockedUpload.payload.error, "BLOG_POST_LOCKED");

  const stored = await database.withContext(ADMIN_CONTEXT, async (transaction) => {
    const media = await transaction.query(
      `SELECT placement, status, storage_key, preview_storage_key,
              preview_mime_type, preview_size_bytes, preview_checksum_sha256
       FROM blog_post_media
       WHERE post_id = $1
       ORDER BY created_at`,
      [created.id]
    );
    const audits = await transaction.query(
      `SELECT action, metadata
       FROM audit_events
       WHERE entity_type = 'blog_media' AND provider_id = $1`,
      [CONTEXT_A.providerId]
    );
    return { media: media.rows, audits: audits.rows };
  });

  const ready = stored.media.filter((item) => item.status === "READY");
  assert.equal(ready.length, 11);
  assert.equal(ready.filter((item) => item.placement === "COVER").length, 1);
  assert.ok(stored.media.some((item) => item.status === "REJECTED"));
  assert.ok(stored.media.some((item) => item.status === "DELETED"));
  assert.ok(ready.every((item) => item.preview_storage_key));
  assert.ok(ready.every((item) => item.preview_mime_type === "image/webp"));
  assert.ok(ready.every((item) => Number(item.preview_size_bytes) > 0));
  assert.ok(ready.every((item) => /^[a-f0-9]{64}$/.test(item.preview_checksum_sha256)));
  assert.ok(stored.audits.some((item) => item.action === "BLOG_MEDIA_UPLOADED"));
  assert.ok(stored.audits.some((item) => item.action === "BLOG_MEDIA_METADATA_UPDATED"));
  assert.ok(stored.audits.some((item) => item.action === "BLOG_MEDIA_DELETED"));
  assert.equal(JSON.stringify(stored.audits).includes("storage_key"), false);
  assert.equal(JSON.stringify(stored.audits).includes(storageRoot), false);

  const temporaryFiles = await readdir(join(storageRoot, ".tmp"));
  assert.deepEqual(temporaryFiles, []);
});

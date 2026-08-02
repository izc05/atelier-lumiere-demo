import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import { createAdminBlogApiHandler } from "../src/admin-blog-api.mjs";
import { createAdminBlogService } from "../src/admin-blog-service.mjs";
import { createRequestAuthenticator } from "../src/auth-context.mjs";
import { createBlogPostsService } from "../src/blog-posts-service.mjs";
import { createDatabase } from "../src/database.mjs";
import { createProductsService } from "../src/products-service.mjs";

const connectionString = process.env.DATABASE_URL;
const ADMIN_TOKEN = "admin-blog-review-token-atelier-0000000000001";
const ADMIN_CONTEXT = Object.freeze({
  role: "ADMIN",
  userId: "00000000-0000-4000-8000-000000000001",
  providerId: null
});
const PROVIDER_CONTEXT = Object.freeze({
  role: "PROVIDER_OWNER",
  userId: "00000000-0000-4000-8000-000000000101",
  providerId: "00000000-0000-4000-8000-000000000201"
});
const PREVIEW = Buffer.from("RIFF1234WEBPadmin-blog-preview", "ascii");

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

function bodyMarkdown() {
  return [
    "## La idea inicial",
    "Cada historia comienza con una conversación sobre la persona, la celebración y el objeto que queremos crear.",
    "Seleccionamos los materiales y preparamos cada herramienta antes de comenzar el trabajo manual.",
    "## El proceso artesanal",
    "La pieza avanza despacio, revisando cada detalle, el acabado y la forma en que se presentará al recibirla.",
    "Documentamos el proceso para mostrar el valor del trabajo y preparar después un envío seguro desde el taller."
  ].join("\n\n");
}

async function createSubmittedPost({
  database,
  postsService,
  productsService,
  suffix,
  title,
  withCover = true,
  withRelatedProduct = false
}) {
  const created = await postsService.create(PROVIDER_CONTEXT, {
    title: `${title} ${suffix}`,
    excerpt: "",
    bodyMarkdown: "",
    category: "Procesos artesanales"
  });
  const updated = await postsService.update(PROVIDER_CONTEXT, created.id, {
    expectedVersion: created.version,
    title: created.title,
    excerpt: "Un recorrido completo por la inspiración, los materiales y el proceso manual seguido dentro del taller artesanal.",
    bodyMarkdown: bodyMarkdown(),
    category: "Procesos artesanales"
  });
  await postsService.replaceTags(PROVIDER_CONTEXT, created.id, {
    tags: ["hecho-a-mano", "proceso-artesanal"]
  });

  let product = null;
  if (withRelatedProduct) {
    product = await productsService.create(PROVIDER_CONTEXT, {
      name: `Pieza relacionada ${suffix}`,
      shortDescription: "Pieza artesanal relacionada con la historia editorial del taller.",
      story: "Elaborada manualmente como parte del proceso que se explica en el blog.",
      category: "Decoración artesanal",
      priceCents: 5200,
      stockMode: "MADE_TO_ORDER",
      preparationMinDays: 3,
      preparationMaxDays: 7,
      customizable: false,
      personalizationNotes: "",
      shippingNotes: "Embalaje protegido."
    });
    await postsService.replaceRelatedProducts(PROVIDER_CONTEXT, created.id, {
      productIds: [product.id]
    });
  }

  let mediaId = null;
  if (withCover) {
    mediaId = randomUUID();
    await database.withContext(ADMIN_CONTEXT, async (transaction) => {
      await transaction.query(
        `INSERT INTO blog_post_media (
           id, provider_id, post_id, placement, mime_type, original_filename,
           storage_key, size_bytes, checksum_sha256, status, sort_order,
           alt_text, width, height, preview_storage_key, preview_mime_type,
           preview_size_bytes, preview_checksum_sha256, preview_width,
           preview_height, uploaded_by, ready_at
         ) VALUES (
           $1, $2, $3, 'COVER', 'image/png', 'portada.png',
           $4, 68, repeat('a', 64), 'READY', 0,
           'Portada del proceso artesanal', 1, 1, $5, 'image/webp',
           $6, repeat('b', 64), 1, 1, $7, now()
         )`,
        [
          mediaId,
          PROVIDER_CONTEXT.providerId,
          created.id,
          `providers/${PROVIDER_CONTEXT.providerId}/blog/${created.id}/${mediaId}/original.png`,
          `providers/${PROVIDER_CONTEXT.providerId}/blog/${created.id}/${mediaId}/preview.webp`,
          PREVIEW.length,
          PROVIDER_CONTEXT.userId
        ]
      );
    });
  }

  const submitted = await postsService.submit(PROVIDER_CONTEXT, created.id, {
    expectedVersion: updated.version,
    providerNote: "Historia terminada y preparada para revisión editorial."
  });
  return { post: submitted.post, mediaId, product };
}

test("Administración revisa, devuelve y publica historias con portada obligatoria", {
  skip: !connectionString
}, async (t) => {
  const database = createDatabase({
    connectionString,
    maxConnections: 6,
    statementTimeoutMs: 5000,
    logger: { error() {} }
  });
  const postsService = createBlogPostsService({ database });
  const productsService = createProductsService({ database });
  const storage = {
    async openPreview(_key, range) {
      return {
        stream: Readable.from(PREVIEW),
        statusCode: range ? 206 : 200,
        sizeBytes: PREVIEW.length,
        start: 0,
        end: PREVIEW.length - 1
      };
    }
  };
  const adminBlogService = createAdminBlogService({ database, storage });
  const authenticateRequest = createRequestAuthenticator({
    environment: "test",
    allowDevelopmentAdminAuth: true,
    developmentAdminToken: ADMIN_TOKEN,
    developmentAdminUserId: ADMIN_CONTEXT.userId
  });
  const server = createServer(createAdminBlogApiHandler({
    baseHandler(_request, response) {
      response.writeHead(404, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "NOT_FOUND" }));
    },
    adminBlogService,
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
  const publishable = await createSubmittedPost({
    database,
    postsService,
    productsService,
    suffix,
    title: "El oficio detrás de una pieza",
    withCover: true,
    withRelatedProduct: true
  });
  const returnable = await createSubmittedPost({
    database,
    postsService,
    productsService,
    suffix: `${suffix}-b`,
    title: "Una técnica que necesita cambios",
    withCover: true
  });
  const withoutCover = await createSubmittedPost({
    database,
    postsService,
    productsService,
    suffix: `${suffix}-c`,
    title: "Historia todavía sin portada",
    withCover: false
  });

  const unauthorized = await requestJson(baseUrl, "/api/admin/blog-posts", { bearer: null });
  assert.equal(unauthorized.response.status, 401);

  const list = await requestJson(baseUrl, "/api/admin/blog-posts?status=IN_REVIEW");
  assert.equal(list.response.status, 200);
  assert.ok(list.payload.posts.some((item) => item.id === publishable.post.id));
  assert.ok(list.payload.posts.some((item) => item.id === returnable.post.id));
  const listedPublishable = list.payload.posts.find((item) => item.id === publishable.post.id);
  assert.equal(listedPublishable.hasCover, true);
  assert.equal(listedPublishable.tagCount, 2);
  assert.equal(listedPublishable.relatedProductCount, 1);

  const detail = await requestJson(baseUrl, `/api/admin/blog-posts/${publishable.post.id}`);
  assert.equal(detail.response.status, 200);
  assert.equal(detail.payload.post.status, "IN_REVIEW");
  assert.deepEqual(detail.payload.post.tags, ["hecho-a-mano", "proceso-artesanal"]);
  assert.equal(detail.payload.post.relatedProducts[0].id, publishable.product.id);
  assert.equal(detail.payload.post.media[0].placement, "COVER");
  assert.match(detail.payload.post.media[0].previewPath, /\/preview$/);
  assert.equal(detail.payload.post.reviews[0].status, "PENDING");

  const noPreviewAuth = await fetch(
    `${baseUrl}/api/admin/blog-posts/${publishable.post.id}/media/${publishable.mediaId}/preview`
  );
  assert.equal(noPreviewAuth.status, 401);

  const preview = await fetch(
    `${baseUrl}/api/admin/blog-posts/${publishable.post.id}/media/${publishable.mediaId}/preview`,
    {
      headers: {
        Authorization: `Bearer ${ADMIN_TOKEN}`,
        Range: `bytes=0-${PREVIEW.length - 1}`
      }
    }
  );
  assert.equal(preview.status, 206);
  assert.equal(preview.headers.get("content-type"), "image/webp");
  assert.deepEqual(Buffer.from(await preview.arrayBuffer()), PREVIEW);

  const approved = await requestJson(
    baseUrl,
    `/api/admin/blog-posts/${publishable.post.id}/review`,
    {
      method: "POST",
      body: { decision: "APPROVED", reviewerNote: "Historia y portada correctas." }
    }
  );
  assert.equal(approved.response.status, 200);
  assert.equal(approved.payload.status, "APPROVED");

  const published = await requestJson(
    baseUrl,
    `/api/admin/blog-posts/${publishable.post.id}/publish`,
    { method: "POST" }
  );
  assert.equal(published.response.status, 200);
  assert.equal(published.payload.status, "PUBLISHED");
  assert.ok(published.payload.publishedAt);

  const returned = await requestJson(
    baseUrl,
    `/api/admin/blog-posts/${returnable.post.id}/review`,
    {
      method: "POST",
      body: {
        decision: "CHANGES_REQUESTED",
        reviewerNote: "Amplía el segundo apartado y explica mejor el acabado final de la pieza."
      }
    }
  );
  assert.equal(returned.response.status, 200);
  assert.equal(returned.payload.status, "CHANGES_REQUESTED");

  const approvedWithoutCover = await requestJson(
    baseUrl,
    `/api/admin/blog-posts/${withoutCover.post.id}/review`,
    { method: "POST", body: { decision: "APPROVED" } }
  );
  assert.equal(approvedWithoutCover.response.status, 200);
  assert.equal(approvedWithoutCover.payload.status, "APPROVED");

  const publishWithoutCover = await requestJson(
    baseUrl,
    `/api/admin/blog-posts/${withoutCover.post.id}/publish`,
    { method: "POST" }
  );
  assert.equal(publishWithoutCover.response.status, 422);
  assert.equal(publishWithoutCover.payload.error, "BLOG_POST_COVER_REQUIRED");

  await assert.rejects(
    database.withContext(ADMIN_CONTEXT, async (transaction) => {
      await transaction.query(
        "UPDATE blog_posts SET status = 'PUBLISHED' WHERE id = $1",
        [withoutCover.post.id]
      );
    }),
    (error) => error?.code === "23514" && String(error.message).includes("BLOG_POST_COVER_REQUIRED")
  );

  const repeatedReview = await requestJson(
    baseUrl,
    `/api/admin/blog-posts/${publishable.post.id}/review`,
    { method: "POST", body: { decision: "APPROVED" } }
  );
  assert.equal(repeatedReview.response.status, 409);
  assert.equal(repeatedReview.payload.error, "BLOG_POST_NOT_IN_REVIEW");

  const stored = await database.withContext(ADMIN_CONTEXT, async (transaction) => {
    const statuses = await transaction.query(
      "SELECT id, status FROM blog_posts WHERE id = ANY($1::uuid[])",
      [[publishable.post.id, returnable.post.id, withoutCover.post.id]]
    );
    const audits = await transaction.query(
      `SELECT action, metadata
       FROM audit_events
       WHERE entity_id = ANY($1::uuid[])
         AND action IN ('BLOG_REVIEW_APPROVED', 'BLOG_CHANGES_REQUESTED', 'BLOG_POST_PUBLISHED')`,
      [[publishable.post.id, returnable.post.id, withoutCover.post.id]]
    );
    return { statuses: statuses.rows, audits: audits.rows };
  });
  assert.equal(stored.statuses.find((item) => item.id === publishable.post.id).status, "PUBLISHED");
  assert.equal(stored.statuses.find((item) => item.id === returnable.post.id).status, "CHANGES_REQUESTED");
  assert.equal(stored.statuses.find((item) => item.id === withoutCover.post.id).status, "APPROVED");
  assert.ok(stored.audits.some((item) => item.action === "BLOG_REVIEW_APPROVED"));
  assert.ok(stored.audits.some((item) => item.action === "BLOG_CHANGES_REQUESTED"));
  assert.ok(stored.audits.some((item) => item.action === "BLOG_POST_PUBLISHED"));
  assert.equal(JSON.stringify(stored.audits).includes("storage_key"), false);
});

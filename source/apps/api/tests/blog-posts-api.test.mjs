import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { createBlogPostsApiHandler } from "../src/blog-posts-api.mjs";
import { createBlogPostsService } from "../src/blog-posts-service.mjs";
import { createDatabase } from "../src/database.mjs";
import { createProductsService } from "../src/products-service.mjs";

const connectionString = process.env.DATABASE_URL;
const TOKEN_A = "blog-provider-a-session-token-000000000000001";
const TOKEN_B = "blog-provider-b-session-token-000000000000002";
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

function providerAuthService() {
  return {
    async authenticate(token) {
      if (token === TOKEN_A) return { context: CONTEXT_A };
      if (token === TOKEN_B) return { context: CONTEXT_B };
      return null;
    }
  };
}

async function startServer(handler) {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return {
    server,
    baseUrl: `http://127.0.0.1:${server.address().port}`
  };
}

async function requestJson(baseUrl, path, { method = "GET", token, body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function createProduct(productsService, context, suffix, name) {
  return productsService.create(context, {
    name: `${name} ${suffix}`,
    shortDescription: "Artículo artesanal relacionado con una historia editorial del taller.",
    story: "Pieza elaborada manualmente en el taller para las pruebas del blog.",
    category: "Decoración artesanal",
    priceCents: 3900,
    stockMode: "MADE_TO_ORDER",
    preparationMinDays: 3,
    preparationMaxDays: 6,
    customizable: false,
    personalizationNotes: "",
    shippingNotes: "Embalaje protegido."
  });
}

test("el proveedor crea, relaciona y envía una entrada sin acceder a otro taller", {
  skip: !connectionString
}, async (t) => {
  const database = createDatabase({
    connectionString,
    maxConnections: 6,
    statementTimeoutMs: 5000,
    logger: { error() {} }
  });
  const productsService = createProductsService({ database });
  const blogPostsService = createBlogPostsService({ database });
  const suffix = randomUUID().slice(0, 8);
  const ownProduct = await createProduct(productsService, CONTEXT_A, suffix, "Caja bordada");
  const foreignProduct = await createProduct(productsService, CONTEXT_B, suffix, "Jarrón cerámico");

  const baseHandler = (_request, response) => {
    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "NOT_FOUND" }));
  };
  const app = await startServer(createBlogPostsApiHandler({
    baseHandler,
    blogPostsService,
    providerAuthService: providerAuthService(),
    logger: { error() {} }
  }));
  t.after(async () => {
    await new Promise((resolve) => app.server.close(resolve));
    await database.close();
  });

  const unauthorized = await requestJson(app.baseUrl, "/api/provider/blog-posts");
  assert.equal(unauthorized.response.status, 401);

  const created = await requestJson(app.baseUrl, "/api/provider/blog-posts", {
    method: "POST",
    token: TOKEN_A,
    body: {
      title: `Cómo nace una pieza bordada ${suffix}`,
      excerpt: "",
      bodyMarkdown: "",
      category: "Procesos artesanales"
    }
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.payload.post.status, "DRAFT");
  assert.equal(created.payload.post.providerId, CONTEXT_A.providerId);
  const postId = created.payload.post.id;

  const tooEarly = await requestJson(app.baseUrl, `/api/provider/blog-posts/${postId}/submit`, {
    method: "POST",
    token: TOKEN_A,
    body: {
      expectedVersion: created.payload.post.version,
      providerNote: "Primera entrega editorial."
    }
  });
  assert.equal(tooEarly.response.status, 422);
  assert.equal(tooEarly.payload.error, "BLOG_POST_NOT_READY_FOR_REVIEW");

  const bodyMarkdown = [
    "## La idea inicial",
    "Cada pieza comienza con una conversación sobre el momento que se quiere celebrar.",
    "Seleccionamos tejidos, colores y puntadas para que el resultado tenga identidad propia.",
    "## El trabajo manual",
    "El bordado avanza lentamente, revisando la tensión del hilo y cada pequeño acabado.",
    "Al terminar, protegemos la pieza y preparamos su envío desde el propio taller."
  ].join("\n\n");
  const updated = await requestJson(app.baseUrl, `/api/provider/blog-posts/${postId}`, {
    method: "PATCH",
    token: TOKEN_A,
    body: {
      expectedVersion: created.payload.post.version,
      title: `Cómo nace una pieza bordada ${suffix}`,
      excerpt: "Un recorrido por la elección de materiales, el bordado manual y el acabado de una pieza creada para celebrar.",
      bodyMarkdown,
      category: "Procesos artesanales"
    }
  });
  assert.equal(updated.response.status, 200);
  assert.equal(updated.payload.post.version, created.payload.post.version + 1);

  const staleUpdate = await requestJson(app.baseUrl, `/api/provider/blog-posts/${postId}`, {
    method: "PATCH",
    token: TOKEN_A,
    body: {
      expectedVersion: created.payload.post.version,
      title: "Versión antigua",
      excerpt: updated.payload.post.excerpt,
      bodyMarkdown,
      category: "Procesos artesanales"
    }
  });
  assert.equal(staleUpdate.response.status, 409);
  assert.equal(staleUpdate.payload.error, "BLOG_POST_VERSION_CONFLICT");

  const tagResult = await requestJson(app.baseUrl, `/api/provider/blog-posts/${postId}/tags`, {
    method: "PUT",
    token: TOKEN_A,
    body: { tags: ["Hecho a mano", "Bordado", "hecho-a-mano"] }
  });
  assert.equal(tagResult.response.status, 200);
  assert.deepEqual(tagResult.payload.tags, ["hecho-a-mano", "bordado"]);

  const related = await requestJson(app.baseUrl, `/api/provider/blog-posts/${postId}/products`, {
    method: "PUT",
    token: TOKEN_A,
    body: { productIds: [ownProduct.id] }
  });
  assert.equal(related.response.status, 200);
  assert.deepEqual(related.payload.productIds, [ownProduct.id]);

  const foreignRelation = await requestJson(app.baseUrl, `/api/provider/blog-posts/${postId}/products`, {
    method: "PUT",
    token: TOKEN_A,
    body: { productIds: [foreignProduct.id] }
  });
  assert.equal(foreignRelation.response.status, 422);
  assert.equal(foreignRelation.payload.error, "RELATED_PRODUCT_NOT_ALLOWED");

  const restoredRelation = await requestJson(app.baseUrl, `/api/provider/blog-posts/${postId}/products`, {
    method: "PUT",
    token: TOKEN_A,
    body: { productIds: [ownProduct.id] }
  });
  assert.equal(restoredRelation.response.status, 200);

  const hiddenFromOtherProvider = await requestJson(
    app.baseUrl,
    `/api/provider/blog-posts/${postId}`,
    { token: TOKEN_B }
  );
  assert.equal(hiddenFromOtherProvider.response.status, 404);

  const submitted = await requestJson(app.baseUrl, `/api/provider/blog-posts/${postId}/submit`, {
    method: "POST",
    token: TOKEN_A,
    body: {
      expectedVersion: updated.payload.post.version,
      providerNote: "Historia terminada y preparada para revisión editorial."
    }
  });
  assert.equal(submitted.response.status, 200);
  assert.equal(submitted.payload.post.status, "IN_REVIEW");
  assert.equal(submitted.payload.review.submissionNumber, 1);

  const locked = await requestJson(app.baseUrl, `/api/provider/blog-posts/${postId}`, {
    method: "PATCH",
    token: TOKEN_A,
    body: {
      expectedVersion: submitted.payload.post.version,
      title: "Intento de edición bloqueado",
      excerpt: updated.payload.post.excerpt,
      bodyMarkdown,
      category: "Procesos artesanales"
    }
  });
  assert.equal(locked.response.status, 409);
  assert.equal(locked.payload.error, "BLOG_POST_LOCKED");

  const listA = await requestJson(app.baseUrl, "/api/provider/blog-posts", { token: TOKEN_A });
  const listB = await requestJson(app.baseUrl, "/api/provider/blog-posts", { token: TOKEN_B });
  assert.ok(listA.payload.posts.some((item) => item.id === postId));
  assert.equal(listB.payload.posts.some((item) => item.id === postId), false);

  const detail = await requestJson(app.baseUrl, `/api/provider/blog-posts/${postId}`, { token: TOKEN_A });
  assert.equal(detail.response.status, 200);
  assert.deepEqual(detail.payload.post.tags, ["bordado", "hecho-a-mano"]);
  assert.equal(detail.payload.post.relatedProducts[0].id, ownProduct.id);
  assert.equal(detail.payload.post.reviews[0].status, "PENDING");
  assert.equal(JSON.stringify(detail.payload).includes("storage_key"), false);

  const stored = await database.withContext(ADMIN_CONTEXT, async (transaction) => {
    const audits = await transaction.query(
      `SELECT action FROM audit_events
       WHERE entity_type = 'blog_post' AND entity_id = $1
       ORDER BY created_at`,
      [postId]
    );
    return audits.rows.map((item) => item.action);
  });
  assert.ok(stored.includes("BLOG_POST_CREATED"));
  assert.ok(stored.includes("BLOG_POST_UPDATED"));
  assert.ok(stored.includes("BLOG_POST_TAGS_REPLACED"));
  assert.ok(stored.includes("BLOG_POST_PRODUCTS_REPLACED"));
  assert.ok(stored.includes("BLOG_POST_SUBMITTED"));
});

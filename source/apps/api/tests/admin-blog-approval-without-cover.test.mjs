import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createAdminBlogService } from "../src/admin-blog-service.mjs";
import { createBlogPostsService } from "../src/blog-posts-service.mjs";
import { createDatabase } from "../src/database.mjs";

const connectionString = process.env.DATABASE_URL;
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

test("Administración puede aprobar una historia sin portada, pero no publicarla", {
  skip: !connectionString
}, async (t) => {
  const database = createDatabase({
    connectionString,
    maxConnections: 3,
    statementTimeoutMs: 5000,
    logger: console
  });
  t.after(() => database.close());

  const postsService = createBlogPostsService({ database });
  const adminBlogService = createAdminBlogService({
    database,
    storage: {
      async openPreview() {
        throw new Error("No debe abrirse ninguna imagen en esta prueba.");
      }
    }
  });
  const suffix = randomUUID().slice(0, 8);
  const created = await postsService.create(PROVIDER_CONTEXT, {
    title: `Historia sin portada ${suffix}`,
    excerpt: "",
    bodyMarkdown: "",
    category: "Procesos artesanales"
  });
  const updated = await postsService.update(PROVIDER_CONTEXT, created.id, {
    expectedVersion: created.version,
    title: created.title,
    excerpt: "Una introducción suficientemente extensa para enviar esta historia a la revisión editorial.",
    bodyMarkdown: [
      "## El origen",
      "Esta historia explica cómo nace una pieza artesanal desde la elección de los materiales.",
      "## El proceso",
      "Cada fase se realiza lentamente en el taller, revisando el acabado y documentando el trabajo manual para que el resultado final conserve su identidad propia."
    ].join("\n\n"),
    category: "Procesos artesanales"
  });
  await postsService.submit(PROVIDER_CONTEXT, created.id, {
    expectedVersion: updated.version,
    providerNote: "Historia preparada para revisión, todavía sin portada."
  });

  const approved = await adminBlogService.decide(ADMIN_CONTEXT, created.id, {
    decision: "APPROVED",
    reviewerNote: "Contenido aprobado; la portada deberá añadirse antes de publicar."
  });
  assert.equal(approved.status, "APPROVED");

  await assert.rejects(
    adminBlogService.publish(ADMIN_CONTEXT, created.id),
    (error) => error?.code === "BLOG_POST_COVER_REQUIRED" && error?.statusCode === 422
  );
});

import { ServiceError } from "./providers-service.mjs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function uuid(value, field = "id") {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new ServiceError("VALIDATION_ERROR", `${field} no es válido.`, 422, { field });
  }
  return value.toLowerCase();
}

function text(value, field, { min = 0, max, nullable = false } = {}) {
  if ((value === undefined || value === null || value === "") && nullable) return null;
  const normalized = typeof value === "string" ? value.trim() : "";
  if (normalized.length < min || normalized.length > max) {
    throw new ServiceError("VALIDATION_ERROR", `${field} no es válido.`, 422, { field });
  }
  return normalized;
}

function integer(value, field, { min = 0, max } = {}) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new ServiceError("VALIDATION_ERROR", `${field} no es válido.`, 422, { field });
  }
  return value;
}

function slugify(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 140);
}

function postSlug(value, title) {
  const normalized = slugify(typeof value === "string" && value.trim() ? value : title);
  if (!SLUG_PATTERN.test(normalized)) {
    throw new ServiceError("VALIDATION_ERROR", "No se ha podido crear una URL válida.", 422, {
      field: "slug"
    });
  }
  return normalized;
}

function providerContext(context) {
  if (
    !context
    || !UUID_PATTERN.test(context.userId ?? "")
    || !UUID_PATTERN.test(context.providerId ?? "")
    || !["PROVIDER_OWNER", "PROVIDER_MEMBER"].includes(context.role)
  ) {
    throw new ServiceError("UNAUTHORIZED", "La sesión del proveedor no es válida.", 401);
  }
  return {
    userId: context.userId.toLowerCase(),
    providerId: context.providerId.toLowerCase(),
    role: context.role
  };
}

function fields(input, current = {}) {
  const title = text(input.title ?? current.title, "title", { min: 4, max: 180 });
  return {
    slug: postSlug(input.slug ?? current.slug, title),
    title,
    excerpt: text(input.excerpt ?? current.excerpt ?? "", "excerpt", { max: 420 }),
    bodyMarkdown: text(input.bodyMarkdown ?? current.body_markdown ?? "", "bodyMarkdown", {
      max: 50000
    }),
    category: text(input.category ?? current.category, "category", {
      min: 2,
      max: 80,
      nullable: true
    })
  };
}

function tags(value) {
  if (!Array.isArray(value) || value.length > 12) {
    throw new ServiceError("VALIDATION_ERROR", "Las etiquetas no son válidas.", 422, {
      field: "tags"
    });
  }
  const normalized = [...new Set(value.map((item) => slugify(item)).filter(Boolean))];
  if (normalized.some((item) => !SLUG_PATTERN.test(item) || item.length > 80)) {
    throw new ServiceError("VALIDATION_ERROR", "Hay una etiqueta no válida.", 422, {
      field: "tags"
    });
  }
  return normalized;
}

function relatedProducts(value) {
  if (!Array.isArray(value) || value.length > 8) {
    throw new ServiceError("VALIDATION_ERROR", "Los artículos relacionados no son válidos.", 422, {
      field: "productIds"
    });
  }
  return [...new Set(value.map((item) => uuid(item, "productId")))];
}

function serialize(row) {
  return {
    id: row.id,
    providerId: row.provider_id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    bodyMarkdown: row.body_markdown,
    category: row.category,
    status: row.status,
    version: row.version,
    tagCount: Number(row.tag_count ?? 0),
    relatedProductCount: Number(row.related_product_count ?? 0),
    imageCount: Number(row.image_count ?? 0),
    submittedAt: row.submitted_at,
    approvedAt: row.approved_at,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function translateDatabaseError(error) {
  if (error instanceof ServiceError) return error;
  if (error?.code === "23505") {
    return new ServiceError("BLOG_POST_CONFLICT", "Ya existe una entrada con esa URL.", 409);
  }
  if (error?.code === "42501") {
    return new ServiceError(
      "BLOG_POST_LOCKED",
      "La entrada no se puede modificar en su estado actual.",
      409
    );
  }
  if (error?.code === "23514") {
    if (String(error.message).includes("BLOG_POST_NOT_READY_FOR_REVIEW")) {
      return new ServiceError(
        "BLOG_POST_NOT_READY_FOR_REVIEW",
        "La introducción necesita 40 caracteres y el contenido al menos 200 antes de enviarlo.",
        422
      );
    }
    return new ServiceError("VALIDATION_ERROR", "La entrada no cumple las reglas editoriales.", 422);
  }
  if (error?.code === "23503") {
    return new ServiceError(
      "RELATED_PRODUCT_NOT_ALLOWED",
      "Uno de los artículos relacionados no pertenece a este taller.",
      422
    );
  }
  return error;
}

async function audit(transaction, context, action, postId, metadata = {}) {
  await transaction.query(
    `INSERT INTO audit_events
      (actor_user_id, provider_id, action, entity_type, entity_id, metadata)
     VALUES ($1, $2, $3, 'blog_post', $4, $5::jsonb)`,
    [context.userId, context.providerId, action, postId, JSON.stringify(metadata)]
  );
}

async function loadPost(transaction, postId, { lock = false } = {}) {
  const result = await transaction.query(
    `SELECT * FROM blog_posts WHERE id = $1 ${lock ? "FOR UPDATE" : ""}`,
    [postId]
  );
  return result.rows[0] ?? null;
}

function notFound() {
  return new ServiceError("BLOG_POST_NOT_FOUND", "No se ha encontrado la entrada.", 404);
}

function editable(post) {
  if (!post || !["DRAFT", "CHANGES_REQUESTED"].includes(post.status)) {
    throw new ServiceError(
      "BLOG_POST_LOCKED",
      "La entrada está bloqueada mientras se revisa o publica.",
      409
    );
  }
}

export function createBlogPostsService({ database } = {}) {
  if (!database || typeof database.withContext !== "function") {
    throw new TypeError("createBlogPostsService necesita una base de datos.");
  }

  return Object.freeze({
    async list(rawContext) {
      const context = providerContext(rawContext);
      try {
        return await database.withContext(context, async (transaction) => {
          const result = await transaction.query(
            `SELECT post.*,
                    COUNT(DISTINCT tag.tag_slug)::int AS tag_count,
                    COUNT(DISTINCT relation.product_id)::int AS related_product_count,
                    COUNT(DISTINCT media.id) FILTER (WHERE media.status <> 'DELETED')::int AS image_count
             FROM blog_posts post
             LEFT JOIN blog_post_tags tag ON tag.post_id = post.id
             LEFT JOIN blog_post_products relation ON relation.post_id = post.id
             LEFT JOIN blog_post_media media ON media.post_id = post.id
             GROUP BY post.id
             ORDER BY post.updated_at DESC, post.created_at DESC`
          );
          return result.rows.map(serialize);
        });
      } catch (error) {
        throw translateDatabaseError(error);
      }
    },

    async get(rawContext, rawPostId) {
      const context = providerContext(rawContext);
      const postId = uuid(rawPostId, "postId");
      try {
        return await database.withContext(context, async (transaction) => {
          const postResult = await transaction.query(
            `SELECT post.*,
                    COUNT(DISTINCT tag.tag_slug)::int AS tag_count,
                    COUNT(DISTINCT relation.product_id)::int AS related_product_count,
                    COUNT(DISTINCT media.id) FILTER (WHERE media.status <> 'DELETED')::int AS image_count
             FROM blog_posts post
             LEFT JOIN blog_post_tags tag ON tag.post_id = post.id
             LEFT JOIN blog_post_products relation ON relation.post_id = post.id
             LEFT JOIN blog_post_media media ON media.post_id = post.id
             WHERE post.id = $1
             GROUP BY post.id`,
            [postId]
          );
          if (postResult.rowCount !== 1) throw notFound();

          const [tagResult, productResult, mediaResult, reviewResult] = await Promise.all([
            transaction.query(
              "SELECT tag_slug FROM blog_post_tags WHERE post_id = $1 ORDER BY tag_slug",
              [postId]
            ),
            transaction.query(
              `SELECT product.id, product.name, product.slug, product.status, relation.sort_order
               FROM blog_post_products relation
               INNER JOIN products product ON product.id = relation.product_id
               WHERE relation.post_id = $1
               ORDER BY relation.sort_order, product.name`,
              [postId]
            ),
            transaction.query(
              `SELECT id, placement, mime_type, original_filename, size_bytes, status,
                      sort_order, alt_text, width, height, rejection_reason, created_at
               FROM blog_post_media
               WHERE post_id = $1 AND status <> 'DELETED'
               ORDER BY placement, sort_order, created_at`,
              [postId]
            ),
            transaction.query(
              `SELECT id, submission_number, status, provider_note, reviewer_note,
                      submitted_at, reviewed_at
               FROM blog_post_reviews
               WHERE post_id = $1
               ORDER BY submission_number DESC`,
              [postId]
            )
          ]);

          return {
            ...serialize(postResult.rows[0]),
            tags: tagResult.rows.map((row) => row.tag_slug),
            relatedProducts: productResult.rows.map((row) => ({
              id: row.id,
              name: row.name,
              slug: row.slug,
              status: row.status,
              sortOrder: row.sort_order
            })),
            media: mediaResult.rows.map((row) => ({
              id: row.id,
              placement: row.placement,
              mimeType: row.mime_type,
              originalFilename: row.original_filename,
              sizeBytes: Number(row.size_bytes),
              status: row.status,
              sortOrder: row.sort_order,
              altText: row.alt_text,
              width: row.width,
              height: row.height,
              rejectionReason: row.rejection_reason,
              createdAt: row.created_at
            })),
            reviews: reviewResult.rows.map((row) => ({
              id: row.id,
              submissionNumber: row.submission_number,
              status: row.status,
              providerNote: row.provider_note,
              reviewerNote: row.reviewer_note,
              submittedAt: row.submitted_at,
              reviewedAt: row.reviewed_at
            }))
          };
        });
      } catch (error) {
        throw translateDatabaseError(error);
      }
    },

    async create(rawContext, input = {}) {
      const context = providerContext(rawContext);
      const values = fields(input);
      try {
        return await database.withContext(context, async (transaction) => {
          const result = await transaction.query(
            `INSERT INTO blog_posts (
               provider_id, slug, title, excerpt, body_markdown, category,
               created_by, updated_by
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
             RETURNING *`,
            [
              context.providerId,
              values.slug,
              values.title,
              values.excerpt,
              values.bodyMarkdown,
              values.category,
              context.userId
            ]
          );
          await audit(transaction, context, "BLOG_POST_CREATED", result.rows[0].id);
          return serialize(result.rows[0]);
        });
      } catch (error) {
        throw translateDatabaseError(error);
      }
    },

    async update(rawContext, rawPostId, input = {}) {
      const context = providerContext(rawContext);
      const postId = uuid(rawPostId, "postId");
      const expectedVersion = integer(input.expectedVersion, "expectedVersion", { min: 1, max: 1000000 });
      try {
        return await database.withContext(context, async (transaction) => {
          const current = await loadPost(transaction, postId, { lock: true });
          if (!current) throw notFound();
          editable(current);
          if (current.version !== expectedVersion) {
            throw new ServiceError(
              "BLOG_POST_VERSION_CONFLICT",
              "La entrada ha cambiado. Recarga antes de guardar de nuevo.",
              409,
              { currentVersion: current.version }
            );
          }
          const values = fields(input, current);
          const result = await transaction.query(
            `UPDATE blog_posts
             SET slug = $2, title = $3, excerpt = $4, body_markdown = $5,
                 category = $6, status = CASE WHEN status = 'CHANGES_REQUESTED' THEN 'DRAFT' ELSE status END
             WHERE id = $1
             RETURNING *`,
            [
              postId,
              values.slug,
              values.title,
              values.excerpt,
              values.bodyMarkdown,
              values.category
            ]
          );
          await audit(transaction, context, "BLOG_POST_UPDATED", postId, {
            previousVersion: current.version,
            nextVersion: result.rows[0].version
          });
          return serialize(result.rows[0]);
        });
      } catch (error) {
        throw translateDatabaseError(error);
      }
    },

    async replaceTags(rawContext, rawPostId, input = {}) {
      const context = providerContext(rawContext);
      const postId = uuid(rawPostId, "postId");
      const selectedTags = tags(input.tags);
      try {
        return await database.withContext(context, async (transaction) => {
          const post = await loadPost(transaction, postId, { lock: true });
          if (!post) throw notFound();
          editable(post);
          await transaction.query("DELETE FROM blog_post_tags WHERE post_id = $1", [postId]);
          for (const tag of selectedTags) {
            await transaction.query(
              `INSERT INTO blog_post_tags (provider_id, post_id, tag_slug)
               VALUES ($1, $2, $3)`,
              [context.providerId, postId, tag]
            );
          }
          await audit(transaction, context, "BLOG_POST_TAGS_REPLACED", postId, {
            count: selectedTags.length
          });
          return selectedTags;
        });
      } catch (error) {
        throw translateDatabaseError(error);
      }
    },

    async replaceProducts(rawContext, rawPostId, input = {}) {
      const context = providerContext(rawContext);
      const postId = uuid(rawPostId, "postId");
      const productIds = relatedProducts(input.productIds);
      try {
        return await database.withContext(context, async (transaction) => {
          const post = await loadPost(transaction, postId, { lock: true });
          if (!post) throw notFound();
          editable(post);

          if (productIds.length > 0) {
            const products = await transaction.query(
              `SELECT id FROM products
               WHERE id = ANY($1::uuid[])
                 AND provider_id = $2
                 AND status <> 'ARCHIVED'`,
              [productIds, context.providerId]
            );
            if (products.rowCount !== productIds.length) {
              throw new ServiceError(
                "RELATED_PRODUCT_NOT_ALLOWED",
                "Solo puedes relacionar artículos de este taller que no estén archivados.",
                422
              );
            }
          }

          await transaction.query("DELETE FROM blog_post_products WHERE post_id = $1", [postId]);
          for (const [sortOrder, productId] of productIds.entries()) {
            await transaction.query(
              `INSERT INTO blog_post_products
                (provider_id, post_id, product_id, sort_order)
               VALUES ($1, $2, $3, $4)`,
              [context.providerId, postId, productId, sortOrder]
            );
          }
          await audit(transaction, context, "BLOG_POST_PRODUCTS_REPLACED", postId, {
            count: productIds.length
          });
          return productIds;
        });
      } catch (error) {
        throw translateDatabaseError(error);
      }
    },

    async submit(rawContext, rawPostId, input = {}) {
      const context = providerContext(rawContext);
      const postId = uuid(rawPostId, "postId");
      const expectedVersion = integer(input.expectedVersion, "expectedVersion", { min: 1, max: 1000000 });
      const providerNote = text(input.providerNote ?? "", "providerNote", { max: 4000 });
      try {
        return await database.withContext(context, async (transaction) => {
          const current = await loadPost(transaction, postId, { lock: true });
          if (!current) throw notFound();
          editable(current);
          if (current.version !== expectedVersion) {
            throw new ServiceError(
              "BLOG_POST_VERSION_CONFLICT",
              "La entrada ha cambiado. Recarga antes de enviarla.",
              409,
              { currentVersion: current.version }
            );
          }

          const pending = await transaction.query(
            "SELECT 1 FROM blog_post_reviews WHERE post_id = $1 AND status = 'PENDING'",
            [postId]
          );
          if (pending.rowCount > 0) {
            throw new ServiceError("BLOG_REVIEW_ALREADY_PENDING", "Ya existe una revisión pendiente.", 409);
          }

          const updated = await transaction.query(
            `UPDATE blog_posts SET status = 'IN_REVIEW' WHERE id = $1 RETURNING *`,
            [postId]
          );
          const nextNumber = await transaction.query(
            `SELECT COALESCE(MAX(submission_number), 0) + 1 AS value
             FROM blog_post_reviews WHERE post_id = $1`,
            [postId]
          );
          const review = await transaction.query(
            `INSERT INTO blog_post_reviews (
               provider_id, post_id, submission_number, provider_note, submitted_by
             ) VALUES ($1, $2, $3, $4, $5)
             RETURNING id, submission_number, status, provider_note, submitted_at`,
            [
              context.providerId,
              postId,
              nextNumber.rows[0].value,
              providerNote,
              context.userId
            ]
          );
          await audit(transaction, context, "BLOG_POST_SUBMITTED", postId, {
            submissionNumber: review.rows[0].submission_number
          });
          return {
            post: serialize(updated.rows[0]),
            review: {
              id: review.rows[0].id,
              submissionNumber: review.rows[0].submission_number,
              status: review.rows[0].status,
              providerNote: review.rows[0].provider_note,
              submittedAt: review.rows[0].submitted_at
            }
          };
        });
      } catch (error) {
        throw translateDatabaseError(error);
      }
    }
  });
}

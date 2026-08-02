import { ServiceError } from "./providers-service.mjs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REVIEW_DECISIONS = new Set(["APPROVED", "CHANGES_REQUESTED"]);
const LIST_STATUSES = new Set([
  "DRAFT", "IN_REVIEW", "CHANGES_REQUESTED", "APPROVED", "PUBLISHED", "ARCHIVED"
]);

function uuid(value, field = "id") {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new ServiceError("VALIDATION_ERROR", `${field} no es válido.`, 422, { field });
  }
  return value.toLowerCase();
}

function adminContext(context) {
  if (!context || context.role !== "ADMIN" || !UUID_PATTERN.test(context.userId ?? "")) {
    throw new ServiceError("UNAUTHORIZED", "Necesitas una sesión administrativa.", 401);
  }
  return { role: "ADMIN", userId: context.userId.toLowerCase(), providerId: null };
}

function reviewNote(value, required) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if ((required && normalized.length < 10) || normalized.length > 4000) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      required
        ? "Explica los cambios solicitados con al menos 10 caracteres."
        : "La nota de revisión no es válida.",
      422,
      { field: "reviewerNote" }
    );
  }
  return normalized;
}

function summary(row) {
  return {
    id: row.id,
    provider: {
      id: row.provider_id,
      displayName: row.provider_display_name,
      slug: row.provider_slug
    },
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    category: row.category,
    status: row.status,
    version: row.version,
    imageCount: Number(row.image_count),
    tagCount: Number(row.tag_count),
    relatedProductCount: Number(row.related_product_count),
    hasCover: row.has_cover,
    submittedAt: row.submitted_at,
    approvedAt: row.approved_at,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
    latestReviewStatus: row.latest_review_status,
    latestSubmissionNumber: row.latest_submission_number
  };
}

function post(row) {
  return {
    id: row.id,
    provider: {
      id: row.provider_id,
      displayName: row.provider_display_name,
      slug: row.provider_slug,
      contactName: row.provider_contact_name,
      contactEmail: row.provider_contact_email
    },
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    bodyMarkdown: row.body_markdown,
    category: row.category,
    status: row.status,
    version: row.version,
    submittedAt: row.submitted_at,
    approvedAt: row.approved_at,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function audit(transaction, context, blogPost, action, metadata = {}) {
  await transaction.query(
    `INSERT INTO audit_events
      (actor_user_id, provider_id, action, entity_type, entity_id, metadata)
     VALUES ($1, $2, $3, 'blog_post', $4, $5::jsonb)`,
    [context.userId, blogPost.provider_id, action, blogPost.id, JSON.stringify(metadata)]
  );
}

function notFound() {
  return new ServiceError("BLOG_POST_NOT_FOUND", "No se ha encontrado la publicación.", 404);
}

export function createAdminBlogService({ database, storage } = {}) {
  if (!database || typeof database.withContext !== "function") {
    throw new TypeError("createAdminBlogService necesita una base de datos.");
  }
  if (!storage || typeof storage.openPreview !== "function") {
    throw new TypeError("createAdminBlogService necesita almacenamiento multimedia.");
  }

  return Object.freeze({
    async list(rawContext, { status, query } = {}) {
      const context = adminContext(rawContext);
      const selectedStatus = status && status !== "ALL" ? String(status).toUpperCase() : null;
      if (selectedStatus && !LIST_STATUSES.has(selectedStatus)) {
        throw new ServiceError("VALIDATION_ERROR", "El estado solicitado no es válido.", 422);
      }
      const search = typeof query === "string" ? query.trim().slice(0, 160) : "";
      return database.withContext(context, async (transaction) => {
        const result = await transaction.query(
          `SELECT
             bp.id, bp.provider_id, bp.slug, bp.title, bp.excerpt, bp.category,
             bp.status, bp.version, bp.submitted_at, bp.approved_at,
             bp.published_at, bp.updated_at,
             pr.display_name AS provider_display_name, pr.slug AS provider_slug,
             (SELECT COUNT(*) FROM blog_post_media bm
               WHERE bm.post_id = bp.id AND bm.status = 'READY')::int AS image_count,
             (SELECT COUNT(*) FROM blog_post_tags bt
               WHERE bt.post_id = bp.id)::int AS tag_count,
             (SELECT COUNT(*) FROM blog_post_products bpp
               WHERE bpp.post_id = bp.id)::int AS related_product_count,
             EXISTS (
               SELECT 1 FROM blog_post_media cover
               WHERE cover.post_id = bp.id
                 AND cover.placement = 'COVER'
                 AND cover.status = 'READY'
             ) AS has_cover,
             latest.status AS latest_review_status,
             latest.submission_number AS latest_submission_number
           FROM blog_posts bp
           INNER JOIN providers pr ON pr.id = bp.provider_id
           LEFT JOIN LATERAL (
             SELECT status, submission_number
             FROM blog_post_reviews
             WHERE post_id = bp.id
             ORDER BY submission_number DESC
             LIMIT 1
           ) latest ON true
           WHERE ($1::text IS NULL OR bp.status = $1)
             AND (
               $2::text = ''
               OR bp.title ILIKE '%' || $2 || '%'
               OR bp.excerpt ILIKE '%' || $2 || '%'
               OR COALESCE(bp.category, '') ILIKE '%' || $2 || '%'
               OR pr.display_name ILIKE '%' || $2 || '%'
             )
           ORDER BY
             CASE bp.status WHEN 'IN_REVIEW' THEN 0 WHEN 'CHANGES_REQUESTED' THEN 1 ELSE 2 END,
             bp.submitted_at DESC NULLS LAST,
             bp.updated_at DESC
           LIMIT 250`,
          [selectedStatus, search]
        );
        return result.rows.map(summary);
      });
    },

    async get(rawContext, rawPostId) {
      const context = adminContext(rawContext);
      const postId = uuid(rawPostId, "postId");
      return database.withContext(context, async (transaction) => {
        const result = await transaction.query(
          `SELECT bp.*,
                  pr.display_name AS provider_display_name,
                  pr.slug AS provider_slug,
                  pr.contact_name AS provider_contact_name,
                  pr.contact_email AS provider_contact_email
           FROM blog_posts bp
           INNER JOIN providers pr ON pr.id = bp.provider_id
           WHERE bp.id = $1`,
          [postId]
        );
        if (result.rowCount !== 1) throw notFound();

        const [tags, related, media, reviews] = await Promise.all([
          transaction.query(
            "SELECT tag_slug FROM blog_post_tags WHERE post_id = $1 ORDER BY tag_slug",
            [postId]
          ),
          transaction.query(
            `SELECT p.id, p.slug, p.name, p.category, p.price_cents, p.currency, p.status
             FROM blog_post_products bpp
             INNER JOIN products p ON p.id = bpp.product_id
             WHERE bpp.post_id = $1
             ORDER BY bpp.sort_order, p.name`,
            [postId]
          ),
          transaction.query(
            `SELECT id, placement, mime_type, original_filename, size_bytes, status,
                    sort_order, alt_text, width, height,
                    preview_storage_key, preview_mime_type, preview_size_bytes,
                    preview_width, preview_height, ready_at, created_at
             FROM blog_post_media
             WHERE post_id = $1 AND status <> 'DELETED'
             ORDER BY CASE placement WHEN 'COVER' THEN 0 ELSE 1 END, sort_order, created_at`,
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
          ...post(result.rows[0]),
          tags: tags.rows.map((item) => item.tag_slug),
          relatedProducts: related.rows.map((item) => ({
            id: item.id,
            slug: item.slug,
            name: item.name,
            category: item.category,
            priceCents: item.price_cents,
            currency: item.currency,
            status: item.status
          })),
          media: media.rows.map((item) => ({
            id: item.id,
            placement: item.placement,
            mimeType: item.mime_type,
            originalFilename: item.original_filename,
            sizeBytes: Number(item.size_bytes),
            status: item.status,
            sortOrder: item.sort_order,
            altText: item.alt_text,
            width: item.width,
            height: item.height,
            previewPath: item.preview_storage_key
              ? `/api/admin/blog-posts/${postId}/media/${item.id}/preview`
              : null,
            preview: item.preview_storage_key ? {
              mimeType: item.preview_mime_type,
              sizeBytes: Number(item.preview_size_bytes),
              width: item.preview_width,
              height: item.preview_height
            } : null,
            readyAt: item.ready_at,
            createdAt: item.created_at
          })),
          reviews: reviews.rows.map((item) => ({
            id: item.id,
            submissionNumber: item.submission_number,
            status: item.status,
            providerNote: item.provider_note,
            reviewerNote: item.reviewer_note,
            submittedAt: item.submitted_at,
            reviewedAt: item.reviewed_at
          }))
        };
      });
    },

    async decide(rawContext, rawPostId, input = {}) {
      const context = adminContext(rawContext);
      const postId = uuid(rawPostId, "postId");
      const decision = String(input.decision ?? "").toUpperCase();
      if (!REVIEW_DECISIONS.has(decision)) {
        throw new ServiceError("VALIDATION_ERROR", "La decisión de revisión no es válida.", 422);
      }
      const note = reviewNote(input.reviewerNote, decision === "CHANGES_REQUESTED");

      return database.withContext(context, async (transaction) => {
        const postResult = await transaction.query(
          `SELECT id, provider_id, status, version
           FROM blog_posts
           WHERE id = $1
           FOR UPDATE`,
          [postId]
        );
        if (postResult.rowCount !== 1) throw notFound();
        const blogPost = postResult.rows[0];
        if (blogPost.status !== "IN_REVIEW") {
          throw new ServiceError(
            "BLOG_POST_NOT_IN_REVIEW",
            "La publicación ya no está pendiente de revisión.",
            409
          );
        }

        const reviewResult = await transaction.query(
          `SELECT id, submission_number
           FROM blog_post_reviews
           WHERE post_id = $1 AND status = 'PENDING'
           ORDER BY submission_number DESC
           LIMIT 1
           FOR UPDATE`,
          [postId]
        );
        if (reviewResult.rowCount !== 1) {
          throw new ServiceError("BLOG_REVIEW_NOT_FOUND", "No hay una revisión pendiente.", 409);
        }
        const review = reviewResult.rows[0];

        await transaction.query(
          `UPDATE blog_post_reviews
           SET status = $2, reviewer_note = NULLIF($3, '')
           WHERE id = $1`,
          [review.id, decision, note]
        );
        const nextStatus = decision === "APPROVED" ? "APPROVED" : "CHANGES_REQUESTED";
        const updated = await transaction.query(
          `UPDATE blog_posts
           SET status = $2
           WHERE id = $1
           RETURNING status, version, approved_at, updated_at`,
          [postId, nextStatus]
        );
        await audit(
          transaction,
          context,
          blogPost,
          decision === "APPROVED" ? "BLOG_REVIEW_APPROVED" : "BLOG_CHANGES_REQUESTED",
          { submissionNumber: review.submission_number, reviewerNote: note || null }
        );
        return {
          postId,
          status: updated.rows[0].status,
          version: updated.rows[0].version,
          approvedAt: updated.rows[0].approved_at,
          updatedAt: updated.rows[0].updated_at,
          review: {
            id: review.id,
            submissionNumber: review.submission_number,
            status: decision,
            reviewerNote: note || null
          }
        };
      });
    },

    async publish(rawContext, rawPostId) {
      const context = adminContext(rawContext);
      const postId = uuid(rawPostId, "postId");
      return database.withContext(context, async (transaction) => {
        const postResult = await transaction.query(
          `SELECT id, provider_id, status
           FROM blog_posts
           WHERE id = $1
           FOR UPDATE`,
          [postId]
        );
        if (postResult.rowCount !== 1) throw notFound();
        const blogPost = postResult.rows[0];
        if (blogPost.status !== "APPROVED") {
          throw new ServiceError(
            "BLOG_POST_NOT_APPROVED",
            "La publicación debe estar aprobada antes de publicarse.",
            409
          );
        }
        const cover = await transaction.query(
          `SELECT 1
           FROM blog_post_media
           WHERE post_id = $1
             AND placement = 'COVER'
             AND status = 'READY'
             AND preview_mime_type = 'image/webp'
           LIMIT 1`,
          [postId]
        );
        if (cover.rowCount !== 1) {
          throw new ServiceError(
            "BLOG_POST_COVER_REQUIRED",
            "Añade una portada lista antes de publicar la historia.",
            422
          );
        }
        const result = await transaction.query(
          `UPDATE blog_posts
           SET status = 'PUBLISHED'
           WHERE id = $1
           RETURNING status, version, published_at, updated_at`,
          [postId]
        );
        await audit(transaction, context, blogPost, "BLOG_POST_PUBLISHED");
        return {
          postId,
          status: result.rows[0].status,
          version: result.rows[0].version,
          publishedAt: result.rows[0].published_at,
          updatedAt: result.rows[0].updated_at
        };
      });
    },

    async openPreview(rawContext, rawPostId, rawMediaId, rangeHeader) {
      const context = adminContext(rawContext);
      const postId = uuid(rawPostId, "postId");
      const mediaId = uuid(rawMediaId, "mediaId");
      const row = await database.withContext(context, async (transaction) => {
        const result = await transaction.query(
          `SELECT bm.preview_storage_key, bm.preview_mime_type, bm.original_filename
           FROM blog_post_media bm
           INNER JOIN blog_posts bp ON bp.id = bm.post_id
           WHERE bm.id = $1 AND bm.post_id = $2
             AND bm.status = 'READY'
             AND bm.preview_storage_key IS NOT NULL`,
          [mediaId, postId]
        );
        return result.rows[0] ?? null;
      });
      if (!row) {
        throw new ServiceError(
          "BLOG_MEDIA_PREVIEW_NOT_FOUND",
          "La previsualización no está disponible.",
          404
        );
      }
      const opened = await storage.openPreview(row.preview_storage_key, rangeHeader);
      return {
        ...opened,
        mimeType: row.preview_mime_type,
        originalFilename: `${row.original_filename.replace(/\.[^.]+$/, "")}-preview.webp`
      };
    }
  });
}

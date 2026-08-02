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

function serializeSummary(row) {
  return {
    id: row.id,
    provider: {
      id: row.provider_id,
      displayName: row.provider_display_name,
      slug: row.provider_slug
    },
    name: row.name,
    category: row.category,
    priceCents: row.price_cents,
    currency: row.currency,
    status: row.status,
    version: row.version,
    imageCount: Number(row.image_count),
    videoCount: Number(row.video_count),
    submittedAt: row.submitted_at,
    approvedAt: row.approved_at,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
    latestReviewStatus: row.latest_review_status,
    latestSubmissionNumber: row.latest_submission_number
  };
}

function serializeProduct(row) {
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
    name: row.name,
    shortDescription: row.short_description,
    story: row.story,
    category: row.category,
    priceCents: row.price_cents,
    currency: row.currency,
    stockMode: row.stock_mode,
    stockQuantity: row.stock_quantity,
    preparationMinDays: row.preparation_min_days,
    preparationMaxDays: row.preparation_max_days,
    customizable: row.customizable,
    personalizationNotes: row.personalization_notes,
    shippingNotes: row.shipping_notes,
    status: row.status,
    version: row.version,
    submittedAt: row.submitted_at,
    approvedAt: row.approved_at,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function writeAudit(transaction, context, product, action, metadata = {}) {
  await transaction.query(
    `INSERT INTO audit_events
      (actor_user_id, provider_id, action, entity_type, entity_id, metadata)
     VALUES ($1, $2, $3, 'product', $4, $5::jsonb)`,
    [context.userId, product.provider_id, action, product.id, JSON.stringify(metadata)]
  );
}

function productNotFound() {
  return new ServiceError("PRODUCT_NOT_FOUND", "No se ha encontrado el artículo.", 404);
}

export function createAdminProductsService({ database, storage } = {}) {
  if (!database || typeof database.withContext !== "function") {
    throw new TypeError("createAdminProductsService necesita una base de datos.");
  }
  if (!storage || typeof storage.openPreview !== "function") {
    throw new TypeError("createAdminProductsService necesita almacenamiento multimedia.");
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
             p.id, p.provider_id, p.name, p.category, p.price_cents, p.currency,
             p.status, p.version, p.submitted_at, p.approved_at, p.published_at,
             p.updated_at,
             pr.display_name AS provider_display_name, pr.slug AS provider_slug,
             COUNT(pm.id) FILTER (WHERE pm.kind = 'IMAGE' AND pm.status = 'READY')::int AS image_count,
             COUNT(pm.id) FILTER (WHERE pm.kind = 'VIDEO' AND pm.status = 'READY')::int AS video_count,
             latest.status AS latest_review_status,
             latest.submission_number AS latest_submission_number
           FROM products p
           INNER JOIN providers pr ON pr.id = p.provider_id
           LEFT JOIN product_media pm ON pm.product_id = p.id
           LEFT JOIN LATERAL (
             SELECT status, submission_number
             FROM product_reviews
             WHERE product_id = p.id
             ORDER BY submission_number DESC
             LIMIT 1
           ) latest ON true
           WHERE ($1::text IS NULL OR p.status = $1)
             AND (
               $2::text = ''
               OR p.name ILIKE '%' || $2 || '%'
               OR COALESCE(p.category, '') ILIKE '%' || $2 || '%'
               OR pr.display_name ILIKE '%' || $2 || '%'
             )
           GROUP BY p.id, pr.id, latest.status, latest.submission_number
           ORDER BY
             CASE p.status WHEN 'IN_REVIEW' THEN 0 WHEN 'CHANGES_REQUESTED' THEN 1 ELSE 2 END,
             p.submitted_at DESC NULLS LAST,
             p.updated_at DESC
           LIMIT 250`,
          [selectedStatus, search]
        );
        return result.rows.map(serializeSummary);
      });
    },

    async get(rawContext, rawProductId) {
      const context = adminContext(rawContext);
      const productId = uuid(rawProductId, "productId");
      return database.withContext(context, async (transaction) => {
        const result = await transaction.query(
          `SELECT p.*,
                  pr.display_name AS provider_display_name,
                  pr.slug AS provider_slug,
                  pr.contact_name AS provider_contact_name,
                  pr.contact_email AS provider_contact_email
           FROM products p
           INNER JOIN providers pr ON pr.id = p.provider_id
           WHERE p.id = $1`,
          [productId]
        );
        if (result.rowCount !== 1) throw productNotFound();
        const [events, options, media, reviews] = await Promise.all([
          transaction.query(
            "SELECT event_slug FROM product_events WHERE product_id = $1 ORDER BY event_slug",
            [productId]
          ),
          transaction.query(
            `SELECT id, name, option_type, required, choices, price_delta_cents, sort_order
             FROM product_personalization_options
             WHERE product_id = $1
             ORDER BY sort_order, created_at`,
            [productId]
          ),
          transaction.query(
            `SELECT id, kind, mime_type, original_filename, size_bytes, status,
                    sort_order, alt_text, width, height, duration_seconds,
                    preview_storage_key, preview_mime_type, preview_size_bytes,
                    preview_width, preview_height, ready_at, created_at
             FROM product_media
             WHERE product_id = $1 AND status <> 'DELETED'
             ORDER BY kind, sort_order, created_at`,
            [productId]
          ),
          transaction.query(
            `SELECT id, submission_number, status, provider_note, reviewer_note,
                    submitted_at, reviewed_at
             FROM product_reviews
             WHERE product_id = $1
             ORDER BY submission_number DESC`,
            [productId]
          )
        ]);
        return {
          ...serializeProduct(result.rows[0]),
          events: events.rows.map((item) => item.event_slug),
          personalizations: options.rows.map((item) => ({
            id: item.id,
            name: item.name,
            optionType: item.option_type,
            required: item.required,
            choices: item.choices,
            priceDeltaCents: item.price_delta_cents,
            sortOrder: item.sort_order
          })),
          media: media.rows.map((item) => ({
            id: item.id,
            kind: item.kind,
            mimeType: item.mime_type,
            originalFilename: item.original_filename,
            sizeBytes: Number(item.size_bytes),
            status: item.status,
            sortOrder: item.sort_order,
            altText: item.alt_text,
            width: item.width,
            height: item.height,
            durationSeconds: item.duration_seconds === null ? null : Number(item.duration_seconds),
            previewPath: item.preview_storage_key
              ? `/api/admin/products/${productId}/media/${item.id}/preview`
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

    async decide(rawContext, rawProductId, input = {}) {
      const context = adminContext(rawContext);
      const productId = uuid(rawProductId, "productId");
      const decision = String(input.decision ?? "").toUpperCase();
      if (!REVIEW_DECISIONS.has(decision)) {
        throw new ServiceError("VALIDATION_ERROR", "La decisión de revisión no es válida.", 422);
      }
      const note = reviewNote(input.reviewerNote, decision === "CHANGES_REQUESTED");

      return database.withContext(context, async (transaction) => {
        const productResult = await transaction.query(
          `SELECT id, provider_id, status, version
           FROM products
           WHERE id = $1
           FOR UPDATE`,
          [productId]
        );
        if (productResult.rowCount !== 1) throw productNotFound();
        const product = productResult.rows[0];
        if (product.status !== "IN_REVIEW") {
          throw new ServiceError(
            "PRODUCT_NOT_IN_REVIEW",
            "El artículo ya no está pendiente de revisión.",
            409
          );
        }

        const reviewResult = await transaction.query(
          `SELECT id, submission_number
           FROM product_reviews
           WHERE product_id = $1 AND status = 'PENDING'
           ORDER BY submission_number DESC
           LIMIT 1
           FOR UPDATE`,
          [productId]
        );
        if (reviewResult.rowCount !== 1) {
          throw new ServiceError("REVIEW_NOT_FOUND", "No hay una revisión pendiente.", 409);
        }
        const review = reviewResult.rows[0];

        await transaction.query(
          `UPDATE product_reviews
           SET status = $2, reviewer_note = NULLIF($3, '')
           WHERE id = $1`,
          [review.id, decision, note]
        );
        const nextStatus = decision === "APPROVED" ? "APPROVED" : "CHANGES_REQUESTED";
        const updated = await transaction.query(
          `UPDATE products
           SET status = $2
           WHERE id = $1
           RETURNING status, version, approved_at, updated_at`,
          [productId, nextStatus]
        );
        await writeAudit(
          transaction,
          context,
          product,
          decision === "APPROVED" ? "PRODUCT_REVIEW_APPROVED" : "PRODUCT_CHANGES_REQUESTED",
          { submissionNumber: review.submission_number, reviewerNote: note || null }
        );
        return {
          productId,
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

    async publish(rawContext, rawProductId) {
      const context = adminContext(rawContext);
      const productId = uuid(rawProductId, "productId");
      return database.withContext(context, async (transaction) => {
        const productResult = await transaction.query(
          `SELECT id, provider_id, status
           FROM products
           WHERE id = $1
           FOR UPDATE`,
          [productId]
        );
        if (productResult.rowCount !== 1) throw productNotFound();
        const product = productResult.rows[0];
        if (product.status !== "APPROVED") {
          throw new ServiceError(
            "PRODUCT_NOT_APPROVED",
            "El artículo debe estar aprobado antes de publicarse.",
            409
          );
        }
        const result = await transaction.query(
          `UPDATE products
           SET status = 'PUBLISHED'
           WHERE id = $1
           RETURNING status, version, published_at, updated_at`,
          [productId]
        );
        await writeAudit(transaction, context, product, "PRODUCT_PUBLISHED");
        return {
          productId,
          status: result.rows[0].status,
          version: result.rows[0].version,
          publishedAt: result.rows[0].published_at,
          updatedAt: result.rows[0].updated_at
        };
      });
    },

    async openPreview(rawContext, rawProductId, rawMediaId, rangeHeader) {
      const context = adminContext(rawContext);
      const productId = uuid(rawProductId, "productId");
      const mediaId = uuid(rawMediaId, "mediaId");
      const row = await database.withContext(context, async (transaction) => {
        const result = await transaction.query(
          `SELECT pm.preview_storage_key, pm.preview_mime_type, pm.original_filename
           FROM product_media pm
           INNER JOIN products p ON p.id = pm.product_id
           WHERE pm.id = $1 AND pm.product_id = $2
             AND pm.status = 'READY'
             AND pm.preview_storage_key IS NOT NULL`,
          [mediaId, productId]
        );
        return result.rows[0] ?? null;
      });
      if (!row) {
        throw new ServiceError("MEDIA_PREVIEW_NOT_FOUND", "La previsualización no está disponible.", 404);
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

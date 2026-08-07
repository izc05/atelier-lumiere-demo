import { ServiceError } from "./providers-service.mjs";

const PUBLIC_CONTEXT = Object.freeze({
  role: "CATALOG_READER",
  userId: "00000000-0000-4000-8000-000000000002",
  providerId: null
});
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function cleanQuery(value, maximum = 120) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function slug(value, field) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!SLUG_PATTERN.test(normalized) || normalized.length > 180) {
    throw new ServiceError("VALIDATION_ERROR", `${field} no es válido.`, 422, { field });
  }
  return normalized;
}

function uuid(value, field) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new ServiceError("VALIDATION_ERROR", `${field} no es válido.`, 422, { field });
  }
  return value.toLowerCase();
}

function profileMedia(profile, providerSlug) {
  const raw = Array.isArray(profile.media) ? profile.media : [];
  const media = raw
    .filter((item) => item && typeof item === "object" && UUID_PATTERN.test(String(item.id || "")))
    .map((item) => ({
      id: String(item.id).toLowerCase(),
      kind: ["LOGO", "COVER", "GALLERY"].includes(item.kind) ? item.kind : "GALLERY",
      altText: typeof item.altText === "string" ? item.altText : "",
      width: Number.isInteger(item.previewWidth) ? item.previewWidth : null,
      height: Number.isInteger(item.previewHeight) ? item.previewHeight : null,
      sortOrder: Number.isInteger(item.sortOrder) ? item.sortOrder : 0,
      path: `/api/catalog/providers/${providerSlug}/media/${String(item.id).toLowerCase()}/preview`
    }));
  return {
    logo: media.find((item) => item.kind === "LOGO") ?? null,
    cover: media.find((item) => item.kind === "COVER") ?? null,
    gallery: media.filter((item) => item.kind === "GALLERY").slice(0, 6),
    media
  };
}

function providerSummary(row) {
  const profile = row.provider_profile_snapshot && typeof row.provider_profile_snapshot === "object"
    ? row.provider_profile_snapshot
    : {};
  const media = profileMedia(profile, row.provider_slug);
  const featuredProductIds = Array.isArray(profile.featuredProductIds)
    ? profile.featuredProductIds
      .map((value) => String(value || "").toLowerCase())
      .filter((value, index, values) => UUID_PATTERN.test(value) && values.indexOf(value) === index)
      .slice(0, 4)
    : [];
  return {
    slug: row.provider_slug,
    displayName: profile.displayName || row.provider_display_name,
    specialty: profile.specialty || row.provider_specialty,
    tagline: profile.tagline || null,
    locationLabel: profile.locationLabel || null,
    story: profile.story || null,
    craftDescription: profile.craftDescription || null,
    materials: Array.isArray(profile.materials) ? profile.materials : [],
    techniques: Array.isArray(profile.techniques) ? profile.techniques : [],
    preparationNote: profile.preparationNote || null,
    shippingNote: profile.shippingNote || null,
    acceptsCustomRequests: Boolean(profile.acceptsCustomRequests),
    featuredProductIds,
    profileRevision: row.provider_profile_revision ? Number(row.provider_profile_revision) : null,
    logo: media.logo,
    cover: media.cover,
    gallery: media.gallery
  };
}

function publicSummary(row) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    shortDescription: row.short_description,
    category: row.category,
    priceCents: row.price_cents,
    currency: row.currency,
    stockMode: row.stock_mode,
    stockQuantity: row.stock_quantity,
    preparationMinDays: row.preparation_min_days,
    preparationMaxDays: row.preparation_max_days,
    customizable: row.customizable,
    publishedAt: row.published_at,
    provider: providerSummary(row),
    cover: row.cover_media_id ? {
      mediaId: row.cover_media_id,
      altText: row.cover_alt_text,
      width: row.cover_width,
      height: row.cover_height,
      focalX: Number(row.cover_focal_x ?? 50),
      focalY: Number(row.cover_focal_y ?? 50),
      path: `/api/catalog/products/${row.id}/media/${row.cover_media_id}/preview`
    } : null,
    events: Array.isArray(row.events) ? row.events : []
  };
}

function publicProduct(row) {
  return {
    ...publicSummary(row),
    story: row.story,
    personalizationNotes: row.personalization_notes,
    shippingNotes: row.shipping_notes
  };
}

export function createPublicCatalogService({ database, storage } = {}) {
  if (!database || typeof database.withContext !== "function") {
    throw new TypeError("createPublicCatalogService necesita una base de datos.");
  }
  if (!storage || typeof storage.openPreview !== "function" || typeof storage.openRead !== "function") {
    throw new TypeError("createPublicCatalogService necesita almacenamiento multimedia.");
  }

  return Object.freeze({
    async list({ query, category, event, provider, limit = 60 } = {}) {
      const search = cleanQuery(query, 160);
      const selectedCategory = cleanQuery(category, 80);
      const selectedEvent = event ? slug(event, "event") : "";
      const selectedProvider = provider ? slug(provider, "provider") : "";
      const selectedLimit = Number.isInteger(limit) ? Math.min(Math.max(limit, 1), 100) : 60;

      return database.withContext(PUBLIC_CONTEXT, async (transaction) => {
        const result = await transaction.query(
          `SELECT
             product.id,
             product.slug,
             product.name,
             product.short_description,
             product.category,
             product.price_cents,
             product.currency,
             product.stock_mode,
             product.stock_quantity,
             product.preparation_min_days,
             product.preparation_max_days,
             product.customizable,
             product.published_at,
             provider.slug AS provider_slug,
             provider.display_name AS provider_display_name,
             provider.specialty AS provider_specialty,
             profile_publication.revision AS provider_profile_revision,
             profile_publication.snapshot AS provider_profile_snapshot,
             cover.id AS cover_media_id,
             cover.alt_text AS cover_alt_text,
             cover.preview_width AS cover_width,
             cover.preview_height AS cover_height,
             cover.focal_x AS cover_focal_x,
             cover.focal_y AS cover_focal_y,
             COALESCE(events.values, ARRAY[]::text[]) AS events
           FROM products product
           INNER JOIN providers provider ON provider.id = product.provider_id
           LEFT JOIN provider_profile_publications profile_publication
             ON profile_publication.provider_id = provider.id
           LEFT JOIN LATERAL (
             SELECT media.id, media.alt_text, media.preview_width, media.preview_height,
                    COALESCE(focal.focal_x, 50) AS focal_x,
                    COALESCE(focal.focal_y, 50) AS focal_y
             FROM product_media media
             LEFT JOIN product_media_focal_points focal ON focal.media_id = media.id
             WHERE media.product_id = product.id
               AND media.kind = 'IMAGE'
               AND media.status = 'READY'
               AND media.preview_storage_key IS NOT NULL
             ORDER BY media.sort_order, media.created_at
             LIMIT 1
           ) cover ON true
           LEFT JOIN LATERAL (
             SELECT array_agg(product_event.event_slug ORDER BY product_event.event_slug) AS values
             FROM product_events product_event
             WHERE product_event.product_id = product.id
           ) events ON true
           WHERE product.status = 'PUBLISHED'
             AND provider.status = 'ACTIVE'
             AND (
               $1::text = ''
               OR product.name ILIKE '%' || $1 || '%'
               OR product.short_description ILIKE '%' || $1 || '%'
               OR COALESCE(product.category, '') ILIKE '%' || $1 || '%'
               OR provider.display_name ILIKE '%' || $1 || '%'
             )
             AND ($2::text = '' OR product.category ILIKE $2)
             AND (
               $3::text = ''
               OR EXISTS (
                 SELECT 1 FROM product_events event_filter
                 WHERE event_filter.product_id = product.id
                   AND event_filter.event_slug = $3
               )
             )
             AND ($4::text = '' OR provider.slug = $4)
           ORDER BY product.published_at DESC, product.name
           LIMIT $5`,
          [search, selectedCategory, selectedEvent, selectedProvider, selectedLimit]
        );
        return result.rows.map(publicSummary);
      });
    },

    async get(rawProviderSlug, rawProductSlug) {
      const providerSlug = slug(rawProviderSlug, "providerSlug");
      const productSlug = slug(rawProductSlug, "productSlug");
      return database.withContext(PUBLIC_CONTEXT, async (transaction) => {
        const result = await transaction.query(
          `SELECT
             product.*,
             provider.slug AS provider_slug,
             provider.display_name AS provider_display_name,
             provider.specialty AS provider_specialty,
             profile_publication.revision AS provider_profile_revision,
             profile_publication.snapshot AS provider_profile_snapshot,
             cover.id AS cover_media_id,
             cover.alt_text AS cover_alt_text,
             cover.preview_width AS cover_width,
             cover.preview_height AS cover_height,
             cover.focal_x AS cover_focal_x,
             cover.focal_y AS cover_focal_y,
             COALESCE(events.values, ARRAY[]::text[]) AS events
           FROM products product
           INNER JOIN providers provider ON provider.id = product.provider_id
           LEFT JOIN provider_profile_publications profile_publication
             ON profile_publication.provider_id = provider.id
           LEFT JOIN LATERAL (
             SELECT media.id, media.alt_text, media.preview_width, media.preview_height,
                    COALESCE(focal.focal_x, 50) AS focal_x,
                    COALESCE(focal.focal_y, 50) AS focal_y
             FROM product_media media
             LEFT JOIN product_media_focal_points focal ON focal.media_id = media.id
             WHERE media.product_id = product.id
               AND media.kind = 'IMAGE'
               AND media.status = 'READY'
               AND media.preview_storage_key IS NOT NULL
             ORDER BY media.sort_order, media.created_at
             LIMIT 1
           ) cover ON true
           LEFT JOIN LATERAL (
             SELECT array_agg(product_event.event_slug ORDER BY product_event.event_slug) AS values
             FROM product_events product_event
             WHERE product_event.product_id = product.id
           ) events ON true
           WHERE provider.slug = $1
             AND product.slug = $2
             AND provider.status = 'ACTIVE'
             AND product.status = 'PUBLISHED'`,
          [providerSlug, productSlug]
        );
        if (result.rowCount !== 1) {
          throw new ServiceError("PRODUCT_NOT_FOUND", "No se ha encontrado el artículo publicado.", 404);
        }
        const row = result.rows[0];
        const [options, media] = await Promise.all([
          transaction.query(
            `SELECT id, name, option_type, required, choices, price_delta_cents, sort_order
             FROM product_personalization_options
             WHERE product_id = $1 AND active = true
             ORDER BY sort_order, created_at`,
            [row.id]
          ),
          transaction.query(
            `SELECT media.id, media.kind, media.mime_type, media.original_filename, media.alt_text,
                    media.width, media.height, media.duration_seconds, media.sort_order,
                    media.preview_storage_key,
                    COALESCE(focal.focal_x, 50) AS focal_x,
                    COALESCE(focal.focal_y, 50) AS focal_y
             FROM product_media media
             LEFT JOIN product_media_focal_points focal ON focal.media_id = media.id
             WHERE media.product_id = $1 AND media.status = 'READY'
             ORDER BY media.kind, media.sort_order, media.created_at`,
            [row.id]
          )
        ]);
        return {
          ...publicProduct(row),
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
            altText: item.alt_text,
            width: item.width,
            height: item.height,
            durationSeconds: item.duration_seconds === null ? null : Number(item.duration_seconds),
            sortOrder: item.sort_order,
            focalX: Number(item.focal_x ?? 50),
            focalY: Number(item.focal_y ?? 50),
            path: item.kind === "IMAGE" && item.preview_storage_key
              ? `/api/catalog/products/${row.id}/media/${item.id}/preview`
              : item.kind === "VIDEO"
                ? `/api/catalog/products/${row.id}/media/${item.id}/content`
                : null
          })).filter((item) => item.path)
        };
      });
    },

    async openMedia(rawProductId, rawMediaId, variant, rangeHeader) {
      const productId = uuid(rawProductId, "productId");
      const mediaId = uuid(rawMediaId, "mediaId");
      if (!["preview", "content"].includes(variant)) {
        throw new ServiceError("VALIDATION_ERROR", "La variante multimedia no es válida.", 422);
      }
      const row = await database.withContext(PUBLIC_CONTEXT, async (transaction) => {
        const result = await transaction.query(
          `SELECT media.kind, media.mime_type, media.storage_key,
                  media.preview_storage_key, media.preview_mime_type,
                  media.original_filename
           FROM product_media media
           INNER JOIN products product ON product.id = media.product_id
           INNER JOIN providers provider ON provider.id = product.provider_id
           WHERE media.id = $1
             AND media.product_id = $2
             AND media.status = 'READY'
             AND product.status = 'PUBLISHED'
             AND provider.status = 'ACTIVE'`,
          [mediaId, productId]
        );
        return result.rows[0] ?? null;
      });
      if (!row) throw new ServiceError("MEDIA_NOT_FOUND", "El archivo publicado no está disponible.", 404);
      if (variant === "preview") {
        if (row.kind !== "IMAGE" || !row.preview_storage_key) {
          throw new ServiceError("MEDIA_NOT_FOUND", "La previsualización no está disponible.", 404);
        }
        return {
          ...(await storage.openPreview(row.preview_storage_key, rangeHeader)),
          mimeType: row.preview_mime_type,
          filename: `${row.original_filename.replace(/\.[^.]+$/, "")}-preview.webp`
        };
      }
      if (row.kind !== "VIDEO") {
        throw new ServiceError("MEDIA_NOT_FOUND", "El contenido original no se publica para fotografías.", 404);
      }
      return {
        ...(await storage.openRead(row.storage_key, rangeHeader)),
        mimeType: row.mime_type,
        filename: row.original_filename
      };
    },

    async openProviderMedia(rawProviderSlug, rawMediaId, rangeHeader) {
      const providerSlug = slug(rawProviderSlug, "providerSlug");
      const mediaId = uuid(rawMediaId, "mediaId");
      const row = await database.withContext(PUBLIC_CONTEXT, async (transaction) => {
        const result = await transaction.query(
          `SELECT item.value ->> 'previewStorageKey' AS preview_storage_key,
                  item.value ->> 'previewMimeType' AS preview_mime_type,
                  item.value ->> 'originalFilename' AS original_filename
           FROM provider_profile_publications publication
           INNER JOIN providers provider ON provider.id = publication.provider_id
           CROSS JOIN LATERAL jsonb_array_elements(COALESCE(publication.snapshot -> 'media', '[]'::jsonb)) item(value)
           WHERE provider.slug = $1
             AND provider.status = 'ACTIVE'
             AND item.value ->> 'id' = $2`,
          [providerSlug, mediaId]
        );
        return result.rows[0] ?? null;
      });
      if (!row?.preview_storage_key) {
        throw new ServiceError("MEDIA_NOT_FOUND", "La imagen publicada del taller no está disponible.", 404);
      }
      return {
        ...(await storage.openPreview(row.preview_storage_key, rangeHeader)),
        mimeType: row.preview_mime_type || "image/webp",
        filename: `${String(row.original_filename || "taller").replace(/\.[^.]+$/, "")}-preview.webp`
      };
    }
  });
}

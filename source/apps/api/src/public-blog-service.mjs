import { ServiceError } from "./providers-service.mjs";

const PUBLIC_CONTEXT = Object.freeze({
  role: "CATALOG_READER",
  userId: "00000000-0000-4000-8000-000000000002",
  providerId: null
});
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function clean(value, maximum) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}
function slug(value, field) {
  const normalized = clean(value, 180).toLowerCase();
  if (!SLUG_PATTERN.test(normalized)) {
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
function summary(row) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    category: row.category,
    publishedAt: row.published_at,
    provider: {
      slug: row.provider_slug,
      displayName: row.provider_display_name,
      specialty: row.provider_specialty
    },
    cover: {
      mediaId: row.cover_media_id,
      altText: row.cover_alt_text,
      width: row.cover_width,
      height: row.cover_height,
      path: `/api/blog/posts/${row.id}/media/${row.cover_media_id}/preview`
    },
    tags: Array.isArray(row.tags) ? row.tags : []
  };
}

export function createPublicBlogService({ database, storage } = {}) {
  if (!database || typeof database.withContext !== "function") {
    throw new TypeError("createPublicBlogService necesita una base de datos.");
  }
  if (!storage || typeof storage.openPreview !== "function") {
    throw new TypeError("createPublicBlogService necesita almacenamiento multimedia.");
  }

  return Object.freeze({
    async list({ query, category, tag, limit = 40 } = {}) {
      const search = clean(query, 160);
      const selectedCategory = clean(category, 80);
      const selectedTag = tag ? slug(tag, "tag") : "";
      const selectedLimit = Number.isInteger(limit) ? Math.min(Math.max(limit, 1), 80) : 40;
      return database.withContext(PUBLIC_CONTEXT, async (transaction) => {
        const result = await transaction.query(
          `SELECT post.id, post.slug, post.title, post.excerpt, post.category,
                  post.published_at,
                  provider.slug AS provider_slug,
                  provider.display_name AS provider_display_name,
                  provider.specialty AS provider_specialty,
                  cover.id AS cover_media_id,
                  cover.alt_text AS cover_alt_text,
                  cover.preview_width AS cover_width,
                  cover.preview_height AS cover_height,
                  COALESCE(tags.values, ARRAY[]::text[]) AS tags
           FROM blog_posts post
           INNER JOIN providers provider ON provider.id = post.provider_id
           INNER JOIN LATERAL (
             SELECT media.id, media.alt_text, media.preview_width, media.preview_height
             FROM blog_post_media media
             WHERE media.post_id = post.id
               AND media.placement = 'COVER'
               AND media.status = 'READY'
               AND media.preview_storage_key IS NOT NULL
             LIMIT 1
           ) cover ON true
           LEFT JOIN LATERAL (
             SELECT array_agg(item.tag_slug ORDER BY item.tag_slug) AS values
             FROM blog_post_tags item WHERE item.post_id = post.id
           ) tags ON true
           WHERE post.status = 'PUBLISHED'
             AND provider.status = 'ACTIVE'
             AND ($1 = '' OR post.title ILIKE '%' || $1 || '%'
               OR post.excerpt ILIKE '%' || $1 || '%'
               OR COALESCE(post.category, '') ILIKE '%' || $1 || '%'
               OR provider.display_name ILIKE '%' || $1 || '%')
             AND ($2 = '' OR post.category ILIKE $2)
             AND ($3 = '' OR EXISTS (
               SELECT 1 FROM blog_post_tags filter
               WHERE filter.post_id = post.id AND filter.tag_slug = $3
             ))
           ORDER BY post.published_at DESC, post.title
           LIMIT $4`,
          [search, selectedCategory, selectedTag, selectedLimit]
        );
        return result.rows.map(summary);
      });
    },

    async get(rawProviderSlug, rawPostSlug) {
      const providerSlug = slug(rawProviderSlug, "providerSlug");
      const postSlug = slug(rawPostSlug, "postSlug");
      return database.withContext(PUBLIC_CONTEXT, async (transaction) => {
        const result = await transaction.query(
          `SELECT post.*, provider.slug AS provider_slug,
                  provider.display_name AS provider_display_name,
                  provider.specialty AS provider_specialty,
                  cover.id AS cover_media_id,
                  cover.alt_text AS cover_alt_text,
                  cover.preview_width AS cover_width,
                  cover.preview_height AS cover_height,
                  COALESCE(tags.values, ARRAY[]::text[]) AS tags
           FROM blog_posts post
           INNER JOIN providers provider ON provider.id = post.provider_id
           INNER JOIN LATERAL (
             SELECT media.id, media.alt_text, media.preview_width, media.preview_height
             FROM blog_post_media media
             WHERE media.post_id = post.id
               AND media.placement = 'COVER'
               AND media.status = 'READY'
               AND media.preview_storage_key IS NOT NULL
             LIMIT 1
           ) cover ON true
           LEFT JOIN LATERAL (
             SELECT array_agg(item.tag_slug ORDER BY item.tag_slug) AS values
             FROM blog_post_tags item WHERE item.post_id = post.id
           ) tags ON true
           WHERE provider.slug = $1 AND post.slug = $2
             AND provider.status = 'ACTIVE' AND post.status = 'PUBLISHED'`,
          [providerSlug, postSlug]
        );
        if (result.rowCount !== 1) {
          throw new ServiceError("BLOG_POST_NOT_FOUND", "No se ha encontrado la historia publicada.", 404);
        }
        const row = result.rows[0];
        const [media, related] = await Promise.all([
          transaction.query(
            `SELECT id, placement, alt_text, preview_width, preview_height, sort_order
             FROM blog_post_media
             WHERE post_id = $1 AND status = 'READY' AND preview_storage_key IS NOT NULL
             ORDER BY CASE placement WHEN 'COVER' THEN 0 ELSE 1 END, sort_order, created_at`,
            [row.id]
          ),
          transaction.query(
            `SELECT product.id, product.slug, product.name, product.short_description,
                    product.category, product.price_cents, product.currency,
                    provider.slug AS provider_slug,
                    cover.id AS cover_media_id, cover.alt_text AS cover_alt_text
             FROM blog_post_products link
             INNER JOIN products product ON product.id = link.product_id
             INNER JOIN providers provider ON provider.id = product.provider_id
             LEFT JOIN LATERAL (
               SELECT item.id, item.alt_text
               FROM product_media item
               WHERE item.product_id = product.id AND item.kind = 'IMAGE'
                 AND item.status = 'READY' AND item.preview_storage_key IS NOT NULL
               ORDER BY item.sort_order, item.created_at LIMIT 1
             ) cover ON true
             WHERE link.post_id = $1 AND product.status = 'PUBLISHED'
             ORDER BY link.sort_order, product.name`,
            [row.id]
          )
        ]);
        return {
          ...summary(row),
          bodyMarkdown: row.body_markdown,
          media: media.rows.map((item) => ({
            id: item.id,
            placement: item.placement,
            altText: item.alt_text,
            width: item.preview_width,
            height: item.preview_height,
            sortOrder: item.sort_order,
            path: `/api/blog/posts/${row.id}/media/${item.id}/preview`
          })),
          relatedProducts: related.rows.map((item) => ({
            id: item.id,
            slug: item.slug,
            name: item.name,
            shortDescription: item.short_description,
            category: item.category,
            priceCents: item.price_cents,
            currency: item.currency,
            providerSlug: item.provider_slug,
            cover: item.cover_media_id ? {
              path: `/api/catalog/products/${item.id}/media/${item.cover_media_id}/preview`,
              altText: item.cover_alt_text
            } : null
          }))
        };
      });
    },

    async openPreview(rawPostId, rawMediaId, rangeHeader) {
      const postId = uuid(rawPostId, "postId");
      const mediaId = uuid(rawMediaId, "mediaId");
      const row = await database.withContext(PUBLIC_CONTEXT, async (transaction) => {
        const result = await transaction.query(
          `SELECT media.preview_storage_key, media.preview_mime_type, media.original_filename
           FROM blog_post_media media
           INNER JOIN blog_posts post ON post.id = media.post_id
           INNER JOIN providers provider ON provider.id = post.provider_id
           WHERE media.id = $1 AND media.post_id = $2
             AND media.status = 'READY' AND media.preview_storage_key IS NOT NULL
             AND post.status = 'PUBLISHED' AND provider.status = 'ACTIVE'`,
          [mediaId, postId]
        );
        return result.rows[0] ?? null;
      });
      if (!row) throw new ServiceError("BLOG_MEDIA_NOT_FOUND", "La imagen no está disponible.", 404);
      return {
        ...(await storage.openPreview(row.preview_storage_key, rangeHeader)),
        mimeType: row.preview_mime_type,
        filename: `${row.original_filename.replace(/\.[^.]+$/, "")}-preview.webp`
      };
    }
  });
}

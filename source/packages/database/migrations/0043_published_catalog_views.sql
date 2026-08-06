BEGIN;

CREATE SCHEMA catalog;
GRANT USAGE ON SCHEMA catalog TO atelier_app_runtime;

CREATE VIEW catalog.products WITH (security_invoker = true) AS
SELECT publication.product_id AS id,
       publication.provider_id,
       (publication.snapshot #>> '{product,slug}')::citext AS slug,
       publication.snapshot #>> '{product,name}' AS name,
       COALESCE(publication.snapshot #>> '{product,shortDescription}', '') AS short_description,
       COALESCE(publication.snapshot #>> '{product,story}', '') AS story,
       publication.snapshot #>> '{product,category}' AS category,
       (publication.snapshot #>> '{product,priceCents}')::integer AS price_cents,
       COALESCE(publication.snapshot #>> '{product,currency}', 'EUR')::char(3) AS currency,
       COALESCE(publication.snapshot #>> '{product,stockMode}', 'FINITE') AS stock_mode,
       (publication.snapshot #>> '{product,stockQuantity}')::integer AS stock_quantity,
       (publication.snapshot #>> '{product,preparationMinDays}')::integer AS preparation_min_days,
       (publication.snapshot #>> '{product,preparationMaxDays}')::integer AS preparation_max_days,
       COALESCE((publication.snapshot #>> '{product,customizable}')::boolean, false) AS customizable,
       COALESCE(publication.snapshot #>> '{product,personalizationNotes}', '') AS personalization_notes,
       COALESCE(publication.snapshot #>> '{product,shippingNotes}', '') AS shipping_notes,
       'PUBLISHED'::text AS status,
       publication.revision AS version,
       publication.published_by,
       publication.published_at,
       publication.published_at AS created_at,
       publication.updated_at
FROM product_publications publication
WHERE publication.visible = true;

CREATE VIEW catalog.product_events WITH (security_invoker = true) AS
SELECT publication.provider_id,
       publication.product_id,
       event.value AS event_slug,
       publication.published_at AS created_at
FROM product_publications publication
CROSS JOIN LATERAL jsonb_array_elements_text(publication.snapshot -> 'events') event(value)
WHERE publication.visible = true;

CREATE VIEW catalog.product_personalization_options WITH (security_invoker = true) AS
SELECT (item.value ->> 'id')::uuid AS id,
       publication.provider_id,
       publication.product_id,
       item.value ->> 'name' AS name,
       item.value ->> 'optionType' AS option_type,
       COALESCE((item.value ->> 'required')::boolean, false) AS required,
       COALESCE(item.value -> 'choices', '[]'::jsonb) AS choices,
       COALESCE((item.value ->> 'priceDeltaCents')::integer, 0) AS price_delta_cents,
       COALESCE((item.value ->> 'sortOrder')::smallint, 0) AS sort_order,
       COALESCE((item.value ->> 'active')::boolean, true) AS active,
       COALESCE((item.value ->> 'createdAt')::timestamptz, publication.published_at) AS created_at,
       publication.updated_at
FROM product_publications publication
CROSS JOIN LATERAL jsonb_array_elements(publication.snapshot -> 'personalizations') item(value)
WHERE publication.visible = true;

CREATE VIEW catalog.product_media WITH (security_invoker = true) AS
SELECT (item.value ->> 'id')::uuid AS id,
       publication.provider_id,
       publication.product_id,
       item.value ->> 'kind' AS kind,
       item.value ->> 'mimeType' AS mime_type,
       item.value ->> 'originalFilename' AS original_filename,
       item.value ->> 'storageKey' AS storage_key,
       (item.value ->> 'sizeBytes')::bigint AS size_bytes,
       'READY'::text AS status,
       COALESCE((item.value ->> 'sortOrder')::smallint, 0) AS sort_order,
       COALESCE(item.value ->> 'altText', '') AS alt_text,
       (item.value ->> 'width')::integer AS width,
       (item.value ->> 'height')::integer AS height,
       (item.value ->> 'durationSeconds')::numeric(8,2) AS duration_seconds,
       item.value ->> 'previewStorageKey' AS preview_storage_key,
       item.value ->> 'previewMimeType' AS preview_mime_type,
       (item.value ->> 'previewSizeBytes')::bigint AS preview_size_bytes,
       (item.value ->> 'previewWidth')::integer AS preview_width,
       (item.value ->> 'previewHeight')::integer AS preview_height,
       COALESCE((item.value ->> 'createdAt')::timestamptz, publication.published_at) AS created_at,
       publication.updated_at
FROM product_publications publication
CROSS JOIN LATERAL jsonb_array_elements(publication.snapshot -> 'media') item(value)
WHERE publication.visible = true;

CREATE VIEW catalog.product_media_focal_points WITH (security_invoker = true) AS
SELECT (item.value ->> 'id')::uuid AS media_id,
       publication.provider_id,
       publication.product_id,
       COALESCE((item.value ->> 'focalX')::smallint, 50) AS focal_x,
       COALESCE((item.value ->> 'focalY')::smallint, 50) AS focal_y,
       publication.updated_at
FROM product_publications publication
CROSS JOIN LATERAL jsonb_array_elements(publication.snapshot -> 'media') item(value)
WHERE publication.visible = true
  AND item.value ->> 'kind' = 'IMAGE';

GRANT SELECT ON
  catalog.products,
  catalog.product_events,
  catalog.product_personalization_options,
  catalog.product_media,
  catalog.product_media_focal_points
TO atelier_app_runtime;

COMMIT;

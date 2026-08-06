BEGIN;

CREATE SCHEMA IF NOT EXISTS catalog;
GRANT USAGE ON SCHEMA catalog TO atelier_app_runtime;

CREATE TABLE product_publications (
  product_id uuid PRIMARY KEY,
  provider_id uuid NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision >= 1),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  visible boolean NOT NULL DEFAULT true,
  published_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  published_at timestamptz NOT NULL,
  paused_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  paused_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (product_id, provider_id)
    REFERENCES products(id, provider_id) ON DELETE CASCADE,
  CHECK (
    (visible = true AND paused_by IS NULL AND paused_at IS NULL)
    OR (visible = false AND paused_by IS NOT NULL AND paused_at IS NOT NULL)
  )
);

CREATE INDEX product_publications_provider_idx
  ON product_publications(provider_id, visible, published_at DESC);

CREATE OR REPLACE FUNCTION app.build_product_publication_snapshot(target_product_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'product', jsonb_build_object(
      'slug', product.slug::text,
      'name', product.name,
      'shortDescription', product.short_description,
      'story', product.story,
      'category', product.category,
      'priceCents', product.price_cents,
      'currency', product.currency,
      'stockMode', product.stock_mode,
      'stockQuantity', product.stock_quantity,
      'preparationMinDays', product.preparation_min_days,
      'preparationMaxDays', product.preparation_max_days,
      'customizable', product.customizable,
      'personalizationNotes', product.personalization_notes,
      'shippingNotes', product.shipping_notes
    ),
    'events', COALESCE((
      SELECT jsonb_agg(event.event_slug ORDER BY event.event_slug)
      FROM product_events event
      WHERE event.product_id = product.id
    ), '[]'::jsonb),
    'personalizations', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', option.id,
          'name', option.name,
          'optionType', option.option_type,
          'required', option.required,
          'choices', option.choices,
          'priceDeltaCents', option.price_delta_cents,
          'sortOrder', option.sort_order,
          'active', option.active,
          'createdAt', option.created_at
        ) ORDER BY option.sort_order, option.created_at
      )
      FROM product_personalization_options option
      WHERE option.product_id = product.id
        AND option.active = true
    ), '[]'::jsonb),
    'media', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', media.id,
          'kind', media.kind,
          'mimeType', media.mime_type,
          'originalFilename', media.original_filename,
          'storageKey', media.storage_key,
          'sizeBytes', media.size_bytes,
          'sortOrder', media.sort_order,
          'altText', media.alt_text,
          'width', media.width,
          'height', media.height,
          'durationSeconds', media.duration_seconds,
          'previewStorageKey', media.preview_storage_key,
          'previewMimeType', media.preview_mime_type,
          'previewSizeBytes', media.preview_size_bytes,
          'previewWidth', media.preview_width,
          'previewHeight', media.preview_height,
          'focalX', COALESCE(focal.focal_x, 50),
          'focalY', COALESCE(focal.focal_y, 50),
          'createdAt', media.created_at
        ) ORDER BY media.kind, media.sort_order, media.created_at
      )
      FROM product_media media
      LEFT JOIN product_media_focal_points focal ON focal.media_id = media.id
      WHERE media.product_id = product.id
        AND media.status = 'READY'
    ), '[]'::jsonb)
  )
  FROM products product
  WHERE product.id = target_product_id;
$$;

CREATE OR REPLACE FUNCTION app.guard_product_publication_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT app.is_admin() THEN
      RAISE EXCEPTION 'PRODUCT_PUBLICATION_INSERT_NOT_ALLOWED' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF current_setting('app.publication_sync', true) = 'true' THEN
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  IF app.is_admin() THEN
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  IF NOT app.is_provider_actor(OLD.provider_id)
     OR NEW.product_id IS DISTINCT FROM OLD.product_id
     OR NEW.provider_id IS DISTINCT FROM OLD.provider_id
     OR NEW.revision IS DISTINCT FROM OLD.revision
     OR NEW.snapshot IS DISTINCT FROM OLD.snapshot
     OR NEW.published_by IS DISTINCT FROM OLD.published_by
     OR NEW.published_at IS DISTINCT FROM OLD.published_at THEN
    RAISE EXCEPTION 'PRODUCT_PUBLICATION_UPDATE_NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;

  IF NEW.visible IS DISTINCT FROM OLD.visible THEN
    IF NEW.visible THEN
      NEW.paused_by := NULL;
      NEW.paused_at := NULL;
    ELSE
      NEW.paused_by := app.current_user_id();
      NEW.paused_at := now();
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER product_publications_00_guard_write
BEFORE INSERT OR UPDATE ON product_publications
FOR EACH ROW EXECUTE FUNCTION app.guard_product_publication_write();

CREATE OR REPLACE FUNCTION app.refresh_product_publication()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  publication_snapshot jsonb;
BEGIN
  IF NEW.status <> 'PUBLISHED'
     OR OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  publication_snapshot := app.build_product_publication_snapshot(NEW.id);
  IF publication_snapshot IS NULL THEN
    RAISE EXCEPTION 'PRODUCT_PUBLICATION_SNAPSHOT_FAILED' USING ERRCODE = '23514';
  END IF;

  INSERT INTO product_publications (
    product_id, provider_id, revision, snapshot, visible,
    published_by, published_at, paused_by, paused_at
  ) VALUES (
    NEW.id, NEW.provider_id, 1, publication_snapshot, true,
    NEW.published_by, NEW.published_at, NULL, NULL
  )
  ON CONFLICT (product_id) DO UPDATE
  SET revision = product_publications.revision + 1,
      snapshot = EXCLUDED.snapshot,
      visible = true,
      published_by = EXCLUDED.published_by,
      published_at = EXCLUDED.published_at,
      paused_by = NULL,
      paused_at = NULL,
      updated_at = now();

  RETURN NEW;
END;
$$;

CREATE TRIGGER products_90_refresh_publication
AFTER UPDATE ON products
FOR EACH ROW EXECUTE FUNCTION app.refresh_product_publication();

INSERT INTO product_publications (
  product_id, provider_id, revision, snapshot, visible,
  published_by, published_at
)
SELECT product.id,
       product.provider_id,
       1,
       app.build_product_publication_snapshot(product.id),
       true,
       product.published_by,
       product.published_at
FROM products product
WHERE product.status = 'PUBLISHED'
ON CONFLICT (product_id) DO NOTHING;

CREATE OR REPLACE FUNCTION app.sync_published_focal_point()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('app.publication_sync', 'true', true);

  UPDATE product_publications publication
  SET snapshot = jsonb_set(
        publication.snapshot,
        '{media}',
        COALESCE((
          SELECT jsonb_agg(
            CASE
              WHEN media_item.value ->> 'id' = NEW.media_id::text THEN
                jsonb_set(
                  jsonb_set(media_item.value, '{focalX}', to_jsonb(NEW.focal_x), true),
                  '{focalY}', to_jsonb(NEW.focal_y), true
                )
              ELSE media_item.value
            END
            ORDER BY media_item.ordinality
          )
          FROM jsonb_array_elements(publication.snapshot -> 'media')
               WITH ORDINALITY AS media_item(value, ordinality)
        ), '[]'::jsonb),
        true
      ),
      updated_at = now()
  WHERE publication.product_id = NEW.product_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER product_media_focal_points_90_sync_publication
AFTER INSERT OR UPDATE ON product_media_focal_points
FOR EACH ROW EXECUTE FUNCTION app.sync_published_focal_point();

CREATE OR REPLACE FUNCTION app.enforce_product_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  ready_images integer;
  pending_media integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT app.is_admin() THEN
      IF NOT app.is_provider_actor(NEW.provider_id)
         OR NEW.status <> 'DRAFT'
         OR NEW.created_by IS DISTINCT FROM app.current_user_id()
         OR NEW.updated_by IS DISTINCT FROM app.current_user_id() THEN
        RAISE EXCEPTION 'PRODUCT_INSERT_NOT_ALLOWED' USING ERRCODE = '42501';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.provider_id IS DISTINCT FROM OLD.provider_id
     OR NEW.id IS DISTINCT FROM OLD.id
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'PRODUCT_IDENTITY_IMMUTABLE' USING ERRCODE = '23514';
  END IF;

  NEW.updated_at := now();
  NEW.updated_by := COALESCE(app.current_user_id(), OLD.updated_by);
  NEW.version := OLD.version + 1;

  IF app.is_admin() THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NOT (
        (OLD.status = 'DRAFT' AND NEW.status IN ('DRAFT', 'IN_REVIEW', 'ARCHIVED'))
        OR (OLD.status = 'CHANGES_REQUESTED' AND NEW.status IN ('CHANGES_REQUESTED', 'IN_REVIEW', 'ARCHIVED'))
        OR (OLD.status = 'IN_REVIEW' AND NEW.status IN ('IN_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'ARCHIVED'))
        OR (OLD.status = 'APPROVED' AND NEW.status IN ('APPROVED', 'PUBLISHED', 'CHANGES_REQUESTED', 'ARCHIVED'))
        OR (OLD.status = 'PUBLISHED' AND NEW.status IN ('PUBLISHED', 'ARCHIVED'))
        OR (OLD.status = 'ARCHIVED' AND NEW.status IN ('ARCHIVED', 'DRAFT'))
      ) THEN
        RAISE EXCEPTION 'PRODUCT_STATUS_TRANSITION_NOT_ALLOWED' USING ERRCODE = '23514';
      END IF;

      IF NEW.status = 'APPROVED' THEN
        NEW.approved_at := now();
        NEW.approved_by := app.current_user_id();
      ELSIF NEW.status = 'PUBLISHED' THEN
        IF OLD.status <> 'APPROVED' THEN
          RAISE EXCEPTION 'PRODUCT_MUST_BE_APPROVED_BEFORE_PUBLICATION' USING ERRCODE = '23514';
        END IF;
        NEW.published_at := now();
        NEW.published_by := app.current_user_id();
      ELSIF NEW.status = 'CHANGES_REQUESTED' THEN
        NEW.approved_at := NULL;
        NEW.approved_by := NULL;
      ELSIF NEW.status = 'ARCHIVED' THEN
        NEW.archived_at := now();
      ELSIF NEW.status = 'DRAFT' THEN
        NEW.submitted_at := NULL;
        NEW.approved_at := NULL;
        NEW.approved_by := NULL;
        NEW.published_at := NULL;
        NEW.published_by := NULL;
        NEW.archived_at := NULL;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF NOT app.is_provider_actor(OLD.provider_id)
     OR NOT (
       (OLD.status = 'DRAFT' AND NEW.status IN ('DRAFT', 'IN_REVIEW'))
       OR (OLD.status = 'CHANGES_REQUESTED' AND NEW.status IN ('DRAFT', 'CHANGES_REQUESTED', 'IN_REVIEW'))
       OR (OLD.status = 'PUBLISHED' AND NEW.status = 'DRAFT')
     ) THEN
    RAISE EXCEPTION 'PRODUCT_UPDATE_NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;

  IF NEW.status = 'IN_REVIEW' AND OLD.status <> 'IN_REVIEW' THEN
    SELECT COUNT(*) FILTER (WHERE kind = 'IMAGE' AND status = 'READY'),
           COUNT(*) FILTER (WHERE status = 'PENDING_UPLOAD')
      INTO ready_images, pending_media
      FROM product_media
     WHERE product_id = OLD.id;

    IF char_length(btrim(NEW.short_description)) < 20
       OR NEW.category IS NULL
       OR NEW.price_cents IS NULL
       OR NEW.preparation_min_days IS NULL
       OR NEW.preparation_max_days IS NULL
       OR ready_images < 1
       OR pending_media > 0 THEN
      RAISE EXCEPTION 'PRODUCT_NOT_READY_FOR_REVIEW' USING ERRCODE = '23514';
    END IF;
    NEW.submitted_at := now();
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.guard_product_workflow()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  approved_review_exists boolean;
  ready_images integer;
  unfinished_media integer;
BEGIN
  IF TG_OP <> 'UPDATE' OR NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NOT app.is_admin() THEN
    IF NOT (
      (OLD.status = 'DRAFT' AND NEW.status IN ('DRAFT', 'IN_REVIEW'))
      OR (OLD.status = 'CHANGES_REQUESTED' AND NEW.status IN ('DRAFT', 'CHANGES_REQUESTED', 'IN_REVIEW'))
      OR (OLD.status = 'PUBLISHED' AND NEW.status = 'DRAFT')
    ) THEN
      RAISE EXCEPTION 'PROVIDER_PRODUCT_STATUS_NOT_ALLOWED' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status IN ('APPROVED', 'PUBLISHED') THEN
    SELECT EXISTS (
      SELECT 1
      FROM product_reviews
      WHERE product_id = OLD.id
        AND status = 'APPROVED'
    ) INTO approved_review_exists;

    IF NOT approved_review_exists THEN
      RAISE EXCEPTION 'PRODUCT_REVIEW_APPROVAL_REQUIRED' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.status = 'PUBLISHED' THEN
    SELECT COUNT(*) FILTER (WHERE kind = 'IMAGE' AND status = 'READY'),
           COUNT(*) FILTER (WHERE status IN ('PENDING_UPLOAD', 'REJECTED'))
      INTO ready_images, unfinished_media
      FROM product_media
      WHERE product_id = OLD.id;

    IF ready_images < 1 OR unfinished_media > 0 THEN
      RAISE EXCEPTION 'PRODUCT_MEDIA_NOT_READY_FOR_PUBLICATION' USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

ALTER TABLE product_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_publications FORCE ROW LEVEL SECURITY;

CREATE POLICY product_publications_select_policy ON product_publications
FOR SELECT USING (
  app.is_provider_actor(provider_id)
  OR (
    app.current_role() = 'CATALOG_READER'
    AND visible = true
    AND EXISTS (
      SELECT 1 FROM providers provider
      WHERE provider.id = product_publications.provider_id
        AND provider.status = 'ACTIVE'
    )
  )
);

CREATE POLICY product_publications_insert_policy ON product_publications
FOR INSERT WITH CHECK (app.is_admin());

CREATE POLICY product_publications_update_policy ON product_publications
FOR UPDATE USING (app.is_provider_actor(provider_id))
WITH CHECK (app.is_provider_actor(provider_id));

GRANT SELECT, INSERT, UPDATE ON product_publications TO atelier_app_runtime;

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
       publication.published_at AS updated_at
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
       COALESCE((item.value ->> 'createdAt')::timestamptz, publication.published_at) AS created_at
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
       COALESCE((item.value ->> 'createdAt')::timestamptz, publication.published_at) AS created_at
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

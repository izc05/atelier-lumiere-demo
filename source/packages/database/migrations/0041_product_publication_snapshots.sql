BEGIN;

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
WHERE product.status = 'PUBLISHED';

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

GRANT SELECT, INSERT, UPDATE
ON product_publications
TO atelier_app_runtime;

COMMIT;

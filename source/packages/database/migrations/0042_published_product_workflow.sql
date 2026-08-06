BEGIN;

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

CREATE OR REPLACE FUNCTION app.retain_published_media_file()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  published_reference_exists boolean;
  original_extension text;
BEGIN
  IF NEW.status <> 'DELETED'
     OR OLD.status = 'DELETED' THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM product_publications publication
    CROSS JOIN LATERAL jsonb_array_elements(publication.snapshot -> 'media') media_item
    WHERE publication.product_id = OLD.product_id
      AND media_item ->> 'id' = OLD.id::text
  ) INTO published_reference_exists;

  IF published_reference_exists THEN
    original_extension := lower(regexp_replace(OLD.storage_key, '^.*\.', ''));
    IF original_extension !~ '^[a-z0-9]+$' THEN
      RAISE EXCEPTION 'PRODUCT_MEDIA_EXTENSION_INVALID' USING ERRCODE = '23514';
    END IF;
    NEW.storage_key := format(
      'retained/%s/%s/%s/original.%s',
      OLD.provider_id,
      OLD.product_id,
      OLD.id,
      original_extension
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER product_media_00_retain_publication
BEFORE UPDATE ON product_media
FOR EACH ROW EXECUTE FUNCTION app.retain_published_media_file();

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

COMMIT;

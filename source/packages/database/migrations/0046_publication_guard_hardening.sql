BEGIN;

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
    IF NEW.product_id IS DISTINCT FROM OLD.product_id
       OR NEW.provider_id IS DISTINCT FROM OLD.provider_id
       OR NEW.revision IS DISTINCT FROM OLD.revision
       OR NEW.visible IS DISTINCT FROM OLD.visible
       OR NEW.published_by IS DISTINCT FROM OLD.published_by
       OR NEW.published_at IS DISTINCT FROM OLD.published_at
       OR NEW.paused_by IS DISTINCT FROM OLD.paused_by
       OR NEW.paused_at IS DISTINCT FROM OLD.paused_at THEN
      RAISE EXCEPTION 'PRODUCT_PUBLICATION_SYNC_SCOPE_INVALID' USING ERRCODE = '42501';
    END IF;
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
  ELSIF NEW.paused_by IS DISTINCT FROM OLD.paused_by
        OR NEW.paused_at IS DISTINCT FROM OLD.paused_at THEN
    RAISE EXCEPTION 'PRODUCT_PUBLICATION_PAUSE_METADATA_IMMUTABLE' USING ERRCODE = '42501';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.sync_published_focal_point()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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

  PERFORM set_config('app.publication_sync', 'false', true);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app.sync_published_focal_point() FROM PUBLIC;

CREATE OR REPLACE FUNCTION app.prepare_published_product_edit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'PUBLISHED'
     AND NEW.status = 'DRAFT'
     AND NOT app.is_admin()
     AND app.is_provider_actor(OLD.provider_id) THEN
    NEW.submitted_at := NULL;
    NEW.approved_at := NULL;
    NEW.approved_by := NULL;
    NEW.published_at := NULL;
    NEW.published_by := NULL;
    NEW.archived_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER products_05_prepare_published_edit
BEFORE UPDATE ON products
FOR EACH ROW EXECUTE FUNCTION app.prepare_published_product_edit();

COMMIT;

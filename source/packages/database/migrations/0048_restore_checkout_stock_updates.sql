BEGIN;

CREATE OR REPLACE FUNCTION app.enforce_product_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  ready_images integer;
  pending_media integer;
BEGIN
  IF app.is_pilot_checkout_service() THEN
    IF TG_OP <> 'UPDATE'
       OR (to_jsonb(NEW) - ARRAY['stock_quantity','updated_at','updated_by','version'])
          IS DISTINCT FROM
          (to_jsonb(OLD) - ARRAY['stock_quantity','updated_at','updated_by','version'])
       OR OLD.stock_mode <> 'FINITE'
       OR NEW.stock_quantity IS NULL
       OR NEW.stock_quantity < 0
       OR NEW.stock_quantity >= OLD.stock_quantity
       OR NOT EXISTS (
         SELECT 1
         FROM product_publications publication
         WHERE publication.product_id = OLD.id
           AND publication.visible = true
       ) THEN
      RAISE EXCEPTION 'PILOT_CHECKOUT_STOCK_UPDATE_NOT_ALLOWED' USING ERRCODE = '42501';
    END IF;

    NEW.updated_at := now();
    NEW.updated_by := app.current_user_id();
    NEW.version := OLD.version + 1;
    RETURN NEW;
  END IF;

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

CREATE OR REPLACE FUNCTION app.sync_published_stock_quantity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.stock_mode IS NOT DISTINCT FROM OLD.stock_mode
     AND NEW.stock_quantity IS NOT DISTINCT FROM OLD.stock_quantity THEN
    RETURN NEW;
  END IF;

  PERFORM set_config('app.publication_sync', 'true', true);

  UPDATE product_publications publication
  SET snapshot = jsonb_set(
        jsonb_set(
          publication.snapshot,
          '{product,stockMode}',
          to_jsonb(NEW.stock_mode::text),
          true
        ),
        '{product,stockQuantity}',
        COALESCE(to_jsonb(NEW.stock_quantity), 'null'::jsonb),
        true
      ),
      updated_at = now()
  WHERE publication.product_id = NEW.id;

  PERFORM set_config('app.publication_sync', 'false', true);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app.sync_published_stock_quantity() FROM PUBLIC;

CREATE TRIGGER products_95_sync_publication_stock
AFTER UPDATE OF stock_mode, stock_quantity ON products
FOR EACH ROW EXECUTE FUNCTION app.sync_published_stock_quantity();

COMMIT;

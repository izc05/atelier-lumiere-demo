BEGIN;

ALTER TABLE products
  ALTER COLUMN stock_quantity SET DEFAULT 0;

CREATE OR REPLACE FUNCTION app.enforce_product_media_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  active_count integer;
  target_kind text;
  target_product uuid;
  target_provider uuid;
  product_status text;
BEGIN
  target_provider := CASE WHEN TG_OP = 'DELETE' THEN OLD.provider_id ELSE NEW.provider_id END;
  target_product := CASE WHEN TG_OP = 'DELETE' THEN OLD.product_id ELSE NEW.product_id END;

  IF TG_OP = 'DELETE' THEN
    IF NOT app.is_admin() THEN
      RAISE EXCEPTION 'PRODUCT_MEDIA_HARD_DELETE_NOT_ALLOWED' USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;

  SELECT status INTO product_status
    FROM products
   WHERE id = target_product AND provider_id = target_provider;

  IF NOT app.is_admin() THEN
    IF NOT app.is_provider_actor(target_provider)
       OR product_status NOT IN ('DRAFT', 'CHANGES_REQUESTED')
       OR NEW.uploaded_by IS DISTINCT FROM app.current_user_id() THEN
      RAISE EXCEPTION 'PRODUCT_MEDIA_WRITE_NOT_ALLOWED' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND (
    NEW.id IS DISTINCT FROM OLD.id
    OR NEW.provider_id IS DISTINCT FROM OLD.provider_id
    OR NEW.product_id IS DISTINCT FROM OLD.product_id
    OR NEW.uploaded_by IS DISTINCT FROM OLD.uploaded_by
    OR NEW.storage_key IS DISTINCT FROM OLD.storage_key
    OR NEW.checksum_sha256 IS DISTINCT FROM OLD.checksum_sha256
    OR NEW.kind IS DISTINCT FROM OLD.kind
  ) THEN
    RAISE EXCEPTION 'PRODUCT_MEDIA_IDENTITY_IMMUTABLE' USING ERRCODE = '23514';
  END IF;

  IF NEW.status <> 'DELETED' THEN
    target_kind := NEW.kind;
    PERFORM pg_advisory_xact_lock(hashtextextended(target_product::text, 0));

    SELECT COUNT(*) INTO active_count
      FROM product_media
     WHERE product_id = target_product
       AND kind = target_kind
       AND status <> 'DELETED'
       AND id <> NEW.id;

    IF target_kind = 'IMAGE' AND active_count >= 8 THEN
      RAISE EXCEPTION 'PRODUCT_IMAGE_LIMIT_EXCEEDED' USING ERRCODE = '23514';
    END IF;
    IF target_kind = 'VIDEO' AND active_count >= 1 THEN
      RAISE EXCEPTION 'PRODUCT_VIDEO_LIMIT_EXCEEDED' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.status = 'READY' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'READY') THEN
    NEW.ready_at := now();
  END IF;
  IF NEW.status = 'DELETED' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'DELETED') THEN
    NEW.deleted_at := now();
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;

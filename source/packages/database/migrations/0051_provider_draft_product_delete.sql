BEGIN;

CREATE OR REPLACE FUNCTION app.guard_provider_product_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF app.is_admin() THEN
    RETURN OLD;
  END IF;

  IF NOT app.is_provider_actor(OLD.provider_id) OR OLD.status <> 'DRAFT' THEN
    RAISE EXCEPTION 'PRODUCT_DELETE_NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1 FROM product_publications WHERE product_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'PUBLISHED_PRODUCT_DELETE_NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1 FROM product_reviews WHERE product_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'SUBMITTED_PRODUCT_DELETE_NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1 FROM product_media
    WHERE product_id = OLD.id AND status <> 'DELETED'
  ) THEN
    RAISE EXCEPTION 'PRODUCT_MEDIA_DELETE_REQUIRED' USING ERRCODE = '23514';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS products_99_provider_delete_guard ON products;
CREATE TRIGGER products_99_provider_delete_guard
BEFORE DELETE ON products
FOR EACH ROW EXECUTE FUNCTION app.guard_provider_product_delete();

DROP POLICY IF EXISTS products_delete_draft_policy ON products;
CREATE POLICY products_delete_draft_policy ON products
FOR DELETE USING (
  app.is_provider_actor(provider_id)
  AND status = 'DRAFT'
);

COMMIT;

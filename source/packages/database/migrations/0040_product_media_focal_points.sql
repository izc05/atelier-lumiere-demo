BEGIN;

CREATE TABLE product_media_focal_points (
  media_id uuid PRIMARY KEY REFERENCES product_media(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  focal_x smallint NOT NULL DEFAULT 50 CHECK (focal_x BETWEEN 0 AND 100),
  focal_y smallint NOT NULL DEFAULT 50 CHECK (focal_y BETWEEN 0 AND 100),
  updated_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (media_id, provider_id, product_id)
);

CREATE INDEX product_media_focal_product_idx
  ON product_media_focal_points(product_id, media_id);

CREATE OR REPLACE FUNCTION app.enforce_product_media_focal_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  media_row product_media%ROWTYPE;
  product_status text;
BEGIN
  SELECT * INTO media_row
  FROM product_media
  WHERE id = NEW.media_id;

  IF NOT FOUND
     OR media_row.provider_id IS DISTINCT FROM NEW.provider_id
     OR media_row.product_id IS DISTINCT FROM NEW.product_id
     OR media_row.kind <> 'IMAGE'
     OR media_row.status <> 'READY' THEN
    RAISE EXCEPTION 'PRODUCT_MEDIA_FOCAL_TARGET_INVALID' USING ERRCODE = '23514';
  END IF;

  SELECT status INTO product_status
  FROM products
  WHERE id = NEW.product_id AND provider_id = NEW.provider_id;

  IF NOT app.is_provider_actor(NEW.provider_id)
     OR product_status NOT IN ('DRAFT', 'CHANGES_REQUESTED', 'APPROVED', 'PUBLISHED') THEN
    RAISE EXCEPTION 'PRODUCT_MEDIA_FOCAL_WRITE_NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.media_id IS DISTINCT FROM OLD.media_id
       OR NEW.provider_id IS DISTINCT FROM OLD.provider_id
       OR NEW.product_id IS DISTINCT FROM OLD.product_id THEN
      RAISE EXCEPTION 'PRODUCT_MEDIA_FOCAL_IDENTITY_IMMUTABLE' USING ERRCODE = '23514';
    END IF;
  END IF;

  NEW.updated_by := app.current_user_id();
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER product_media_focal_points_enforce_write
BEFORE INSERT OR UPDATE ON product_media_focal_points
FOR EACH ROW EXECUTE FUNCTION app.enforce_product_media_focal_write();

ALTER TABLE product_media_focal_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_media_focal_points FORCE ROW LEVEL SECURITY;

CREATE POLICY product_media_focal_select_policy ON product_media_focal_points
FOR SELECT USING (
  app.is_provider_actor(provider_id)
  OR (
    app.current_role() = 'CATALOG_READER'
    AND EXISTS (
      SELECT 1
      FROM products product
      INNER JOIN providers provider ON provider.id = product.provider_id
      WHERE product.id = product_media_focal_points.product_id
        AND product.provider_id = product_media_focal_points.provider_id
        AND product.status = 'PUBLISHED'
        AND provider.status = 'ACTIVE'
    )
  )
);

CREATE POLICY product_media_focal_insert_policy ON product_media_focal_points
FOR INSERT WITH CHECK (app.is_provider_actor(provider_id));

CREATE POLICY product_media_focal_update_policy ON product_media_focal_points
FOR UPDATE USING (app.is_provider_actor(provider_id))
WITH CHECK (app.is_provider_actor(provider_id));

GRANT SELECT, INSERT, UPDATE
ON product_media_focal_points
TO atelier_app_runtime;

COMMIT;

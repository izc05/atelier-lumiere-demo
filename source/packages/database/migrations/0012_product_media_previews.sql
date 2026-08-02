BEGIN;

ALTER TABLE product_media
  ADD COLUMN preview_storage_key text,
  ADD COLUMN preview_mime_type text,
  ADD COLUMN preview_size_bytes bigint,
  ADD COLUMN preview_checksum_sha256 text,
  ADD COLUMN preview_width integer,
  ADD COLUMN preview_height integer;

ALTER TABLE product_media
  ADD CONSTRAINT product_media_preview_complete_check
  CHECK (
    (
      preview_storage_key IS NULL
      AND preview_mime_type IS NULL
      AND preview_size_bytes IS NULL
      AND preview_checksum_sha256 IS NULL
      AND preview_width IS NULL
      AND preview_height IS NULL
    )
    OR (
      kind = 'IMAGE'
      AND preview_storage_key IS NOT NULL
      AND char_length(preview_storage_key) BETWEEN 8 AND 500
      AND preview_mime_type = 'image/webp'
      AND preview_size_bytes BETWEEN 1 AND 5242880
      AND preview_checksum_sha256 ~ '^[a-f0-9]{64}$'
      AND preview_width BETWEEN 1 AND 1280
      AND preview_height BETWEEN 1 AND 1280
    )
  );

CREATE UNIQUE INDEX product_media_preview_storage_key_idx
  ON product_media(provider_id, preview_storage_key)
  WHERE preview_storage_key IS NOT NULL;

CREATE OR REPLACE FUNCTION app.enforce_product_media_preview_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  preview_changed boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.preview_storage_key IS NOT NULL
       AND NOT app.is_admin()
       AND app.current_media_upload_id() IS DISTINCT FROM NEW.id THEN
      RAISE EXCEPTION 'PRODUCT_MEDIA_PREVIEW_CONTEXT_REQUIRED' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  preview_changed :=
    NEW.preview_storage_key IS DISTINCT FROM OLD.preview_storage_key
    OR NEW.preview_mime_type IS DISTINCT FROM OLD.preview_mime_type
    OR NEW.preview_size_bytes IS DISTINCT FROM OLD.preview_size_bytes
    OR NEW.preview_checksum_sha256 IS DISTINCT FROM OLD.preview_checksum_sha256
    OR NEW.preview_width IS DISTINCT FROM OLD.preview_width
    OR NEW.preview_height IS DISTINCT FROM OLD.preview_height;

  IF preview_changed AND NOT app.is_admin() THEN
    IF NOT (
      OLD.status = 'PENDING_UPLOAD'
      AND NEW.status = 'READY'
      AND app.current_media_upload_id() IS NOT DISTINCT FROM NEW.id
    ) THEN
      RAISE EXCEPTION 'PRODUCT_MEDIA_PREVIEW_IMMUTABLE' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER product_media_enforce_preview_write
BEFORE INSERT OR UPDATE ON product_media
FOR EACH ROW EXECUTE FUNCTION app.enforce_product_media_preview_write();

COMMIT;

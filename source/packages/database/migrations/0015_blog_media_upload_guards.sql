BEGIN;

ALTER TABLE blog_post_media
  ADD COLUMN upload_expires_at timestamptz;

ALTER TABLE blog_post_media
  ADD CONSTRAINT blog_media_pending_expiry_check CHECK (
    (status = 'PENDING_UPLOAD' AND upload_expires_at IS NOT NULL)
    OR (status <> 'PENDING_UPLOAD' AND upload_expires_at IS NULL)
  ),
  ADD CONSTRAINT blog_media_ready_preview_check CHECK (
    status <> 'READY'
    OR (
      ready_at IS NOT NULL
      AND preview_storage_key IS NOT NULL
      AND preview_mime_type = 'image/webp'
      AND preview_size_bytes IS NOT NULL
      AND preview_checksum_sha256 IS NOT NULL
      AND preview_width IS NOT NULL
      AND preview_height IS NOT NULL
    )
  );

CREATE INDEX blog_post_media_expired_upload_idx
  ON blog_post_media(upload_expires_at)
  WHERE status = 'PENDING_UPLOAD';

CREATE OR REPLACE FUNCTION app.guard_blog_media_internal_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  upload_context text := current_setting('app.blog_media_upload_id', true);
BEGIN
  IF app.is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'PENDING_UPLOAD'
       OR NEW.checksum_sha256 <> repeat('0', 64)
       OR NEW.width IS NOT NULL
       OR NEW.height IS NOT NULL
       OR NEW.preview_storage_key IS NOT NULL
       OR NEW.preview_mime_type IS NOT NULL
       OR NEW.preview_size_bytes IS NOT NULL
       OR NEW.preview_checksum_sha256 IS NOT NULL
       OR NEW.preview_width IS NOT NULL
       OR NEW.preview_height IS NOT NULL
       OR NEW.rejection_reason IS NOT NULL
       OR NEW.ready_at IS NOT NULL
       OR NEW.deleted_at IS NOT NULL
       OR NEW.upload_expires_at IS NULL THEN
      RAISE EXCEPTION 'BLOG_MEDIA_RESERVATION_INVALID' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.provider_id IS DISTINCT FROM OLD.provider_id
     OR NEW.post_id IS DISTINCT FROM OLD.post_id
     OR NEW.mime_type IS DISTINCT FROM OLD.mime_type
     OR NEW.original_filename IS DISTINCT FROM OLD.original_filename
     OR NEW.storage_key IS DISTINCT FROM OLD.storage_key
     OR NEW.uploaded_by IS DISTINCT FROM OLD.uploaded_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'BLOG_MEDIA_IDENTITY_IMMUTABLE' USING ERRCODE = '23514';
  END IF;

  IF upload_context IS DISTINCT FROM OLD.id::text THEN
    IF NEW.size_bytes IS DISTINCT FROM OLD.size_bytes
       OR NEW.checksum_sha256 IS DISTINCT FROM OLD.checksum_sha256
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.width IS DISTINCT FROM OLD.width
       OR NEW.height IS DISTINCT FROM OLD.height
       OR NEW.preview_storage_key IS DISTINCT FROM OLD.preview_storage_key
       OR NEW.preview_mime_type IS DISTINCT FROM OLD.preview_mime_type
       OR NEW.preview_size_bytes IS DISTINCT FROM OLD.preview_size_bytes
       OR NEW.preview_checksum_sha256 IS DISTINCT FROM OLD.preview_checksum_sha256
       OR NEW.preview_width IS DISTINCT FROM OLD.preview_width
       OR NEW.preview_height IS DISTINCT FROM OLD.preview_height
       OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
       OR NEW.ready_at IS DISTINCT FROM OLD.ready_at
       OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
       OR NEW.upload_expires_at IS DISTINCT FROM OLD.upload_expires_at THEN
      RAISE EXCEPTION 'BLOG_MEDIA_INTERNAL_FIELDS_IMMUTABLE' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NOT (
    (OLD.status = 'PENDING_UPLOAD' AND NEW.status IN ('READY', 'REJECTED'))
    OR (OLD.status IN ('READY', 'REJECTED') AND NEW.status = 'DELETED')
  ) THEN
    RAISE EXCEPTION 'BLOG_MEDIA_STATUS_TRANSITION_INVALID' USING ERRCODE = '23514';
  END IF;

  IF NEW.status = 'READY' AND (
    NEW.checksum_sha256 = repeat('0', 64)
    OR NEW.width IS NULL
    OR NEW.height IS NULL
    OR NEW.preview_storage_key IS NULL
    OR NEW.preview_mime_type <> 'image/webp'
    OR NEW.preview_size_bytes IS NULL
    OR NEW.preview_checksum_sha256 IS NULL
    OR NEW.preview_width IS NULL
    OR NEW.preview_height IS NULL
    OR NEW.upload_expires_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'BLOG_MEDIA_READY_INVALID' USING ERRCODE = '23514';
  END IF;

  IF NEW.status = 'REJECTED' AND (
    NEW.rejection_reason IS NULL OR NEW.upload_expires_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'BLOG_MEDIA_REJECTION_INVALID' USING ERRCODE = '23514';
  END IF;

  IF NEW.status = 'DELETED' AND NEW.upload_expires_at IS NOT NULL THEN
    RAISE EXCEPTION 'BLOG_MEDIA_DELETE_INVALID' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER blog_post_media_00_guard_internal
BEFORE INSERT OR UPDATE ON blog_post_media
FOR EACH ROW EXECUTE FUNCTION app.guard_blog_media_internal_fields();

CREATE OR REPLACE FUNCTION app.enforce_blog_media_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  row_provider_id uuid;
  row_post_id uuid;
  post_status text;
  active_count integer;
BEGIN
  row_provider_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.provider_id ELSE NEW.provider_id END;
  row_post_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.post_id ELSE NEW.post_id END;

  IF TG_OP = 'DELETE' AND NOT app.is_admin() THEN
    RAISE EXCEPTION 'BLOG_MEDIA_HARD_DELETE_NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;

  IF NOT app.is_admin() THEN
    SELECT status INTO post_status
      FROM blog_posts
     WHERE id = row_post_id AND provider_id = row_provider_id;

    IF NOT app.is_provider_actor(row_provider_id)
       OR post_status NOT IN ('DRAFT', 'CHANGES_REQUESTED') THEN
      RAISE EXCEPTION 'BLOG_POST_CHILD_WRITE_NOT_ALLOWED' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  IF NOT app.is_admin() AND NEW.uploaded_by IS DISTINCT FROM app.current_user_id() THEN
    RAISE EXCEPTION 'BLOG_MEDIA_UPLOADER_INVALID' USING ERRCODE = '42501';
  END IF;

  IF NEW.status <> 'DELETED' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.post_id::text, 1));
    SELECT COUNT(*) INTO active_count
      FROM blog_post_media
     WHERE post_id = NEW.post_id
       AND status <> 'DELETED'
       AND id <> NEW.id;
    IF active_count >= 12 THEN
      RAISE EXCEPTION 'BLOG_IMAGE_LIMIT_EXCEEDED' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.status = 'READY' AND OLD.status IS DISTINCT FROM 'READY' THEN
    NEW.ready_at := now();
  END IF;
  IF NEW.status = 'DELETED' AND OLD.status IS DISTINCT FROM 'DELETED' THEN
    NEW.deleted_at := now();
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;

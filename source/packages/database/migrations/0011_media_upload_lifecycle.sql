BEGIN;

CREATE OR REPLACE FUNCTION app.current_media_upload_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.media_upload_id', true), '')::uuid;
$$;

ALTER TABLE product_media
  ADD COLUMN upload_expires_at timestamptz;

ALTER TABLE product_media
  ADD CONSTRAINT product_media_pending_upload_expiry_check
  CHECK (status <> 'PENDING_UPLOAD' OR upload_expires_at IS NOT NULL)
  NOT VALID;

ALTER TABLE product_media
  VALIDATE CONSTRAINT product_media_pending_upload_expiry_check;

CREATE INDEX product_media_pending_expiry_idx
  ON product_media(upload_expires_at)
  WHERE status = 'PENDING_UPLOAD';

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
     OR OLD.status NOT IN ('DRAFT', 'CHANGES_REQUESTED')
     OR NEW.status NOT IN ('DRAFT', 'CHANGES_REQUESTED', 'IN_REVIEW') THEN
    RAISE EXCEPTION 'PRODUCT_UPDATE_NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;

  IF NEW.status = 'IN_REVIEW' AND OLD.status <> 'IN_REVIEW' THEN
    SELECT COUNT(*) FILTER (WHERE kind = 'IMAGE' AND status = 'READY'),
           COUNT(*) FILTER (
             WHERE status = 'PENDING_UPLOAD'
               AND upload_expires_at > now()
           )
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
  upload_context_matches boolean;
  content_changed boolean;
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

  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.provider_id IS DISTINCT FROM OLD.provider_id
       OR NEW.product_id IS DISTINCT FROM OLD.product_id
       OR NEW.uploaded_by IS DISTINCT FROM OLD.uploaded_by
       OR NEW.storage_key IS DISTINCT FROM OLD.storage_key
       OR NEW.original_filename IS DISTINCT FROM OLD.original_filename
       OR NEW.kind IS DISTINCT FROM OLD.kind
       OR NEW.mime_type IS DISTINCT FROM OLD.mime_type THEN
      RAISE EXCEPTION 'PRODUCT_MEDIA_IDENTITY_IMMUTABLE' USING ERRCODE = '23514';
    END IF;

    IF NOT (
      (OLD.status = 'PENDING_UPLOAD' AND NEW.status IN ('PENDING_UPLOAD', 'READY', 'REJECTED', 'DELETED'))
      OR (OLD.status = 'READY' AND NEW.status IN ('READY', 'DELETED'))
      OR (OLD.status = 'REJECTED' AND NEW.status IN ('REJECTED', 'DELETED'))
      OR (OLD.status = 'DELETED' AND NEW.status = 'DELETED')
    ) THEN
      RAISE EXCEPTION 'PRODUCT_MEDIA_STATUS_TRANSITION_NOT_ALLOWED' USING ERRCODE = '23514';
    END IF;

    upload_context_matches := app.current_media_upload_id() IS NOT DISTINCT FROM NEW.id;
    content_changed :=
      NEW.size_bytes IS DISTINCT FROM OLD.size_bytes
      OR NEW.checksum_sha256 IS DISTINCT FROM OLD.checksum_sha256
      OR NEW.width IS DISTINCT FROM OLD.width
      OR NEW.height IS DISTINCT FROM OLD.height
      OR NEW.duration_seconds IS DISTINCT FROM OLD.duration_seconds;

    IF content_changed AND NOT (
      OLD.status = 'PENDING_UPLOAD'
      AND NEW.status IN ('READY', 'REJECTED')
      AND upload_context_matches
    ) THEN
      RAISE EXCEPTION 'PRODUCT_MEDIA_CONTENT_IMMUTABLE' USING ERRCODE = '23514';
    END IF;

    IF OLD.status = 'PENDING_UPLOAD'
       AND NEW.status IN ('READY', 'REJECTED')
       AND NOT upload_context_matches THEN
      RAISE EXCEPTION 'PRODUCT_MEDIA_UPLOAD_CONTEXT_REQUIRED' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.status IN ('PENDING_UPLOAD', 'READY') THEN
    target_kind := NEW.kind;
    PERFORM pg_advisory_xact_lock(hashtextextended(target_product::text, 0));

    SELECT COUNT(*) INTO active_count
      FROM product_media
     WHERE product_id = target_product
       AND kind = target_kind
       AND id <> NEW.id
       AND (
         status = 'READY'
         OR (status = 'PENDING_UPLOAD' AND upload_expires_at > now())
       );

    IF target_kind = 'IMAGE' AND active_count >= 8 THEN
      RAISE EXCEPTION 'PRODUCT_IMAGE_LIMIT_EXCEEDED' USING ERRCODE = '23514';
    END IF;
    IF target_kind = 'VIDEO' AND active_count >= 1 THEN
      RAISE EXCEPTION 'PRODUCT_VIDEO_LIMIT_EXCEEDED' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'READY' THEN
      NEW.ready_at := COALESCE(NEW.ready_at, now());
      NEW.upload_expires_at := NULL;
    ELSIF NEW.status = 'REJECTED' THEN
      NEW.upload_expires_at := NULL;
    ELSIF NEW.status = 'DELETED' THEN
      NEW.deleted_at := COALESCE(NEW.deleted_at, now());
      NEW.upload_expires_at := NULL;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status = 'READY' AND OLD.status IS DISTINCT FROM 'READY' THEN
    NEW.ready_at := now();
    NEW.rejection_reason := NULL;
    NEW.upload_expires_at := NULL;
  ELSIF NEW.status = 'REJECTED' AND OLD.status IS DISTINCT FROM 'REJECTED' THEN
    NEW.ready_at := NULL;
    NEW.upload_expires_at := NULL;
  ELSIF NEW.status = 'DELETED' AND OLD.status IS DISTINCT FROM 'DELETED' THEN
    NEW.deleted_at := now();
    NEW.upload_expires_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;

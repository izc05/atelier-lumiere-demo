BEGIN;

ALTER TABLE custom_request_files
  ADD COLUMN upload_expires_at timestamptz;

CREATE INDEX custom_request_files_active_limit_idx
  ON custom_request_files(request_id, created_at)
  WHERE status IN ('PENDING_UPLOAD', 'READY');

CREATE OR REPLACE FUNCTION app.enforce_custom_request_file_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  upload_context text := current_setting('app.custom_request_file_upload_id', true);
  active_files integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT app.can_access_order(NEW.provider_id, NEW.customer_user_id)
       OR NEW.uploaded_by IS DISTINCT FROM app.current_user_id()
       OR NEW.status <> 'PENDING_UPLOAD'
       OR NEW.checksum_sha256 <> repeat('0', 64)
       OR NEW.ready_at IS NOT NULL
       OR NEW.deleted_at IS NOT NULL
       OR NEW.rejection_reason IS NOT NULL
       OR NEW.upload_expires_at IS NULL THEN
      RAISE EXCEPTION 'CUSTOM_REQUEST_FILE_INSERT_NOT_ALLOWED' USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM custom_requests request
      WHERE request.id = NEW.request_id
        AND request.order_id = NEW.order_id
        AND request.provider_id = NEW.provider_id
        AND request.customer_user_id = NEW.customer_user_id
        AND request.status NOT IN ('COMPLETED', 'CANCELLED')
    ) THEN
      RAISE EXCEPTION 'CUSTOM_REQUEST_FILE_SCOPE_INVALID' USING ERRCODE = '23503';
    END IF;

    SELECT count(*)::integer INTO active_files
    FROM custom_request_files file
    WHERE file.request_id = NEW.request_id
      AND file.status IN ('PENDING_UPLOAD', 'READY');

    IF active_files >= 12 THEN
      RAISE EXCEPTION 'CUSTOM_REQUEST_FILE_LIMIT_EXCEEDED' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.request_id IS DISTINCT FROM OLD.request_id
     OR NEW.message_id IS DISTINCT FROM OLD.message_id
     OR NEW.order_id IS DISTINCT FROM OLD.order_id
     OR NEW.provider_id IS DISTINCT FROM OLD.provider_id
     OR NEW.customer_user_id IS DISTINCT FROM OLD.customer_user_id
     OR NEW.uploaded_by IS DISTINCT FROM OLD.uploaded_by
     OR NEW.mime_type IS DISTINCT FROM OLD.mime_type
     OR NEW.original_filename IS DISTINCT FROM OLD.original_filename
     OR NEW.storage_key IS DISTINCT FROM OLD.storage_key
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'CUSTOM_REQUEST_FILE_IDENTITY_IMMUTABLE' USING ERRCODE = '23514';
  END IF;

  IF upload_context = OLD.id::text AND OLD.status = 'PENDING_UPLOAD' THEN
    IF NEW.status NOT IN ('READY', 'REJECTED') THEN
      RAISE EXCEPTION 'CUSTOM_REQUEST_FILE_FINALIZATION_INVALID' USING ERRCODE = '23514';
    END IF;
    IF NEW.status = 'READY' AND (
      NEW.checksum_sha256 = repeat('0', 64)
      OR NEW.ready_at IS NULL
      OR NEW.rejection_reason IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'CUSTOM_REQUEST_FILE_READY_INVALID' USING ERRCODE = '23514';
    END IF;
    IF NEW.status = 'REJECTED' AND (
      NEW.rejection_reason IS NULL
      OR NEW.ready_at IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'CUSTOM_REQUEST_FILE_REJECTION_INVALID' USING ERRCODE = '23514';
    END IF;
    NEW.upload_expires_at := NULL;
    RETURN NEW;
  END IF;

  IF app.can_access_order(OLD.provider_id, OLD.customer_user_id)
     AND OLD.status IN ('PENDING_UPLOAD', 'READY', 'REJECTED')
     AND NEW.status = 'DELETED' THEN
    NEW.deleted_at := COALESCE(NEW.deleted_at, now());
    NEW.upload_expires_at := NULL;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'CUSTOM_REQUEST_FILE_UPDATE_NOT_ALLOWED' USING ERRCODE = '42501';
END;
$$;

CREATE TRIGGER custom_request_files_write_guard
BEFORE INSERT OR UPDATE ON custom_request_files
FOR EACH ROW EXECUTE FUNCTION app.enforce_custom_request_file_write();

COMMIT;

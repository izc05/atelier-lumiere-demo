BEGIN;

CREATE OR REPLACE FUNCTION app.enforce_custom_request_file_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  request_row custom_requests%ROWTYPE;
  active_files integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT * INTO request_row
    FROM custom_requests
    WHERE id = NEW.request_id
      AND order_id = NEW.order_id
      AND provider_id = NEW.provider_id
      AND customer_user_id = NEW.customer_user_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'REQUEST_FILE_SCOPE_INVALID' USING ERRCODE = '23503';
    END IF;

    IF NOT app.is_admin() AND (
      NEW.uploaded_by IS DISTINCT FROM app.current_user_id()
      OR NOT app.can_access_order(NEW.provider_id, NEW.customer_user_id)
    ) THEN
      RAISE EXCEPTION 'REQUEST_FILE_INSERT_NOT_ALLOWED' USING ERRCODE = '42501';
    END IF;

    IF request_row.status IN ('COMPLETED', 'CANCELLED') THEN
      RAISE EXCEPTION 'REQUEST_FILE_REQUEST_LOCKED' USING ERRCODE = '23514';
    END IF;

    IF NEW.message_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM custom_request_messages message
      WHERE message.id = NEW.message_id
        AND message.request_id = NEW.request_id
        AND message.order_id = NEW.order_id
        AND message.provider_id = NEW.provider_id
        AND message.customer_user_id = NEW.customer_user_id
    ) THEN
      RAISE EXCEPTION 'REQUEST_FILE_MESSAGE_SCOPE_INVALID' USING ERRCODE = '23503';
    END IF;

    SELECT count(*)::integer INTO active_files
    FROM custom_request_files file
    WHERE file.request_id = NEW.request_id
      AND file.status <> 'DELETED';
    IF active_files >= 20 THEN
      RAISE EXCEPTION 'REQUEST_FILE_LIMIT_EXCEEDED' USING ERRCODE = '23514';
    END IF;

    IF NEW.status <> 'READY'
       OR NEW.ready_at IS NULL
       OR NEW.deleted_at IS NOT NULL
       OR NEW.rejection_reason IS NOT NULL
       OR NEW.storage_key !~ ('^providers/' || NEW.provider_id::text || '/requests/' || NEW.request_id::text || '/' || NEW.id::text || '/original[.](jpg|png|webp|pdf)$') THEN
      RAISE EXCEPTION 'REQUEST_FILE_METADATA_INVALID' USING ERRCODE = '23514';
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
     OR NEW.size_bytes IS DISTINCT FROM OLD.size_bytes
     OR NEW.checksum_sha256 IS DISTINCT FROM OLD.checksum_sha256
     OR NEW.ready_at IS DISTINCT FROM OLD.ready_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'REQUEST_FILE_IDENTITY_IMMUTABLE' USING ERRCODE = '23514';
  END IF;

  IF NOT app.is_admin() AND (
    OLD.uploaded_by IS DISTINCT FROM app.current_user_id()
    OR NOT app.can_access_order(OLD.provider_id, OLD.customer_user_id)
  ) THEN
    RAISE EXCEPTION 'REQUEST_FILE_UPDATE_NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;

  IF OLD.status <> 'READY'
     OR NEW.status <> 'DELETED'
     OR NEW.deleted_at IS NULL THEN
    RAISE EXCEPTION 'REQUEST_FILE_STATUS_TRANSITION_INVALID' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS custom_request_files_guard ON custom_request_files;
CREATE TRIGGER custom_request_files_guard
BEFORE INSERT OR UPDATE ON custom_request_files
FOR EACH ROW EXECUTE FUNCTION app.enforce_custom_request_file_write();

CREATE INDEX IF NOT EXISTS custom_request_files_active_idx
  ON custom_request_files(request_id, created_at, id)
  WHERE status = 'READY';

COMMIT;

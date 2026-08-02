BEGIN;

DROP INDEX blog_post_one_cover_idx;
CREATE UNIQUE INDEX blog_post_one_cover_idx
  ON blog_post_media(post_id)
  WHERE placement = 'COVER' AND status IN ('PENDING_UPLOAD', 'READY');

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

  IF NEW.status IN ('PENDING_UPLOAD', 'READY') THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.post_id::text, 1));
    SELECT COUNT(*) INTO active_count
      FROM blog_post_media
     WHERE post_id = NEW.post_id
       AND status IN ('PENDING_UPLOAD', 'READY')
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

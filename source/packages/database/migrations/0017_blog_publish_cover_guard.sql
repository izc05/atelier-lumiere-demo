BEGIN;

CREATE OR REPLACE FUNCTION app.require_blog_cover_before_publish()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'PUBLISHED' AND OLD.status IS DISTINCT FROM 'PUBLISHED' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM blog_post_media
      WHERE post_id = NEW.id
        AND provider_id = NEW.provider_id
        AND placement = 'COVER'
        AND status = 'READY'
        AND preview_mime_type = 'image/webp'
    ) THEN
      RAISE EXCEPTION 'BLOG_POST_COVER_REQUIRED' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER blog_posts_require_cover
BEFORE UPDATE ON blog_posts
FOR EACH ROW EXECUTE FUNCTION app.require_blog_cover_before_publish();

COMMIT;

BEGIN;

CREATE OR REPLACE FUNCTION app.guard_blog_post_workflow()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  approved_review_exists boolean;
BEGIN
  IF TG_OP <> 'UPDATE' OR NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF app.is_admin() AND NEW.status IN ('APPROVED', 'PUBLISHED') THEN
    SELECT EXISTS (
      SELECT 1
      FROM blog_post_reviews
      WHERE post_id = OLD.id
        AND status = 'APPROVED'
    ) INTO approved_review_exists;

    IF NOT approved_review_exists THEN
      RAISE EXCEPTION 'BLOG_REVIEW_APPROVAL_REQUIRED' USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER blog_posts_00_review_guard
BEFORE UPDATE ON blog_posts
FOR EACH ROW EXECUTE FUNCTION app.guard_blog_post_workflow();

COMMIT;

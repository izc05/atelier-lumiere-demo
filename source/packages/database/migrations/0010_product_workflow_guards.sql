BEGIN;

CREATE OR REPLACE FUNCTION app.guard_product_workflow()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  approved_review_exists boolean;
  ready_images integer;
  unfinished_media integer;
BEGIN
  IF TG_OP <> 'UPDATE' OR NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NOT app.is_admin() THEN
    IF NOT (
      (OLD.status = 'DRAFT' AND NEW.status IN ('DRAFT', 'IN_REVIEW'))
      OR (OLD.status = 'CHANGES_REQUESTED' AND NEW.status IN ('DRAFT', 'CHANGES_REQUESTED', 'IN_REVIEW'))
    ) THEN
      RAISE EXCEPTION 'PROVIDER_PRODUCT_STATUS_NOT_ALLOWED' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status IN ('APPROVED', 'PUBLISHED') THEN
    SELECT EXISTS (
      SELECT 1
      FROM product_reviews
      WHERE product_id = OLD.id
        AND status = 'APPROVED'
    ) INTO approved_review_exists;

    IF NOT approved_review_exists THEN
      RAISE EXCEPTION 'PRODUCT_REVIEW_APPROVAL_REQUIRED' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.status = 'PUBLISHED' THEN
    SELECT COUNT(*) FILTER (WHERE kind = 'IMAGE' AND status = 'READY'),
           COUNT(*) FILTER (WHERE status IN ('PENDING_UPLOAD', 'REJECTED'))
      INTO ready_images, unfinished_media
      FROM product_media
      WHERE product_id = OLD.id;

    IF ready_images < 1 OR unfinished_media > 0 THEN
      RAISE EXCEPTION 'PRODUCT_MEDIA_NOT_READY_FOR_PUBLICATION' USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER products_00_workflow_guard
BEFORE UPDATE ON products
FOR EACH ROW EXECUTE FUNCTION app.guard_product_workflow();

CREATE OR REPLACE FUNCTION app.guard_product_review_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.provider_id IS DISTINCT FROM OLD.provider_id
     OR NEW.product_id IS DISTINCT FROM OLD.product_id
     OR NEW.submission_number IS DISTINCT FROM OLD.submission_number
     OR NEW.submitted_by IS DISTINCT FROM OLD.submitted_by
     OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at THEN
    RAISE EXCEPTION 'PRODUCT_REVIEW_IDENTITY_IMMUTABLE' USING ERRCODE = '23514';
  END IF;

  IF NOT app.is_admin() THEN
    RAISE EXCEPTION 'PRODUCT_REVIEW_UPDATE_NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;

  IF OLD.status <> 'PENDING'
     OR NEW.status NOT IN ('APPROVED', 'CHANGES_REQUESTED', 'REJECTED') THEN
    RAISE EXCEPTION 'PRODUCT_REVIEW_TRANSITION_NOT_ALLOWED' USING ERRCODE = '23514';
  END IF;

  NEW.reviewed_by := app.current_user_id();
  NEW.reviewed_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER product_reviews_00_update_guard
BEFORE UPDATE ON product_reviews
FOR EACH ROW EXECUTE FUNCTION app.guard_product_review_update();

COMMIT;

BEGIN;

CREATE OR REPLACE FUNCTION app.enforce_custom_request_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT app.is_admin() AND (
      NOT app.is_customer_actor(NEW.customer_user_id)
      OR NEW.status <> 'OPEN'
    ) THEN
      RAISE EXCEPTION 'CUSTOM_REQUEST_INSERT_NOT_ALLOWED' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.order_id IS DISTINCT FROM OLD.order_id
     OR NEW.order_item_id IS DISTINCT FROM OLD.order_item_id
     OR NEW.provider_id IS DISTINCT FROM OLD.provider_id
     OR NEW.customer_user_id IS DISTINCT FROM OLD.customer_user_id
     OR NEW.title IS DISTINCT FROM OLD.title
     OR NEW.brief IS DISTINCT FROM OLD.brief
     OR NEW.desired_date IS DISTINCT FROM OLD.desired_date
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'CUSTOM_REQUEST_IDENTITY_IMMUTABLE' USING ERRCODE = '23514';
  END IF;

  IF app.is_customer_actor(OLD.customer_user_id) THEN
    IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
      (OLD.status IN ('OPEN', 'NEEDS_INFO', 'QUOTED') AND NEW.status = 'CANCELLED')
      OR (OLD.status = 'QUOTED' AND NEW.status = 'APPROVED')
    ) THEN
      RAISE EXCEPTION 'CUSTOM_REQUEST_CUSTOMER_UPDATE_NOT_ALLOWED' USING ERRCODE = '42501';
    END IF;
    IF NEW.quoted_price_cents IS DISTINCT FROM OLD.quoted_price_cents THEN
      RAISE EXCEPTION 'CUSTOM_REQUEST_CUSTOMER_QUOTE_IMMUTABLE' USING ERRCODE = '42501';
    END IF;
  ELSIF app.is_admin() THEN
    IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
      (OLD.status = 'OPEN' AND NEW.status IN ('NEEDS_INFO', 'QUOTED', 'CANCELLED'))
      OR (OLD.status = 'NEEDS_INFO' AND NEW.status IN ('OPEN', 'QUOTED', 'CANCELLED'))
      OR (OLD.status = 'QUOTED' AND NEW.status IN ('APPROVED', 'NEEDS_INFO', 'CANCELLED'))
      OR (OLD.status = 'APPROVED' AND NEW.status IN ('IN_PROGRESS', 'CANCELLED'))
      OR (OLD.status = 'IN_PROGRESS' AND NEW.status IN ('COMPLETED', 'CANCELLED'))
    ) THEN
      RAISE EXCEPTION 'CUSTOM_REQUEST_STATUS_TRANSITION_NOT_ALLOWED' USING ERRCODE = '23514';
    END IF;
  ELSIF app.is_provider_actor(OLD.provider_id) THEN
    IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
      (OLD.status = 'OPEN' AND NEW.status IN ('NEEDS_INFO', 'QUOTED', 'CANCELLED'))
      OR (OLD.status = 'NEEDS_INFO' AND NEW.status IN ('OPEN', 'QUOTED', 'CANCELLED'))
      OR (OLD.status = 'QUOTED' AND NEW.status IN ('NEEDS_INFO', 'CANCELLED'))
      OR (OLD.status = 'APPROVED' AND NEW.status IN ('IN_PROGRESS', 'CANCELLED'))
      OR (OLD.status = 'IN_PROGRESS' AND NEW.status IN ('COMPLETED', 'CANCELLED'))
    ) THEN
      RAISE EXCEPTION 'CUSTOM_REQUEST_PROVIDER_UPDATE_NOT_ALLOWED' USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'CUSTOM_REQUEST_UPDATE_NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;

  NEW.version := OLD.version + 1;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

COMMIT;

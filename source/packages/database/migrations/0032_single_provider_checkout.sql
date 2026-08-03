BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM provider_orders first_order
    INNER JOIN provider_orders other_order
      ON other_order.checkout_id = first_order.checkout_id
     AND other_order.provider_id <> first_order.provider_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'provider_orders_single_provider_checkout',
      MESSAGE = 'existing_checkout_contains_multiple_providers';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION app.enforce_single_provider_checkout()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM provider_orders existing_order
    WHERE existing_order.checkout_id = NEW.checkout_id
      AND existing_order.provider_id <> NEW.provider_id
      AND existing_order.id <> NEW.id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'provider_orders_single_provider_checkout',
      MESSAGE = 'checkout_batch_must_use_single_provider';
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS provider_orders_single_provider_checkout
  ON provider_orders;

CREATE TRIGGER provider_orders_single_provider_checkout
BEFORE INSERT OR UPDATE OF checkout_id, provider_id
ON provider_orders
FOR EACH ROW
EXECUTE FUNCTION app.enforce_single_provider_checkout();

COMMIT;

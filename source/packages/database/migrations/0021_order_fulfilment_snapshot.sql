BEGIN;

ALTER TABLE provider_orders
  ADD COLUMN customer_name text NOT NULL
    CHECK (char_length(customer_name) BETWEEN 2 AND 160),
  ADD COLUMN contact_email citext NOT NULL,
  ADD COLUMN contact_phone text
    CHECK (contact_phone IS NULL OR char_length(contact_phone) BETWEEN 6 AND 40),
  ADD COLUMN shipping_address jsonb NOT NULL
    CHECK (jsonb_typeof(shipping_address) = 'object');

CREATE OR REPLACE FUNCTION app.enforce_order_fulfilment_snapshot()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  checkout_row checkout_batches%ROWTYPE;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT * INTO checkout_row
    FROM checkout_batches
    WHERE id = NEW.checkout_id
      AND customer_user_id = NEW.customer_user_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'ORDER_CHECKOUT_NOT_FOUND' USING ERRCODE = '23503';
    END IF;

    IF NEW.currency IS DISTINCT FROM checkout_row.currency
       OR NEW.customer_name IS DISTINCT FROM checkout_row.customer_name
       OR NEW.contact_email IS DISTINCT FROM checkout_row.contact_email
       OR NEW.contact_phone IS DISTINCT FROM checkout_row.contact_phone
       OR NEW.shipping_address IS DISTINCT FROM checkout_row.shipping_address THEN
      RAISE EXCEPTION 'ORDER_CHECKOUT_SNAPSHOT_MISMATCH' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.customer_name IS DISTINCT FROM OLD.customer_name
     OR NEW.contact_email IS DISTINCT FROM OLD.contact_email
     OR NEW.contact_phone IS DISTINCT FROM OLD.contact_phone
     OR NEW.shipping_address IS DISTINCT FROM OLD.shipping_address THEN
    RAISE EXCEPTION 'ORDER_FULFILMENT_SNAPSHOT_IMMUTABLE' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER provider_orders_fulfilment_guard
BEFORE INSERT OR UPDATE ON provider_orders
FOR EACH ROW EXECUTE FUNCTION app.enforce_order_fulfilment_snapshot();

COMMIT;

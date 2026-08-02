BEGIN;

CREATE OR REPLACE FUNCTION app.customer_has_order_with_provider(target_provider_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT app.current_role() = 'CUSTOMER'
    AND EXISTS (
      SELECT 1
      FROM provider_orders customer_order
      WHERE customer_order.provider_id = target_provider_id
        AND customer_order.customer_user_id = app.current_user_id()
    );
$$;

REVOKE ALL ON FUNCTION app.customer_has_order_with_provider(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.customer_has_order_with_provider(uuid) TO atelier_app_runtime;

CREATE POLICY providers_customer_order_select ON providers
FOR SELECT
USING (app.customer_has_order_with_provider(id));

COMMIT;

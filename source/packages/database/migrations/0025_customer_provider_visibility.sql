BEGIN;

CREATE POLICY providers_customer_order_select ON providers
FOR SELECT
USING (
  app.current_role() = 'CUSTOMER'
  AND EXISTS (
    SELECT 1
    FROM provider_orders customer_order
    WHERE customer_order.provider_id = providers.id
      AND customer_order.customer_user_id = app.current_user_id()
  )
);

COMMIT;

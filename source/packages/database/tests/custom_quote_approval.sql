BEGIN;

SET LOCAL ROLE atelier_app_runtime;
SELECT set_config('app.role', 'ADMIN', true);
SELECT set_config('app.user_id', '00000000-0000-4000-8000-000000000001', true);
SELECT set_config('app.provider_id', '', true);

INSERT INTO users (
  id, email, display_name, status, email_verified_at, two_factor_enabled
) VALUES (
  '00000000-0000-4000-8000-000000000004',
  'cliente-presupuesto@example.test',
  'Cliente presupuesto',
  'ACTIVE',
  now(),
  false
);

INSERT INTO checkout_batches (
  id, customer_user_id, checkout_reference, currency,
  customer_name, contact_email, shipping_address,
  status, submitted_at
) VALUES (
  '50000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000004',
  'AL-CHECKOUT-QUOTE-TEST-01',
  'EUR',
  'Cliente presupuesto',
  'cliente-presupuesto@example.test',
  '{"line1":"Calle presupuesto 4","city":"Granada","postalCode":"18001","country":"ES"}'::jsonb,
  'SUBMITTED',
  now()
);

INSERT INTO provider_orders (
  id, checkout_id, provider_id, customer_user_id, order_number,
  status, currency, subtotal_cents, shipping_cents, total_cents,
  customer_name, contact_email, shipping_address
) VALUES (
  '51000000-0000-4000-8000-000000000004',
  '50000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000004',
  'AL-QUOTE-ORDER-TEST-01',
  'PENDING_CONFIRMATION',
  'EUR', 4800, 0, 4800,
  'Cliente presupuesto',
  'cliente-presupuesto@example.test',
  '{"line1":"Calle presupuesto 4","city":"Granada","postalCode":"18001","country":"ES"}'::jsonb
);

INSERT INTO order_items (
  id, order_id, provider_id, customer_user_id, item_type,
  product_name, quantity, unit_price_cents, line_total_cents,
  currency, personalization
) VALUES (
  '52000000-0000-4000-8000-000000000004',
  '51000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000004',
  'CUSTOM',
  'Diseño presupuestado',
  1, 4800, 4800, 'EUR',
  '{"finish":"mate"}'::jsonb
);

INSERT INTO custom_requests (
  id, order_id, order_item_id, provider_id, customer_user_id,
  title, brief
) VALUES (
  '53000000-0000-4000-8000-000000000004',
  '51000000-0000-4000-8000-000000000004',
  '52000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000004',
  'Diseño con presupuesto',
  'El cliente solicita una pieza personalizada y debe aprobar personalmente el presupuesto emitido.'
);

SELECT set_config('app.role', 'PROVIDER_OWNER', true);
SELECT set_config('app.user_id', '00000000-0000-4000-8000-000000000101', true);
SELECT set_config('app.provider_id', '00000000-0000-4000-8000-000000000201', true);

UPDATE custom_requests
SET status = 'QUOTED', quoted_price_cents = 4800
WHERE id = '53000000-0000-4000-8000-000000000004';

DO $$
BEGIN
  BEGIN
    UPDATE custom_requests
    SET status = 'APPROVED'
    WHERE id = '53000000-0000-4000-8000-000000000004';
    RAISE EXCEPTION 'El taller ha aprobado su propio presupuesto';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;

SELECT set_config('app.role', 'CUSTOMER', true);
SELECT set_config('app.user_id', '00000000-0000-4000-8000-000000000004', true);
SELECT set_config('app.provider_id', '', true);

UPDATE custom_requests
SET status = 'APPROVED'
WHERE id = '53000000-0000-4000-8000-000000000004';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM custom_requests
    WHERE id = '53000000-0000-4000-8000-000000000004'
      AND status = 'APPROVED'
      AND quoted_price_cents = 4800
  ) THEN
    RAISE EXCEPTION 'El cliente no ha podido aprobar el presupuesto vigente';
  END IF;
END;
$$;

RESET ROLE;
ROLLBACK;

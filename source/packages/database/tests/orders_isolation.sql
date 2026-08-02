BEGIN;

SET LOCAL ROLE atelier_app_runtime;
SELECT set_config('app.role', 'ADMIN', true);
SELECT set_config('app.user_id', '00000000-0000-4000-8000-000000000001', true);
SELECT set_config('app.provider_id', '', true);

INSERT INTO users (
  id, email, display_name, status, email_verified_at, two_factor_enabled
) VALUES (
  '00000000-0000-4000-8000-000000000003',
  'cliente-pedidos@example.test',
  'Cliente de prueba',
  'ACTIVE',
  now(),
  false
);

INSERT INTO checkout_batches (
  id, customer_user_id, checkout_reference, currency,
  customer_name, contact_email, contact_phone, shipping_address,
  status, submitted_at
) VALUES (
  '50000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000003',
  'AL-CHECKOUT-TEST-ORDER-0001',
  'EUR',
  'Cliente de prueba',
  'cliente-prueba@example.test',
  '+34000000000',
  '{"line1":"Calle de prueba 1","city":"Granada","postalCode":"18001","country":"ES"}'::jsonb,
  'SUBMITTED',
  now()
);

INSERT INTO provider_orders (
  id, checkout_id, provider_id, customer_user_id, order_number,
  status, currency, subtotal_cents, shipping_cents, total_cents,
  preparation_min_days, preparation_max_days, customer_note,
  customer_name, contact_email, contact_phone, shipping_address
) VALUES
(
  '51000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000003',
  'AL-TEST-ORDER-A-0001',
  'PENDING_CONFIRMATION',
  'EUR', 4500, 500, 5000, 3, 7,
  'Preparar para regalo.',
  'Cliente de prueba', 'cliente-prueba@example.test', '+34000000000',
  '{"line1":"Calle de prueba 1","city":"Granada","postalCode":"18001","country":"ES"}'::jsonb
),
(
  '51000000-0000-4000-8000-000000000002',
  '50000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000202',
  '00000000-0000-4000-8000-000000000003',
  'AL-TEST-ORDER-B-0001',
  'PENDING_CONFIRMATION',
  'EUR', 3200, 400, 3600, 5, 10,
  '',
  'Cliente de prueba', 'cliente-prueba@example.test', '+34000000000',
  '{"line1":"Calle de prueba 1","city":"Granada","postalCode":"18001","country":"ES"}'::jsonb
);

INSERT INTO order_items (
  id, order_id, provider_id, customer_user_id, item_type,
  product_name, quantity, unit_price_cents, line_total_cents,
  currency, personalization
) VALUES
(
  '52000000-0000-4000-8000-000000000001',
  '51000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000003',
  'CUSTOM', 'Bordado personalizado', 1, 4500, 4500, 'EUR',
  '{"name":"Adriana","thread":"rosa"}'::jsonb
),
(
  '52000000-0000-4000-8000-000000000002',
  '51000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000202',
  '00000000-0000-4000-8000-000000000003',
  'CUSTOM', 'Lámina personalizada', 1, 3200, 3200, 'EUR',
  '{"text":"Familia"}'::jsonb
);

INSERT INTO custom_requests (
  id, order_id, order_item_id, provider_id, customer_user_id,
  title, brief, desired_date
) VALUES (
  '53000000-0000-4000-8000-000000000001',
  '51000000-0000-4000-8000-000000000001',
  '52000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000003',
  'Bordado con nombre',
  'Necesito bordar el nombre indicado y mantener la tipografía suave de la muestra.',
  current_date + 30
);

INSERT INTO custom_request_messages (
  id, request_id, order_id, provider_id, customer_user_id,
  author_user_id, author_role, body
) VALUES (
  '54000000-0000-4000-8000-000000000001',
  '53000000-0000-4000-8000-000000000001',
  '51000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000000001',
  'ADMIN',
  'Conversación inicial creada para la prueba de aislamiento.'
);

SELECT set_config('app.role', 'PROVIDER_OWNER', true);
SELECT set_config('app.user_id', '00000000-0000-4000-8000-000000000101', true);
SELECT set_config('app.provider_id', '00000000-0000-4000-8000-000000000201', true);

DO $$
BEGIN
  IF (SELECT count(*) FROM provider_orders) <> 1 THEN
    RAISE EXCEPTION 'El taller A debe ver exactamente un pedido';
  END IF;
  IF EXISTS (
    SELECT 1 FROM provider_orders
    WHERE provider_id = '00000000-0000-4000-8000-000000000202'
  ) THEN
    RAISE EXCEPTION 'El taller A ha visto el pedido del taller B';
  END IF;
  IF (SELECT count(*) FROM custom_requests) <> 1 THEN
    RAISE EXCEPTION 'El taller A debe ver únicamente su encargo';
  END IF;
END;
$$;

UPDATE provider_orders
SET status = 'ACCEPTED', provider_note = 'Pedido aceptado por el taller.'
WHERE id = '51000000-0000-4000-8000-000000000001';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM order_events
    WHERE order_id = '51000000-0000-4000-8000-000000000001'
      AND event_type = 'ORDER_STATUS_ACCEPTED'
  ) THEN
    RAISE EXCEPTION 'La transición debe generar cronología automática';
  END IF;
  IF (SELECT count(*) FROM order_notifications) < 2 THEN
    RAISE EXCEPTION 'El pedido debe generar notificaciones pendientes';
  END IF;
END;
$$;

DO $$
DECLARE
  affected integer;
BEGIN
  UPDATE provider_orders
  SET provider_note = 'Intento ajeno'
  WHERE id = '51000000-0000-4000-8000-000000000002';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN
    RAISE EXCEPTION 'El taller A ha modificado el pedido del taller B';
  END IF;
END;
$$;

SELECT set_config('app.role', 'ADMIN', true);
SELECT set_config('app.user_id', '00000000-0000-4000-8000-000000000001', true);
SELECT set_config('app.provider_id', '', true);

DO $$
BEGIN
  BEGIN
    INSERT INTO custom_requests (
      order_id, order_item_id, provider_id, customer_user_id,
      title, brief
    ) VALUES (
      '51000000-0000-4000-8000-000000000001',
      '52000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000201',
      '00000000-0000-4000-8000-000000000003',
      'Relación inválida',
      'Este encargo intenta utilizar un artículo perteneciente a otro pedido y debe fallar.'
    );
    RAISE EXCEPTION 'Se ha permitido relacionar un artículo de otro pedido';
  EXCEPTION
    WHEN foreign_key_violation THEN NULL;
  END;
END;
$$;

SELECT set_config('app.role', 'PROVIDER_OWNER', true);
SELECT set_config('app.user_id', '00000000-0000-4000-8000-000000000102', true);
SELECT set_config('app.provider_id', '00000000-0000-4000-8000-000000000202', true);

DO $$
BEGIN
  BEGIN
    INSERT INTO custom_request_messages (
      request_id, order_id, provider_id, customer_user_id,
      author_user_id, author_role, body
    ) VALUES (
      '53000000-0000-4000-8000-000000000001',
      '51000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000201',
      '00000000-0000-4000-8000-000000000003',
      '00000000-0000-4000-8000-000000000102',
      'PROVIDER_OWNER',
      'Este mensaje no debe insertarse.'
    );
    RAISE EXCEPTION 'El taller B ha escrito en el encargo del taller A';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;

SELECT set_config('app.role', 'CUSTOMER', true);
SELECT set_config('app.user_id', '00000000-0000-4000-8000-000000000003', true);
SELECT set_config('app.provider_id', '', true);

DO $$
BEGIN
  IF (SELECT count(*) FROM provider_orders) <> 2 THEN
    RAISE EXCEPTION 'El cliente debe ver los dos pedidos separados por taller';
  END IF;
END;
$$;

UPDATE provider_orders
SET status = 'CANCELLED'
WHERE id = '51000000-0000-4000-8000-000000000002';

DO $$
BEGIN
  BEGIN
    UPDATE provider_orders
    SET status = 'CANCELLED'
    WHERE id = '51000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'El cliente ha cancelado un pedido ya aceptado';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;

RESET ROLE;
ROLLBACK;

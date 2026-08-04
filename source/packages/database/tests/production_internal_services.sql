\set ON_ERROR_STOP on

BEGIN;

SELECT set_config('app.role', 'ADMIN', false);
SELECT set_config('app.user_id', '00000000-0000-4000-8000-000000000008', false);
SELECT set_config('app.provider_id', '', false);

INSERT INTO providers (id, slug, display_name, contact_name, contact_email, specialty, status)
VALUES (
  '10000000-0000-4000-8000-000000000037',
  'servicios-produccion-test',
  'Servicios Producción Test',
  'Responsable de prueba',
  'responsable-servicios@atelier.test',
  'Cerámica',
  'ACTIVE'
);

INSERT INTO products (
  id, provider_id, slug, name, short_description, story, category,
  price_cents, currency, stock_mode, stock_quantity,
  preparation_min_days, preparation_max_days, status,
  created_by, updated_by, approved_by, published_by,
  submitted_at, approved_at, published_at
) VALUES (
  '20000000-0000-4000-8000-000000000037',
  '10000000-0000-4000-8000-000000000037',
  'pieza-publicada-servicios',
  'Pieza publicada servicios',
  'Pieza publicada para comprobar los permisos del piloto.',
  'Historia de control para el test de servicios internos.',
  'Cerámica',
  2500,
  'EUR',
  'FINITE',
  5,
  2,
  4,
  'PUBLISHED',
  '00000000-0000-4000-8000-000000000008',
  '00000000-0000-4000-8000-000000000008',
  '00000000-0000-4000-8000-000000000008',
  '00000000-0000-4000-8000-000000000008',
  now(), now(), now()
);

SET LOCAL ROLE atelier_app_runtime;

SELECT set_config('app.role', 'AUTH_SERVICE', true);
SELECT set_config('app.user_id', '00000000-0000-4000-8000-000000000008', true);
SELECT set_config('app.provider_id', '', true);

DO $$
DECLARE visible integer;
BEGIN
  SELECT count(*) INTO visible FROM providers WHERE id='10000000-0000-4000-8000-000000000037';
  IF visible <> 1 THEN RAISE EXCEPTION 'AUTH_SERVICE_NO_PROVIDER_VISIBILITY'; END IF;

  BEGIN
    PERFORM 1 FROM products WHERE id='20000000-0000-4000-8000-000000000037';
    IF FOUND THEN RAISE EXCEPTION 'AUTH_SERVICE_PRODUCT_VISIBILITY'; END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$$;

SELECT set_config('app.role', 'PILOT_CHECKOUT_SERVICE', true);
SELECT set_config('app.user_id', '00000000-0000-4000-8000-000000000011', true);
SELECT set_config('app.provider_id', '', true);

DO $$
DECLARE visible integer;
BEGIN
  SELECT count(*) INTO visible FROM products WHERE id='20000000-0000-4000-8000-000000000037';
  IF visible <> 1 THEN RAISE EXCEPTION 'PILOT_SERVICE_NO_PUBLISHED_PRODUCT'; END IF;
END;
$$;

UPDATE products
SET stock_quantity = stock_quantity - 1
WHERE id='20000000-0000-4000-8000-000000000037';

DO $$
DECLARE current_stock integer;
BEGIN
  SELECT stock_quantity INTO current_stock FROM products WHERE id='20000000-0000-4000-8000-000000000037';
  IF current_stock <> 4 THEN RAISE EXCEPTION 'PILOT_SERVICE_STOCK_NOT_RESERVED'; END IF;

  BEGIN
    UPDATE products
    SET name='Cambio no permitido'
    WHERE id='20000000-0000-4000-8000-000000000037';
    RAISE EXCEPTION 'PILOT_SERVICE_CHANGED_PRODUCT';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    PERFORM 1 FROM provider_members;
    IF FOUND THEN RAISE EXCEPTION 'PILOT_SERVICE_PROVIDER_MEMBER_VISIBILITY'; END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$$;

ROLLBACK;

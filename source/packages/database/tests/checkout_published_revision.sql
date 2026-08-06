\set ON_ERROR_STOP on

BEGIN;

SET ROLE atelier_app_runtime;
SET search_path = public;
SELECT set_config('app.role', 'ADMIN', false);
SELECT set_config('app.user_id', '00000000-0000-4000-8000-000000000001', false);
SELECT set_config('app.provider_id', '', false);

INSERT INTO products (
  id, provider_id, slug, name, short_description, story, category,
  price_cents, currency, stock_mode, stock_quantity,
  preparation_min_days, preparation_max_days,
  customizable, personalization_notes, shipping_notes, status,
  created_by, updated_by, submitted_at, approved_at, approved_by,
  published_at, published_by
) VALUES (
  '13000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000201',
  'pieza-checkout-publicada',
  'Nombre público aprobado',
  'Descripción pública aprobada para probar una compra durante la edición.',
  'Historia pública aprobada.',
  'Artesanía',
  4200, 'EUR', 'FINITE', 5, 2, 5,
  true, 'Personalización aprobada.', 'Envío protegido.', 'PUBLISHED',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000101',
  now(), now(), '00000000-0000-4000-8000-000000000001',
  now(), '00000000-0000-4000-8000-000000000001'
);

INSERT INTO product_personalization_options (
  id, provider_id, product_id, name, option_type,
  required, choices, price_delta_cents, sort_order, active
) VALUES (
  '13000000-0000-4000-8000-000000000011',
  '00000000-0000-4000-8000-000000000201',
  '13000000-0000-4000-8000-000000000001',
  'Texto aprobado', 'TEXT', false, '[]'::jsonb, 300, 1, true
);

INSERT INTO product_publications (
  product_id, provider_id, revision, snapshot, visible,
  published_by, published_at
) VALUES (
  '13000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000201',
  1,
  app.build_product_publication_snapshot('13000000-0000-4000-8000-000000000001'),
  true,
  '00000000-0000-4000-8000-000000000001',
  now()
);

SELECT set_config('app.role', 'PROVIDER_OWNER', false);
SELECT set_config('app.user_id', '00000000-0000-4000-8000-000000000101', false);
SELECT set_config('app.provider_id', '00000000-0000-4000-8000-000000000201', false);

UPDATE products
SET status = 'DRAFT'
WHERE id = '13000000-0000-4000-8000-000000000001';

UPDATE products
SET name = 'Nombre nuevo todavía privado',
    story = 'Historia nueva todavía privada.',
    price_cents = 9900
WHERE id = '13000000-0000-4000-8000-000000000001';

UPDATE product_personalization_options
SET name = 'Texto nuevo todavía privado',
    price_delta_cents = 1700
WHERE id = '13000000-0000-4000-8000-000000000011';

SELECT set_config('app.role', 'PILOT_CHECKOUT_SERVICE', false);
SELECT set_config('app.user_id', '00000000-0000-4000-8000-000000000011', false);
SELECT set_config('app.provider_id', '', false);

DO $$
DECLARE
  checkout_name text;
  checkout_story text;
  checkout_price integer;
  checkout_status text;
  checkout_stock integer;
  option_name text;
  option_delta integer;
BEGIN
  SELECT publication.snapshot #>> '{product,name}',
         publication.snapshot #>> '{product,story}',
         (publication.snapshot #>> '{product,priceCents}')::integer,
         'PUBLISHED',
         inventory.stock_quantity
    INTO checkout_name, checkout_story, checkout_price, checkout_status, checkout_stock
  FROM products inventory
  INNER JOIN product_publications publication
          ON publication.product_id = inventory.id
         AND publication.provider_id = inventory.provider_id
         AND publication.visible = true
  INNER JOIN providers provider ON provider.id = inventory.provider_id
  WHERE inventory.id = '13000000-0000-4000-8000-000000000001'
  FOR UPDATE OF inventory;

  SELECT item.value ->> 'name',
         (item.value ->> 'priceDeltaCents')::integer
    INTO option_name, option_delta
  FROM product_publications publication
  CROSS JOIN LATERAL jsonb_array_elements(
    publication.snapshot -> 'personalizations'
  ) WITH ORDINALITY AS item(value, ordinality)
  WHERE publication.product_id = '13000000-0000-4000-8000-000000000001';

  IF checkout_name <> 'Nombre público aprobado'
     OR checkout_story <> 'Historia pública aprobada.'
     OR checkout_price <> 4200
     OR checkout_status <> 'PUBLISHED'
     OR checkout_stock <> 5
     OR option_name <> 'Texto aprobado'
     OR option_delta <> 300 THEN
    RAISE EXCEPTION 'El checkout ha leído datos del borrador en lugar de la publicación.';
  END IF;
END;
$$;

UPDATE products
SET stock_quantity = stock_quantity - 1
WHERE id = '13000000-0000-4000-8000-000000000001'
  AND stock_mode = 'FINITE'
  AND stock_quantity >= 1;

DO $$
DECLARE
  live_name text;
  live_price integer;
  live_status text;
  live_stock integer;
  public_name text;
  public_price integer;
  public_stock integer;
BEGIN
  SELECT name, price_cents, status, stock_quantity
    INTO live_name, live_price, live_status, live_stock
  FROM products
  WHERE id = '13000000-0000-4000-8000-000000000001';

  SELECT snapshot #>> '{product,name}',
         (snapshot #>> '{product,priceCents}')::integer,
         (snapshot #>> '{product,stockQuantity}')::integer
    INTO public_name, public_price, public_stock
  FROM product_publications
  WHERE product_id = '13000000-0000-4000-8000-000000000001';

  IF live_name <> 'Nombre nuevo todavía privado'
     OR live_price <> 9900
     OR live_status <> 'DRAFT'
     OR live_stock <> 4
     OR public_name <> 'Nombre público aprobado'
     OR public_price <> 4200
     OR public_stock <> 4 THEN
    RAISE EXCEPTION 'La reserva de stock ha mezclado el borrador con la publicación.';
  END IF;

  BEGIN
    UPDATE products
    SET name = 'Cambio prohibido desde checkout'
    WHERE id = '13000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'El checkout ha podido modificar contenido editorial.';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$$;

RESET ROLE;
ROLLBACK;

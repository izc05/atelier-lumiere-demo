\set ON_ERROR_STOP on

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atelier_catalog_test') THEN
    CREATE ROLE atelier_catalog_test NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END;
$$;

GRANT USAGE ON SCHEMA public, app TO atelier_catalog_test;
GRANT SELECT, INSERT, UPDATE, DELETE
ON products, product_events, product_personalization_options, product_media, product_reviews,
   users, providers, provider_members, audit_events
TO atelier_catalog_test;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO atelier_catalog_test;

SET ROLE atelier_catalog_test;

SELECT set_config('app.role', 'PROVIDER_OWNER', false);
SELECT set_config('app.user_id', '00000000-0000-4000-8000-000000000101', false);
SELECT set_config('app.provider_id', '00000000-0000-4000-8000-000000000201', false);

INSERT INTO products (
  id, provider_id, slug, name, short_description, story, category,
  price_cents, stock_mode, stock_quantity,
  preparation_min_days, preparation_max_days,
  customizable, personalization_notes, shipping_notes,
  created_by, updated_by
) VALUES (
  '10000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000201',
  'cojin-bordado-personalizado',
  'Cojín bordado personalizado',
  'Cojín artesanal bordado a mano y preparado especialmente para cada celebración.',
  'Cada pieza se borda lentamente en el taller con materiales seleccionados.',
  'Textil artesanal',
  4900,
  'FINITE',
  4,
  3,
  7,
  true,
  'Puede incluir nombre, fecha y una frase breve.',
  'Se entrega protegido en una caja de cartón reciclado.',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000101'
);

DO $$
BEGIN
  BEGIN
    INSERT INTO products (
      provider_id, slug, name, created_by, updated_by
    ) VALUES (
      '00000000-0000-4000-8000-000000000202',
      'articulo-ajeno',
      'Artículo ajeno',
      '00000000-0000-4000-8000-000000000101',
      '00000000-0000-4000-8000-000000000101'
    );
    RAISE EXCEPTION 'Taller A ha creado un artículo dentro del Taller B.';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;

INSERT INTO product_events (provider_id, product_id, event_slug)
VALUES
  ('00000000-0000-4000-8000-000000000201', '10000000-0000-4000-8000-000000000001', 'boda'),
  ('00000000-0000-4000-8000-000000000201', '10000000-0000-4000-8000-000000000001', 'aniversario');

INSERT INTO product_personalization_options (
  provider_id, product_id, name, option_type, required, choices, price_delta_cents, sort_order
) VALUES
  (
    '00000000-0000-4000-8000-000000000201',
    '10000000-0000-4000-8000-000000000001',
    'Texto bordado',
    'TEXT',
    true,
    '[]'::jsonb,
    0,
    1
  ),
  (
    '00000000-0000-4000-8000-000000000201',
    '10000000-0000-4000-8000-000000000001',
    'Color del hilo',
    'COLOR',
    true,
    '["burdeos", "verde", "azul"]'::jsonb,
    300,
    2
  );

DO $$
DECLARE
  image_number integer;
BEGIN
  FOR image_number IN 1..8 LOOP
    INSERT INTO product_media (
      provider_id, product_id, kind, mime_type, original_filename,
      storage_key, size_bytes, checksum_sha256, status, sort_order,
      alt_text, width, height, uploaded_by
    ) VALUES (
      '00000000-0000-4000-8000-000000000201',
      '10000000-0000-4000-8000-000000000001',
      'IMAGE',
      'image/webp',
      format('cojin-%s.webp', image_number),
      format('providers/a/products/cojin/image-%s.webp', image_number),
      1024 * image_number,
      lpad(to_hex(image_number), 64, '0'),
      'READY',
      image_number,
      format('Detalle %s del cojín bordado', image_number),
      1400,
      1400,
      '00000000-0000-4000-8000-000000000101'
    );
  END LOOP;
END;
$$;

DO $$
BEGIN
  BEGIN
    INSERT INTO product_media (
      provider_id, product_id, kind, mime_type, original_filename,
      storage_key, size_bytes, checksum_sha256, status, uploaded_by
    ) VALUES (
      '00000000-0000-4000-8000-000000000201',
      '10000000-0000-4000-8000-000000000001',
      'IMAGE', 'image/webp', 'novena.webp',
      'providers/a/products/cojin/image-9.webp', 2048,
      repeat('9', 64), 'READY',
      '00000000-0000-4000-8000-000000000101'
    );
    RAISE EXCEPTION 'El artículo admite más de ocho imágenes.';
  EXCEPTION
    WHEN check_violation THEN
      IF SQLERRM NOT LIKE '%PRODUCT_IMAGE_LIMIT_EXCEEDED%' THEN RAISE; END IF;
  END;
END;
$$;

INSERT INTO product_media (
  provider_id, product_id, kind, mime_type, original_filename,
  storage_key, size_bytes, checksum_sha256, status, sort_order,
  duration_seconds, uploaded_by
) VALUES (
  '00000000-0000-4000-8000-000000000201',
  '10000000-0000-4000-8000-000000000001',
  'VIDEO', 'video/mp4', 'proceso.mp4',
  'providers/a/products/cojin/process.mp4', 8000000,
  repeat('a', 64), 'READY', 20, 42.5,
  '00000000-0000-4000-8000-000000000101'
);

DO $$
BEGIN
  BEGIN
    INSERT INTO product_media (
      provider_id, product_id, kind, mime_type, original_filename,
      storage_key, size_bytes, checksum_sha256, status, uploaded_by
    ) VALUES (
      '00000000-0000-4000-8000-000000000201',
      '10000000-0000-4000-8000-000000000001',
      'VIDEO', 'video/mp4', 'segundo.mp4',
      'providers/a/products/cojin/process-2.mp4', 4000000,
      repeat('b', 64), 'READY',
      '00000000-0000-4000-8000-000000000101'
    );
    RAISE EXCEPTION 'El artículo admite más de un vídeo.';
  EXCEPTION
    WHEN check_violation THEN
      IF SQLERRM NOT LIKE '%PRODUCT_VIDEO_LIMIT_EXCEEDED%' THEN RAISE; END IF;
  END;
END;
$$;

DO $$
BEGIN
  BEGIN
    INSERT INTO product_media (
      provider_id, product_id, kind, mime_type, original_filename,
      storage_key, size_bytes, checksum_sha256, uploaded_by
    ) VALUES (
      '00000000-0000-4000-8000-000000000201',
      '10000000-0000-4000-8000-000000000001',
      'IMAGE', 'image/jpeg', 'demasiado-grande.jpg',
      'providers/a/products/cojin/huge.jpg', 12582913,
      repeat('c', 64),
      '00000000-0000-4000-8000-000000000101'
    );
    RAISE EXCEPTION 'Se ha aceptado una imagen de más de 12 MB.';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;
END;
$$;

UPDATE products
SET status = 'IN_REVIEW'
WHERE id = '10000000-0000-4000-8000-000000000001';

INSERT INTO product_reviews (
  provider_id, product_id, submission_number, status,
  provider_note, submitted_by
) VALUES (
  '00000000-0000-4000-8000-000000000201',
  '10000000-0000-4000-8000-000000000001',
  1,
  'PENDING',
  'Primera versión lista para revisión.',
  '00000000-0000-4000-8000-000000000101'
);

DO $$
BEGIN
  BEGIN
    UPDATE products
    SET name = 'Cambio durante revisión'
    WHERE id = '10000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'El proveedor ha editado un artículo durante la revisión.';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;

DO $$
BEGIN
  BEGIN
    DELETE FROM product_media
    WHERE product_id = '10000000-0000-4000-8000-000000000001'
    LIMIT 1;
    RAISE EXCEPTION 'El proveedor ha eliminado físicamente un archivo.';
  EXCEPTION
    WHEN syntax_error THEN NULL;
  END;
END;
$$;

SELECT set_config('app.user_id', '00000000-0000-4000-8000-000000000102', false);
SELECT set_config('app.provider_id', '00000000-0000-4000-8000-000000000202', false);

DO $$
DECLARE
  visible_products integer;
  visible_media integer;
BEGIN
  SELECT count(*) INTO visible_products FROM products;
  SELECT count(*) INTO visible_media FROM product_media;
  IF visible_products <> 0 OR visible_media <> 0 THEN
    RAISE EXCEPTION 'Taller B puede ver artículos o archivos del Taller A.';
  END IF;
END;
$$;

SELECT set_config('app.role', 'CUSTOMER', false);
SELECT set_config('app.user_id', '', false);
SELECT set_config('app.provider_id', '', false);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM products) THEN
    RAISE EXCEPTION 'Un cliente puede leer el catálogo privado antes de publicarse.';
  END IF;
END;
$$;

SELECT set_config('app.role', 'ADMIN', false);
SELECT set_config('app.user_id', '00000000-0000-4000-8000-000000000001', false);
SELECT set_config('app.provider_id', '', false);

UPDATE product_reviews
SET status = 'APPROVED',
    reviewer_note = 'Ficha y material multimedia aprobados.',
    reviewed_by = '00000000-0000-4000-8000-000000000001',
    reviewed_at = now()
WHERE product_id = '10000000-0000-4000-8000-000000000001'
  AND status = 'PENDING';

UPDATE products
SET status = 'APPROVED'
WHERE id = '10000000-0000-4000-8000-000000000001';

UPDATE products
SET status = 'PUBLISHED'
WHERE id = '10000000-0000-4000-8000-000000000001';

DO $$
DECLARE
  product_row products%ROWTYPE;
  image_count integer;
  video_count integer;
BEGIN
  SELECT * INTO product_row
  FROM products
  WHERE id = '10000000-0000-4000-8000-000000000001';

  SELECT count(*) FILTER (WHERE kind = 'IMAGE'),
         count(*) FILTER (WHERE kind = 'VIDEO')
    INTO image_count, video_count
    FROM product_media
   WHERE product_id = product_row.id AND status = 'READY';

  IF product_row.status <> 'PUBLISHED'
     OR product_row.approved_at IS NULL
     OR product_row.published_at IS NULL
     OR image_count <> 8
     OR video_count <> 1 THEN
    RAISE EXCEPTION 'El artículo no ha completado correctamente revisión y publicación.';
  END IF;
END;
$$;

RESET ROLE;
ROLLBACK;

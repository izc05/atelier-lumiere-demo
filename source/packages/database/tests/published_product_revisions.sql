\set ON_ERROR_STOP on

BEGIN;

SET ROLE atelier_app_runtime;
SET search_path = public;
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
  '12000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000201',
  'pieza-publicada-revisable',
  'Versión pública original',
  'Descripción suficientemente completa para enviar la primera versión a revisión editorial.',
  'Historia de la primera versión publicada.',
  'Artesanía',
  4200, 'FINITE', 3, 2, 5, false, '', 'Envío protegido.',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000101'
);

INSERT INTO product_media (
  id, provider_id, product_id, kind, mime_type, original_filename,
  storage_key, size_bytes, checksum_sha256, status, sort_order,
  alt_text, width, height, uploaded_by
) VALUES (
  '12000000-0000-4000-8000-000000000011',
  '00000000-0000-4000-8000-000000000201',
  '12000000-0000-4000-8000-000000000001',
  'IMAGE', 'image/webp', 'original.webp',
  'providers/revision-test/products/pieza/media/original.webp',
  2048, repeat('a', 64), 'READY', 1,
  'Fotografía de la versión original', 1200, 900,
  '00000000-0000-4000-8000-000000000101'
);

INSERT INTO product_media_focal_points (
  media_id, provider_id, product_id, focal_x, focal_y, updated_by
) VALUES (
  '12000000-0000-4000-8000-000000000011',
  '00000000-0000-4000-8000-000000000201',
  '12000000-0000-4000-8000-000000000001',
  50, 70,
  '00000000-0000-4000-8000-000000000101'
);

UPDATE products
SET status = 'IN_REVIEW'
WHERE id = '12000000-0000-4000-8000-000000000001';

INSERT INTO product_reviews (
  provider_id, product_id, submission_number, provider_note, submitted_by
) VALUES (
  '00000000-0000-4000-8000-000000000201',
  '12000000-0000-4000-8000-000000000001',
  1, 'Primera versión preparada.',
  '00000000-0000-4000-8000-000000000101'
);

SELECT set_config('app.role', 'ADMIN', false);
SELECT set_config('app.user_id', '00000000-0000-4000-8000-000000000001', false);
SELECT set_config('app.provider_id', '', false);

UPDATE product_reviews
SET status = 'APPROVED', reviewer_note = NULL
WHERE product_id = '12000000-0000-4000-8000-000000000001'
  AND submission_number = 1;
UPDATE products SET status = 'APPROVED'
WHERE id = '12000000-0000-4000-8000-000000000001';
UPDATE products SET status = 'PUBLISHED'
WHERE id = '12000000-0000-4000-8000-000000000001';

DO $$
DECLARE publication product_publications%ROWTYPE;
BEGIN
  SELECT * INTO publication
  FROM product_publications
  WHERE product_id = '12000000-0000-4000-8000-000000000001';

  IF publication.revision <> 1
     OR publication.visible IS NOT TRUE
     OR publication.snapshot #>> '{product,name}' <> 'Versión pública original'
     OR publication.snapshot #>> '{media,0,focalY}' <> '70' THEN
    RAISE EXCEPTION 'La primera instantánea publicada no es correcta.';
  END IF;
END;
$$;

SELECT set_config('app.role', 'PROVIDER_OWNER', false);
SELECT set_config('app.user_id', '00000000-0000-4000-8000-000000000101', false);
SELECT set_config('app.provider_id', '00000000-0000-4000-8000-000000000201', false);

UPDATE products
SET status = 'DRAFT'
WHERE id = '12000000-0000-4000-8000-000000000001';

UPDATE products
SET name = 'Versión nueva todavía privada',
    short_description = 'Descripción revisada que todavía no debe sustituir la versión visible en la tienda.',
    price_cents = 5100
WHERE id = '12000000-0000-4000-8000-000000000001';

UPDATE product_media
SET status = 'DELETED'
WHERE id = '12000000-0000-4000-8000-000000000011';

DO $$
DECLARE live_name text; public_name text; retained_key text; public_key text;
BEGIN
  SELECT name INTO live_name
  FROM products
  WHERE id = '12000000-0000-4000-8000-000000000001';

  SELECT snapshot #>> '{product,name}', snapshot #>> '{media,0,storageKey}'
    INTO public_name, public_key
  FROM product_publications
  WHERE product_id = '12000000-0000-4000-8000-000000000001';

  SELECT storage_key INTO retained_key
  FROM product_media
  WHERE id = '12000000-0000-4000-8000-000000000011';

  IF live_name <> 'Versión nueva todavía privada'
     OR public_name <> 'Versión pública original'
     OR public_key <> 'providers/revision-test/products/pieza/media/original.webp'
     OR retained_key NOT LIKE 'retained/%' THEN
    RAISE EXCEPTION 'La edición privada ha alterado la versión pública o su archivo.';
  END IF;
END;
$$;

SELECT set_config('app.role', 'CATALOG_READER', false);
SELECT set_config('app.user_id', '00000000-0000-4000-8000-000000000002', false);
SELECT set_config('app.provider_id', '', false);
SET search_path = catalog, public;

DO $$
DECLARE public_name text;
BEGIN
  SELECT name INTO public_name
  FROM products
  WHERE id = '12000000-0000-4000-8000-000000000001';
  IF public_name <> 'Versión pública original' THEN
    RAISE EXCEPTION 'El catálogo no conserva la versión anterior durante la edición.';
  END IF;
END;
$$;

SET search_path = public;
SELECT set_config('app.role', 'PROVIDER_OWNER', false);
SELECT set_config('app.user_id', '00000000-0000-4000-8000-000000000101', false);
SELECT set_config('app.provider_id', '00000000-0000-4000-8000-000000000201', false);

UPDATE product_publications
SET visible = false
WHERE product_id = '12000000-0000-4000-8000-000000000001';

SELECT set_config('app.role', 'CATALOG_READER', false);
SELECT set_config('app.user_id', '00000000-0000-4000-8000-000000000002', false);
SELECT set_config('app.provider_id', '', false);
SET search_path = catalog, public;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM products
    WHERE id = '12000000-0000-4000-8000-000000000001'
  ) THEN
    RAISE EXCEPTION 'Un artículo pausado continúa visible en el catálogo.';
  END IF;
END;
$$;

SET search_path = public;
SELECT set_config('app.role', 'PROVIDER_OWNER', false);
SELECT set_config('app.user_id', '00000000-0000-4000-8000-000000000101', false);
SELECT set_config('app.provider_id', '00000000-0000-4000-8000-000000000201', false);

UPDATE product_publications
SET visible = true
WHERE product_id = '12000000-0000-4000-8000-000000000001';

INSERT INTO product_media (
  id, provider_id, product_id, kind, mime_type, original_filename,
  storage_key, size_bytes, checksum_sha256, status, sort_order,
  alt_text, width, height, uploaded_by
) VALUES (
  '12000000-0000-4000-8000-000000000012',
  '00000000-0000-4000-8000-000000000201',
  '12000000-0000-4000-8000-000000000001',
  'IMAGE', 'image/webp', 'revisada.webp',
  'providers/revision-test/products/pieza/media/revisada.webp',
  3072, repeat('b', 64), 'READY', 1,
  'Fotografía de la versión revisada', 1200, 900,
  '00000000-0000-4000-8000-000000000101'
);

INSERT INTO product_media_focal_points (
  media_id, provider_id, product_id, focal_x, focal_y, updated_by
) VALUES (
  '12000000-0000-4000-8000-000000000012',
  '00000000-0000-4000-8000-000000000201',
  '12000000-0000-4000-8000-000000000001',
  40, 80,
  '00000000-0000-4000-8000-000000000101'
);

UPDATE products
SET status = 'IN_REVIEW'
WHERE id = '12000000-0000-4000-8000-000000000001';

INSERT INTO product_reviews (
  provider_id, product_id, submission_number, provider_note, submitted_by
) VALUES (
  '00000000-0000-4000-8000-000000000201',
  '12000000-0000-4000-8000-000000000001',
  2, 'Segunda versión preparada.',
  '00000000-0000-4000-8000-000000000101'
);

SELECT set_config('app.role', 'ADMIN', false);
SELECT set_config('app.user_id', '00000000-0000-4000-8000-000000000001', false);
SELECT set_config('app.provider_id', '', false);

UPDATE product_reviews
SET status = 'APPROVED', reviewer_note = NULL
WHERE product_id = '12000000-0000-4000-8000-000000000001'
  AND submission_number = 2;
UPDATE products SET status = 'APPROVED'
WHERE id = '12000000-0000-4000-8000-000000000001';
UPDATE products SET status = 'PUBLISHED'
WHERE id = '12000000-0000-4000-8000-000000000001';

DO $$
DECLARE publication product_publications%ROWTYPE;
BEGIN
  SELECT * INTO publication
  FROM product_publications
  WHERE product_id = '12000000-0000-4000-8000-000000000001';

  IF publication.revision <> 2
     OR publication.visible IS NOT TRUE
     OR publication.snapshot #>> '{product,name}' <> 'Versión nueva todavía privada'
     OR publication.snapshot #>> '{product,priceCents}' <> '5100'
     OR publication.snapshot #>> '{media,0,id}' <> '12000000-0000-4000-8000-000000000012'
     OR publication.snapshot #>> '{media,0,focalY}' <> '80' THEN
    RAISE EXCEPTION 'La segunda publicación no ha sustituido la instantánea anterior.';
  END IF;
END;
$$;

SELECT set_config('app.role', 'PROVIDER_OWNER', false);
SELECT set_config('app.user_id', '00000000-0000-4000-8000-000000000101', false);
SELECT set_config('app.provider_id', '00000000-0000-4000-8000-000000000201', false);

UPDATE product_media_focal_points
SET focal_x = 35, focal_y = 90
WHERE media_id = '12000000-0000-4000-8000-000000000012';

DO $$
DECLARE focal_x text; focal_y text;
BEGIN
  SELECT snapshot #>> '{media,0,focalX}', snapshot #>> '{media,0,focalY}'
    INTO focal_x, focal_y
  FROM product_publications
  WHERE product_id = '12000000-0000-4000-8000-000000000001';

  IF focal_x <> '35' OR focal_y <> '90' THEN
    RAISE EXCEPTION 'El encuadre no se ha sincronizado con la versión pública.';
  END IF;
END;
$$;

RESET ROLE;
ROLLBACK;

\set ON_ERROR_STOP on

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atelier_blog_test') THEN
    CREATE ROLE atelier_blog_test NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END;
$$;

GRANT USAGE ON SCHEMA public, app TO atelier_blog_test;
GRANT SELECT, INSERT, UPDATE, DELETE
ON users, providers, provider_members, products, audit_events,
   blog_posts, blog_post_tags, blog_post_products, blog_post_media, blog_post_reviews
TO atelier_blog_test;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO atelier_blog_test;

SET ROLE atelier_blog_test;
SELECT set_config('app.role', 'PROVIDER_OWNER', false);
SELECT set_config('app.user_id', '00000000-0000-4000-8000-000000000101', false);
SELECT set_config('app.provider_id', '00000000-0000-4000-8000-000000000201', false);

INSERT INTO products (
  id, provider_id, slug, name, short_description, story,
  price_cents, stock_mode, stock_quantity, customizable,
  created_by, updated_by
) VALUES (
  '30000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000201',
  'pieza-blog-taller-a', 'Pieza del blog A',
  'Pieza artesanal relacionada con una historia del taller.',
  'Elaborada a mano para comprobar la relación editorial.',
  3200, 'MADE_TO_ORDER', NULL, false,
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000101'
);

INSERT INTO blog_posts (
  id, provider_id, slug, title, excerpt, body_markdown, category,
  created_by, updated_by
) VALUES (
  '40000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000201',
  'como-nace-una-pieza-bordada',
  'Cómo nace una pieza bordada',
  'Un recorrido completo por la elección de materiales y el trabajo manual del taller.',
  repeat('La historia de esta pieza explica el proceso artesanal y cada una de sus fases. ', 5),
  'Procesos artesanales',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000101'
);

INSERT INTO blog_post_tags (provider_id, post_id, tag_slug)
VALUES
  ('00000000-0000-4000-8000-000000000201', '40000000-0000-4000-8000-000000000001', 'bordado'),
  ('00000000-0000-4000-8000-000000000201', '40000000-0000-4000-8000-000000000001', 'hecho-a-mano');

INSERT INTO blog_post_products (provider_id, post_id, product_id, sort_order)
VALUES (
  '00000000-0000-4000-8000-000000000201',
  '40000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001', 0
);

SELECT set_config('app.user_id', '00000000-0000-4000-8000-000000000102', false);
SELECT set_config('app.provider_id', '00000000-0000-4000-8000-000000000202', false);

DO $$
DECLARE visible_posts integer;
BEGIN
  SELECT count(*) INTO visible_posts FROM blog_posts;
  IF visible_posts <> 0 THEN
    RAISE EXCEPTION 'Taller B puede leer las historias del Taller A.';
  END IF;
END;
$$;

INSERT INTO products (
  id, provider_id, slug, name, short_description, story,
  price_cents, stock_mode, stock_quantity, customizable,
  created_by, updated_by
) VALUES (
  '30000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000202',
  'pieza-blog-taller-b', 'Pieza del blog B',
  'Pieza cerámica del segundo taller.',
  'Creada para verificar el aislamiento entre proveedores.',
  4200, 'MADE_TO_ORDER', NULL, false,
  '00000000-0000-4000-8000-000000000102',
  '00000000-0000-4000-8000-000000000102'
);

SELECT set_config('app.user_id', '00000000-0000-4000-8000-000000000101', false);
SELECT set_config('app.provider_id', '00000000-0000-4000-8000-000000000201', false);

DO $$
BEGIN
  BEGIN
    INSERT INTO blog_post_products (provider_id, post_id, product_id, sort_order)
    VALUES (
      '00000000-0000-4000-8000-000000000201',
      '40000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000002', 1
    );
    RAISE EXCEPTION 'El Taller A ha relacionado un producto del Taller B.';
  EXCEPTION WHEN foreign_key_violation OR insufficient_privilege THEN NULL;
  END;
END;
$$;

UPDATE blog_posts SET status = 'IN_REVIEW'
WHERE id = '40000000-0000-4000-8000-000000000001';

INSERT INTO blog_post_reviews (
  provider_id, post_id, submission_number, provider_note, submitted_by
) VALUES (
  '00000000-0000-4000-8000-000000000201',
  '40000000-0000-4000-8000-000000000001', 1,
  'Historia preparada para la revisión editorial.',
  '00000000-0000-4000-8000-000000000101'
);

DO $$
BEGIN
  BEGIN
    UPDATE blog_posts SET title = 'Edición durante revisión'
    WHERE id = '40000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'El proveedor ha editado una historia en revisión.';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;

SELECT set_config('app.role', 'ADMIN', false);
SELECT set_config('app.user_id', '00000000-0000-4000-8000-000000000001', false);
SELECT set_config('app.provider_id', '', false);

DO $$
BEGIN
  BEGIN
    UPDATE blog_posts SET status = 'APPROVED'
    WHERE id = '40000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'Administración ha aprobado el blog sin resolver la revisión.';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%BLOG_REVIEW_APPROVAL_REQUIRED%' THEN RAISE; END IF;
  END;
END;
$$;

UPDATE blog_post_reviews
SET status = 'APPROVED', reviewer_note = 'Contenido editorial aprobado.'
WHERE post_id = '40000000-0000-4000-8000-000000000001'
  AND status = 'PENDING';

UPDATE blog_posts SET status = 'APPROVED'
WHERE id = '40000000-0000-4000-8000-000000000001';

INSERT INTO blog_post_media (
  id, provider_id, post_id, placement, mime_type, original_filename,
  storage_key, size_bytes, checksum_sha256, status, sort_order,
  alt_text, width, height, preview_storage_key, preview_mime_type,
  preview_size_bytes, preview_checksum_sha256, preview_width,
  preview_height, uploaded_by, ready_at
) VALUES (
  '50000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000201',
  '40000000-0000-4000-8000-000000000001',
  'COVER', 'image/png', 'portada-blog.png',
  'providers/test/blog/post/cover/original.png', 68, repeat('a', 64),
  'READY', 0, 'Portada del proceso artesanal', 1, 1,
  'providers/test/blog/post/cover/preview.webp', 'image/webp',
  32, repeat('b', 64), 1, 1,
  '00000000-0000-4000-8000-000000000001', now()
);

UPDATE blog_posts SET status = 'PUBLISHED'
WHERE id = '40000000-0000-4000-8000-000000000001';

DO $$
DECLARE post_status text; reviewed_by_value uuid;
BEGIN
  SELECT status INTO post_status FROM blog_posts
  WHERE id = '40000000-0000-4000-8000-000000000001';
  SELECT reviewed_by INTO reviewed_by_value FROM blog_post_reviews
  WHERE post_id = '40000000-0000-4000-8000-000000000001';
  IF post_status <> 'PUBLISHED' OR reviewed_by_value IS NULL THEN
    RAISE EXCEPTION 'El flujo editorial del blog no se ha completado.';
  END IF;
END;
$$;

SELECT set_config('app.role', 'CUSTOMER', false);
SELECT set_config('app.user_id', '00000000-0000-4000-8000-000000000002', false);

DO $$
DECLARE visible_posts integer;
BEGIN
  SELECT count(*) INTO visible_posts FROM blog_posts;
  IF visible_posts <> 0 THEN
    RAISE EXCEPTION 'El blog se ha hecho público antes de crear su API pública.';
  END IF;
END;
$$;

ROLLBACK;

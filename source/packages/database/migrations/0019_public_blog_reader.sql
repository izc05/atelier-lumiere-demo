BEGIN;

CREATE POLICY blog_posts_catalog_reader_select ON blog_posts
FOR SELECT
USING (
  app.current_role() = 'CATALOG_READER'
  AND status = 'PUBLISHED'
  AND EXISTS (
    SELECT 1 FROM providers provider
    WHERE provider.id = blog_posts.provider_id
      AND provider.status = 'ACTIVE'
  )
);

CREATE POLICY blog_post_tags_catalog_reader_select ON blog_post_tags
FOR SELECT
USING (
  app.current_role() = 'CATALOG_READER'
  AND EXISTS (
    SELECT 1 FROM blog_posts post
    WHERE post.id = blog_post_tags.post_id
      AND post.provider_id = blog_post_tags.provider_id
  )
);

CREATE POLICY blog_post_products_catalog_reader_select ON blog_post_products
FOR SELECT
USING (
  app.current_role() = 'CATALOG_READER'
  AND EXISTS (
    SELECT 1 FROM blog_posts post
    WHERE post.id = blog_post_products.post_id
      AND post.provider_id = blog_post_products.provider_id
  )
);

CREATE POLICY blog_post_media_catalog_reader_select ON blog_post_media
FOR SELECT
USING (
  app.current_role() = 'CATALOG_READER'
  AND status = 'READY'
  AND preview_storage_key IS NOT NULL
  AND preview_mime_type = 'image/webp'
  AND EXISTS (
    SELECT 1 FROM blog_posts post
    WHERE post.id = blog_post_media.post_id
      AND post.provider_id = blog_post_media.provider_id
  )
);

COMMIT;

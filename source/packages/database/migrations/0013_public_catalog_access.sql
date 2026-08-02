BEGIN;

CREATE POLICY providers_catalog_select_policy ON providers
FOR SELECT USING (
  app.current_role() = 'CATALOG_READER'
  AND status = 'ACTIVE'
);

CREATE POLICY products_catalog_select_policy ON products
FOR SELECT USING (
  app.current_role() = 'CATALOG_READER'
  AND status = 'PUBLISHED'
  AND EXISTS (
    SELECT 1
    FROM providers provider
    WHERE provider.id = products.provider_id
      AND provider.status = 'ACTIVE'
  )
);

CREATE POLICY product_events_catalog_select_policy ON product_events
FOR SELECT USING (
  app.current_role() = 'CATALOG_READER'
  AND EXISTS (
    SELECT 1
    FROM products product
    WHERE product.id = product_events.product_id
      AND product.provider_id = product_events.provider_id
      AND product.status = 'PUBLISHED'
  )
);

CREATE POLICY product_personalization_catalog_select_policy ON product_personalization_options
FOR SELECT USING (
  app.current_role() = 'CATALOG_READER'
  AND active = true
  AND EXISTS (
    SELECT 1
    FROM products product
    WHERE product.id = product_personalization_options.product_id
      AND product.provider_id = product_personalization_options.provider_id
      AND product.status = 'PUBLISHED'
  )
);

CREATE POLICY product_media_catalog_select_policy ON product_media
FOR SELECT USING (
  app.current_role() = 'CATALOG_READER'
  AND status = 'READY'
  AND EXISTS (
    SELECT 1
    FROM products product
    WHERE product.id = product_media.product_id
      AND product.provider_id = product_media.provider_id
      AND product.status = 'PUBLISHED'
  )
);

COMMIT;

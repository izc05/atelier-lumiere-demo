BEGIN;

CREATE POLICY product_publications_pilot_checkout_select
ON product_publications
FOR SELECT USING (
  app.is_pilot_checkout_service()
  AND visible = true
  AND EXISTS (
    SELECT 1
    FROM providers provider
    WHERE provider.id = product_publications.provider_id
      AND provider.status = 'ACTIVE'
  )
);

DROP POLICY products_pilot_checkout_select ON products;
DROP POLICY products_pilot_checkout_update ON products;

CREATE POLICY products_pilot_checkout_select ON products
FOR SELECT USING (
  app.is_pilot_checkout_service()
  AND EXISTS (
    SELECT 1
    FROM product_publications publication
    WHERE publication.product_id = products.id
      AND publication.visible = true
  )
);

CREATE POLICY products_pilot_checkout_update ON products
FOR UPDATE USING (
  app.is_pilot_checkout_service()
  AND EXISTS (
    SELECT 1
    FROM product_publications publication
    WHERE publication.product_id = products.id
      AND publication.visible = true
  )
)
WITH CHECK (
  app.is_pilot_checkout_service()
  AND EXISTS (
    SELECT 1
    FROM product_publications publication
    WHERE publication.product_id = products.id
      AND publication.visible = true
  )
);

COMMIT;

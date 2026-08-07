BEGIN;

CREATE OR REPLACE FUNCTION app.has_visible_product_publication(target_product_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.product_publications publication
    WHERE publication.product_id = target_product_id
      AND publication.visible = true
  );
$$;

REVOKE ALL ON FUNCTION app.has_visible_product_publication(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.has_visible_product_publication(uuid) TO atelier_app_runtime;

DROP POLICY products_pilot_checkout_select ON public.products;
DROP POLICY products_pilot_checkout_update ON public.products;

CREATE POLICY products_pilot_checkout_select ON public.products
FOR SELECT USING (
  app.is_pilot_checkout_service()
  AND app.has_visible_product_publication(products.id)
);

CREATE POLICY products_pilot_checkout_update ON public.products
FOR UPDATE USING (
  app.is_pilot_checkout_service()
  AND app.has_visible_product_publication(products.id)
)
WITH CHECK (
  app.is_pilot_checkout_service()
  AND app.has_visible_product_publication(products.id)
);

COMMIT;

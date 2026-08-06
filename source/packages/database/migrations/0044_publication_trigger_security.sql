BEGIN;

ALTER FUNCTION app.refresh_product_publication() SECURITY DEFINER;
ALTER FUNCTION app.refresh_product_publication() SET search_path = public, pg_temp;

ALTER FUNCTION app.sync_published_focal_point() SECURITY DEFINER;
ALTER FUNCTION app.sync_published_focal_point() SET search_path = public, pg_temp;

ALTER FUNCTION app.retain_published_media_file() SECURITY DEFINER;
ALTER FUNCTION app.retain_published_media_file() SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION app.refresh_product_publication() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.sync_published_focal_point() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.retain_published_media_file() FROM PUBLIC;

COMMIT;

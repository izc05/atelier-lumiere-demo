BEGIN;

REVOKE UPDATE ON product_publications FROM atelier_app_runtime;
GRANT UPDATE (visible) ON product_publications TO atelier_app_runtime;

COMMIT;

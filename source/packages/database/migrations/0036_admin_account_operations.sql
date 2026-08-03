BEGIN;

CREATE OR REPLACE FUNCTION app.sync_admin_two_factor_enabled()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
BEGIN
  UPDATE users
  SET two_factor_enabled = (NEW.status = 'ACTIVE'),
      updated_at = now()
  WHERE id = NEW.user_id
    AND EXISTS (
      SELECT 1
      FROM admin_memberships am
      WHERE am.user_id = NEW.user_id
    );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS admin_totp_sync_user_flag ON admin_totp_credentials;
CREATE TRIGGER admin_totp_sync_user_flag
AFTER INSERT OR UPDATE OF status ON admin_totp_credentials
FOR EACH ROW EXECUTE FUNCTION app.sync_admin_two_factor_enabled();

UPDATE users u
SET two_factor_enabled = (t.status = 'ACTIVE'),
    updated_at = now()
FROM admin_totp_credentials t
WHERE t.user_id = u.id
  AND EXISTS (
    SELECT 1 FROM admin_memberships am WHERE am.user_id = u.id
  )
  AND u.two_factor_enabled IS DISTINCT FROM (t.status = 'ACTIVE');

COMMIT;

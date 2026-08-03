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

CREATE OR REPLACE FUNCTION app.require_active_platform_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  removes_active_owner boolean;
  active_owners integer;
BEGIN
  removes_active_owner := OLD.role = 'PLATFORM_OWNER'
    AND OLD.status = 'ACTIVE'
    AND (
      TG_OP = 'DELETE'
      OR NEW.role <> 'PLATFORM_OWNER'
      OR NEW.status <> 'ACTIVE'
    );
  IF NOT removes_active_owner THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('atelier-active-platform-owner', 0));
  SELECT count(*)::integer
  INTO active_owners
  FROM admin_memberships
  WHERE role = 'PLATFORM_OWNER' AND status = 'ACTIVE';

  IF active_owners <= 1 THEN
    RAISE EXCEPTION 'LAST_PLATFORM_OWNER_REQUIRED' USING ERRCODE = '23514';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS admin_memberships_keep_owner ON admin_memberships;
CREATE TRIGGER admin_memberships_keep_owner
BEFORE UPDATE OF role, status OR DELETE ON admin_memberships
FOR EACH ROW EXECUTE FUNCTION app.require_active_platform_owner();

COMMIT;

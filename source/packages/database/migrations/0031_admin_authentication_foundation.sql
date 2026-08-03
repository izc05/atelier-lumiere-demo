BEGIN;

CREATE OR REPLACE FUNCTION app.is_auth_service()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT app.current_role() = 'AUTH_SERVICE';
$$;

INSERT INTO users (
  id, email, display_name, status, email_verified_at, two_factor_enabled
) VALUES (
  '00000000-0000-4000-8000-000000000008',
  'auth-service@atelier.invalid',
  'Servicio interno de autenticación',
  'ACTIVE',
  now(),
  false
)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE admin_memberships (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
  role text NOT NULL CHECK (role IN (
    'PLATFORM_OWNER',
    'PROVIDER_MANAGER',
    'EDITORIAL_REVIEWER'
  )),
  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'SUSPENDED')),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER admin_memberships_set_updated_at
BEFORE UPDATE ON admin_memberships
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TABLE admin_totp_credentials (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  secret_ciphertext text NOT NULL,
  secret_iv text NOT NULL,
  secret_auth_tag text NOT NULL,
  key_version integer NOT NULL DEFAULT 1 CHECK (key_version >= 1),
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'ACTIVE', 'REVOKED')),
  last_used_step bigint,
  activated_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'ACTIVE' OR activated_at IS NOT NULL),
  CHECK (status <> 'REVOKED' OR revoked_at IS NOT NULL)
);

CREATE TRIGGER admin_totp_credentials_set_updated_at
BEFORE UPDATE ON admin_totp_credentials
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TABLE admin_login_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE CHECK (char_length(token_hash) = 64),
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'USED', 'REVOKED', 'EXPIRED')),
  failed_attempts integer NOT NULL DEFAULT 0 CHECK (failed_attempts BETWEEN 0 AND 5),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at),
  CHECK ((status = 'USED') = (used_at IS NOT NULL)),
  CHECK ((status = 'REVOKED') = (revoked_at IS NOT NULL))
);

CREATE UNIQUE INDEX admin_login_challenges_one_pending_idx
  ON admin_login_challenges(user_id)
  WHERE status = 'PENDING';
CREATE INDEX admin_login_challenges_expiry_idx
  ON admin_login_challenges(expires_at)
  WHERE status = 'PENDING';

ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_role_check;
ALTER TABLE sessions
  ADD CONSTRAINT sessions_role_check CHECK (role IS NULL OR role IN (
    'PROVIDER_OWNER',
    'PROVIDER_MEMBER',
    'PLATFORM_OWNER',
    'PROVIDER_MANAGER',
    'EDITORIAL_REVIEWER'
  ));
ALTER TABLE sessions
  ADD CONSTRAINT sessions_identity_scope_check CHECK (
    (role IS NULL AND provider_id IS NULL)
    OR (role IN ('PROVIDER_OWNER', 'PROVIDER_MEMBER') AND provider_id IS NOT NULL)
    OR (role IN ('PLATFORM_OWNER', 'PROVIDER_MANAGER', 'EDITORIAL_REVIEWER') AND provider_id IS NULL)
  );

ALTER TABLE admin_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE admin_totp_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_totp_credentials FORCE ROW LEVEL SECURITY;
ALTER TABLE admin_login_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_login_challenges FORCE ROW LEVEL SECURITY;

CREATE POLICY users_auth_service_select ON users
FOR SELECT USING (app.is_auth_service());

CREATE POLICY user_credentials_auth_service_select ON user_credentials
FOR SELECT USING (app.is_auth_service());

CREATE POLICY admin_memberships_admin_all ON admin_memberships
FOR ALL USING (app.is_admin()) WITH CHECK (app.is_admin());
CREATE POLICY admin_memberships_auth_service_select ON admin_memberships
FOR SELECT USING (app.is_auth_service());

CREATE POLICY admin_totp_credentials_admin_all ON admin_totp_credentials
FOR ALL USING (app.is_admin()) WITH CHECK (app.is_admin());
CREATE POLICY admin_totp_credentials_auth_service_select ON admin_totp_credentials
FOR SELECT USING (app.is_auth_service());
CREATE POLICY admin_totp_credentials_auth_service_update ON admin_totp_credentials
FOR UPDATE USING (app.is_auth_service()) WITH CHECK (app.is_auth_service());

CREATE POLICY admin_login_challenges_admin_all ON admin_login_challenges
FOR ALL USING (app.is_admin()) WITH CHECK (app.is_admin());
CREATE POLICY admin_login_challenges_auth_service_all ON admin_login_challenges
FOR ALL USING (app.is_auth_service()) WITH CHECK (app.is_auth_service());

CREATE POLICY user_recovery_codes_auth_service_select ON user_recovery_codes
FOR SELECT USING (app.is_auth_service());
CREATE POLICY user_recovery_codes_auth_service_update ON user_recovery_codes
FOR UPDATE USING (app.is_auth_service()) WITH CHECK (app.is_auth_service());

CREATE POLICY sessions_auth_service_all ON sessions
FOR ALL USING (app.is_auth_service()) WITH CHECK (app.is_auth_service());

CREATE POLICY login_throttles_auth_service_all ON login_throttles
FOR ALL USING (app.is_auth_service()) WITH CHECK (app.is_auth_service());

CREATE POLICY audit_events_auth_service_select ON audit_events
FOR SELECT USING (app.is_auth_service());
CREATE POLICY audit_events_auth_service_insert ON audit_events
FOR INSERT WITH CHECK (app.is_auth_service());

GRANT SELECT ON admin_memberships TO atelier_app_runtime;
GRANT SELECT, UPDATE ON admin_totp_credentials TO atelier_app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON admin_login_challenges TO atelier_app_runtime;

COMMIT;

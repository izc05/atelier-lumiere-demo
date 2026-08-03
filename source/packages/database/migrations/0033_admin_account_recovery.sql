BEGIN;

CREATE TABLE admin_account_recovery_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE CHECK (char_length(token_hash) = 64),
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'USED', 'REVOKED', 'EXPIRED')),
  failed_attempts integer NOT NULL DEFAULT 0 CHECK (failed_attempts BETWEEN 0 AND 5),
  secret_ciphertext text NOT NULL,
  secret_iv text NOT NULL,
  secret_auth_tag text NOT NULL,
  key_version integer NOT NULL DEFAULT 1 CHECK (key_version >= 1),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at),
  CHECK ((status = 'USED') = (used_at IS NOT NULL)),
  CHECK ((status = 'REVOKED') = (revoked_at IS NOT NULL))
);

CREATE UNIQUE INDEX admin_account_recovery_one_pending_idx
  ON admin_account_recovery_tokens(user_id)
  WHERE status = 'PENDING';
CREATE INDEX admin_account_recovery_expiry_idx
  ON admin_account_recovery_tokens(expires_at)
  WHERE status = 'PENDING';

ALTER TABLE admin_account_recovery_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_account_recovery_tokens FORCE ROW LEVEL SECURITY;

CREATE POLICY admin_account_recovery_admin_all
ON admin_account_recovery_tokens
FOR ALL USING (app.is_admin()) WITH CHECK (app.is_admin());

CREATE POLICY admin_account_recovery_auth_service_all
ON admin_account_recovery_tokens
FOR ALL USING (app.is_auth_service()) WITH CHECK (app.is_auth_service());

CREATE POLICY user_credentials_auth_service_update
ON user_credentials
FOR UPDATE USING (app.is_auth_service()) WITH CHECK (app.is_auth_service());

CREATE POLICY user_recovery_codes_auth_service_insert
ON user_recovery_codes
FOR INSERT WITH CHECK (app.is_auth_service());

CREATE POLICY user_recovery_codes_auth_service_delete
ON user_recovery_codes
FOR DELETE USING (app.is_auth_service());

GRANT SELECT, INSERT, UPDATE, DELETE
ON admin_account_recovery_tokens
TO atelier_app_runtime;

COMMIT;

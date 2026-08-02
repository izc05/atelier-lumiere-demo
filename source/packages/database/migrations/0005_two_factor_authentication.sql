BEGIN;

CREATE TABLE onboarding_continuations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE CHECK (char_length(token_hash) = 64),
  purpose text NOT NULL CHECK (purpose = 'SETUP_2FA'),
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'USED', 'REVOKED', 'EXPIRED')),
  failed_attempts integer NOT NULL DEFAULT 0 CHECK (failed_attempts BETWEEN 0 AND 5),
  expires_at timestamptz NOT NULL,
  last_attempt_at timestamptz,
  locked_at timestamptz,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at),
  CHECK (status <> 'USED' OR used_at IS NOT NULL),
  CHECK (status <> 'REVOKED' OR revoked_at IS NOT NULL),
  CHECK (locked_at IS NULL OR status = 'REVOKED')
);

CREATE UNIQUE INDEX onboarding_continuations_one_pending_idx
  ON onboarding_continuations(user_id, purpose)
  WHERE status = 'PENDING';

CREATE INDEX onboarding_continuations_provider_idx
  ON onboarding_continuations(provider_id, created_at DESC);

CREATE TABLE user_totp_credentials (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  secret_ciphertext text NOT NULL,
  secret_iv text NOT NULL,
  secret_auth_tag text NOT NULL,
  key_version integer NOT NULL DEFAULT 1 CHECK (key_version >= 1),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACTIVE', 'REVOKED')),
  last_used_step bigint,
  activated_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'ACTIVE' OR activated_at IS NOT NULL),
  CHECK (status <> 'REVOKED' OR revoked_at IS NOT NULL)
);

CREATE TRIGGER user_totp_credentials_set_updated_at
BEFORE UPDATE ON user_totp_credentials
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TABLE user_recovery_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash text NOT NULL CHECK (char_length(code_hash) = 64),
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, code_hash)
);

CREATE INDEX user_recovery_codes_user_idx
  ON user_recovery_codes(user_id, used_at);

ALTER TABLE onboarding_continuations ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_continuations FORCE ROW LEVEL SECURITY;
ALTER TABLE user_totp_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_totp_credentials FORCE ROW LEVEL SECURITY;
ALTER TABLE user_recovery_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_recovery_codes FORCE ROW LEVEL SECURITY;

CREATE POLICY onboarding_continuations_admin_policy
ON onboarding_continuations
FOR ALL
USING (app.is_admin())
WITH CHECK (app.is_admin());

CREATE POLICY user_totp_credentials_admin_policy
ON user_totp_credentials
FOR ALL
USING (app.is_admin())
WITH CHECK (app.is_admin());

CREATE POLICY user_recovery_codes_admin_policy
ON user_recovery_codes
FOR ALL
USING (app.is_admin())
WITH CHECK (app.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE
ON onboarding_continuations, user_totp_credentials, user_recovery_codes
TO atelier_app_runtime;

COMMIT;

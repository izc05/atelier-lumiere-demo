BEGIN;

CREATE TABLE account_recovery_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('PASSWORD_RESET', 'RESET_2FA')),
  token_hash text NOT NULL UNIQUE CHECK (char_length(token_hash) = 64),
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'USED', 'REVOKED', 'EXPIRED')),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at),
  CHECK (status <> 'USED' OR used_at IS NOT NULL),
  CHECK (status <> 'REVOKED' OR revoked_at IS NOT NULL)
);

CREATE UNIQUE INDEX account_recovery_tokens_one_pending_idx
  ON account_recovery_tokens(user_id, purpose)
  WHERE status = 'PENDING';

CREATE INDEX account_recovery_tokens_expiry_idx
  ON account_recovery_tokens(expires_at)
  WHERE status = 'PENDING';

CREATE INDEX account_recovery_tokens_provider_idx
  ON account_recovery_tokens(provider_id, created_at DESC);

ALTER TABLE account_recovery_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_recovery_tokens FORCE ROW LEVEL SECURITY;

CREATE POLICY account_recovery_tokens_admin_policy
ON account_recovery_tokens
FOR ALL
USING (app.is_admin())
WITH CHECK (app.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE
ON account_recovery_tokens
TO atelier_app_runtime;

COMMIT;

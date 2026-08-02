BEGIN;

CREATE TABLE email_verification_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE CHECK (char_length(token_hash) = 64),
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'VERIFIED', 'REVOKED', 'EXPIRED')),
  expires_at timestamptz NOT NULL,
  sent_at timestamptz,
  verified_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at),
  CHECK ((status = 'VERIFIED') = (verified_at IS NOT NULL)),
  CHECK ((status = 'REVOKED') = (revoked_at IS NOT NULL))
);

CREATE INDEX email_verification_tokens_user_idx
  ON email_verification_tokens(user_id, created_at DESC);

CREATE INDEX email_verification_tokens_provider_idx
  ON email_verification_tokens(provider_id, created_at DESC);

CREATE UNIQUE INDEX email_verification_tokens_one_pending_per_user_idx
  ON email_verification_tokens(user_id)
  WHERE status = 'PENDING';

ALTER TABLE email_verification_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_verification_tokens FORCE ROW LEVEL SECURITY;

CREATE POLICY email_verification_tokens_select_policy
ON email_verification_tokens
FOR SELECT
USING (app.is_admin());

CREATE POLICY email_verification_tokens_insert_policy
ON email_verification_tokens
FOR INSERT
WITH CHECK (app.is_admin());

CREATE POLICY email_verification_tokens_update_policy
ON email_verification_tokens
FOR UPDATE
USING (app.is_admin())
WITH CHECK (app.is_admin());

CREATE POLICY email_verification_tokens_delete_policy
ON email_verification_tokens
FOR DELETE
USING (app.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE
ON email_verification_tokens
TO atelier_app_runtime;

COMMIT;

BEGIN;

ALTER TABLE sessions
  ADD COLUMN provider_id uuid REFERENCES providers(id) ON DELETE CASCADE,
  ADD COLUMN role text CHECK (role IN ('PROVIDER_OWNER', 'PROVIDER_MEMBER')),
  ADD COLUMN last_seen_at timestamptz;

CREATE INDEX sessions_provider_idx
  ON sessions(provider_id, expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE login_throttles (
  key_hash text PRIMARY KEY CHECK (char_length(key_hash) = 64),
  failed_attempts integer NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  window_started_at timestamptz NOT NULL,
  locked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER login_throttles_set_updated_at
BEFORE UPDATE ON login_throttles
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TABLE provider_login_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  membership_id uuid NOT NULL REFERENCES provider_members(id) ON DELETE CASCADE,
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

CREATE UNIQUE INDEX provider_login_challenges_one_pending_idx
  ON provider_login_challenges(user_id, provider_id)
  WHERE status = 'PENDING';

CREATE INDEX provider_login_challenges_expiry_idx
  ON provider_login_challenges(expires_at)
  WHERE status = 'PENDING';

ALTER TABLE login_throttles ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_throttles FORCE ROW LEVEL SECURITY;
ALTER TABLE provider_login_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_login_challenges FORCE ROW LEVEL SECURITY;

CREATE POLICY login_throttles_admin_policy
ON login_throttles
FOR ALL
USING (app.is_admin())
WITH CHECK (app.is_admin());

CREATE POLICY provider_login_challenges_admin_policy
ON provider_login_challenges
FOR ALL
USING (app.is_admin())
WITH CHECK (app.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE
ON login_throttles, provider_login_challenges
TO atelier_app_runtime;

COMMIT;

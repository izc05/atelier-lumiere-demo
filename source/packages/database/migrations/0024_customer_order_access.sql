BEGIN;

ALTER TABLE checkout_batches
  ADD CONSTRAINT checkout_batches_identity_unique
  UNIQUE (id, customer_user_id);

CREATE TABLE customer_order_access_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  checkout_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  revoked_at timestamptz,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (checkout_id, customer_user_id)
    REFERENCES checkout_batches(id, customer_user_id) ON DELETE CASCADE,
  CHECK (expires_at > created_at),
  CHECK (consumed_at IS NULL OR consumed_at >= created_at),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);

CREATE TABLE customer_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  user_agent_hash text CHECK (user_agent_hash IS NULL OR user_agent_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at),
  CHECK (last_seen_at >= created_at),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);

CREATE INDEX customer_access_customer_idx
  ON customer_order_access_tokens(customer_user_id, created_at DESC);
CREATE INDEX customer_access_active_idx
  ON customer_order_access_tokens(token_hash, expires_at)
  WHERE consumed_at IS NULL AND revoked_at IS NULL;
CREATE INDEX customer_sessions_customer_idx
  ON customer_sessions(customer_user_id, created_at DESC);
CREATE INDEX customer_sessions_active_idx
  ON customer_sessions(token_hash, expires_at)
  WHERE revoked_at IS NULL;

ALTER TABLE customer_order_access_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_order_access_tokens FORCE ROW LEVEL SECURITY;
ALTER TABLE customer_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_sessions FORCE ROW LEVEL SECURITY;

CREATE POLICY customer_access_admin_select ON customer_order_access_tokens
FOR SELECT USING (app.is_admin());
CREATE POLICY customer_access_admin_insert ON customer_order_access_tokens
FOR INSERT WITH CHECK (app.is_admin());
CREATE POLICY customer_access_admin_update ON customer_order_access_tokens
FOR UPDATE USING (app.is_admin()) WITH CHECK (app.is_admin());
CREATE POLICY customer_access_admin_delete ON customer_order_access_tokens
FOR DELETE USING (app.is_admin());

CREATE POLICY customer_sessions_admin_select ON customer_sessions
FOR SELECT USING (app.is_admin());
CREATE POLICY customer_sessions_admin_insert ON customer_sessions
FOR INSERT WITH CHECK (app.is_admin());
CREATE POLICY customer_sessions_admin_update ON customer_sessions
FOR UPDATE USING (app.is_admin()) WITH CHECK (app.is_admin());
CREATE POLICY customer_sessions_admin_delete ON customer_sessions
FOR DELETE USING (app.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON
  customer_order_access_tokens,
  customer_sessions
TO atelier_app_runtime;

COMMIT;

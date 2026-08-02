BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE SCHEMA IF NOT EXISTS app;

CREATE OR REPLACE FUNCTION app.current_role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.role', true), '');
$$;

CREATE OR REPLACE FUNCTION app.current_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION app.current_provider_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.provider_id', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION app.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT app.current_role() = 'ADMIN';
$$;

CREATE OR REPLACE FUNCTION app.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext NOT NULL UNIQUE,
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 120),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACTIVE', 'SUSPENDED')),
  email_verified_at timestamptz,
  two_factor_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug citext NOT NULL UNIQUE CHECK (slug::text ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 140),
  legal_name text,
  status text NOT NULL DEFAULT 'INVITED' CHECK (status IN ('INVITED', 'ACTIVE', 'SUSPENDED')),
  contact_name text NOT NULL CHECK (char_length(contact_name) BETWEEN 2 AND 120),
  contact_email citext NOT NULL,
  specialty text NOT NULL CHECK (char_length(specialty) BETWEEN 2 AND 160),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE provider_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES providers(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  role text NOT NULL CHECK (role IN ('PROVIDER_OWNER', 'PROVIDER_MEMBER')),
  status text NOT NULL DEFAULT 'INVITED' CHECK (status IN ('INVITED', 'ACTIVE', 'SUSPENDED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_id, user_id)
);

CREATE TABLE provider_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES providers(id) ON DELETE RESTRICT,
  email citext NOT NULL,
  role text NOT NULL CHECK (role IN ('PROVIDER_OWNER', 'PROVIDER_MEMBER')),
  token_hash text NOT NULL UNIQUE CHECK (char_length(token_hash) >= 32),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED')),
  expires_at timestamptz NOT NULL,
  invited_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  accepted_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at),
  CHECK ((status = 'ACCEPTED') = (accepted_by IS NOT NULL AND accepted_at IS NOT NULL))
);

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE CHECK (char_length(token_hash) >= 32),
  ip_hash text,
  user_agent text,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at)
);

CREATE TABLE audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  provider_id uuid REFERENCES providers(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (char_length(action) BETWEEN 3 AND 120),
  entity_type text NOT NULL CHECK (char_length(entity_type) BETWEEN 2 AND 80),
  entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX providers_status_idx ON providers(status);
CREATE INDEX provider_members_provider_idx ON provider_members(provider_id, status);
CREATE INDEX provider_members_user_idx ON provider_members(user_id, status);
CREATE INDEX provider_invitations_provider_idx ON provider_invitations(provider_id, status);
CREATE INDEX provider_invitations_email_idx ON provider_invitations(email, status);
CREATE INDEX sessions_user_idx ON sessions(user_id, expires_at);
CREATE INDEX audit_events_provider_idx ON audit_events(provider_id, created_at DESC);
CREATE INDEX audit_events_actor_idx ON audit_events(actor_user_id, created_at DESC);

CREATE TRIGGER users_set_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER providers_set_updated_at
BEFORE UPDATE ON providers
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER provider_members_set_updated_at
BEFORE UPDATE ON provider_members
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER provider_invitations_set_updated_at
BEFORE UPDATE ON provider_invitations
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
ALTER TABLE providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE providers FORCE ROW LEVEL SECURITY;
ALTER TABLE provider_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_members FORCE ROW LEVEL SECURITY;
ALTER TABLE provider_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_invitations FORCE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;

CREATE POLICY users_select_policy ON users
FOR SELECT
USING (app.is_admin() OR id = app.current_user_id());

CREATE POLICY users_insert_policy ON users
FOR INSERT
WITH CHECK (app.is_admin() OR id = app.current_user_id());

CREATE POLICY users_update_policy ON users
FOR UPDATE
USING (app.is_admin() OR id = app.current_user_id())
WITH CHECK (app.is_admin() OR id = app.current_user_id());

CREATE POLICY providers_select_policy ON providers
FOR SELECT
USING (app.is_admin() OR id = app.current_provider_id());

CREATE POLICY providers_insert_policy ON providers
FOR INSERT
WITH CHECK (app.is_admin());

CREATE POLICY providers_update_policy ON providers
FOR UPDATE
USING (
  app.is_admin()
  OR (app.current_role() = 'PROVIDER_OWNER' AND id = app.current_provider_id())
)
WITH CHECK (
  app.is_admin()
  OR (app.current_role() = 'PROVIDER_OWNER' AND id = app.current_provider_id())
);

CREATE POLICY provider_members_select_policy ON provider_members
FOR SELECT
USING (app.is_admin() OR provider_id = app.current_provider_id());

CREATE POLICY provider_members_insert_policy ON provider_members
FOR INSERT
WITH CHECK (
  app.is_admin()
  OR (app.current_role() = 'PROVIDER_OWNER' AND provider_id = app.current_provider_id())
);

CREATE POLICY provider_members_update_policy ON provider_members
FOR UPDATE
USING (
  app.is_admin()
  OR (app.current_role() = 'PROVIDER_OWNER' AND provider_id = app.current_provider_id())
)
WITH CHECK (
  app.is_admin()
  OR (app.current_role() = 'PROVIDER_OWNER' AND provider_id = app.current_provider_id())
);

CREATE POLICY provider_invitations_select_policy ON provider_invitations
FOR SELECT
USING (
  app.is_admin()
  OR (app.current_role() = 'PROVIDER_OWNER' AND provider_id = app.current_provider_id())
);

CREATE POLICY provider_invitations_insert_policy ON provider_invitations
FOR INSERT
WITH CHECK (
  app.is_admin()
  OR (app.current_role() = 'PROVIDER_OWNER' AND provider_id = app.current_provider_id())
);

CREATE POLICY provider_invitations_update_policy ON provider_invitations
FOR UPDATE
USING (
  app.is_admin()
  OR (app.current_role() = 'PROVIDER_OWNER' AND provider_id = app.current_provider_id())
)
WITH CHECK (
  app.is_admin()
  OR (app.current_role() = 'PROVIDER_OWNER' AND provider_id = app.current_provider_id())
);

CREATE POLICY sessions_select_policy ON sessions
FOR SELECT
USING (app.is_admin() OR user_id = app.current_user_id());

CREATE POLICY sessions_insert_policy ON sessions
FOR INSERT
WITH CHECK (app.is_admin() OR user_id = app.current_user_id());

CREATE POLICY sessions_update_policy ON sessions
FOR UPDATE
USING (app.is_admin() OR user_id = app.current_user_id())
WITH CHECK (app.is_admin() OR user_id = app.current_user_id());

CREATE POLICY sessions_delete_policy ON sessions
FOR DELETE
USING (app.is_admin() OR user_id = app.current_user_id());

CREATE POLICY audit_events_select_policy ON audit_events
FOR SELECT
USING (
  app.is_admin()
  OR (provider_id IS NOT NULL AND provider_id = app.current_provider_id())
);

CREATE POLICY audit_events_insert_policy ON audit_events
FOR INSERT
WITH CHECK (
  app.is_admin()
  OR (provider_id IS NOT NULL AND provider_id = app.current_provider_id())
);

COMMIT;

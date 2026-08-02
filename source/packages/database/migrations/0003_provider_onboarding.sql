BEGIN;

CREATE TABLE user_credentials (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  password_hash text NOT NULL CHECK (char_length(password_hash) >= 64),
  password_salt text NOT NULL CHECK (char_length(password_salt) >= 16),
  password_algorithm text NOT NULL DEFAULT 'scrypt-v1'
    CHECK (password_algorithm = 'scrypt-v1'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER user_credentials_set_updated_at
BEFORE UPDATE ON user_credentials
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

ALTER TABLE user_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_credentials FORCE ROW LEVEL SECURITY;

CREATE POLICY user_credentials_select_policy ON user_credentials
FOR SELECT
USING (app.is_admin() OR user_id = app.current_user_id());

CREATE POLICY user_credentials_insert_policy ON user_credentials
FOR INSERT
WITH CHECK (app.is_admin() OR user_id = app.current_user_id());

CREATE POLICY user_credentials_update_policy ON user_credentials
FOR UPDATE
USING (app.is_admin() OR user_id = app.current_user_id())
WITH CHECK (app.is_admin() OR user_id = app.current_user_id());

CREATE POLICY user_credentials_delete_policy ON user_credentials
FOR DELETE
USING (app.is_admin() OR user_id = app.current_user_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON user_credentials TO atelier_app_runtime;

COMMIT;

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname = 'atelier_app_runtime'
  ) THEN
    CREATE ROLE atelier_app_runtime
      NOLOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT
      NOBYPASSRLS;
  END IF;
END;
$$;

GRANT USAGE ON SCHEMA public, app TO atelier_app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON users, providers, provider_members, provider_invitations, sessions, audit_events
  TO atelier_app_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO atelier_app_runtime;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO atelier_app_runtime;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO atelier_app_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO atelier_app_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA app
  GRANT EXECUTE ON FUNCTIONS TO atelier_app_runtime;

COMMIT;

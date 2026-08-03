\set ON_ERROR_STOP on

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atelier_rls_test') THEN
    CREATE ROLE atelier_rls_test NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END;
$$;

GRANT USAGE ON SCHEMA public, app TO atelier_rls_test;
GRANT SELECT, INSERT, UPDATE, DELETE ON users, providers, provider_members, provider_invitations, sessions, audit_events TO atelier_rls_test;
GRANT SELECT, INSERT, UPDATE, DELETE ON payment_attempts, payment_webhook_events TO atelier_rls_test;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO atelier_rls_test;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO atelier_rls_test;

SET ROLE atelier_rls_test;

SELECT set_config('app.role', 'PROVIDER_OWNER', false);
SELECT set_config('app.user_id', '00000000-0000-4000-8000-000000000101', false);
SELECT set_config('app.provider_id', '00000000-0000-4000-8000-000000000201', false);

DO $$
DECLARE
  visible_providers integer;
  visible_members integer;
  visible_invitations integer;
  visible_audit integer;
  visible_users integer;
  visible_payments integer;
  changed_rows integer;
BEGIN
  SELECT count(*) INTO visible_providers FROM providers;
  IF visible_providers <> 1 THEN
    RAISE EXCEPTION 'Taller A puede ver % proveedores; debería ver 1.', visible_providers;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM providers
    WHERE id = '00000000-0000-4000-8000-000000000201'
  ) THEN
    RAISE EXCEPTION 'Taller A no puede ver su propio registro.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM providers
    WHERE id = '00000000-0000-4000-8000-000000000202'
  ) THEN
    RAISE EXCEPTION 'Taller A puede ver el Taller B.';
  END IF;

  SELECT count(*) INTO visible_members FROM provider_members;
  IF visible_members <> 1 THEN
    RAISE EXCEPTION 'Taller A puede ver % miembros; debería ver 1.', visible_members;
  END IF;

  SELECT count(*) INTO visible_invitations FROM provider_invitations;
  IF visible_invitations <> 1 THEN
    RAISE EXCEPTION 'Taller A puede ver % invitaciones; debería ver 1.', visible_invitations;
  END IF;

  SELECT count(*) INTO visible_audit FROM audit_events;
  IF visible_audit <> 1 THEN
    RAISE EXCEPTION 'Taller A puede ver % eventos; debería ver 1.', visible_audit;
  END IF;

  SELECT count(*) INTO visible_users FROM users;
  IF visible_users <> 1 THEN
    RAISE EXCEPTION 'La propietaria A puede ver % usuarios; debería verse solo a sí misma.', visible_users;
  END IF;

  SELECT count(*) INTO visible_payments FROM payment_attempts;
  IF visible_payments <> 0 THEN
    RAISE EXCEPTION 'El taller puede leer intentos de pago internos.';
  END IF;

  UPDATE providers
  SET display_name = 'Intento bloqueado'
  WHERE id = '00000000-0000-4000-8000-000000000202';
  GET DIAGNOSTICS changed_rows = ROW_COUNT;
  IF changed_rows <> 0 THEN
    RAISE EXCEPTION 'Taller A ha modificado el Taller B.';
  END IF;

  UPDATE providers
  SET display_name = 'Taller de prueba A revisado'
  WHERE id = '00000000-0000-4000-8000-000000000201';
  GET DIAGNOSTICS changed_rows = ROW_COUNT;
  IF changed_rows <> 1 THEN
    RAISE EXCEPTION 'La propietaria A no puede modificar su propio taller.';
  END IF;
END;
$$;

SELECT set_config('app.role', 'PROVIDER_MEMBER', false);
DO $$
DECLARE
  changed_rows integer;
BEGIN
  UPDATE providers
  SET display_name = 'Cambio no autorizado'
  WHERE id = '00000000-0000-4000-8000-000000000201';
  GET DIAGNOSTICS changed_rows = ROW_COUNT;
  IF changed_rows <> 0 THEN
    RAISE EXCEPTION 'Un colaborador ha modificado el perfil del taller.';
  END IF;
END;
$$;

SELECT set_config('app.role', 'PROVIDER_OWNER', false);
SELECT set_config('app.user_id', '00000000-0000-4000-8000-000000000102', false);
SELECT set_config('app.provider_id', '00000000-0000-4000-8000-000000000202', false);

DO $$
DECLARE
  visible_providers integer;
BEGIN
  SELECT count(*) INTO visible_providers FROM providers;
  IF visible_providers <> 1 THEN
    RAISE EXCEPTION 'Taller B puede ver % proveedores; debería ver 1.', visible_providers;
  END IF;

  IF EXISTS (
    SELECT 1 FROM providers
    WHERE id = '00000000-0000-4000-8000-000000000201'
  ) THEN
    RAISE EXCEPTION 'Taller B puede ver el Taller A.';
  END IF;
END;
$$;

SELECT set_config('app.role', 'CUSTOMER', false);
SELECT set_config('app.user_id', '', false);
SELECT set_config('app.provider_id', '', false);

DO $$
DECLARE
  visible_providers integer;
  visible_payments integer;
BEGIN
  SELECT count(*) INTO visible_providers FROM providers;
  IF visible_providers <> 0 THEN
    RAISE EXCEPTION 'Un cliente puede leer proveedores privados.';
  END IF;
  SELECT count(*) INTO visible_payments FROM payment_attempts;
  IF visible_payments <> 0 THEN
    RAISE EXCEPTION 'Un cliente anónimo puede leer intentos de pago.';
  END IF;
END;
$$;

SELECT set_config('app.role', 'PAYMENT_SERVICE', false);
SELECT set_config('app.user_id', '00000000-0000-4000-8000-000000000009', false);
SELECT set_config('app.provider_id', '', false);

DO $$
DECLARE
  visible_users integer;
  visible_providers integer;
  visible_members integer;
  visible_invitations integer;
  changed_rows integer;
BEGIN
  SELECT count(*) INTO visible_users FROM users;
  IF visible_users <> 1 THEN
    RAISE EXCEPTION 'El servicio de pagos puede leer % usuarios; debería ver solo su cuenta técnica.', visible_users;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM users
    WHERE id = '00000000-0000-4000-8000-000000000009'
  ) OR EXISTS (
    SELECT 1 FROM users
    WHERE id <> '00000000-0000-4000-8000-000000000009'
  ) THEN
    RAISE EXCEPTION 'El servicio de pagos no está aislado en su propia identidad técnica.';
  END IF;
  SELECT count(*) INTO visible_providers FROM providers;
  IF visible_providers <> 2 THEN
    RAISE EXCEPTION 'El servicio de pagos ve % talleres operativos; debería ver los 2 necesarios para resolver pedidos.', visible_providers;
  END IF;
  SELECT count(*) INTO visible_members FROM provider_members;
  IF visible_members <> 0 THEN
    RAISE EXCEPTION 'El servicio de pagos puede leer miembros de talleres.';
  END IF;
  SELECT count(*) INTO visible_invitations FROM provider_invitations;
  IF visible_invitations <> 0 THEN
    RAISE EXCEPTION 'El servicio de pagos puede leer invitaciones.';
  END IF;
  UPDATE providers
  SET display_name = 'Cambio desde pagos'
  WHERE id = '00000000-0000-4000-8000-000000000201';
  GET DIAGNOSTICS changed_rows = ROW_COUNT;
  IF changed_rows <> 0 THEN
    RAISE EXCEPTION 'El servicio de pagos ha modificado un taller.';
  END IF;
END;
$$;

SELECT set_config('app.role', 'ADMIN', false);
SELECT set_config('app.user_id', '00000000-0000-4000-8000-000000000001', false);

DO $$
DECLARE
  visible_providers integer;
  visible_demo_users integer;
  visible_technical_users integer;
BEGIN
  SELECT count(*) INTO visible_providers FROM providers;
  SELECT count(*) INTO visible_demo_users
    FROM users
   WHERE email::text NOT LIKE '%@atelier.invalid';
  SELECT count(*) INTO visible_technical_users
    FROM users
   WHERE email::text LIKE '%@atelier.invalid';

  IF visible_providers <> 2 THEN
    RAISE EXCEPTION 'Administración ve % proveedores; debería ver 2.', visible_providers;
  END IF;
  IF visible_demo_users <> 3 THEN
    RAISE EXCEPTION 'Administración ve % usuarios de demostración; debería ver 3.', visible_demo_users;
  END IF;
  IF visible_technical_users <> 3 THEN
    RAISE EXCEPTION 'Administración ve % cuentas técnicas; debería ver 3.', visible_technical_users;
  END IF;
END;
$$;

RESET ROLE;
ROLLBACK;
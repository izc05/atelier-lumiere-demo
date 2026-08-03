\set ON_ERROR_STOP on

BEGIN;

SET LOCAL ROLE atelier_app_runtime;
SELECT set_config('app.role', 'ADMIN', true);
SELECT set_config('app.user_id', '00000000-0000-4000-8000-000000000001', true);
SELECT set_config('app.provider_id', '', true);

INSERT INTO users (
  id, email, display_name, status, email_verified_at, two_factor_enabled
) VALUES (
  '00000000-0000-4000-8000-000000000105',
  'administrador-real@example.test',
  'Administración real de prueba',
  'ACTIVE',
  now(),
  true
);

INSERT INTO user_credentials (
  user_id, password_hash, password_salt, password_algorithm
) VALUES (
  '00000000-0000-4000-8000-000000000105',
  repeat('h', 86),
  repeat('s', 22),
  'scrypt-v1'
);

INSERT INTO admin_memberships (
  user_id, role, status, created_by
) VALUES (
  '00000000-0000-4000-8000-000000000105',
  'PLATFORM_OWNER',
  'ACTIVE',
  '00000000-0000-4000-8000-000000000001'
);

INSERT INTO admin_totp_credentials (
  user_id, secret_ciphertext, secret_iv, secret_auth_tag,
  status, activated_at
) VALUES (
  '00000000-0000-4000-8000-000000000105',
  'ciphertext-de-prueba',
  'iv-de-prueba',
  'tag-de-prueba',
  'ACTIVE',
  now()
);

INSERT INTO user_recovery_codes (user_id, code_hash)
VALUES (
  '00000000-0000-4000-8000-000000000105',
  repeat('a', 64)
);

SELECT set_config('app.role', 'AUTH_SERVICE', true);
SELECT set_config('app.user_id', '00000000-0000-4000-8000-000000000008', true);
SELECT set_config('app.provider_id', '', true);

DO $$
DECLARE
  visible_users integer;
  visible_credentials integer;
  visible_memberships integer;
  visible_totp integer;
  visible_recovery integer;
BEGIN
  SELECT count(*) INTO visible_users
    FROM users
   WHERE id = '00000000-0000-4000-8000-000000000105';
  SELECT count(*) INTO visible_credentials
    FROM user_credentials
   WHERE user_id = '00000000-0000-4000-8000-000000000105';
  SELECT count(*) INTO visible_memberships
    FROM admin_memberships
   WHERE user_id = '00000000-0000-4000-8000-000000000105';
  SELECT count(*) INTO visible_totp
    FROM admin_totp_credentials
   WHERE user_id = '00000000-0000-4000-8000-000000000105';
  SELECT count(*) INTO visible_recovery
    FROM user_recovery_codes
   WHERE user_id = '00000000-0000-4000-8000-000000000105';

  IF visible_users <> 1
     OR visible_credentials <> 1
     OR visible_memberships <> 1
     OR visible_totp <> 1
     OR visible_recovery <> 1 THEN
    RAISE EXCEPTION 'El servicio de autenticación no puede leer la cuenta administrativa completa.';
  END IF;
END;
$$;

INSERT INTO admin_login_challenges (
  id, user_id, token_hash, expires_at
) VALUES (
  '72000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000105',
  repeat('b', 64),
  now() + interval '10 minutes'
);

INSERT INTO sessions (
  id, user_id, token_hash, role, provider_id,
  expires_at, last_seen_at, user_agent
) VALUES (
  '73000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000105',
  repeat('c', 64),
  'PLATFORM_OWNER',
  NULL,
  now() + interval '8 hours',
  now(),
  'admin-authentication-test'
);

INSERT INTO audit_events (
  actor_user_id, provider_id, action, entity_type, entity_id, metadata
) VALUES (
  '00000000-0000-4000-8000-000000000105',
  NULL,
  'ADMIN_LOGIN_CHALLENGE_CREATED',
  'admin_login_challenge',
  '72000000-0000-4000-8000-000000000001',
  '{"source":"database-test"}'::jsonb
);

DO $$
BEGIN
  BEGIN
    INSERT INTO sessions (
      user_id, token_hash, role, provider_id, expires_at
    ) VALUES (
      '00000000-0000-4000-8000-000000000105',
      repeat('d', 64),
      'PLATFORM_OWNER',
      '00000000-0000-4000-8000-000000000201',
      now() + interval '8 hours'
    );
    RAISE EXCEPTION 'Una sesión administrativa adoptó un taller.';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
END;
$$;

SELECT set_config('app.role', 'PROVIDER_OWNER', true);
SELECT set_config('app.user_id', '00000000-0000-4000-8000-000000000101', true);
SELECT set_config('app.provider_id', '00000000-0000-4000-8000-000000000201', true);

DO $$
DECLARE
  visible_memberships integer;
  visible_totp integer;
  visible_challenges integer;
  visible_admin_sessions integer;
  visible_admin_users integer;
BEGIN
  SELECT count(*) INTO visible_memberships FROM admin_memberships;
  SELECT count(*) INTO visible_totp FROM admin_totp_credentials;
  SELECT count(*) INTO visible_challenges FROM admin_login_challenges;
  SELECT count(*) INTO visible_admin_sessions
    FROM sessions
   WHERE role IN ('PLATFORM_OWNER', 'PROVIDER_MANAGER', 'EDITORIAL_REVIEWER');
  SELECT count(*) INTO visible_admin_users
    FROM users
   WHERE id = '00000000-0000-4000-8000-000000000105';

  IF visible_memberships <> 0
     OR visible_totp <> 0
     OR visible_challenges <> 0
     OR visible_admin_sessions <> 0
     OR visible_admin_users <> 0 THEN
    RAISE EXCEPTION 'Un proveedor puede consultar información administrativa privada.';
  END IF;
END;
$$;

SELECT set_config('app.role', 'CUSTOMER', true);
SELECT set_config('app.user_id', '00000000-0000-4000-8000-000000000103', true);
SELECT set_config('app.provider_id', '', true);

DO $$
DECLARE
  visible_memberships integer;
  visible_challenges integer;
BEGIN
  SELECT count(*) INTO visible_memberships FROM admin_memberships;
  SELECT count(*) INTO visible_challenges FROM admin_login_challenges;
  IF visible_memberships <> 0 OR visible_challenges <> 0 THEN
    RAISE EXCEPTION 'Un cliente puede consultar autenticación administrativa.';
  END IF;
END;
$$;

SELECT set_config('app.role', 'ADMIN', true);
SELECT set_config('app.user_id', '00000000-0000-4000-8000-000000000001', true);

DO $$
DECLARE
  memberships integer;
  sessions_count integer;
BEGIN
  SELECT count(*) INTO memberships
    FROM admin_memberships
   WHERE user_id = '00000000-0000-4000-8000-000000000105'
     AND role = 'PLATFORM_OWNER'
     AND status = 'ACTIVE';
  SELECT count(*) INTO sessions_count
    FROM sessions
   WHERE user_id = '00000000-0000-4000-8000-000000000105'
     AND role = 'PLATFORM_OWNER'
     AND provider_id IS NULL;

  IF memberships <> 1 OR sessions_count <> 1 THEN
    RAISE EXCEPTION 'La base administrativa no conserva membresía y sesión correctamente.';
  END IF;
END;
$$;

RESET ROLE;
ROLLBACK;

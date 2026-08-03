BEGIN;

INSERT INTO users (
  id, email, display_name, status, email_verified_at, two_factor_enabled
) VALUES
  ('00000000-0000-4000-8000-000000000001', 'admin@atelier-lumiere.example', 'Administración Atelier Lumière', 'ACTIVE', now(), true),
  ('00000000-0000-4000-8000-000000000101', 'propietaria-a@atelier-lumiere.example', 'Propietaria Taller A', 'ACTIVE', now(), true),
  ('00000000-0000-4000-8000-000000000102', 'propietaria-b@atelier-lumiere.example', 'Propietaria Taller B', 'ACTIVE', now(), true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO admin_memberships (
  user_id, role, status, created_by
) VALUES (
  '00000000-0000-4000-8000-000000000001',
  'PLATFORM_OWNER',
  'ACTIVE',
  '00000000-0000-4000-8000-000000000001'
)
ON CONFLICT (user_id) DO UPDATE
SET role = 'PLATFORM_OWNER',
    status = 'ACTIVE',
    updated_at = now();

INSERT INTO providers (
  id, slug, display_name, status, contact_name, contact_email, specialty, created_by
) VALUES
  (
    '00000000-0000-4000-8000-000000000201',
    'taller-prueba-a',
    'Taller de prueba A',
    'ACTIVE',
    'Propietaria Taller A',
    'propietaria-a@atelier-lumiere.example',
    'Bordado artesanal',
    '00000000-0000-4000-8000-000000000001'
  ),
  (
    '00000000-0000-4000-8000-000000000202',
    'taller-prueba-b',
    'Taller de prueba B',
    'ACTIVE',
    'Propietaria Taller B',
    'propietaria-b@atelier-lumiere.example',
    'Cerámica artesanal',
    '00000000-0000-4000-8000-000000000001'
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO provider_members (
  id, provider_id, user_id, role, status
) VALUES
  (
    '00000000-0000-4000-8000-000000000301',
    '00000000-0000-4000-8000-000000000201',
    '00000000-0000-4000-8000-000000000101',
    'PROVIDER_OWNER',
    'ACTIVE'
  ),
  (
    '00000000-0000-4000-8000-000000000302',
    '00000000-0000-4000-8000-000000000202',
    '00000000-0000-4000-8000-000000000102',
    'PROVIDER_OWNER',
    'ACTIVE'
  )
ON CONFLICT (provider_id, user_id) DO NOTHING;

INSERT INTO provider_invitations (
  id, provider_id, email, role, token_hash, status, expires_at, invited_by
) VALUES
  (
    '00000000-0000-4000-8000-000000000401',
    '00000000-0000-4000-8000-000000000201',
    'colaborador-a@atelier-lumiere.example',
    'PROVIDER_MEMBER',
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    'PENDING',
    now() + interval '48 hours',
    '00000000-0000-4000-8000-000000000001'
  ),
  (
    '00000000-0000-4000-8000-000000000402',
    '00000000-0000-4000-8000-000000000202',
    'colaborador-b@atelier-lumiere.example',
    'PROVIDER_MEMBER',
    'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    'PENDING',
    now() + interval '48 hours',
    '00000000-0000-4000-8000-000000000001'
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO audit_events (
  actor_user_id, provider_id, action, entity_type, entity_id, metadata
) VALUES
  (
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000201',
    'provider.seeded',
    'provider',
    '00000000-0000-4000-8000-000000000201',
    '{"environment":"test"}'::jsonb
  ),
  (
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000202',
    'provider.seeded',
    'provider',
    '00000000-0000-4000-8000-000000000202',
    '{"environment":"test"}'::jsonb
  );

COMMIT;
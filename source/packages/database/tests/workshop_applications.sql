\set ON_ERROR_STOP on

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atelier_workshop_rls_test') THEN
    CREATE ROLE atelier_workshop_rls_test NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END;
$$;

GRANT USAGE ON SCHEMA public, app TO atelier_workshop_rls_test;
GRANT SELECT, INSERT, UPDATE ON users, providers, provider_profiles,
  workshop_applications, audit_events
  TO atelier_workshop_rls_test;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO atelier_workshop_rls_test;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO atelier_workshop_rls_test;

SET LOCAL ROLE atelier_workshop_rls_test;
SELECT set_config('app.role', 'ADMIN', true);
SELECT set_config('app.user_id', '00000000-0000-4000-8000-000000000001', true);
SELECT set_config('app.provider_id', '', true);

INSERT INTO users (id, email, display_name, status, email_verified_at)
VALUES (
  '00000000-0000-4000-8000-000000000651',
  'workshop-admin@example.test',
  'Administración de solicitudes',
  'ACTIVE',
  now()
) ON CONFLICT (id) DO NOTHING;

INSERT INTO providers (
  id, slug, display_name, contact_name, contact_email, specialty, status, created_by
) VALUES (
  '00000000-0000-4000-8000-000000000652',
  'taller-existente',
  'Taller existente',
  'Responsable existente',
  'existente@example.test',
  'Cerámica',
  'ACTIVE',
  '00000000-0000-4000-8000-000000000651'
) ON CONFLICT (id) DO NOTHING;

CREATE FUNCTION pg_temp.submit_workshop_application(
  email_address text,
  phone_value text DEFAULT NULL,
  slug_value text DEFAULT NULL,
  work_value text DEFAULT NULL,
  story_value text DEFAULT NULL,
  social_value jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  application_id uuid;
BEGIN
  INSERT INTO workshop_applications (
    display_name, contact_name, contact_email, specialty, message,
    phone, proposed_slug, work_description, applicant_story, social_networks,
    privacy_accepted_at, privacy_document_version, submission_version
  ) VALUES (
    'Taller candidato', 'Persona solicitante', email_address, 'Cerámica artística',
    'Mensaje privado para Atelier Lumière.', phone_value, slug_value, work_value,
    story_value, social_value, now(), '0.1.0', 2
  )
  RETURNING id INTO application_id;
  RETURN application_id;
END;
$$;

DO $$
DECLARE
  new_columns integer;
  rls_enabled boolean;
  rls_forced boolean;
BEGIN
  SELECT count(*) INTO new_columns
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'workshop_applications'
    AND column_name IN (
      'phone', 'proposed_slug', 'work_description', 'applicant_story',
      'social_networks', 'admin_notes', 'privacy_accepted_at',
      'privacy_document_version', 'submission_version'
    );
  IF new_columns <> 9 THEN
    RAISE EXCEPTION 'Faltan campos de la ampliación: se encontraron % de 9.', new_columns;
  END IF;

  SELECT relrowsecurity, relforcerowsecurity INTO rls_enabled, rls_forced
  FROM pg_class
  WHERE oid = 'workshop_applications'::regclass;
  IF NOT rls_enabled OR NOT rls_forced THEN
    RAISE EXCEPTION 'RLS o FORCE RLS no está activo en workshop_applications.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'workshop_applications_active_email_idx'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'workshop_applications_status_created_idx'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'workshop_applications_proposed_slug_active_idx'
  ) THEN
    RAISE EXCEPTION 'Falta un índice esperado de workshop_applications.';
  END IF;
END;
$$;

SELECT set_config('app.role', 'AUTH_SERVICE', true);
SELECT set_config('app.user_id', '00000000-0000-4000-8000-000000000008', true);

SELECT pg_temp.submit_workshop_application(
  'campos@example.test',
  '+34 612 345 678',
  'taller-candidato',
  'Creamos piezas de cerámica de forma artesanal.',
  'La historia del taller comenzó en un pequeño estudio familiar.',
  '{"instagram":"https://instagram.com/taller-candidato","other":"@taller"}'::jsonb
) AS fields_application_id \gset

DO $$
DECLARE
  application_row workshop_applications%ROWTYPE;
BEGIN
  SELECT * INTO application_row
  FROM workshop_applications
  WHERE contact_email = 'campos@example.test';

  IF application_row.phone <> '+34 612 345 678'
     OR application_row.proposed_slug::text <> 'taller-candidato'
     OR application_row.social_networks->>'other' <> '@taller'
     OR application_row.submission_version <> 2
     OR application_row.privacy_accepted_at IS NULL
     OR application_row.privacy_document_version <> '0.1.0'
     OR application_row.status <> 'PENDING' THEN
    RAISE EXCEPTION 'Los campos ampliados no se conservaron correctamente.';
  END IF;
END;
$$;

DO $$
BEGIN
  BEGIN
    PERFORM pg_temp.submit_workshop_application('phone-short@example.test', '123');
    RAISE EXCEPTION 'Se aceptó un teléfono demasiado corto.';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    PERFORM pg_temp.submit_workshop_application('phone-format@example.test', 'teléfono 612345678');
    RAISE EXCEPTION 'Se aceptó un teléfono con formato inválido.';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    PERFORM pg_temp.submit_workshop_application('slug-invalid@example.test', NULL, 'Slug Inválido');
    RAISE EXCEPTION 'Se aceptó un proposed_slug inválido.';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    PERFORM pg_temp.submit_workshop_application('work-short@example.test', NULL, NULL, 'demasiado corto');
    RAISE EXCEPTION 'Se aceptó work_description demasiado corto.';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    PERFORM pg_temp.submit_workshop_application(
      'story-long@example.test', NULL, NULL, NULL, repeat('x', 4001)
    );
    RAISE EXCEPTION 'Se aceptó applicant_story demasiado largo.';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    PERFORM pg_temp.submit_workshop_application(
      'social-invalid@example.test', NULL, NULL, NULL, NULL, '[]'::jsonb
    );
    RAISE EXCEPTION 'Se aceptó social_networks que no es un objeto.';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    PERFORM pg_temp.submit_workshop_application(
      'social-scalar@example.test', NULL, NULL, NULL, NULL, '"perfil"'::jsonb
    );
    RAISE EXCEPTION 'Se aceptó social_networks escalar.';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO workshop_applications (
      display_name, contact_name, contact_email, specialty,
      privacy_accepted_at, privacy_document_version, submission_version
    ) VALUES (
      'Sin consentimiento', 'Persona solicitante', 'sin-consent@example.test', 'Textil',
      NULL, NULL, 2
    );
    RAISE EXCEPTION 'Se aceptó una solicitud nueva sin consentimiento.';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO workshop_applications (
      display_name, contact_name, contact_email, specialty,
      privacy_accepted_at, privacy_document_version, submission_version
    ) VALUES (
      'Contrato histórico falso', 'Persona solicitante', 'v1-new@example.test', 'Textil',
      NULL, NULL, 1
    );
    RAISE EXCEPTION 'Se aceptó una inserción nueva con submission_version 1.';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    PERFORM pg_temp.submit_workshop_application(
      'slug-conflict@example.test', NULL, 'taller-existente'
    );
    RAISE EXCEPTION 'Se aceptó un proposed_slug ya asignado a un provider.';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
END;
$$;

SELECT pg_temp.submit_workshop_application('changes@example.test') AS changes_application_id \gset

SELECT set_config('app.role', 'ADMIN', true);
SELECT set_config('app.user_id', '00000000-0000-4000-8000-000000000651', true);

UPDATE workshop_applications
SET status = 'CHANGES_REQUESTED', reviewed_by = app.current_user_id(), reviewed_at = now(),
    review_note = 'Amplía la descripción del proceso.'
WHERE id = :'changes_application_id';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM workshop_applications
    WHERE contact_email = 'changes@example.test'
      AND status = 'CHANGES_REQUESTED'
      AND reviewed_by = '00000000-0000-4000-8000-000000000651'
      AND reviewed_at IS NOT NULL
      AND provider_id IS NULL
  ) THEN
    RAISE EXCEPTION 'CHANGES_REQUESTED no conserva la revisión coherente.';
  END IF;
END;
$$;

SELECT set_config('app.role', 'AUTH_SERVICE', true);
SELECT set_config('app.user_id', '00000000-0000-4000-8000-000000000008', true);

UPDATE workshop_applications
SET status = 'PENDING', reviewed_by = NULL, reviewed_at = NULL, review_note = NULL,
    work_description = 'Descripción ampliada después de solicitar cambios.',
    privacy_accepted_at = now(), privacy_document_version = '0.1.0',
    submission_version = submission_version + 1
WHERE id = :'changes_application_id';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM workshop_applications
    WHERE contact_email = 'changes@example.test' AND status = 'PENDING' AND submission_version = 3
  ) THEN
    RAISE EXCEPTION 'La transición CHANGES_REQUESTED -> PENDING no funcionó.';
  END IF;
END;
$$;

SELECT pg_temp.submit_workshop_application('approved@example.test') AS approved_application_id \gset
SELECT pg_temp.submit_workshop_application('rejected@example.test') AS rejected_application_id \gset
SELECT pg_temp.submit_workshop_application('duplicate@example.test') AS duplicate_application_id \gset

DO $$
BEGIN
  BEGIN
    PERFORM pg_temp.submit_workshop_application('duplicate@example.test');
    RAISE EXCEPTION 'Se aceptó un correo con otra solicitud activa.';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
END;
$$;

SELECT set_config('app.role', 'ADMIN', true);
SELECT set_config('app.user_id', '00000000-0000-4000-8000-000000000651', true);

UPDATE workshop_applications
SET status = 'APPROVED', reviewed_by = app.current_user_id(), reviewed_at = now(),
    provider_id = '00000000-0000-4000-8000-000000000652'
WHERE id = :'approved_application_id';

UPDATE workshop_applications
SET status = 'REJECTED', reviewed_by = app.current_user_id(), reviewed_at = now()
WHERE id IN (:'rejected_application_id', :'duplicate_application_id');

SELECT set_config('app.role', 'AUTH_SERVICE', true);
SELECT set_config('app.user_id', '00000000-0000-4000-8000-000000000008', true);
SELECT pg_temp.submit_workshop_application('duplicate@example.test') AS repeated_after_rejection_id \gset

SELECT set_config('app.role', 'ADMIN', true);
SELECT set_config('app.user_id', '00000000-0000-4000-8000-000000000651', true);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM workshop_applications
    WHERE contact_email = 'approved@example.test' AND status = 'APPROVED'
      AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND provider_id IS NOT NULL
  ) OR NOT EXISTS (
    SELECT 1 FROM workshop_applications
    WHERE contact_email = 'rejected@example.test' AND status = 'REJECTED'
      AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND provider_id IS NULL
  ) OR NOT EXISTS (
    SELECT 1 FROM workshop_applications
    WHERE contact_email = 'duplicate@example.test' AND status = 'PENDING'
  ) THEN
    RAISE EXCEPTION 'APPROVED, REJECTED o la nueva solicitud posterior no es válida.';
  END IF;

  BEGIN
    UPDATE workshop_applications
    SET status = 'APPROVED', provider_id = '00000000-0000-4000-8000-000000000652'
    WHERE contact_email = 'rejected@example.test';
    RAISE EXCEPTION 'Se permitió REJECTED -> APPROVED.';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE workshop_applications
    SET status = 'PENDING', reviewed_by = NULL, reviewed_at = NULL, provider_id = NULL
    WHERE contact_email = 'approved@example.test';
    RAISE EXCEPTION 'Se permitió APPROVED -> PENDING.';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE workshop_applications
    SET admin_notes = repeat('x', 4001)
    WHERE contact_email = 'campos@example.test';
    RAISE EXCEPTION 'Se aceptaron admin_notes demasiado largos.';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE workshop_applications
    SET submission_version = submission_version + 1
    WHERE contact_email = 'campos@example.test';
    RAISE EXCEPTION 'Se alteró submission_version fuera de un reenvío.';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END;
$$;

DO $$
DECLARE
  expected_count integer;
  visible_count integer;
BEGIN
  SELECT count(*) INTO expected_count FROM workshop_applications;
  SELECT count(*) INTO visible_count FROM workshop_applications;
  IF visible_count <> expected_count OR expected_count < 6 THEN
    RAISE EXCEPTION 'ADMIN no puede ver todas las solicitudes.';
  END IF;
END;
$$;

SELECT set_config('app.role', 'PROVIDER_OWNER', true);
SELECT set_config('app.user_id', '00000000-0000-4000-8000-000000000651', true);
SELECT set_config('app.provider_id', '00000000-0000-4000-8000-000000000652', true);

DO $$
DECLARE
  visible_count integer;
  changed_count integer;
  visible_workshop_audit integer;
BEGIN
  SELECT count(*) INTO visible_count FROM workshop_applications;
  IF visible_count <> 0 THEN
    RAISE EXCEPTION 'PROVIDER_OWNER puede leer solicitudes privadas, incluso una vinculada a su provider.';
  END IF;
  UPDATE workshop_applications SET admin_notes = 'Acceso cruzado'
  WHERE contact_email = 'approved@example.test';
  GET DIAGNOSTICS changed_count = ROW_COUNT;
  IF changed_count <> 0 THEN
    RAISE EXCEPTION 'PROVIDER_OWNER pudo modificar una solicitud.';
  END IF;
  SELECT count(*) INTO visible_workshop_audit
  FROM audit_events WHERE entity_type = 'workshop_application';
  IF visible_workshop_audit <> 0 THEN
    RAISE EXCEPTION 'El provider puede leer auditoría privada de solicitudes.';
  END IF;
END;
$$;

SELECT set_config('app.role', 'PROVIDER_MEMBER', true);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM workshop_applications) THEN
    RAISE EXCEPTION 'PROVIDER_MEMBER puede leer solicitudes privadas.';
  END IF;
END; $$;

SELECT set_config('app.role', 'CUSTOMER', true);
SELECT set_config('app.provider_id', '', true);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM workshop_applications) THEN
    RAISE EXCEPTION 'CUSTOMER puede leer solicitudes privadas.';
  END IF;
END; $$;

SELECT set_config('app.role', 'CATALOG_READER', true);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM workshop_applications) THEN
    RAISE EXCEPTION 'CATALOG_READER puede leer solicitudes privadas.';
  END IF;
END; $$;

SELECT set_config('app.role', '', true);
SELECT set_config('app.user_id', '', true);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM workshop_applications) THEN
    RAISE EXCEPTION 'Un contexto anónimo puede leer solicitudes privadas.';
  END IF;
END; $$;

SELECT set_config('app.role', 'ADMIN', true);
SELECT set_config('app.user_id', '00000000-0000-4000-8000-000000000651', true);

DO $$
DECLARE
  action_count integer;
BEGIN
  SELECT count(DISTINCT action) INTO action_count
  FROM audit_events
  WHERE entity_type = 'workshop_application'
    AND action IN (
      'WORKSHOP_APPLICATION_SUBMITTED',
      'WORKSHOP_APPLICATION_CHANGES_REQUESTED',
      'WORKSHOP_APPLICATION_APPROVED',
      'WORKSHOP_APPLICATION_REJECTED'
    );
  IF action_count <> 4 THEN
    RAISE EXCEPTION 'No se registraron los cuatro tipos de auditoría de solicitudes.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM audit_events
    WHERE entity_type = 'workshop_application'
      AND (
        provider_id IS NOT NULL
        OR metadata ?| ARRAY['phone', 'message', 'work_description', 'applicant_story', 'social_networks']
      )
  ) THEN
    RAISE EXCEPTION 'La auditoría de solicitudes contiene datos sensibles o alcance de provider.';
  END IF;
END;
$$;

RESET ROLE;
ROLLBACK;

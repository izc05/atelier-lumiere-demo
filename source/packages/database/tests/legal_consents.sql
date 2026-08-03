BEGIN;

SET LOCAL ROLE atelier_app_runtime;
SELECT set_config('app.role', 'ADMIN', true);
SELECT set_config('app.user_id', '00000000-0000-4000-8000-000000000001', true);
SELECT set_config('app.provider_id', '', true);

INSERT INTO users (
  id, email, display_name, status, email_verified_at, two_factor_enabled
) VALUES (
  '00000000-0000-4000-8000-000000000004',
  'cliente-legal@example.test',
  'Cliente legal',
  'ACTIVE',
  now(),
  false
);

INSERT INTO checkout_batches (
  id, customer_user_id, checkout_reference, currency,
  customer_name, contact_email, shipping_address,
  status, submitted_at
) VALUES (
  '50000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000004',
  'AL-CHECKOUT-LEGAL-0004',
  'EUR',
  'Cliente legal',
  'cliente-legal@example.test',
  '{"line1":"Calle Legal 4","city":"Granada","postalCode":"18001","country":"ES"}'::jsonb,
  'SUBMITTED',
  now()
);

INSERT INTO legal_documents (
  id, document_type, locale, version, title, content_markdown,
  content_sha256, status, review_status, effective_at, published_at, created_by
) VALUES
(
  '70000000-0000-4000-8000-000000000001',
  'PRIVACY_POLICY', 'es-ES', '1.0.0',
  'Política de privacidad técnica',
  '# Borrador técnico\n\nContenido sujeto a revisión profesional antes de apertura.',
  repeat('a', 64), 'ACTIVE', 'TECHNICAL_DRAFT', now(), now(),
  '00000000-0000-4000-8000-000000000001'
),
(
  '70000000-0000-4000-8000-000000000002',
  'PURCHASE_TERMS', 'es-ES', '1.0.0',
  'Condiciones de compra técnicas',
  '# Borrador técnico\n\nCondiciones pendientes de validación jurídica profesional.',
  repeat('b', 64), 'ACTIVE', 'TECHNICAL_DRAFT', now(), now(),
  '00000000-0000-4000-8000-000000000001'
);

DO $$
BEGIN
  BEGIN
    INSERT INTO legal_documents (
      document_type, locale, version, title, content_markdown,
      content_sha256, status, review_status, effective_at, published_at, created_by
    ) VALUES (
      'PRIVACY_POLICY', 'es-ES', '1.1.0', 'Otra privacidad activa',
      '# Documento incompatible\n\nNo puede haber dos versiones activas.',
      repeat('c', 64), 'ACTIVE', 'TECHNICAL_DRAFT', now(), now(),
      '00000000-0000-4000-8000-000000000001'
    );
    RAISE EXCEPTION 'La restricción de documento activo no funcionó';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
END;
$$;

DO $$
BEGIN
  BEGIN
    INSERT INTO legal_documents (
      document_type, locale, version, title, content_markdown,
      content_sha256, review_status, created_by
    ) VALUES (
      'COOKIE_POLICY', 'es-ES', '1.0.0', 'Cookies falsamente revisadas',
      '# Revisión incompleta\n\nNo existe revisor ni fecha de revisión.',
      repeat('d', 64), 'PROFESSIONAL_REVIEWED',
      '00000000-0000-4000-8000-000000000001'
    );
    RAISE EXCEPTION 'Se permitió fingir una revisión profesional';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
END;
$$;

INSERT INTO legal_consent_events (
  id, document_id, subject_user_id, checkout_id, purpose,
  decision, source, user_agent_hash, network_evidence_hash, evidence
) VALUES (
  '71000000-0000-4000-8000-000000000001',
  '70000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000004',
  '50000000-0000-4000-8000-000000000004',
  'PRIVACY_INFORMATION', 'ACCEPTED', 'CHECKOUT',
  repeat('e', 64), repeat('f', 64),
  '{"ui":"checkout-pilot","evidenceVersion":1}'::jsonb
),
(
  '71000000-0000-4000-8000-000000000002',
  '70000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000004',
  '50000000-0000-4000-8000-000000000004',
  'PURCHASE_CONTRACT', 'ACCEPTED', 'CHECKOUT',
  repeat('e', 64), repeat('f', 64),
  '{"ui":"checkout-pilot","evidenceVersion":1}'::jsonb
);

INSERT INTO checkout_legal_snapshots (
  checkout_id, document_id, consent_event_id, purpose, content_sha256
) VALUES
(
  '50000000-0000-4000-8000-000000000004',
  '70000000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000001',
  'PRIVACY_INFORMATION', repeat('a', 64)
),
(
  '50000000-0000-4000-8000-000000000004',
  '70000000-0000-4000-8000-000000000002',
  '71000000-0000-4000-8000-000000000002',
  'PURCHASE_CONTRACT', repeat('b', 64)
);

UPDATE legal_consent_events
   SET decision = 'REJECTED'
 WHERE id = '71000000-0000-4000-8000-000000000001';

DO $$
DECLARE
  stored_decision text;
BEGIN
  SELECT decision INTO stored_decision
    FROM legal_consent_events
   WHERE id = '71000000-0000-4000-8000-000000000001';
  IF stored_decision <> 'ACCEPTED' THEN
    RAISE EXCEPTION 'Se modificó un consentimiento histórico';
  END IF;
END;
$$;

INSERT INTO legal_consent_events (
  id, document_id, subject_user_id, checkout_id, purpose,
  decision, source, supersedes_event_id, evidence
) VALUES (
  '71000000-0000-4000-8000-000000000003',
  '70000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000004',
  '50000000-0000-4000-8000-000000000004',
  'PRIVACY_INFORMATION', 'WITHDRAWN', 'CUSTOMER_ACCOUNT',
  '71000000-0000-4000-8000-000000000001',
  '{"reason":"customer-request"}'::jsonb
);

DO $$
BEGIN
  BEGIN
    INSERT INTO legal_consent_events (
      document_id, subject_user_id, checkout_id, purpose,
      decision, source, supersedes_event_id
    ) VALUES (
      '70000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000004',
      '50000000-0000-4000-8000-000000000004',
      'PURCHASE_CONTRACT', 'WITHDRAWN', 'CUSTOMER_ACCOUNT',
      '71000000-0000-4000-8000-000000000001'
    );
    RAISE EXCEPTION 'Se permitió retirar un consentimiento diferente';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
END;
$$;

DO $$
BEGIN
  BEGIN
    INSERT INTO checkout_legal_snapshots (
      checkout_id, document_id, consent_event_id, purpose, content_sha256
    ) VALUES (
      '50000000-0000-4000-8000-000000000004',
      '70000000-0000-4000-8000-000000000001',
      '71000000-0000-4000-8000-000000000001',
      'CUSTOM_PRODUCT_ACKNOWLEDGEMENT', repeat('a', 64)
    );
    RAISE EXCEPTION 'Se permitió una copia legal con finalidad incorrecta';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
END;
$$;

DO $$
DECLARE
  active_docs integer;
  accepted_events integer;
  withdrawals integer;
  snapshots integer;
BEGIN
  SELECT count(*) INTO active_docs FROM legal_documents WHERE status = 'ACTIVE';
  SELECT count(*) INTO accepted_events FROM legal_consent_events WHERE decision = 'ACCEPTED';
  SELECT count(*) INTO withdrawals FROM legal_consent_events WHERE decision = 'WITHDRAWN';
  SELECT count(*) INTO snapshots FROM checkout_legal_snapshots;

  IF active_docs <> 2 OR accepted_events <> 2 OR withdrawals <> 1 OR snapshots <> 2 THEN
    RAISE EXCEPTION 'Resultado legal inesperado: docs %, aceptados %, retiradas %, copias %',
      active_docs, accepted_events, withdrawals, snapshots;
  END IF;
END;
$$;

ROLLBACK;

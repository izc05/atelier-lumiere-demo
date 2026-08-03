BEGIN;

CREATE TABLE legal_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_type text NOT NULL CHECK (document_type IN (
    'LEGAL_NOTICE',
    'PRIVACY_POLICY',
    'COOKIE_POLICY',
    'PURCHASE_TERMS',
    'SHIPPING_RETURNS',
    'CUSTOM_PRODUCTS',
    'PROVIDER_AGREEMENT',
    'CONTENT_LICENSE'
  )),
  locale text NOT NULL DEFAULT 'es-ES'
    CHECK (locale ~ '^[a-z]{2}(?:-[A-Z]{2})?$'),
  version text NOT NULL CHECK (version ~ '^[0-9]+[.][0-9]+[.][0-9]+$'),
  title text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 180),
  content_markdown text NOT NULL CHECK (char_length(content_markdown) BETWEEN 20 AND 100000),
  content_sha256 char(64) NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'ACTIVE', 'RETIRED')),
  review_status text NOT NULL DEFAULT 'TECHNICAL_DRAFT'
    CHECK (review_status IN ('TECHNICAL_DRAFT', 'PROFESSIONAL_REVIEWED')),
  reviewed_by text CHECK (reviewed_by IS NULL OR char_length(reviewed_by) BETWEEN 3 AND 180),
  reviewed_at timestamptz,
  effective_at timestamptz,
  published_at timestamptz,
  retired_at timestamptz,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_type, locale, version),
  CHECK (
    review_status <> 'PROFESSIONAL_REVIEWED'
    OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
  ),
  CHECK (
    status <> 'ACTIVE'
    OR (effective_at IS NOT NULL AND published_at IS NOT NULL)
  ),
  CHECK (status <> 'RETIRED' OR retired_at IS NOT NULL)
);

CREATE UNIQUE INDEX legal_documents_one_active_idx
  ON legal_documents(document_type, locale)
  WHERE status = 'ACTIVE';
CREATE INDEX legal_documents_public_idx
  ON legal_documents(locale, document_type, effective_at DESC)
  WHERE status = 'ACTIVE';

CREATE TABLE legal_consent_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES legal_documents(id) ON DELETE RESTRICT,
  subject_user_id uuid REFERENCES users(id) ON DELETE RESTRICT,
  checkout_id uuid REFERENCES checkout_batches(id) ON DELETE RESTRICT,
  provider_id uuid REFERENCES providers(id) ON DELETE RESTRICT,
  anonymous_id_hash char(64) CHECK (anonymous_id_hash IS NULL OR anonymous_id_hash ~ '^[a-f0-9]{64}$'),
  purpose text NOT NULL CHECK (purpose IN (
    'ESSENTIAL_SERVICE',
    'PRIVACY_INFORMATION',
    'COOKIE_PREFERENCES',
    'PURCHASE_CONTRACT',
    'CUSTOM_PRODUCT_ACKNOWLEDGEMENT',
    'PROVIDER_ONBOARDING',
    'CONTENT_LICENSE'
  )),
  decision text NOT NULL CHECK (decision IN ('ACCEPTED', 'REJECTED', 'WITHDRAWN')),
  source text NOT NULL CHECK (source IN (
    'COOKIE_BANNER',
    'CHECKOUT',
    'CUSTOMER_ACCOUNT',
    'PROVIDER_ONBOARDING',
    'PROVIDER_PANEL',
    'ADMIN'
  )),
  supersedes_event_id uuid REFERENCES legal_consent_events(id) ON DELETE RESTRICT,
  user_agent_hash char(64) CHECK (user_agent_hash IS NULL OR user_agent_hash ~ '^[a-f0-9]{64}$'),
  network_evidence_hash char(64)
    CHECK (network_evidence_hash IS NULL OR network_evidence_hash ~ '^[a-f0-9]{64}$'),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(evidence) = 'object'),
  CHECK (
    subject_user_id IS NOT NULL
    OR checkout_id IS NOT NULL
    OR provider_id IS NOT NULL
    OR anonymous_id_hash IS NOT NULL
  ),
  CHECK (decision <> 'WITHDRAWN' OR supersedes_event_id IS NOT NULL)
);

CREATE INDEX legal_consent_events_user_idx
  ON legal_consent_events(subject_user_id, purpose, occurred_at DESC)
  WHERE subject_user_id IS NOT NULL;
CREATE INDEX legal_consent_events_checkout_idx
  ON legal_consent_events(checkout_id, purpose, occurred_at DESC)
  WHERE checkout_id IS NOT NULL;
CREATE INDEX legal_consent_events_provider_idx
  ON legal_consent_events(provider_id, purpose, occurred_at DESC)
  WHERE provider_id IS NOT NULL;
CREATE INDEX legal_consent_events_anonymous_idx
  ON legal_consent_events(anonymous_id_hash, purpose, occurred_at DESC)
  WHERE anonymous_id_hash IS NOT NULL;

CREATE TABLE checkout_legal_snapshots (
  checkout_id uuid NOT NULL REFERENCES checkout_batches(id) ON DELETE RESTRICT,
  document_id uuid NOT NULL REFERENCES legal_documents(id) ON DELETE RESTRICT,
  consent_event_id uuid NOT NULL REFERENCES legal_consent_events(id) ON DELETE RESTRICT,
  purpose text NOT NULL CHECK (purpose IN (
    'PRIVACY_INFORMATION',
    'PURCHASE_CONTRACT',
    'CUSTOM_PRODUCT_ACKNOWLEDGEMENT'
  )),
  content_sha256 char(64) NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (checkout_id, purpose),
  UNIQUE (consent_event_id)
);

CREATE OR REPLACE FUNCTION app.set_legal_document_timestamps()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.status = 'ACTIVE' AND OLD.status IS DISTINCT FROM 'ACTIVE' THEN
    NEW.published_at := COALESCE(NEW.published_at, now());
    NEW.effective_at := COALESCE(NEW.effective_at, now());
    NEW.retired_at := NULL;
  ELSIF NEW.status = 'RETIRED' AND OLD.status IS DISTINCT FROM 'RETIRED' THEN
    NEW.retired_at := COALESCE(NEW.retired_at, now());
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER legal_documents_set_timestamps
BEFORE UPDATE ON legal_documents
FOR EACH ROW EXECUTE FUNCTION app.set_legal_document_timestamps();

CREATE OR REPLACE FUNCTION app.enforce_legal_consent_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  previous legal_consent_events%ROWTYPE;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'LEGAL_CONSENT_EVENTS_ARE_IMMUTABLE' USING ERRCODE = '42501';
  END IF;

  IF NEW.supersedes_event_id IS NOT NULL THEN
    SELECT * INTO previous
      FROM legal_consent_events
     WHERE id = NEW.supersedes_event_id;
    IF NOT FOUND
       OR previous.document_id IS DISTINCT FROM NEW.document_id
       OR previous.purpose IS DISTINCT FROM NEW.purpose
       OR previous.subject_user_id IS DISTINCT FROM NEW.subject_user_id
       OR previous.checkout_id IS DISTINCT FROM NEW.checkout_id
       OR previous.provider_id IS DISTINCT FROM NEW.provider_id
       OR previous.anonymous_id_hash IS DISTINCT FROM NEW.anonymous_id_hash THEN
      RAISE EXCEPTION 'LEGAL_CONSENT_SUPERSESSION_INVALID' USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER legal_consent_events_enforce
BEFORE INSERT OR UPDATE OR DELETE ON legal_consent_events
FOR EACH ROW EXECUTE FUNCTION app.enforce_legal_consent_event();

CREATE OR REPLACE FUNCTION app.enforce_checkout_legal_snapshot()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  consent legal_consent_events%ROWTYPE;
  document legal_documents%ROWTYPE;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'CHECKOUT_LEGAL_SNAPSHOTS_ARE_IMMUTABLE' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO consent FROM legal_consent_events WHERE id = NEW.consent_event_id;
  SELECT * INTO document FROM legal_documents WHERE id = NEW.document_id;

  IF NOT FOUND
     OR consent.document_id IS DISTINCT FROM NEW.document_id
     OR consent.checkout_id IS DISTINCT FROM NEW.checkout_id
     OR consent.purpose IS DISTINCT FROM NEW.purpose
     OR consent.decision <> 'ACCEPTED'
     OR document.content_sha256 IS DISTINCT FROM NEW.content_sha256 THEN
    RAISE EXCEPTION 'CHECKOUT_LEGAL_SNAPSHOT_INVALID' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER checkout_legal_snapshots_enforce
BEFORE INSERT OR UPDATE OR DELETE ON checkout_legal_snapshots
FOR EACH ROW EXECUTE FUNCTION app.enforce_checkout_legal_snapshot();

ALTER TABLE legal_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_documents FORCE ROW LEVEL SECURITY;
ALTER TABLE legal_consent_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_consent_events FORCE ROW LEVEL SECURITY;
ALTER TABLE checkout_legal_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkout_legal_snapshots FORCE ROW LEVEL SECURITY;

CREATE POLICY legal_documents_admin_all ON legal_documents
FOR ALL USING (app.is_admin()) WITH CHECK (app.is_admin());

CREATE POLICY legal_consent_events_admin_select ON legal_consent_events
FOR SELECT USING (app.is_admin());
CREATE POLICY legal_consent_events_admin_insert ON legal_consent_events
FOR INSERT WITH CHECK (app.is_admin());

CREATE POLICY checkout_legal_snapshots_admin_select ON checkout_legal_snapshots
FOR SELECT USING (app.is_admin());
CREATE POLICY checkout_legal_snapshots_admin_insert ON checkout_legal_snapshots
FOR INSERT WITH CHECK (app.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON legal_documents TO atelier_app_runtime;
GRANT SELECT, INSERT ON legal_consent_events TO atelier_app_runtime;
GRANT SELECT, INSERT ON checkout_legal_snapshots TO atelier_app_runtime;

COMMIT;

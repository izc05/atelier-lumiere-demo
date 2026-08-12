BEGIN;

ALTER TABLE workshop_applications
  ADD COLUMN phone text,
  ADD COLUMN proposed_slug citext,
  ADD COLUMN work_description text,
  ADD COLUMN applicant_story text,
  ADD COLUMN social_networks jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN admin_notes text,
  ADD COLUMN privacy_accepted_at timestamptz,
  ADD COLUMN privacy_document_version text,
  ADD COLUMN submission_version integer NOT NULL DEFAULT 1;

-- Las filas anteriores a esta ampliación se conservan sin fabricar evidencia
-- de consentimiento. Las nuevas inserciones usan el contrato de envío v2.
ALTER TABLE workshop_applications
  ALTER COLUMN submission_version SET DEFAULT 2,
  DROP CONSTRAINT workshop_applications_status_check,
  DROP CONSTRAINT workshop_applications_check,
  ADD CONSTRAINT workshop_applications_phone_check CHECK (
    phone IS NULL
    OR (
      char_length(phone) BETWEEN 7 AND 40
      AND phone ~ '[0-9]'
      AND phone ~ '^[0-9+() ./xX-]+$'
    )
  ),
  ADD CONSTRAINT workshop_applications_proposed_slug_check CHECK (
    proposed_slug IS NULL
    OR (
      char_length(proposed_slug::text) BETWEEN 2 AND 80
      AND proposed_slug::text ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    )
  ),
  ADD CONSTRAINT workshop_applications_work_description_check CHECK (
    work_description IS NULL
    OR char_length(work_description) BETWEEN 20 AND 4000
  ),
  ADD CONSTRAINT workshop_applications_applicant_story_check CHECK (
    applicant_story IS NULL
    OR char_length(applicant_story) BETWEEN 20 AND 4000
  ),
  ADD CONSTRAINT workshop_applications_social_networks_check CHECK (
    jsonb_typeof(social_networks) = 'object'
  ),
  ADD CONSTRAINT workshop_applications_admin_notes_check CHECK (
    admin_notes IS NULL OR char_length(admin_notes) <= 4000
  ),
  ADD CONSTRAINT workshop_applications_submission_version_check CHECK (
    submission_version >= 1
  ),
  ADD CONSTRAINT workshop_applications_privacy_document_version_check CHECK (
    privacy_document_version IS NULL
    OR (
      char_length(privacy_document_version) BETWEEN 1 AND 80
      AND privacy_document_version = btrim(privacy_document_version)
    )
  ),
  ADD CONSTRAINT workshop_applications_privacy_consent_check CHECK (
    (privacy_accepted_at IS NULL) = (privacy_document_version IS NULL)
    AND (
      submission_version = 1
      OR (privacy_accepted_at IS NOT NULL AND privacy_document_version IS NOT NULL)
    )
  ),
  ADD CONSTRAINT workshop_applications_status_check CHECK (
    status IN ('PENDING', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED')
  ),
  ADD CONSTRAINT workshop_applications_review_state_check CHECK (
    (status = 'PENDING'
      AND reviewed_by IS NULL AND reviewed_at IS NULL AND provider_id IS NULL)
    OR (status = 'CHANGES_REQUESTED'
      AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND provider_id IS NULL)
    OR (status = 'APPROVED'
      AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND provider_id IS NOT NULL)
    OR (status = 'REJECTED'
      AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND provider_id IS NULL)
  );

DROP INDEX workshop_applications_pending_email_idx;

CREATE UNIQUE INDEX workshop_applications_active_email_idx
  ON workshop_applications (contact_email)
  WHERE status IN ('PENDING', 'CHANGES_REQUESTED');

CREATE INDEX workshop_applications_proposed_slug_active_idx
  ON workshop_applications (proposed_slug)
  WHERE proposed_slug IS NOT NULL
    AND status IN ('PENDING', 'CHANGES_REQUESTED');

CREATE OR REPLACE FUNCTION app.guard_workshop_application()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'PENDING' THEN
      RAISE EXCEPTION 'WORKSHOP_APPLICATION_INITIAL_STATUS_INVALID'
        USING ERRCODE = '23514';
    END IF;
    IF NEW.submission_version < 2
       OR NEW.privacy_accepted_at IS NULL
       OR NEW.privacy_document_version IS NULL THEN
      RAISE EXCEPTION 'WORKSHOP_APPLICATION_CONSENT_REQUIRED'
        USING ERRCODE = '23514';
    END IF;
  ELSE
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NOT (
        (OLD.status = 'PENDING'
          AND NEW.status IN ('CHANGES_REQUESTED', 'APPROVED', 'REJECTED'))
        OR (OLD.status = 'CHANGES_REQUESTED' AND NEW.status = 'PENDING')
      ) THEN
        RAISE EXCEPTION 'WORKSHOP_APPLICATION_TRANSITION_INVALID: % -> %', OLD.status, NEW.status
          USING ERRCODE = '23514';
      END IF;

      IF OLD.status = 'CHANGES_REQUESTED' AND NEW.status = 'PENDING' THEN
        IF NEW.submission_version <> OLD.submission_version + 1
           OR NEW.privacy_accepted_at IS NULL
           OR NEW.privacy_document_version IS NULL THEN
          RAISE EXCEPTION 'WORKSHOP_APPLICATION_RESUBMISSION_INVALID'
            USING ERRCODE = '23514';
        END IF;
      ELSIF NEW.submission_version IS DISTINCT FROM OLD.submission_version THEN
        RAISE EXCEPTION 'WORKSHOP_APPLICATION_VERSION_CHANGE_INVALID'
          USING ERRCODE = '23514';
      END IF;
    ELSIF NEW.submission_version IS DISTINCT FROM OLD.submission_version THEN
      RAISE EXCEPTION 'WORKSHOP_APPLICATION_VERSION_CHANGE_INVALID'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.proposed_slug IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.proposed_slug IS DISTINCT FROM OLD.proposed_slug)
     AND EXISTS (
       SELECT 1
       FROM providers
       WHERE slug = NEW.proposed_slug
         AND id IS DISTINCT FROM NEW.provider_id
     ) THEN
    RAISE unique_violation USING
      MESSAGE = 'WORKSHOP_APPLICATION_PROPOSED_SLUG_UNAVAILABLE',
      CONSTRAINT = 'workshop_applications_proposed_slug_provider_conflict';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER workshop_applications_guard
BEFORE INSERT OR UPDATE ON workshop_applications
FOR EACH ROW EXECUTE FUNCTION app.guard_workshop_application();

CREATE OR REPLACE FUNCTION app.audit_workshop_application()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  event_action text;
  event_metadata jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    event_action := 'WORKSHOP_APPLICATION_SUBMITTED';
    event_metadata := jsonb_build_object(
      'status', NEW.status,
      'submission_version', NEW.submission_version
    );
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    event_action := CASE NEW.status
      WHEN 'PENDING' THEN 'WORKSHOP_APPLICATION_SUBMITTED'
      WHEN 'CHANGES_REQUESTED' THEN 'WORKSHOP_APPLICATION_CHANGES_REQUESTED'
      WHEN 'APPROVED' THEN 'WORKSHOP_APPLICATION_APPROVED'
      WHEN 'REJECTED' THEN 'WORKSHOP_APPLICATION_REJECTED'
    END;
    event_metadata := jsonb_build_object(
      'previous_status', OLD.status,
      'status', NEW.status,
      'submission_version', NEW.submission_version
    );
  END IF;

  IF event_action IS NOT NULL THEN
    INSERT INTO audit_events (
      actor_user_id, provider_id, action, entity_type, entity_id, metadata
    ) VALUES (
      app.current_user_id(),
      NULL,
      event_action,
      'workshop_application',
      NEW.id,
      event_metadata
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER workshop_applications_audit
AFTER INSERT OR UPDATE OF status ON workshop_applications
FOR EACH ROW EXECUTE FUNCTION app.audit_workshop_application();

CREATE POLICY workshop_applications_auth_service_resubmit_policy
ON workshop_applications
FOR UPDATE
USING (
  app.current_role() = 'AUTH_SERVICE'
  AND status = 'CHANGES_REQUESTED'
)
WITH CHECK (
  app.current_role() = 'AUTH_SERVICE'
  AND status = 'PENDING'
);

COMMENT ON TABLE workshop_applications IS
  'Solicitudes privadas. Estados: PENDING, CHANGES_REQUESTED, APPROVED y REJECTED.';
COMMENT ON COLUMN workshop_applications.submission_version IS
  'Versión del contrato de envío. La v1 identifica filas históricas; las nuevas solicitudes usan v2 o superior.';
COMMENT ON COLUMN workshop_applications.proposed_slug IS
  'Propuesta no vinculante: no reserva ni asigna el slug definitivo del provider.';
COMMENT ON INDEX workshop_applications_active_email_idx IS
  'Impide otra solicitud activa para el mismo correo; permite volver a solicitar tras rechazo.';

COMMIT;

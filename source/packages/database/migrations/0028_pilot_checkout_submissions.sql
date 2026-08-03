BEGIN;

CREATE TABLE pilot_checkout_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key uuid NOT NULL UNIQUE,
  payload_hash char(64) NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  contact_email citext NOT NULL,
  status text NOT NULL DEFAULT 'PROCESSING'
    CHECK (status IN ('PROCESSING', 'COMPLETED', 'FAILED')),
  checkout_id uuid REFERENCES checkout_batches(id) ON DELETE RESTRICT,
  failure_code text CHECK (failure_code IS NULL OR failure_code ~ '^[A-Z0-9_]{3,80}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  failed_at timestamptz,
  CHECK (status <> 'COMPLETED' OR (checkout_id IS NOT NULL AND completed_at IS NOT NULL)),
  CHECK (status <> 'FAILED' OR failed_at IS NOT NULL)
);

CREATE INDEX pilot_checkout_submissions_created_idx
  ON pilot_checkout_submissions(created_at DESC);
CREATE INDEX pilot_checkout_submissions_processing_idx
  ON pilot_checkout_submissions(created_at)
  WHERE status = 'PROCESSING';

ALTER TABLE pilot_checkout_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pilot_checkout_submissions FORCE ROW LEVEL SECURITY;

CREATE POLICY pilot_checkout_submissions_admin_select ON pilot_checkout_submissions
FOR SELECT USING (app.is_admin());
CREATE POLICY pilot_checkout_submissions_admin_insert ON pilot_checkout_submissions
FOR INSERT WITH CHECK (app.is_admin());
CREATE POLICY pilot_checkout_submissions_admin_update ON pilot_checkout_submissions
FOR UPDATE USING (app.is_admin()) WITH CHECK (app.is_admin());

GRANT SELECT, INSERT, UPDATE ON pilot_checkout_submissions TO atelier_app_runtime;

COMMIT;

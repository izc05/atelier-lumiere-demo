BEGIN;

CREATE TABLE workshop_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 140),
  legal_name text CHECK (legal_name IS NULL OR char_length(legal_name) BETWEEN 2 AND 180),
  contact_name text NOT NULL CHECK (char_length(contact_name) BETWEEN 2 AND 120),
  contact_email citext NOT NULL,
  specialty text NOT NULL CHECK (char_length(specialty) BETWEEN 2 AND 160),
  website_url text CHECK (website_url IS NULL OR char_length(website_url) <= 500),
  message text CHECK (message IS NULL OR char_length(message) BETWEEN 10 AND 2000),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  review_note text CHECK (review_note IS NULL OR char_length(review_note) <= 1000),
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  provider_id uuid UNIQUE REFERENCES providers(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (status = 'PENDING' AND reviewed_by IS NULL AND reviewed_at IS NULL AND provider_id IS NULL)
    OR (status = 'APPROVED' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND provider_id IS NOT NULL)
    OR (status = 'REJECTED' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND provider_id IS NULL)
  )
);

CREATE UNIQUE INDEX workshop_applications_pending_email_idx
  ON workshop_applications (contact_email)
  WHERE status = 'PENDING';
CREATE INDEX workshop_applications_status_created_idx
  ON workshop_applications (status, created_at DESC);

CREATE TRIGGER workshop_applications_set_updated_at
BEFORE UPDATE ON workshop_applications
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

ALTER TABLE workshop_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE workshop_applications FORCE ROW LEVEL SECURITY;

CREATE POLICY workshop_applications_select_policy ON workshop_applications
FOR SELECT USING (app.is_admin() OR app.current_role() = 'AUTH_SERVICE');

CREATE POLICY workshop_applications_insert_policy ON workshop_applications
FOR INSERT WITH CHECK (app.current_role() = 'AUTH_SERVICE');

CREATE POLICY workshop_applications_update_policy ON workshop_applications
FOR UPDATE USING (app.is_admin()) WITH CHECK (app.is_admin());

GRANT SELECT, INSERT, UPDATE ON workshop_applications TO atelier_app_runtime;

COMMIT;

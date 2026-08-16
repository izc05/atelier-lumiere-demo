BEGIN;

CREATE TABLE site_village_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_key text NOT NULL UNIQUE CHECK (zone_key ~ '^ZONE_(0[1-9]|1[0-4])$'),
  workshop_type text NOT NULL DEFAULT '' CHECK (char_length(workshop_type) <= 80),
  display_label text NOT NULL DEFAULT '' CHECK (char_length(display_label) <= 120),
  provider_slug text NULL CHECK (
    provider_slug IS NULL OR provider_slug ~ '^[a-z0-9][a-z0-9_-]{0,79}$'
  ),
  status text NOT NULL DEFAULT 'RESERVED' CHECK (status IN ('ACTIVE','RESERVED','HIDDEN')),
  updated_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX site_village_zones_provider_slug_unique
  ON site_village_zones(provider_slug)
  WHERE provider_slug IS NOT NULL;

CREATE INDEX site_village_zones_status_idx
  ON site_village_zones(status, zone_key);

CREATE TRIGGER site_village_zones_set_updated_at
BEFORE UPDATE ON site_village_zones
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

ALTER TABLE site_village_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_village_zones FORCE ROW LEVEL SECURITY;

CREATE POLICY site_village_zones_admin_select ON site_village_zones
FOR SELECT USING (app.is_admin());

CREATE POLICY site_village_zones_public_select ON site_village_zones
FOR SELECT USING (app.current_role() = 'CATALOG_READER');

CREATE POLICY site_village_zones_admin_insert ON site_village_zones
FOR INSERT WITH CHECK (app.is_admin());

CREATE POLICY site_village_zones_admin_update ON site_village_zones
FOR UPDATE USING (app.is_admin()) WITH CHECK (app.is_admin());

CREATE POLICY site_village_zones_admin_delete ON site_village_zones
FOR DELETE USING (app.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE
ON site_village_zones
TO atelier_app_runtime;

COMMIT;

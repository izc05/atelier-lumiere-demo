BEGIN;

CREATE TABLE site_showcase_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_key text NOT NULL UNIQUE CHECK (slot_key IN (
    'HOME_HERO_DESKTOP',
    'HOME_HERO_MOBILE',
    'STORE_HERO_DESKTOP',
    'STORE_HERO_MOBILE',
    'WORKSHOPS_HERO_DESKTOP',
    'WORKSHOPS_HERO_MOBILE',
    'STORIES_HERO_DESKTOP',
    'STORIES_HERO_MOBILE',
    'COMMISSIONS_HERO_DESKTOP',
    'COMMISSIONS_HERO_MOBILE'
  )),
  mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg','image/png','image/webp')),
  original_filename text NOT NULL CHECK (char_length(original_filename) BETWEEN 1 AND 240),
  storage_key text NOT NULL UNIQUE CHECK (char_length(storage_key) BETWEEN 20 AND 600),
  size_bytes bigint NOT NULL CHECK (size_bytes BETWEEN 1 AND 12582912),
  checksum_sha256 char(64) NOT NULL CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  alt_text text NOT NULL DEFAULT '' CHECK (char_length(alt_text) <= 240),
  width integer NOT NULL CHECK (width BETWEEN 1 AND 20000),
  height integer NOT NULL CHECK (height BETWEEN 1 AND 20000),
  preview_storage_key text NOT NULL UNIQUE,
  preview_mime_type text NOT NULL DEFAULT 'image/webp' CHECK (preview_mime_type = 'image/webp'),
  preview_size_bytes bigint NOT NULL CHECK (preview_size_bytes BETWEEN 1 AND 5242880),
  preview_checksum_sha256 char(64) NOT NULL CHECK (preview_checksum_sha256 ~ '^[0-9a-f]{64}$'),
  preview_width integer NOT NULL CHECK (preview_width BETWEEN 1 AND 1600),
  preview_height integer NOT NULL CHECK (preview_height BETWEEN 1 AND 1600),
  focal_x smallint NOT NULL DEFAULT 50 CHECK (focal_x BETWEEN 0 AND 100),
  focal_y smallint NOT NULL DEFAULT 50 CHECK (focal_y BETWEEN 0 AND 100),
  updated_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX site_showcase_media_updated_idx
  ON site_showcase_media(updated_at DESC);

CREATE TRIGGER site_showcase_media_set_updated_at
BEFORE UPDATE ON site_showcase_media
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

ALTER TABLE site_showcase_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_showcase_media FORCE ROW LEVEL SECURITY;

CREATE POLICY site_showcase_media_admin_select ON site_showcase_media
FOR SELECT USING (app.is_admin());

CREATE POLICY site_showcase_media_public_select ON site_showcase_media
FOR SELECT USING (app.current_role() = 'CATALOG_READER');

CREATE POLICY site_showcase_media_admin_insert ON site_showcase_media
FOR INSERT WITH CHECK (app.is_admin());

CREATE POLICY site_showcase_media_admin_update ON site_showcase_media
FOR UPDATE USING (app.is_admin()) WITH CHECK (app.is_admin());

CREATE POLICY site_showcase_media_admin_delete ON site_showcase_media
FOR DELETE USING (app.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE
ON site_showcase_media
TO atelier_app_runtime;

COMMIT;

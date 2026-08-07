BEGIN;

CREATE TABLE provider_profile_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('LOGO','COVER','GALLERY')),
  mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg','image/png','image/webp')),
  original_filename text NOT NULL CHECK (char_length(original_filename) BETWEEN 1 AND 240),
  storage_key text NOT NULL UNIQUE CHECK (char_length(storage_key) BETWEEN 20 AND 600),
  size_bytes bigint NOT NULL CHECK (size_bytes BETWEEN 1 AND 12582912),
  checksum_sha256 char(64) NOT NULL CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'PENDING_UPLOAD' CHECK (status IN ('PENDING_UPLOAD','READY','REJECTED','DELETED')),
  sort_order smallint NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 1000),
  alt_text text NOT NULL DEFAULT '' CHECK (char_length(alt_text) <= 240),
  width integer CHECK (width IS NULL OR width BETWEEN 1 AND 20000),
  height integer CHECK (height IS NULL OR height BETWEEN 1 AND 20000),
  preview_storage_key text,
  preview_mime_type text CHECK (preview_mime_type IS NULL OR preview_mime_type = 'image/webp'),
  preview_size_bytes bigint CHECK (preview_size_bytes IS NULL OR preview_size_bytes BETWEEN 1 AND 5242880),
  preview_checksum_sha256 char(64) CHECK (preview_checksum_sha256 IS NULL OR preview_checksum_sha256 ~ '^[0-9a-f]{64}$'),
  preview_width integer CHECK (preview_width IS NULL OR preview_width BETWEEN 1 AND 1600),
  preview_height integer CHECK (preview_height IS NULL OR preview_height BETWEEN 1 AND 1600),
  uploaded_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  upload_expires_at timestamptz,
  rejection_reason text CHECK (rejection_reason IS NULL OR char_length(rejection_reason) <= 1000),
  ready_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    status <> 'READY'
    OR (
      width IS NOT NULL AND height IS NOT NULL
      AND preview_storage_key IS NOT NULL
      AND preview_mime_type = 'image/webp'
      AND preview_size_bytes IS NOT NULL
      AND preview_checksum_sha256 IS NOT NULL
      AND preview_width IS NOT NULL
      AND preview_height IS NOT NULL
      AND ready_at IS NOT NULL
    )
  )
);

CREATE INDEX provider_profile_media_provider_idx
  ON provider_profile_media(provider_id, status, kind, sort_order, created_at);
CREATE INDEX provider_profile_media_upload_expiry_idx
  ON provider_profile_media(status, upload_expires_at)
  WHERE status = 'PENDING_UPLOAD';

CREATE OR REPLACE FUNCTION app.guard_provider_profile_media_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  profile_status text;
  active_count integer;
  maximum integer;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.provider_id IS DISTINCT FROM OLD.provider_id
       OR NEW.uploaded_by IS DISTINCT FROM OLD.uploaded_by
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'PROVIDER_PROFILE_MEDIA_IDENTITY_IMMUTABLE' USING ERRCODE = '23514';
    END IF;
  END IF;

  SELECT status INTO profile_status
  FROM provider_profiles
  WHERE provider_id = NEW.provider_id
  FOR UPDATE;

  IF profile_status IS NULL THEN
    RAISE EXCEPTION 'PROVIDER_PROFILE_MEDIA_PROFILE_MISSING' USING ERRCODE = '23514';
  END IF;

  IF NOT app.is_admin() THEN
    IF NOT app.is_provider_actor(NEW.provider_id)
       OR profile_status NOT IN ('DRAFT','CHANGES_REQUESTED') THEN
      RAISE EXCEPTION 'PROVIDER_PROFILE_MEDIA_WRITE_NOT_ALLOWED' USING ERRCODE = '42501';
    END IF;
    IF TG_OP = 'INSERT' AND NEW.uploaded_by IS DISTINCT FROM app.current_user_id() THEN
      RAISE EXCEPTION 'PROVIDER_PROFILE_MEDIA_ACTOR_INVALID' USING ERRCODE = '42501';
    END IF;
  END IF;

  NEW.updated_at := now();

  IF NEW.status NOT IN ('REJECTED','DELETED') THEN
    maximum := CASE NEW.kind WHEN 'LOGO' THEN 1 WHEN 'COVER' THEN 1 ELSE 6 END;
    SELECT COUNT(*) INTO active_count
    FROM provider_profile_media media
    WHERE media.provider_id = NEW.provider_id
      AND media.kind = NEW.kind
      AND media.status NOT IN ('REJECTED','DELETED')
      AND media.id IS DISTINCT FROM NEW.id;

    IF active_count >= maximum THEN
      RAISE EXCEPTION 'PROVIDER_PROFILE_MEDIA_LIMIT_EXCEEDED' USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER provider_profile_media_00_guard_write
BEFORE INSERT OR UPDATE ON provider_profile_media
FOR EACH ROW EXECUTE FUNCTION app.guard_provider_profile_media_write();

CREATE OR REPLACE FUNCTION app.require_provider_profile_cover_for_review()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  cover_count integer;
BEGIN
  IF NEW.status = 'IN_REVIEW'
     AND OLD.status IS DISTINCT FROM NEW.status THEN
    SELECT COUNT(*) INTO cover_count
    FROM provider_profile_media media
    WHERE media.provider_id = NEW.provider_id
      AND media.kind = 'COVER'
      AND media.status = 'READY';

    IF cover_count < 1 THEN
      RAISE EXCEPTION 'PROVIDER_PROFILE_COVER_REQUIRED' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER provider_profiles_01_require_cover
BEFORE UPDATE ON provider_profiles
FOR EACH ROW EXECUTE FUNCTION app.require_provider_profile_cover_for_review();

CREATE OR REPLACE FUNCTION app.build_provider_profile_snapshot(target_provider_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'providerId', provider.id,
    'slug', provider.slug::text,
    'displayName', profile.public_name,
    'specialty', profile.specialty_label,
    'tagline', NULLIF(profile.tagline, ''),
    'locationLabel', profile.location_label,
    'story', profile.story,
    'craftDescription', profile.craft_description,
    'materials', to_jsonb(profile.materials),
    'techniques', to_jsonb(profile.techniques),
    'preparationNote', profile.preparation_note,
    'shippingNote', profile.shipping_note,
    'acceptsCustomRequests', profile.accepts_custom_requests,
    'media', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', media.id,
          'kind', media.kind,
          'mimeType', media.mime_type,
          'originalFilename', media.original_filename,
          'sizeBytes', media.size_bytes,
          'checksumSha256', media.checksum_sha256,
          'altText', media.alt_text,
          'width', media.width,
          'height', media.height,
          'previewStorageKey', media.preview_storage_key,
          'previewMimeType', media.preview_mime_type,
          'previewSizeBytes', media.preview_size_bytes,
          'previewChecksumSha256', media.preview_checksum_sha256,
          'previewWidth', media.preview_width,
          'previewHeight', media.preview_height,
          'sortOrder', media.sort_order,
          'createdAt', media.created_at
        )
        ORDER BY CASE media.kind WHEN 'LOGO' THEN 0 WHEN 'COVER' THEN 1 ELSE 2 END,
                 media.sort_order,
                 media.created_at
      )
      FROM provider_profile_media media
      WHERE media.provider_id = provider.id
        AND media.status = 'READY'
    ), '[]'::jsonb)
  )
  FROM providers provider
  INNER JOIN provider_profiles profile ON profile.provider_id = provider.id
  WHERE provider.id = target_provider_id;
$$;

ALTER TABLE provider_profile_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_profile_media FORCE ROW LEVEL SECURITY;

CREATE POLICY provider_profile_media_select_policy ON provider_profile_media
FOR SELECT USING (app.is_admin() OR app.is_provider_actor(provider_id));

CREATE POLICY provider_profile_media_insert_policy ON provider_profile_media
FOR INSERT WITH CHECK (app.is_admin() OR app.is_provider_actor(provider_id));

CREATE POLICY provider_profile_media_update_policy ON provider_profile_media
FOR UPDATE USING (app.is_admin() OR app.is_provider_actor(provider_id))
WITH CHECK (app.is_admin() OR app.is_provider_actor(provider_id));

GRANT SELECT, INSERT, UPDATE ON provider_profile_media TO atelier_app_runtime;

COMMIT;

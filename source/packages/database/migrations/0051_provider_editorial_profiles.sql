BEGIN;

CREATE TABLE provider_profiles (
  provider_id uuid PRIMARY KEY REFERENCES providers(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','IN_REVIEW','CHANGES_REQUESTED','APPROVED','PUBLISHED')),
  public_name text NOT NULL CHECK (char_length(public_name) BETWEEN 2 AND 140),
  specialty_label text NOT NULL CHECK (char_length(specialty_label) BETWEEN 2 AND 160),
  tagline text NOT NULL DEFAULT '' CHECK (char_length(tagline) <= 180),
  location_label text CHECK (location_label IS NULL OR char_length(location_label) BETWEEN 2 AND 120),
  story text CHECK (story IS NULL OR char_length(story) <= 4000),
  craft_description text CHECK (craft_description IS NULL OR char_length(craft_description) <= 2500),
  materials text[] NOT NULL DEFAULT ARRAY[]::text[],
  techniques text[] NOT NULL DEFAULT ARRAY[]::text[],
  preparation_note text CHECK (preparation_note IS NULL OR char_length(preparation_note) <= 1200),
  shipping_note text CHECK (shipping_note IS NULL OR char_length(shipping_note) <= 1200),
  accepts_custom_requests boolean NOT NULL DEFAULT false,
  editorial_note text CHECK (editorial_note IS NULL OR char_length(editorial_note) <= 1200),
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  submitted_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  submitted_at timestamptz,
  approved_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  approved_at timestamptz,
  published_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (cardinality(materials) <= 12),
  CHECK (cardinality(techniques) <= 12)
);

CREATE TABLE provider_profile_publications (
  provider_id uuid PRIMARY KEY REFERENCES providers(id) ON DELETE CASCADE,
  revision integer NOT NULL DEFAULT 1 CHECK (revision >= 1),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  published_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  published_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX provider_profiles_status_idx ON provider_profiles(status, updated_at DESC);
CREATE INDEX provider_profile_publications_published_idx ON provider_profile_publications(published_at DESC);

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
    'acceptsCustomRequests', profile.accepts_custom_requests
  )
  FROM providers provider
  INNER JOIN provider_profiles profile ON profile.provider_id = provider.id
  WHERE provider.id = target_provider_id;
$$;

INSERT INTO provider_profiles (
  provider_id, status, public_name, specialty_label, tagline,
  created_by, updated_by, submitted_by, submitted_at,
  approved_by, approved_at, published_by, published_at
)
SELECT provider.id,
       CASE WHEN provider.status = 'ACTIVE' THEN 'PUBLISHED' ELSE 'DRAFT' END,
       provider.display_name,
       provider.specialty,
       provider.specialty,
       provider.created_by,
       provider.created_by,
       CASE WHEN provider.status = 'ACTIVE' THEN provider.created_by ELSE NULL END,
       CASE WHEN provider.status = 'ACTIVE' THEN now() ELSE NULL END,
       CASE WHEN provider.status = 'ACTIVE' THEN provider.created_by ELSE NULL END,
       CASE WHEN provider.status = 'ACTIVE' THEN now() ELSE NULL END,
       CASE WHEN provider.status = 'ACTIVE' THEN provider.created_by ELSE NULL END,
       CASE WHEN provider.status = 'ACTIVE' THEN now() ELSE NULL END
FROM providers provider;

INSERT INTO provider_profile_publications (provider_id, revision, snapshot, published_by, published_at)
SELECT profile.provider_id,
       1,
       app.build_provider_profile_snapshot(profile.provider_id),
       profile.published_by,
       profile.published_at
FROM provider_profiles profile
WHERE profile.status = 'PUBLISHED';

CREATE OR REPLACE FUNCTION app.create_provider_profile()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO provider_profiles (
    provider_id, status, public_name, specialty_label, tagline, created_by, updated_by
  ) VALUES (
    NEW.id, 'DRAFT', NEW.display_name, NEW.specialty, NEW.specialty, NEW.created_by, NEW.created_by
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER providers_90_create_editorial_profile
AFTER INSERT ON providers
FOR EACH ROW EXECUTE FUNCTION app.create_provider_profile();

CREATE OR REPLACE FUNCTION app.guard_provider_profile_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT app.is_admin() THEN
      IF NOT app.is_provider_actor(NEW.provider_id)
         OR NEW.status <> 'DRAFT'
         OR NEW.created_by IS DISTINCT FROM app.current_user_id()
         OR NEW.updated_by IS DISTINCT FROM app.current_user_id() THEN
        RAISE EXCEPTION 'PROVIDER_PROFILE_INSERT_NOT_ALLOWED' USING ERRCODE = '42501';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.provider_id IS DISTINCT FROM OLD.provider_id
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'PROVIDER_PROFILE_IDENTITY_IMMUTABLE' USING ERRCODE = '23514';
  END IF;

  NEW.updated_at := now();
  NEW.updated_by := COALESCE(app.current_user_id(), OLD.updated_by);
  NEW.version := OLD.version + 1;

  IF app.is_admin() THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NOT (
        (OLD.status = 'DRAFT' AND NEW.status IN ('DRAFT','IN_REVIEW','CHANGES_REQUESTED'))
        OR (OLD.status = 'IN_REVIEW' AND NEW.status IN ('IN_REVIEW','CHANGES_REQUESTED','APPROVED'))
        OR (OLD.status = 'CHANGES_REQUESTED' AND NEW.status IN ('CHANGES_REQUESTED','IN_REVIEW','APPROVED'))
        OR (OLD.status = 'APPROVED' AND NEW.status IN ('APPROVED','CHANGES_REQUESTED','PUBLISHED'))
        OR (OLD.status = 'PUBLISHED' AND NEW.status IN ('PUBLISHED','CHANGES_REQUESTED'))
      ) THEN
        RAISE EXCEPTION 'PROVIDER_PROFILE_STATUS_NOT_ALLOWED' USING ERRCODE = '23514';
      END IF;

      IF NEW.status = 'APPROVED' THEN
        NEW.approved_by := app.current_user_id();
        NEW.approved_at := now();
      ELSIF NEW.status = 'PUBLISHED' THEN
        IF OLD.status <> 'APPROVED' THEN
          RAISE EXCEPTION 'PROVIDER_PROFILE_APPROVAL_REQUIRED' USING ERRCODE = '23514';
        END IF;
        NEW.published_by := app.current_user_id();
        NEW.published_at := now();
        NEW.editorial_note := NULL;
      ELSIF NEW.status = 'CHANGES_REQUESTED' THEN
        NEW.approved_by := NULL;
        NEW.approved_at := NULL;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF NOT app.is_provider_actor(OLD.provider_id)
     OR NOT (
       (OLD.status = 'DRAFT' AND NEW.status IN ('DRAFT','IN_REVIEW'))
       OR (OLD.status = 'CHANGES_REQUESTED' AND NEW.status IN ('DRAFT','CHANGES_REQUESTED','IN_REVIEW'))
       OR (OLD.status = 'PUBLISHED' AND NEW.status = 'DRAFT')
     ) THEN
    RAISE EXCEPTION 'PROVIDER_PROFILE_UPDATE_NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;

  IF NEW.editorial_note IS DISTINCT FROM OLD.editorial_note THEN
    RAISE EXCEPTION 'PROVIDER_PROFILE_EDITORIAL_NOTE_NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;

  IF OLD.status = 'PUBLISHED' AND NEW.status = 'DRAFT' THEN
    NEW.submitted_by := NULL;
    NEW.submitted_at := NULL;
    NEW.approved_by := NULL;
    NEW.approved_at := NULL;
    NEW.published_by := NULL;
    NEW.published_at := NULL;
  END IF;

  IF NEW.status = 'IN_REVIEW' AND OLD.status <> 'IN_REVIEW' THEN
    IF char_length(btrim(NEW.public_name)) < 2
       OR char_length(btrim(NEW.specialty_label)) < 2
       OR char_length(btrim(NEW.tagline)) < 10
       OR NEW.story IS NULL OR char_length(btrim(NEW.story)) < 40
       OR NEW.craft_description IS NULL OR char_length(btrim(NEW.craft_description)) < 20 THEN
      RAISE EXCEPTION 'PROVIDER_PROFILE_NOT_READY_FOR_REVIEW' USING ERRCODE = '23514';
    END IF;
    NEW.submitted_by := app.current_user_id();
    NEW.submitted_at := now();
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER provider_profiles_00_guard_write
BEFORE INSERT OR UPDATE ON provider_profiles
FOR EACH ROW EXECUTE FUNCTION app.guard_provider_profile_write();

CREATE OR REPLACE FUNCTION app.refresh_provider_profile_publication()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  publication_snapshot jsonb;
BEGIN
  IF NEW.status <> 'PUBLISHED'
     OR OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  publication_snapshot := app.build_provider_profile_snapshot(NEW.provider_id);
  IF publication_snapshot IS NULL THEN
    RAISE EXCEPTION 'PROVIDER_PROFILE_SNAPSHOT_FAILED' USING ERRCODE = '23514';
  END IF;

  INSERT INTO provider_profile_publications (
    provider_id, revision, snapshot, published_by, published_at
  ) VALUES (
    NEW.provider_id, 1, publication_snapshot, NEW.published_by, NEW.published_at
  )
  ON CONFLICT (provider_id) DO UPDATE
  SET revision = provider_profile_publications.revision + 1,
      snapshot = EXCLUDED.snapshot,
      published_by = EXCLUDED.published_by,
      published_at = EXCLUDED.published_at,
      updated_at = now();

  RETURN NEW;
END;
$$;

CREATE TRIGGER provider_profiles_90_refresh_publication
AFTER UPDATE ON provider_profiles
FOR EACH ROW EXECUTE FUNCTION app.refresh_provider_profile_publication();

ALTER TABLE provider_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE provider_profile_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_profile_publications FORCE ROW LEVEL SECURITY;

CREATE POLICY provider_profiles_select_policy ON provider_profiles
FOR SELECT USING (app.is_admin() OR app.is_provider_actor(provider_id));

CREATE POLICY provider_profiles_insert_policy ON provider_profiles
FOR INSERT WITH CHECK (app.is_admin() OR app.is_provider_actor(provider_id));

CREATE POLICY provider_profiles_update_policy ON provider_profiles
FOR UPDATE USING (app.is_admin() OR app.is_provider_actor(provider_id))
WITH CHECK (app.is_admin() OR app.is_provider_actor(provider_id));

CREATE POLICY provider_profile_publications_select_policy ON provider_profile_publications
FOR SELECT USING (
  app.is_admin()
  OR app.is_provider_actor(provider_id)
  OR (
    app.current_role() = 'CATALOG_READER'
    AND EXISTS (
      SELECT 1 FROM providers provider
      WHERE provider.id = provider_profile_publications.provider_id
        AND provider.status = 'ACTIVE'
    )
  )
);

CREATE POLICY provider_profile_publications_insert_policy ON provider_profile_publications
FOR INSERT WITH CHECK (app.is_admin());

CREATE POLICY provider_profile_publications_update_policy ON provider_profile_publications
FOR UPDATE USING (app.is_admin()) WITH CHECK (app.is_admin());

GRANT SELECT, INSERT, UPDATE ON provider_profiles TO atelier_app_runtime;
GRANT SELECT, INSERT, UPDATE ON provider_profile_publications TO atelier_app_runtime;

COMMIT;

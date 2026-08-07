BEGIN;

CREATE TABLE provider_profile_featured_products (
  provider_id uuid NOT NULL REFERENCES provider_profiles(provider_id) ON DELETE CASCADE,
  product_id uuid NOT NULL,
  sort_order smallint NOT NULL CHECK (sort_order BETWEEN 0 AND 3),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider_id, product_id),
  UNIQUE (provider_id, sort_order),
  FOREIGN KEY (product_id, provider_id)
    REFERENCES products(id, provider_id) ON DELETE CASCADE
);

CREATE INDEX provider_profile_featured_products_order_idx
  ON provider_profile_featured_products(provider_id, sort_order);

CREATE OR REPLACE FUNCTION app.provider_featured_product_choices(target_provider_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN app.is_admin() OR app.is_provider_actor(target_provider_id) THEN COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', publication.product_id,
          'name', COALESCE(NULLIF(publication.snapshot -> 'product' ->> 'name', ''), 'Pieza publicada'),
          'slug', publication.snapshot -> 'product' ->> 'slug',
          'publishedAt', publication.published_at
        )
        ORDER BY publication.published_at DESC, publication.product_id
      )
      FROM product_publications publication
      WHERE publication.provider_id = target_provider_id
        AND publication.visible = true
    ), '[]'::jsonb)
    ELSE '[]'::jsonb
  END;
$$;

REVOKE ALL ON FUNCTION app.provider_featured_product_choices(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.provider_featured_product_choices(uuid) TO atelier_app_runtime;

CREATE OR REPLACE FUNCTION app.guard_provider_profile_featured_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_provider_id uuid;
  profile_status text;
BEGIN
  target_provider_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.provider_id ELSE NEW.provider_id END;

  SELECT status INTO profile_status
  FROM provider_profiles
  WHERE provider_id = target_provider_id
  FOR UPDATE;

  IF profile_status IS NULL THEN
    RAISE EXCEPTION 'PROVIDER_PROFILE_FEATURED_PROFILE_MISSING' USING ERRCODE = '23514';
  END IF;

  IF NOT app.is_admin() THEN
    IF NOT app.is_provider_actor(target_provider_id)
       OR profile_status NOT IN ('DRAFT','CHANGES_REQUESTED') THEN
      RAISE EXCEPTION 'PROVIDER_PROFILE_FEATURED_WRITE_NOT_ALLOWED' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.provider_id IS DISTINCT FROM OLD.provider_id
       OR NEW.product_id IS DISTINCT FROM OLD.product_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'PROVIDER_PROFILE_FEATURED_IDENTITY_IMMUTABLE' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NOT app.has_visible_product_publication(NEW.product_id) THEN
    RAISE EXCEPTION 'PROVIDER_PROFILE_FEATURED_PRODUCT_NOT_VISIBLE' USING ERRCODE = '23514';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER provider_profile_featured_products_00_guard_write
BEFORE INSERT OR UPDATE OR DELETE ON provider_profile_featured_products
FOR EACH ROW EXECUTE FUNCTION app.guard_provider_profile_featured_write();

CREATE OR REPLACE FUNCTION app.require_provider_profile_featured_available_for_review()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'IN_REVIEW'
     AND OLD.status IS DISTINCT FROM NEW.status
     AND EXISTS (
       SELECT 1
       FROM provider_profile_featured_products featured
       WHERE featured.provider_id = NEW.provider_id
         AND NOT app.has_visible_product_publication(featured.product_id)
     ) THEN
    RAISE EXCEPTION 'PROVIDER_PROFILE_FEATURED_PRODUCT_NOT_VISIBLE' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER provider_profiles_02_require_featured_available
BEFORE UPDATE ON provider_profiles
FOR EACH ROW EXECUTE FUNCTION app.require_provider_profile_featured_available_for_review();

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
    'featuredProductIds', COALESCE((
      SELECT jsonb_agg(featured.product_id ORDER BY featured.sort_order)
      FROM provider_profile_featured_products featured
      WHERE featured.provider_id = provider.id
    ), '[]'::jsonb),
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

ALTER TABLE provider_profile_featured_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_profile_featured_products FORCE ROW LEVEL SECURITY;

CREATE POLICY provider_profile_featured_products_select_policy ON provider_profile_featured_products
FOR SELECT USING (app.is_admin() OR app.is_provider_actor(provider_id));

CREATE POLICY provider_profile_featured_products_insert_policy ON provider_profile_featured_products
FOR INSERT WITH CHECK (app.is_admin() OR app.is_provider_actor(provider_id));

CREATE POLICY provider_profile_featured_products_update_policy ON provider_profile_featured_products
FOR UPDATE USING (app.is_admin() OR app.is_provider_actor(provider_id))
WITH CHECK (app.is_admin() OR app.is_provider_actor(provider_id));

CREATE POLICY provider_profile_featured_products_delete_policy ON provider_profile_featured_products
FOR DELETE USING (app.is_admin() OR app.is_provider_actor(provider_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON provider_profile_featured_products TO atelier_app_runtime;

COMMIT;

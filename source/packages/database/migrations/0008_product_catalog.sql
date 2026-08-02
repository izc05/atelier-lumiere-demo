BEGIN;

CREATE OR REPLACE FUNCTION app.is_provider_actor(target_provider_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT app.is_admin()
    OR (
      app.current_provider_id() = target_provider_id
      AND app.current_role() IN ('PROVIDER_OWNER', 'PROVIDER_MEMBER')
    );
$$;

CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES providers(id) ON DELETE RESTRICT,
  slug citext NOT NULL CHECK (slug::text ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 180),
  short_description text NOT NULL DEFAULT '' CHECK (char_length(short_description) <= 320),
  story text NOT NULL DEFAULT '' CHECK (char_length(story) <= 12000),
  category text CHECK (category IS NULL OR char_length(category) BETWEEN 2 AND 80),
  price_cents integer CHECK (price_cents IS NULL OR price_cents BETWEEN 0 AND 100000000),
  currency char(3) NOT NULL DEFAULT 'EUR' CHECK (currency ~ '^[A-Z]{3}$'),
  stock_mode text NOT NULL DEFAULT 'FINITE'
    CHECK (stock_mode IN ('FINITE', 'MADE_TO_ORDER', 'UNLIMITED')),
  stock_quantity integer CHECK (stock_quantity IS NULL OR stock_quantity >= 0),
  preparation_min_days integer CHECK (preparation_min_days IS NULL OR preparation_min_days BETWEEN 0 AND 365),
  preparation_max_days integer CHECK (preparation_max_days IS NULL OR preparation_max_days BETWEEN 0 AND 365),
  customizable boolean NOT NULL DEFAULT false,
  personalization_notes text NOT NULL DEFAULT '' CHECK (char_length(personalization_notes) <= 4000),
  shipping_notes text NOT NULL DEFAULT '' CHECK (char_length(shipping_notes) <= 4000),
  status text NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'IN_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'PUBLISHED', 'ARCHIVED')),
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  approved_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  published_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  submitted_at timestamptz,
  approved_at timestamptz,
  published_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_id, slug),
  UNIQUE (id, provider_id),
  CHECK (
    (stock_mode = 'FINITE' AND stock_quantity IS NOT NULL)
    OR (stock_mode IN ('MADE_TO_ORDER', 'UNLIMITED') AND stock_quantity IS NULL)
  ),
  CHECK (
    preparation_min_days IS NULL
    OR preparation_max_days IS NULL
    OR preparation_min_days <= preparation_max_days
  ),
  CHECK (status <> 'IN_REVIEW' OR submitted_at IS NOT NULL),
  CHECK (status <> 'APPROVED' OR (approved_at IS NOT NULL AND approved_by IS NOT NULL)),
  CHECK (status <> 'PUBLISHED' OR (
    approved_at IS NOT NULL AND approved_by IS NOT NULL
    AND published_at IS NOT NULL AND published_by IS NOT NULL
  )),
  CHECK (status <> 'ARCHIVED' OR archived_at IS NOT NULL)
);

CREATE TABLE product_events (
  provider_id uuid NOT NULL,
  product_id uuid NOT NULL,
  event_slug text NOT NULL CHECK (event_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, event_slug),
  FOREIGN KEY (product_id, provider_id)
    REFERENCES products(id, provider_id) ON DELETE CASCADE
);

CREATE TABLE product_personalization_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL,
  product_id uuid NOT NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  option_type text NOT NULL CHECK (option_type IN ('TEXT', 'SELECT', 'COLOR', 'NUMBER')),
  required boolean NOT NULL DEFAULT false,
  choices jsonb NOT NULL DEFAULT '[]'::jsonb,
  price_delta_cents integer NOT NULL DEFAULT 0 CHECK (price_delta_cents BETWEEN 0 AND 100000000),
  sort_order smallint NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 1000),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (product_id, provider_id)
    REFERENCES products(id, provider_id) ON DELETE CASCADE,
  CHECK (jsonb_typeof(choices) = 'array'),
  CHECK (
    (option_type IN ('SELECT', 'COLOR') AND jsonb_array_length(choices) BETWEEN 1 AND 50)
    OR (option_type IN ('TEXT', 'NUMBER') AND jsonb_array_length(choices) = 0)
  )
);

CREATE TABLE product_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL,
  product_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('IMAGE', 'VIDEO')),
  mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'video/mp4')),
  original_filename text NOT NULL CHECK (char_length(original_filename) BETWEEN 1 AND 240),
  storage_key text NOT NULL CHECK (char_length(storage_key) BETWEEN 8 AND 500),
  size_bytes bigint NOT NULL CHECK (size_bytes > 0),
  checksum_sha256 text NOT NULL CHECK (checksum_sha256 ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'PENDING_UPLOAD'
    CHECK (status IN ('PENDING_UPLOAD', 'READY', 'REJECTED', 'DELETED')),
  sort_order smallint NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 1000),
  alt_text text NOT NULL DEFAULT '' CHECK (char_length(alt_text) <= 240),
  width integer CHECK (width IS NULL OR width BETWEEN 1 AND 20000),
  height integer CHECK (height IS NULL OR height BETWEEN 1 AND 20000),
  duration_seconds numeric(8,2) CHECK (duration_seconds IS NULL OR duration_seconds > 0),
  rejection_reason text CHECK (rejection_reason IS NULL OR char_length(rejection_reason) <= 1000),
  uploaded_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  ready_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_id, storage_key),
  FOREIGN KEY (product_id, provider_id)
    REFERENCES products(id, provider_id) ON DELETE CASCADE,
  CHECK (
    (kind = 'IMAGE' AND mime_type IN ('image/jpeg', 'image/png', 'image/webp') AND size_bytes <= 12582912)
    OR (kind = 'VIDEO' AND mime_type = 'video/mp4' AND size_bytes <= 52428800)
  ),
  CHECK (status <> 'READY' OR ready_at IS NOT NULL),
  CHECK (status <> 'DELETED' OR deleted_at IS NOT NULL),
  CHECK (kind = 'VIDEO' OR duration_seconds IS NULL)
);

CREATE TABLE product_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL,
  product_id uuid NOT NULL,
  submission_number integer NOT NULL CHECK (submission_number >= 1),
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'APPROVED', 'CHANGES_REQUESTED', 'REJECTED', 'CANCELLED')),
  provider_note text NOT NULL DEFAULT '' CHECK (char_length(provider_note) <= 4000),
  reviewer_note text NOT NULL DEFAULT '' CHECK (char_length(reviewer_note) <= 4000),
  submitted_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reviewed_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, submission_number),
  FOREIGN KEY (product_id, provider_id)
    REFERENCES products(id, provider_id) ON DELETE CASCADE,
  CHECK (
    (status = 'PENDING' AND reviewed_by IS NULL AND reviewed_at IS NULL)
    OR (status = 'CANCELLED' AND reviewed_by IS NULL)
    OR (status IN ('APPROVED', 'CHANGES_REQUESTED', 'REJECTED') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX product_reviews_one_pending_idx
  ON product_reviews(product_id)
  WHERE status = 'PENDING';

CREATE INDEX products_provider_status_idx
  ON products(provider_id, status, updated_at DESC);
CREATE INDEX products_publication_idx
  ON products(status, published_at DESC)
  WHERE status = 'PUBLISHED';
CREATE INDEX product_media_product_idx
  ON product_media(product_id, status, kind, sort_order);
CREATE INDEX product_personalization_product_idx
  ON product_personalization_options(product_id, active, sort_order);
CREATE INDEX product_reviews_provider_idx
  ON product_reviews(provider_id, status, submitted_at DESC);

CREATE TRIGGER product_personalization_options_set_updated_at
BEFORE UPDATE ON product_personalization_options
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER product_media_set_updated_at
BEFORE UPDATE ON product_media
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE OR REPLACE FUNCTION app.enforce_product_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  ready_images integer;
  pending_media integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT app.is_admin() THEN
      IF NOT app.is_provider_actor(NEW.provider_id)
         OR NEW.status <> 'DRAFT'
         OR NEW.created_by IS DISTINCT FROM app.current_user_id()
         OR NEW.updated_by IS DISTINCT FROM app.current_user_id() THEN
        RAISE EXCEPTION 'PRODUCT_INSERT_NOT_ALLOWED' USING ERRCODE = '42501';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.provider_id IS DISTINCT FROM OLD.provider_id
     OR NEW.id IS DISTINCT FROM OLD.id
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'PRODUCT_IDENTITY_IMMUTABLE' USING ERRCODE = '23514';
  END IF;

  NEW.updated_at := now();
  NEW.updated_by := COALESCE(app.current_user_id(), OLD.updated_by);
  NEW.version := OLD.version + 1;

  IF app.is_admin() THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NOT (
        (OLD.status = 'DRAFT' AND NEW.status IN ('DRAFT', 'IN_REVIEW', 'ARCHIVED'))
        OR (OLD.status = 'CHANGES_REQUESTED' AND NEW.status IN ('CHANGES_REQUESTED', 'IN_REVIEW', 'ARCHIVED'))
        OR (OLD.status = 'IN_REVIEW' AND NEW.status IN ('IN_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'ARCHIVED'))
        OR (OLD.status = 'APPROVED' AND NEW.status IN ('APPROVED', 'PUBLISHED', 'CHANGES_REQUESTED', 'ARCHIVED'))
        OR (OLD.status = 'PUBLISHED' AND NEW.status IN ('PUBLISHED', 'ARCHIVED'))
        OR (OLD.status = 'ARCHIVED' AND NEW.status IN ('ARCHIVED', 'DRAFT'))
      ) THEN
        RAISE EXCEPTION 'PRODUCT_STATUS_TRANSITION_NOT_ALLOWED' USING ERRCODE = '23514';
      END IF;

      IF NEW.status = 'APPROVED' THEN
        NEW.approved_at := now();
        NEW.approved_by := app.current_user_id();
      ELSIF NEW.status = 'PUBLISHED' THEN
        IF OLD.status <> 'APPROVED' THEN
          RAISE EXCEPTION 'PRODUCT_MUST_BE_APPROVED_BEFORE_PUBLICATION' USING ERRCODE = '23514';
        END IF;
        NEW.published_at := now();
        NEW.published_by := app.current_user_id();
      ELSIF NEW.status = 'CHANGES_REQUESTED' THEN
        NEW.approved_at := NULL;
        NEW.approved_by := NULL;
      ELSIF NEW.status = 'ARCHIVED' THEN
        NEW.archived_at := now();
      ELSIF NEW.status = 'DRAFT' THEN
        NEW.submitted_at := NULL;
        NEW.approved_at := NULL;
        NEW.approved_by := NULL;
        NEW.published_at := NULL;
        NEW.published_by := NULL;
        NEW.archived_at := NULL;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF NOT app.is_provider_actor(OLD.provider_id)
     OR OLD.status NOT IN ('DRAFT', 'CHANGES_REQUESTED')
     OR NEW.status NOT IN ('DRAFT', 'CHANGES_REQUESTED', 'IN_REVIEW') THEN
    RAISE EXCEPTION 'PRODUCT_UPDATE_NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;

  IF NEW.status = 'IN_REVIEW' AND OLD.status <> 'IN_REVIEW' THEN
    SELECT COUNT(*) FILTER (WHERE kind = 'IMAGE' AND status = 'READY'),
           COUNT(*) FILTER (WHERE status = 'PENDING_UPLOAD')
      INTO ready_images, pending_media
      FROM product_media
     WHERE product_id = OLD.id;

    IF char_length(btrim(NEW.short_description)) < 20
       OR NEW.category IS NULL
       OR NEW.price_cents IS NULL
       OR NEW.preparation_min_days IS NULL
       OR NEW.preparation_max_days IS NULL
       OR ready_images < 1
       OR pending_media > 0 THEN
      RAISE EXCEPTION 'PRODUCT_NOT_READY_FOR_REVIEW' USING ERRCODE = '23514';
    END IF;
    NEW.submitted_at := now();
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER products_enforce_write
BEFORE INSERT OR UPDATE ON products
FOR EACH ROW EXECUTE FUNCTION app.enforce_product_write();

CREATE OR REPLACE FUNCTION app.enforce_product_child_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  row_provider_id uuid;
  row_product_id uuid;
  product_status text;
BEGIN
  row_provider_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.provider_id ELSE NEW.provider_id END;
  row_product_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.product_id ELSE NEW.product_id END;

  IF app.is_admin() THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  SELECT status INTO product_status
    FROM products
   WHERE id = row_product_id AND provider_id = row_provider_id;

  IF NOT app.is_provider_actor(row_provider_id)
     OR product_status NOT IN ('DRAFT', 'CHANGES_REQUESTED') THEN
    RAISE EXCEPTION 'PRODUCT_CHILD_WRITE_NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER product_events_enforce_write
BEFORE INSERT OR UPDATE OR DELETE ON product_events
FOR EACH ROW EXECUTE FUNCTION app.enforce_product_child_write();

CREATE TRIGGER product_personalization_enforce_write
BEFORE INSERT OR UPDATE OR DELETE ON product_personalization_options
FOR EACH ROW EXECUTE FUNCTION app.enforce_product_child_write();

CREATE OR REPLACE FUNCTION app.enforce_product_media_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  active_count integer;
  target_kind text;
  target_product uuid;
BEGIN
  IF TG_OP = 'DELETE' AND NOT app.is_admin() THEN
    RAISE EXCEPTION 'PRODUCT_MEDIA_HARD_DELETE_NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;

  PERFORM app.enforce_product_child_write();
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;

  IF NOT app.is_admin() AND NEW.uploaded_by IS DISTINCT FROM app.current_user_id() THEN
    RAISE EXCEPTION 'PRODUCT_MEDIA_UPLOADER_INVALID' USING ERRCODE = '42501';
  END IF;

  IF NEW.status <> 'DELETED' THEN
    target_kind := NEW.kind;
    target_product := NEW.product_id;
    PERFORM pg_advisory_xact_lock(hashtextextended(target_product::text, 0));

    SELECT COUNT(*) INTO active_count
      FROM product_media
     WHERE product_id = target_product
       AND kind = target_kind
       AND status <> 'DELETED'
       AND id <> NEW.id;

    IF target_kind = 'IMAGE' AND active_count >= 8 THEN
      RAISE EXCEPTION 'PRODUCT_IMAGE_LIMIT_EXCEEDED' USING ERRCODE = '23514';
    END IF;
    IF target_kind = 'VIDEO' AND active_count >= 1 THEN
      RAISE EXCEPTION 'PRODUCT_VIDEO_LIMIT_EXCEEDED' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.status = 'READY' AND OLD.status IS DISTINCT FROM 'READY' THEN
    NEW.ready_at := now();
  END IF;
  IF NEW.status = 'DELETED' AND OLD.status IS DISTINCT FROM 'DELETED' THEN
    NEW.deleted_at := now();
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER product_media_enforce_write
BEFORE INSERT OR UPDATE OR DELETE ON product_media
FOR EACH ROW EXECUTE FUNCTION app.enforce_product_media_write();

CREATE OR REPLACE FUNCTION app.enforce_product_review_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  product_status text;
BEGIN
  IF app.is_admin() THEN RETURN NEW; END IF;

  SELECT status INTO product_status
    FROM products
   WHERE id = NEW.product_id AND provider_id = NEW.provider_id;

  IF NOT app.is_provider_actor(NEW.provider_id)
     OR NEW.status <> 'PENDING'
     OR NEW.submitted_by IS DISTINCT FROM app.current_user_id()
     OR NEW.reviewed_by IS NOT NULL
     OR NEW.reviewed_at IS NOT NULL
     OR product_status <> 'IN_REVIEW' THEN
    RAISE EXCEPTION 'PRODUCT_REVIEW_INSERT_NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER product_reviews_enforce_insert
BEFORE INSERT ON product_reviews
FOR EACH ROW EXECUTE FUNCTION app.enforce_product_review_write();

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE products FORCE ROW LEVEL SECURITY;
ALTER TABLE product_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_events FORCE ROW LEVEL SECURITY;
ALTER TABLE product_personalization_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_personalization_options FORCE ROW LEVEL SECURITY;
ALTER TABLE product_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_media FORCE ROW LEVEL SECURITY;
ALTER TABLE product_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_reviews FORCE ROW LEVEL SECURITY;

CREATE POLICY products_select_policy ON products
FOR SELECT USING (app.is_provider_actor(provider_id));
CREATE POLICY products_insert_policy ON products
FOR INSERT WITH CHECK (app.is_provider_actor(provider_id));
CREATE POLICY products_update_policy ON products
FOR UPDATE USING (app.is_provider_actor(provider_id))
WITH CHECK (app.is_provider_actor(provider_id));
CREATE POLICY products_delete_policy ON products
FOR DELETE USING (app.is_admin());

CREATE POLICY product_events_select_policy ON product_events
FOR SELECT USING (app.is_provider_actor(provider_id));
CREATE POLICY product_events_insert_policy ON product_events
FOR INSERT WITH CHECK (app.is_provider_actor(provider_id));
CREATE POLICY product_events_update_policy ON product_events
FOR UPDATE USING (app.is_provider_actor(provider_id))
WITH CHECK (app.is_provider_actor(provider_id));
CREATE POLICY product_events_delete_policy ON product_events
FOR DELETE USING (app.is_provider_actor(provider_id));

CREATE POLICY product_personalization_select_policy ON product_personalization_options
FOR SELECT USING (app.is_provider_actor(provider_id));
CREATE POLICY product_personalization_insert_policy ON product_personalization_options
FOR INSERT WITH CHECK (app.is_provider_actor(provider_id));
CREATE POLICY product_personalization_update_policy ON product_personalization_options
FOR UPDATE USING (app.is_provider_actor(provider_id))
WITH CHECK (app.is_provider_actor(provider_id));
CREATE POLICY product_personalization_delete_policy ON product_personalization_options
FOR DELETE USING (app.is_provider_actor(provider_id));

CREATE POLICY product_media_select_policy ON product_media
FOR SELECT USING (app.is_provider_actor(provider_id));
CREATE POLICY product_media_insert_policy ON product_media
FOR INSERT WITH CHECK (app.is_provider_actor(provider_id));
CREATE POLICY product_media_update_policy ON product_media
FOR UPDATE USING (app.is_provider_actor(provider_id))
WITH CHECK (app.is_provider_actor(provider_id));
CREATE POLICY product_media_delete_policy ON product_media
FOR DELETE USING (app.is_admin());

CREATE POLICY product_reviews_select_policy ON product_reviews
FOR SELECT USING (app.is_provider_actor(provider_id));
CREATE POLICY product_reviews_insert_policy ON product_reviews
FOR INSERT WITH CHECK (app.is_provider_actor(provider_id));
CREATE POLICY product_reviews_update_policy ON product_reviews
FOR UPDATE USING (app.is_admin()) WITH CHECK (app.is_admin());
CREATE POLICY product_reviews_delete_policy ON product_reviews
FOR DELETE USING (app.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE
ON products, product_events, product_personalization_options, product_media, product_reviews
TO atelier_app_runtime;

COMMIT;

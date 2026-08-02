BEGIN;

CREATE TABLE blog_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES providers(id) ON DELETE RESTRICT,
  slug citext NOT NULL CHECK (slug::text ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text NOT NULL CHECK (char_length(title) BETWEEN 4 AND 180),
  excerpt text NOT NULL DEFAULT '' CHECK (char_length(excerpt) <= 420),
  body_markdown text NOT NULL DEFAULT '' CHECK (char_length(body_markdown) <= 50000),
  category text CHECK (category IS NULL OR char_length(category) BETWEEN 2 AND 80),
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
  CHECK (status <> 'IN_REVIEW' OR submitted_at IS NOT NULL),
  CHECK (status <> 'APPROVED' OR (approved_at IS NOT NULL AND approved_by IS NOT NULL)),
  CHECK (status <> 'PUBLISHED' OR (
    approved_at IS NOT NULL AND approved_by IS NOT NULL
    AND published_at IS NOT NULL AND published_by IS NOT NULL
  )),
  CHECK (status <> 'ARCHIVED' OR archived_at IS NOT NULL)
);

CREATE TABLE blog_post_tags (
  provider_id uuid NOT NULL,
  post_id uuid NOT NULL,
  tag_slug text NOT NULL CHECK (tag_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, tag_slug),
  FOREIGN KEY (post_id, provider_id)
    REFERENCES blog_posts(id, provider_id) ON DELETE CASCADE
);

CREATE TABLE blog_post_products (
  provider_id uuid NOT NULL,
  post_id uuid NOT NULL,
  product_id uuid NOT NULL,
  sort_order smallint NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, product_id),
  FOREIGN KEY (post_id, provider_id)
    REFERENCES blog_posts(id, provider_id) ON DELETE CASCADE,
  FOREIGN KEY (product_id, provider_id)
    REFERENCES products(id, provider_id) ON DELETE RESTRICT
);

CREATE TABLE blog_post_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL,
  post_id uuid NOT NULL,
  placement text NOT NULL DEFAULT 'INLINE' CHECK (placement IN ('COVER', 'INLINE')),
  mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  original_filename text NOT NULL CHECK (char_length(original_filename) BETWEEN 1 AND 240),
  storage_key text NOT NULL CHECK (char_length(storage_key) BETWEEN 8 AND 500),
  size_bytes bigint NOT NULL CHECK (size_bytes BETWEEN 1 AND 12582912),
  checksum_sha256 text NOT NULL CHECK (checksum_sha256 ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'PENDING_UPLOAD'
    CHECK (status IN ('PENDING_UPLOAD', 'READY', 'REJECTED', 'DELETED')),
  sort_order smallint NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 1000),
  alt_text text NOT NULL DEFAULT '' CHECK (char_length(alt_text) <= 240),
  width integer CHECK (width IS NULL OR width BETWEEN 1 AND 20000),
  height integer CHECK (height IS NULL OR height BETWEEN 1 AND 20000),
  preview_storage_key text CHECK (preview_storage_key IS NULL OR char_length(preview_storage_key) BETWEEN 8 AND 500),
  preview_mime_type text CHECK (preview_mime_type IS NULL OR preview_mime_type = 'image/webp'),
  preview_size_bytes bigint CHECK (preview_size_bytes IS NULL OR preview_size_bytes BETWEEN 1 AND 12582912),
  preview_checksum_sha256 text CHECK (preview_checksum_sha256 IS NULL OR preview_checksum_sha256 ~ '^[a-f0-9]{64}$'),
  preview_width integer CHECK (preview_width IS NULL OR preview_width BETWEEN 1 AND 20000),
  preview_height integer CHECK (preview_height IS NULL OR preview_height BETWEEN 1 AND 20000),
  rejection_reason text CHECK (rejection_reason IS NULL OR char_length(rejection_reason) <= 1000),
  uploaded_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  ready_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_id, storage_key),
  FOREIGN KEY (post_id, provider_id)
    REFERENCES blog_posts(id, provider_id) ON DELETE CASCADE,
  CHECK (status <> 'READY' OR ready_at IS NOT NULL),
  CHECK (status <> 'DELETED' OR deleted_at IS NOT NULL),
  CHECK (
    preview_storage_key IS NULL
    OR (
      preview_mime_type = 'image/webp'
      AND preview_size_bytes IS NOT NULL
      AND preview_checksum_sha256 IS NOT NULL
      AND preview_width IS NOT NULL
      AND preview_height IS NOT NULL
    )
  )
);

CREATE UNIQUE INDEX blog_post_one_cover_idx
  ON blog_post_media(post_id)
  WHERE placement = 'COVER' AND status <> 'DELETED';

CREATE TABLE blog_post_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL,
  post_id uuid NOT NULL,
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
  UNIQUE (post_id, submission_number),
  FOREIGN KEY (post_id, provider_id)
    REFERENCES blog_posts(id, provider_id) ON DELETE CASCADE,
  CHECK (
    (status = 'PENDING' AND reviewed_by IS NULL AND reviewed_at IS NULL)
    OR (status = 'CANCELLED' AND reviewed_by IS NULL)
    OR (status IN ('APPROVED', 'CHANGES_REQUESTED', 'REJECTED') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX blog_post_reviews_one_pending_idx
  ON blog_post_reviews(post_id)
  WHERE status = 'PENDING';

CREATE INDEX blog_posts_provider_status_idx
  ON blog_posts(provider_id, status, updated_at DESC);
CREATE INDEX blog_posts_publication_idx
  ON blog_posts(status, published_at DESC)
  WHERE status = 'PUBLISHED';
CREATE INDEX blog_post_products_product_idx
  ON blog_post_products(product_id, post_id);
CREATE INDEX blog_post_media_post_idx
  ON blog_post_media(post_id, status, placement, sort_order);
CREATE INDEX blog_post_reviews_provider_idx
  ON blog_post_reviews(provider_id, status, submitted_at DESC);

CREATE TRIGGER blog_post_media_set_updated_at
BEFORE UPDATE ON blog_post_media
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE OR REPLACE FUNCTION app.enforce_blog_post_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT app.is_admin() AND (
      NOT app.is_provider_actor(NEW.provider_id)
      OR NEW.status <> 'DRAFT'
      OR NEW.created_by IS DISTINCT FROM app.current_user_id()
      OR NEW.updated_by IS DISTINCT FROM app.current_user_id()
    ) THEN
      RAISE EXCEPTION 'BLOG_POST_INSERT_NOT_ALLOWED' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.provider_id IS DISTINCT FROM OLD.provider_id
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'BLOG_POST_IDENTITY_IMMUTABLE' USING ERRCODE = '23514';
  END IF;

  NEW.updated_at := now();
  NEW.updated_by := COALESCE(app.current_user_id(), OLD.updated_by);
  NEW.version := OLD.version + 1;

  IF app.is_admin() THEN
    IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
      (OLD.status = 'DRAFT' AND NEW.status IN ('DRAFT', 'IN_REVIEW', 'ARCHIVED'))
      OR (OLD.status = 'CHANGES_REQUESTED' AND NEW.status IN ('CHANGES_REQUESTED', 'IN_REVIEW', 'ARCHIVED'))
      OR (OLD.status = 'IN_REVIEW' AND NEW.status IN ('IN_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'ARCHIVED'))
      OR (OLD.status = 'APPROVED' AND NEW.status IN ('APPROVED', 'PUBLISHED', 'CHANGES_REQUESTED', 'ARCHIVED'))
      OR (OLD.status = 'PUBLISHED' AND NEW.status IN ('PUBLISHED', 'ARCHIVED'))
      OR (OLD.status = 'ARCHIVED' AND NEW.status IN ('ARCHIVED', 'DRAFT'))
    ) THEN
      RAISE EXCEPTION 'BLOG_POST_ADMIN_STATUS_NOT_ALLOWED' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF NOT app.is_provider_actor(NEW.provider_id)
       OR OLD.status NOT IN ('DRAFT', 'CHANGES_REQUESTED')
       OR NEW.status NOT IN ('DRAFT', 'CHANGES_REQUESTED', 'IN_REVIEW') THEN
      RAISE EXCEPTION 'BLOG_POST_PROVIDER_WRITE_NOT_ALLOWED' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.status = 'IN_REVIEW' AND OLD.status IS DISTINCT FROM 'IN_REVIEW' THEN
    IF char_length(trim(NEW.excerpt)) < 40 OR char_length(trim(NEW.body_markdown)) < 200 THEN
      RAISE EXCEPTION 'BLOG_POST_NOT_READY_FOR_REVIEW' USING ERRCODE = '23514';
    END IF;
    NEW.submitted_at := now();
  END IF;

  IF NEW.status = 'APPROVED' AND OLD.status IS DISTINCT FROM 'APPROVED' THEN
    NEW.approved_by := app.current_user_id();
    NEW.approved_at := now();
  END IF;

  IF NEW.status = 'PUBLISHED' AND OLD.status IS DISTINCT FROM 'PUBLISHED' THEN
    IF OLD.status <> 'APPROVED' THEN
      RAISE EXCEPTION 'BLOG_POST_APPROVAL_REQUIRED' USING ERRCODE = '23514';
    END IF;
    NEW.published_by := app.current_user_id();
    NEW.published_at := now();
  END IF;

  IF NEW.status = 'ARCHIVED' AND OLD.status IS DISTINCT FROM 'ARCHIVED' THEN
    NEW.archived_at := now();
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER blog_posts_enforce_write
BEFORE INSERT OR UPDATE ON blog_posts
FOR EACH ROW EXECUTE FUNCTION app.enforce_blog_post_write();

CREATE OR REPLACE FUNCTION app.enforce_blog_child_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  row_provider_id uuid;
  row_post_id uuid;
  post_status text;
BEGIN
  IF app.is_admin() THEN RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END; END IF;
  row_provider_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.provider_id ELSE NEW.provider_id END;
  row_post_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.post_id ELSE NEW.post_id END;

  SELECT status INTO post_status
    FROM blog_posts
   WHERE id = row_post_id AND provider_id = row_provider_id;

  IF NOT app.is_provider_actor(row_provider_id)
     OR post_status NOT IN ('DRAFT', 'CHANGES_REQUESTED') THEN
    RAISE EXCEPTION 'BLOG_POST_CHILD_WRITE_NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER blog_post_tags_enforce_write
BEFORE INSERT OR UPDATE OR DELETE ON blog_post_tags
FOR EACH ROW EXECUTE FUNCTION app.enforce_blog_child_write();

CREATE TRIGGER blog_post_products_enforce_write
BEFORE INSERT OR UPDATE OR DELETE ON blog_post_products
FOR EACH ROW EXECUTE FUNCTION app.enforce_blog_child_write();

CREATE OR REPLACE FUNCTION app.enforce_blog_media_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  active_count integer;
BEGIN
  IF TG_OP = 'DELETE' AND NOT app.is_admin() THEN
    RAISE EXCEPTION 'BLOG_MEDIA_HARD_DELETE_NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;

  PERFORM app.enforce_blog_child_write();
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;

  IF NOT app.is_admin() AND NEW.uploaded_by IS DISTINCT FROM app.current_user_id() THEN
    RAISE EXCEPTION 'BLOG_MEDIA_UPLOADER_INVALID' USING ERRCODE = '42501';
  END IF;

  IF NEW.status <> 'DELETED' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.post_id::text, 1));
    SELECT COUNT(*) INTO active_count
      FROM blog_post_media
     WHERE post_id = NEW.post_id
       AND status <> 'DELETED'
       AND id <> NEW.id;
    IF active_count >= 12 THEN
      RAISE EXCEPTION 'BLOG_IMAGE_LIMIT_EXCEEDED' USING ERRCODE = '23514';
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

CREATE TRIGGER blog_post_media_enforce_write
BEFORE INSERT OR UPDATE OR DELETE ON blog_post_media
FOR EACH ROW EXECUTE FUNCTION app.enforce_blog_media_write();

CREATE OR REPLACE FUNCTION app.enforce_blog_review_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  post_status text;
BEGIN
  IF app.is_admin() THEN RETURN NEW; END IF;

  SELECT status INTO post_status
    FROM blog_posts
   WHERE id = NEW.post_id AND provider_id = NEW.provider_id;

  IF NOT app.is_provider_actor(NEW.provider_id)
     OR NEW.status <> 'PENDING'
     OR NEW.submitted_by IS DISTINCT FROM app.current_user_id()
     OR NEW.reviewed_by IS NOT NULL
     OR NEW.reviewed_at IS NOT NULL
     OR post_status <> 'IN_REVIEW' THEN
    RAISE EXCEPTION 'BLOG_REVIEW_INSERT_NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER blog_post_reviews_enforce_insert
BEFORE INSERT ON blog_post_reviews
FOR EACH ROW EXECUTE FUNCTION app.enforce_blog_review_insert();

CREATE OR REPLACE FUNCTION app.guard_blog_review_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.provider_id IS DISTINCT FROM OLD.provider_id
     OR NEW.post_id IS DISTINCT FROM OLD.post_id
     OR NEW.submission_number IS DISTINCT FROM OLD.submission_number
     OR NEW.submitted_by IS DISTINCT FROM OLD.submitted_by
     OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at THEN
    RAISE EXCEPTION 'BLOG_REVIEW_IDENTITY_IMMUTABLE' USING ERRCODE = '23514';
  END IF;

  IF NOT app.is_admin() THEN
    RAISE EXCEPTION 'BLOG_REVIEW_UPDATE_NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;

  IF OLD.status <> 'PENDING'
     OR NEW.status NOT IN ('APPROVED', 'CHANGES_REQUESTED', 'REJECTED') THEN
    RAISE EXCEPTION 'BLOG_REVIEW_TRANSITION_NOT_ALLOWED' USING ERRCODE = '23514';
  END IF;

  NEW.reviewed_by := app.current_user_id();
  NEW.reviewed_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER blog_post_reviews_guard_update
BEFORE UPDATE ON blog_post_reviews
FOR EACH ROW EXECUTE FUNCTION app.guard_blog_review_update();

ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_posts FORCE ROW LEVEL SECURITY;
ALTER TABLE blog_post_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_post_tags FORCE ROW LEVEL SECURITY;
ALTER TABLE blog_post_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_post_products FORCE ROW LEVEL SECURITY;
ALTER TABLE blog_post_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_post_media FORCE ROW LEVEL SECURITY;
ALTER TABLE blog_post_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_post_reviews FORCE ROW LEVEL SECURITY;

CREATE POLICY blog_posts_select_policy ON blog_posts
FOR SELECT USING (app.is_provider_actor(provider_id));
CREATE POLICY blog_posts_insert_policy ON blog_posts
FOR INSERT WITH CHECK (app.is_provider_actor(provider_id));
CREATE POLICY blog_posts_update_policy ON blog_posts
FOR UPDATE USING (app.is_provider_actor(provider_id))
WITH CHECK (app.is_provider_actor(provider_id));
CREATE POLICY blog_posts_delete_policy ON blog_posts
FOR DELETE USING (app.is_admin());

CREATE POLICY blog_post_tags_select_policy ON blog_post_tags
FOR SELECT USING (app.is_provider_actor(provider_id));
CREATE POLICY blog_post_tags_insert_policy ON blog_post_tags
FOR INSERT WITH CHECK (app.is_provider_actor(provider_id));
CREATE POLICY blog_post_tags_update_policy ON blog_post_tags
FOR UPDATE USING (app.is_provider_actor(provider_id))
WITH CHECK (app.is_provider_actor(provider_id));
CREATE POLICY blog_post_tags_delete_policy ON blog_post_tags
FOR DELETE USING (app.is_provider_actor(provider_id));

CREATE POLICY blog_post_products_select_policy ON blog_post_products
FOR SELECT USING (app.is_provider_actor(provider_id));
CREATE POLICY blog_post_products_insert_policy ON blog_post_products
FOR INSERT WITH CHECK (app.is_provider_actor(provider_id));
CREATE POLICY blog_post_products_update_policy ON blog_post_products
FOR UPDATE USING (app.is_provider_actor(provider_id))
WITH CHECK (app.is_provider_actor(provider_id));
CREATE POLICY blog_post_products_delete_policy ON blog_post_products
FOR DELETE USING (app.is_provider_actor(provider_id));

CREATE POLICY blog_post_media_select_policy ON blog_post_media
FOR SELECT USING (app.is_provider_actor(provider_id));
CREATE POLICY blog_post_media_insert_policy ON blog_post_media
FOR INSERT WITH CHECK (app.is_provider_actor(provider_id));
CREATE POLICY blog_post_media_update_policy ON blog_post_media
FOR UPDATE USING (app.is_provider_actor(provider_id))
WITH CHECK (app.is_provider_actor(provider_id));
CREATE POLICY blog_post_media_delete_policy ON blog_post_media
FOR DELETE USING (app.is_admin());

CREATE POLICY blog_post_reviews_select_policy ON blog_post_reviews
FOR SELECT USING (app.is_provider_actor(provider_id));
CREATE POLICY blog_post_reviews_insert_policy ON blog_post_reviews
FOR INSERT WITH CHECK (app.is_provider_actor(provider_id));
CREATE POLICY blog_post_reviews_update_policy ON blog_post_reviews
FOR UPDATE USING (app.is_admin()) WITH CHECK (app.is_admin());
CREATE POLICY blog_post_reviews_delete_policy ON blog_post_reviews
FOR DELETE USING (app.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE
ON blog_posts, blog_post_tags, blog_post_products, blog_post_media, blog_post_reviews
TO atelier_app_runtime;

COMMIT;

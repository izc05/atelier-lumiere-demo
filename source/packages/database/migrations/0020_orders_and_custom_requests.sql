BEGIN;

CREATE OR REPLACE FUNCTION app.is_customer_actor(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT app.current_role() = 'CUSTOMER'
    AND app.current_user_id() = target_user_id;
$$;

CREATE OR REPLACE FUNCTION app.can_access_order(
  target_provider_id uuid,
  target_customer_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT app.is_admin()
    OR app.is_provider_actor(target_provider_id)
    OR app.is_customer_actor(target_customer_user_id);
$$;

CREATE TABLE checkout_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  checkout_reference text NOT NULL UNIQUE
    CHECK (checkout_reference ~ '^AL-CHECKOUT-[A-Z0-9-]{8,40}$'),
  currency char(3) NOT NULL DEFAULT 'EUR' CHECK (currency ~ '^[A-Z]{3}$'),
  customer_name text NOT NULL CHECK (char_length(customer_name) BETWEEN 2 AND 160),
  contact_email citext NOT NULL,
  contact_phone text CHECK (contact_phone IS NULL OR char_length(contact_phone) BETWEEN 6 AND 40),
  shipping_address jsonb NOT NULL,
  status text NOT NULL DEFAULT 'CREATED'
    CHECK (status IN ('CREATED', 'SUBMITTED', 'CANCELLED')),
  submitted_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(shipping_address) = 'object'),
  CHECK (status <> 'SUBMITTED' OR submitted_at IS NOT NULL),
  CHECK (status <> 'CANCELLED' OR cancelled_at IS NOT NULL)
);

CREATE TABLE provider_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_id uuid NOT NULL REFERENCES checkout_batches(id) ON DELETE RESTRICT,
  provider_id uuid NOT NULL REFERENCES providers(id) ON DELETE RESTRICT,
  customer_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  order_number text NOT NULL UNIQUE
    CHECK (order_number ~ '^AL-[A-Z0-9-]{8,40}$'),
  status text NOT NULL DEFAULT 'PENDING_CONFIRMATION'
    CHECK (status IN (
      'PENDING_CONFIRMATION',
      'ACCEPTED',
      'IN_PRODUCTION',
      'READY_TO_SHIP',
      'SHIPPED',
      'DELIVERED',
      'INCIDENT',
      'CANCELLED'
    )),
  currency char(3) NOT NULL DEFAULT 'EUR' CHECK (currency ~ '^[A-Z]{3}$'),
  subtotal_cents integer NOT NULL CHECK (subtotal_cents >= 0),
  shipping_cents integer NOT NULL DEFAULT 0 CHECK (shipping_cents >= 0),
  total_cents integer NOT NULL CHECK (total_cents >= 0),
  preparation_min_days integer CHECK (preparation_min_days IS NULL OR preparation_min_days BETWEEN 0 AND 365),
  preparation_max_days integer CHECK (preparation_max_days IS NULL OR preparation_max_days BETWEEN 0 AND 365),
  customer_note text NOT NULL DEFAULT '' CHECK (char_length(customer_note) <= 4000),
  provider_note text NOT NULL DEFAULT '' CHECK (char_length(provider_note) <= 4000),
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  placed_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  production_started_at timestamptz,
  ready_to_ship_at timestamptz,
  shipped_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (checkout_id, provider_id),
  UNIQUE (id, provider_id, customer_user_id),
  CHECK (total_cents = subtotal_cents + shipping_cents),
  CHECK (
    preparation_min_days IS NULL
    OR preparation_max_days IS NULL
    OR preparation_min_days <= preparation_max_days
  ),
  CHECK (status <> 'ACCEPTED' OR accepted_at IS NOT NULL),
  CHECK (status <> 'IN_PRODUCTION' OR production_started_at IS NOT NULL),
  CHECK (status <> 'READY_TO_SHIP' OR ready_to_ship_at IS NOT NULL),
  CHECK (status <> 'SHIPPED' OR shipped_at IS NOT NULL),
  CHECK (status <> 'DELIVERED' OR delivered_at IS NOT NULL),
  CHECK (status <> 'CANCELLED' OR cancelled_at IS NOT NULL)
);

CREATE TABLE order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  provider_id uuid NOT NULL,
  customer_user_id uuid NOT NULL,
  product_id uuid,
  item_type text NOT NULL DEFAULT 'PRODUCT' CHECK (item_type IN ('PRODUCT', 'CUSTOM')),
  product_name text NOT NULL CHECK (char_length(product_name) BETWEEN 2 AND 180),
  product_slug text CHECK (product_slug IS NULL OR product_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  product_story_snapshot text NOT NULL DEFAULT '' CHECK (char_length(product_story_snapshot) <= 4000),
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 1000),
  unit_price_cents integer NOT NULL CHECK (unit_price_cents >= 0),
  line_total_cents integer NOT NULL CHECK (line_total_cents >= 0),
  currency char(3) NOT NULL DEFAULT 'EUR' CHECK (currency ~ '^[A-Z]{3}$'),
  personalization jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (order_id, provider_id, customer_user_id)
    REFERENCES provider_orders(id, provider_id, customer_user_id) ON DELETE CASCADE,
  FOREIGN KEY (product_id, provider_id)
    REFERENCES products(id, provider_id) ON DELETE RESTRICT,
  CHECK (line_total_cents = quantity * unit_price_cents),
  CHECK (jsonb_typeof(personalization) = 'object'),
  CHECK (
    (item_type = 'PRODUCT' AND product_id IS NOT NULL)
    OR (item_type = 'CUSTOM' AND product_id IS NULL)
  )
);

CREATE TABLE order_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id uuid NOT NULL,
  provider_id uuid NOT NULL,
  customer_user_id uuid NOT NULL,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_role text NOT NULL
    CHECK (actor_role IN ('ADMIN', 'PROVIDER_OWNER', 'PROVIDER_MEMBER', 'CUSTOMER', 'SYSTEM')),
  event_type text NOT NULL CHECK (event_type ~ '^[A-Z0-9_]{3,80}$'),
  message text NOT NULL DEFAULT '' CHECK (char_length(message) <= 4000),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (order_id, provider_id, customer_user_id)
    REFERENCES provider_orders(id, provider_id, customer_user_id) ON DELETE CASCADE,
  CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE TABLE custom_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  order_item_id uuid,
  provider_id uuid NOT NULL,
  customer_user_id uuid NOT NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 180),
  brief text NOT NULL CHECK (char_length(brief) BETWEEN 20 AND 12000),
  desired_date date,
  status text NOT NULL DEFAULT 'OPEN'
    CHECK (status IN (
      'OPEN',
      'NEEDS_INFO',
      'QUOTED',
      'APPROVED',
      'IN_PROGRESS',
      'COMPLETED',
      'CANCELLED'
    )),
  quoted_price_cents integer CHECK (quoted_price_cents IS NULL OR quoted_price_cents >= 0),
  currency char(3) NOT NULL DEFAULT 'EUR' CHECK (currency ~ '^[A-Z]{3}$'),
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (order_id, provider_id, customer_user_id)
    REFERENCES provider_orders(id, provider_id, customer_user_id) ON DELETE CASCADE,
  FOREIGN KEY (order_item_id)
    REFERENCES order_items(id) ON DELETE SET NULL,
  CHECK (status <> 'QUOTED' OR quoted_price_cents IS NOT NULL)
);

CREATE TABLE custom_request_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES custom_requests(id) ON DELETE CASCADE,
  order_id uuid NOT NULL,
  provider_id uuid NOT NULL,
  customer_user_id uuid NOT NULL,
  author_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  author_role text NOT NULL
    CHECK (author_role IN ('ADMIN', 'PROVIDER_OWNER', 'PROVIDER_MEMBER', 'CUSTOMER')),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 8000),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (order_id, provider_id, customer_user_id)
    REFERENCES provider_orders(id, provider_id, customer_user_id) ON DELETE CASCADE
);

CREATE TABLE custom_request_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES custom_requests(id) ON DELETE CASCADE,
  message_id uuid REFERENCES custom_request_messages(id) ON DELETE SET NULL,
  order_id uuid NOT NULL,
  provider_id uuid NOT NULL,
  customer_user_id uuid NOT NULL,
  uploaded_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  original_filename text NOT NULL CHECK (char_length(original_filename) BETWEEN 1 AND 240),
  storage_key text NOT NULL CHECK (char_length(storage_key) BETWEEN 8 AND 500),
  size_bytes bigint NOT NULL CHECK (size_bytes BETWEEN 1 AND 12582912),
  checksum_sha256 text NOT NULL CHECK (checksum_sha256 ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'PENDING_UPLOAD'
    CHECK (status IN ('PENDING_UPLOAD', 'READY', 'REJECTED', 'DELETED')),
  rejection_reason text CHECK (rejection_reason IS NULL OR char_length(rejection_reason) <= 1000),
  ready_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_id, storage_key),
  FOREIGN KEY (order_id, provider_id, customer_user_id)
    REFERENCES provider_orders(id, provider_id, customer_user_id) ON DELETE CASCADE,
  CHECK (status <> 'READY' OR ready_at IS NOT NULL),
  CHECK (status <> 'DELETED' OR deleted_at IS NOT NULL)
);

CREATE TABLE order_shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  provider_id uuid NOT NULL,
  customer_user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'LABEL_CREATED', 'IN_TRANSIT', 'DELIVERED', 'EXCEPTION', 'RETURNED')),
  carrier text CHECK (carrier IS NULL OR char_length(carrier) BETWEEN 2 AND 120),
  tracking_code text CHECK (tracking_code IS NULL OR char_length(tracking_code) BETWEEN 2 AND 180),
  tracking_url text CHECK (tracking_url IS NULL OR char_length(tracking_url) <= 1000),
  shipped_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (order_id, provider_id, customer_user_id)
    REFERENCES provider_orders(id, provider_id, customer_user_id) ON DELETE CASCADE,
  CHECK (status <> 'IN_TRANSIT' OR shipped_at IS NOT NULL),
  CHECK (status <> 'DELIVERED' OR delivered_at IS NOT NULL)
);

CREATE TABLE order_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  provider_id uuid NOT NULL,
  customer_user_id uuid NOT NULL,
  opened_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  incident_type text NOT NULL
    CHECK (incident_type IN ('DELAY', 'DAMAGE', 'WRONG_ITEM', 'DELIVERY', 'CUSTOMIZATION', 'OTHER')),
  status text NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'INVESTIGATING', 'RESOLVED', 'CLOSED')),
  description text NOT NULL CHECK (char_length(description) BETWEEN 10 AND 8000),
  resolution text NOT NULL DEFAULT '' CHECK (char_length(resolution) <= 8000),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (order_id, provider_id, customer_user_id)
    REFERENCES provider_orders(id, provider_id, customer_user_id) ON DELETE CASCADE,
  CHECK (status NOT IN ('RESOLVED', 'CLOSED') OR resolved_at IS NOT NULL)
);

CREATE TABLE order_notifications (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id uuid NOT NULL,
  provider_id uuid NOT NULL,
  customer_user_id uuid NOT NULL,
  recipient_user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'IN_APP' CHECK (channel IN ('IN_APP', 'EMAIL')),
  event_type text NOT NULL CHECK (event_type ~ '^[A-Z0-9_]{3,80}$'),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENT', 'FAILED', 'CANCELLED')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 20),
  available_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  last_error text CHECK (last_error IS NULL OR char_length(last_error) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (order_id, provider_id, customer_user_id)
    REFERENCES provider_orders(id, provider_id, customer_user_id) ON DELETE CASCADE,
  CHECK (jsonb_typeof(payload) = 'object'),
  CHECK (status <> 'SENT' OR sent_at IS NOT NULL)
);

CREATE INDEX checkout_batches_customer_idx
  ON checkout_batches(customer_user_id, created_at DESC);
CREATE INDEX provider_orders_provider_idx
  ON provider_orders(provider_id, status, placed_at DESC);
CREATE INDEX provider_orders_customer_idx
  ON provider_orders(customer_user_id, status, placed_at DESC);
CREATE INDEX order_items_order_idx ON order_items(order_id, created_at);
CREATE INDEX order_events_order_idx ON order_events(order_id, created_at, id);
CREATE INDEX custom_requests_provider_idx
  ON custom_requests(provider_id, status, updated_at DESC);
CREATE INDEX custom_requests_customer_idx
  ON custom_requests(customer_user_id, status, updated_at DESC);
CREATE INDEX custom_request_messages_request_idx
  ON custom_request_messages(request_id, created_at);
CREATE INDEX custom_request_files_request_idx
  ON custom_request_files(request_id, status, created_at);
CREATE INDEX order_shipments_order_idx
  ON order_shipments(order_id, status, created_at DESC);
CREATE INDEX order_incidents_order_idx
  ON order_incidents(order_id, status, created_at DESC);
CREATE INDEX order_notifications_pending_idx
  ON order_notifications(status, available_at, id)
  WHERE status = 'PENDING';

CREATE TRIGGER checkout_batches_set_updated_at
BEFORE UPDATE ON checkout_batches
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER custom_request_files_set_updated_at
BEFORE UPDATE ON custom_request_files
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER order_shipments_set_updated_at
BEFORE UPDATE ON order_shipments
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER order_incidents_set_updated_at
BEFORE UPDATE ON order_incidents
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE OR REPLACE FUNCTION app.enforce_checkout_batch_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT app.is_admin() AND (
      NOT app.is_customer_actor(NEW.customer_user_id)
      OR NEW.status <> 'CREATED'
    ) THEN
      RAISE EXCEPTION 'CHECKOUT_INSERT_NOT_ALLOWED' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.customer_user_id IS DISTINCT FROM OLD.customer_user_id
     OR NEW.checkout_reference IS DISTINCT FROM OLD.checkout_reference
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.customer_name IS DISTINCT FROM OLD.customer_name
     OR NEW.contact_email IS DISTINCT FROM OLD.contact_email
     OR NEW.contact_phone IS DISTINCT FROM OLD.contact_phone
     OR NEW.shipping_address IS DISTINCT FROM OLD.shipping_address
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'CHECKOUT_IDENTITY_IMMUTABLE' USING ERRCODE = '23514';
  END IF;

  IF NOT app.is_admin() AND NOT app.is_customer_actor(OLD.customer_user_id) THEN
    RAISE EXCEPTION 'CHECKOUT_UPDATE_NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    (OLD.status = 'CREATED' AND NEW.status IN ('SUBMITTED', 'CANCELLED'))
    OR (OLD.status = 'SUBMITTED' AND NEW.status = 'CANCELLED')
  ) THEN
    RAISE EXCEPTION 'CHECKOUT_STATUS_TRANSITION_NOT_ALLOWED' USING ERRCODE = '23514';
  END IF;

  IF NEW.status = 'SUBMITTED' AND OLD.status <> 'SUBMITTED' THEN
    NEW.submitted_at := now();
  ELSIF NEW.status = 'CANCELLED' AND OLD.status <> 'CANCELLED' THEN
    NEW.cancelled_at := now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER checkout_batches_guard
BEFORE INSERT OR UPDATE ON checkout_batches
FOR EACH ROW EXECUTE FUNCTION app.enforce_checkout_batch_write();

CREATE OR REPLACE FUNCTION app.enforce_provider_order_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  role_name text := app.current_role();
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT app.is_admin() AND (
      NOT app.is_customer_actor(NEW.customer_user_id)
      OR NEW.status <> 'PENDING_CONFIRMATION'
    ) THEN
      RAISE EXCEPTION 'ORDER_INSERT_NOT_ALLOWED' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.checkout_id IS DISTINCT FROM OLD.checkout_id
     OR NEW.provider_id IS DISTINCT FROM OLD.provider_id
     OR NEW.customer_user_id IS DISTINCT FROM OLD.customer_user_id
     OR NEW.order_number IS DISTINCT FROM OLD.order_number
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.subtotal_cents IS DISTINCT FROM OLD.subtotal_cents
     OR NEW.shipping_cents IS DISTINCT FROM OLD.shipping_cents
     OR NEW.total_cents IS DISTINCT FROM OLD.total_cents
     OR NEW.preparation_min_days IS DISTINCT FROM OLD.preparation_min_days
     OR NEW.preparation_max_days IS DISTINCT FROM OLD.preparation_max_days
     OR NEW.customer_note IS DISTINCT FROM OLD.customer_note
     OR NEW.placed_at IS DISTINCT FROM OLD.placed_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'ORDER_IDENTITY_IMMUTABLE' USING ERRCODE = '23514';
  END IF;

  IF app.is_customer_actor(OLD.customer_user_id) THEN
    IF NOT (
      OLD.status = 'PENDING_CONFIRMATION'
      AND NEW.status = 'CANCELLED'
      AND NEW.provider_note IS NOT DISTINCT FROM OLD.provider_note
    ) THEN
      RAISE EXCEPTION 'ORDER_CUSTOMER_UPDATE_NOT_ALLOWED' USING ERRCODE = '42501';
    END IF;
  ELSIF app.is_admin() OR app.is_provider_actor(OLD.provider_id) THEN
    IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
      (OLD.status = 'PENDING_CONFIRMATION' AND NEW.status IN ('ACCEPTED', 'CANCELLED'))
      OR (OLD.status = 'ACCEPTED' AND NEW.status IN ('IN_PRODUCTION', 'CANCELLED', 'INCIDENT'))
      OR (OLD.status = 'IN_PRODUCTION' AND NEW.status IN ('READY_TO_SHIP', 'CANCELLED', 'INCIDENT'))
      OR (OLD.status = 'READY_TO_SHIP' AND NEW.status IN ('SHIPPED', 'INCIDENT'))
      OR (OLD.status = 'SHIPPED' AND NEW.status IN ('DELIVERED', 'INCIDENT'))
      OR (OLD.status = 'INCIDENT' AND NEW.status IN ('IN_PRODUCTION', 'READY_TO_SHIP', 'SHIPPED', 'CANCELLED'))
    ) THEN
      RAISE EXCEPTION 'ORDER_STATUS_TRANSITION_NOT_ALLOWED' USING ERRCODE = '23514';
    END IF;
  ELSE
    RAISE EXCEPTION 'ORDER_UPDATE_NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;

  NEW.version := OLD.version + 1;
  NEW.updated_at := now();

  IF NEW.status = 'ACCEPTED' AND OLD.status <> 'ACCEPTED' THEN
    NEW.accepted_at := now();
  ELSIF NEW.status = 'IN_PRODUCTION' AND OLD.status <> 'IN_PRODUCTION' THEN
    NEW.production_started_at := now();
  ELSIF NEW.status = 'READY_TO_SHIP' AND OLD.status <> 'READY_TO_SHIP' THEN
    NEW.ready_to_ship_at := now();
  ELSIF NEW.status = 'SHIPPED' AND OLD.status <> 'SHIPPED' THEN
    NEW.shipped_at := now();
  ELSIF NEW.status = 'DELIVERED' AND OLD.status <> 'DELIVERED' THEN
    NEW.delivered_at := now();
  ELSIF NEW.status = 'CANCELLED' AND OLD.status <> 'CANCELLED' THEN
    NEW.cancelled_at := now();
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER provider_orders_guard
BEFORE INSERT OR UPDATE ON provider_orders
FOR EACH ROW EXECUTE FUNCTION app.enforce_provider_order_write();

CREATE OR REPLACE FUNCTION app.record_provider_order_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  event_name text;
  actor_name text := COALESCE(app.current_role(), 'SYSTEM');
BEGIN
  IF TG_OP = 'INSERT' THEN
    event_name := 'ORDER_CREATED';
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    event_name := 'ORDER_STATUS_' || NEW.status;
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO order_events (
    order_id,
    provider_id,
    customer_user_id,
    actor_user_id,
    actor_role,
    event_type,
    metadata
  ) VALUES (
    NEW.id,
    NEW.provider_id,
    NEW.customer_user_id,
    app.current_user_id(),
    CASE WHEN actor_name IN ('ADMIN', 'PROVIDER_OWNER', 'PROVIDER_MEMBER', 'CUSTOMER')
      THEN actor_name ELSE 'SYSTEM' END,
    event_name,
    jsonb_build_object(
      'oldStatus', CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END,
      'newStatus', NEW.status,
      'version', NEW.version
    )
  );

  INSERT INTO order_notifications (
    order_id,
    provider_id,
    customer_user_id,
    recipient_user_id,
    event_type,
    payload
  ) VALUES (
    NEW.id,
    NEW.provider_id,
    NEW.customer_user_id,
    CASE WHEN actor_name = 'CUSTOMER' THEN NULL ELSE NEW.customer_user_id END,
    event_name,
    jsonb_build_object('orderNumber', NEW.order_number, 'status', NEW.status)
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER provider_orders_event
AFTER INSERT OR UPDATE OF status ON provider_orders
FOR EACH ROW EXECUTE FUNCTION app.record_provider_order_event();

CREATE OR REPLACE FUNCTION app.enforce_custom_request_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT app.is_admin() AND (
      NOT app.is_customer_actor(NEW.customer_user_id)
      OR NEW.status <> 'OPEN'
    ) THEN
      RAISE EXCEPTION 'CUSTOM_REQUEST_INSERT_NOT_ALLOWED' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.order_id IS DISTINCT FROM OLD.order_id
     OR NEW.order_item_id IS DISTINCT FROM OLD.order_item_id
     OR NEW.provider_id IS DISTINCT FROM OLD.provider_id
     OR NEW.customer_user_id IS DISTINCT FROM OLD.customer_user_id
     OR NEW.title IS DISTINCT FROM OLD.title
     OR NEW.brief IS DISTINCT FROM OLD.brief
     OR NEW.desired_date IS DISTINCT FROM OLD.desired_date
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'CUSTOM_REQUEST_IDENTITY_IMMUTABLE' USING ERRCODE = '23514';
  END IF;

  IF app.is_customer_actor(OLD.customer_user_id) THEN
    IF NOT (OLD.status IN ('OPEN', 'NEEDS_INFO', 'QUOTED') AND NEW.status = 'CANCELLED') THEN
      RAISE EXCEPTION 'CUSTOM_REQUEST_CUSTOMER_UPDATE_NOT_ALLOWED' USING ERRCODE = '42501';
    END IF;
  ELSIF app.is_admin() OR app.is_provider_actor(OLD.provider_id) THEN
    IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
      (OLD.status = 'OPEN' AND NEW.status IN ('NEEDS_INFO', 'QUOTED', 'CANCELLED'))
      OR (OLD.status = 'NEEDS_INFO' AND NEW.status IN ('OPEN', 'QUOTED', 'CANCELLED'))
      OR (OLD.status = 'QUOTED' AND NEW.status IN ('APPROVED', 'NEEDS_INFO', 'CANCELLED'))
      OR (OLD.status = 'APPROVED' AND NEW.status IN ('IN_PROGRESS', 'CANCELLED'))
      OR (OLD.status = 'IN_PROGRESS' AND NEW.status IN ('COMPLETED', 'CANCELLED'))
    ) THEN
      RAISE EXCEPTION 'CUSTOM_REQUEST_STATUS_TRANSITION_NOT_ALLOWED' USING ERRCODE = '23514';
    END IF;
  ELSE
    RAISE EXCEPTION 'CUSTOM_REQUEST_UPDATE_NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;

  NEW.version := OLD.version + 1;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER custom_requests_guard
BEFORE INSERT OR UPDATE ON custom_requests
FOR EACH ROW EXECUTE FUNCTION app.enforce_custom_request_write();

CREATE OR REPLACE FUNCTION app.enforce_custom_request_message_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT app.is_admin() AND (
    NEW.author_user_id IS DISTINCT FROM app.current_user_id()
    OR NEW.author_role IS DISTINCT FROM app.current_role()
    OR NOT app.can_access_order(NEW.provider_id, NEW.customer_user_id)
  ) THEN
    RAISE EXCEPTION 'CUSTOM_MESSAGE_INSERT_NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER custom_request_messages_guard
BEFORE INSERT ON custom_request_messages
FOR EACH ROW EXECUTE FUNCTION app.enforce_custom_request_message_insert();

ALTER TABLE checkout_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkout_batches FORCE ROW LEVEL SECURITY;
ALTER TABLE provider_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_orders FORCE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items FORCE ROW LEVEL SECURITY;
ALTER TABLE order_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_events FORCE ROW LEVEL SECURITY;
ALTER TABLE custom_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE custom_request_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_request_messages FORCE ROW LEVEL SECURITY;
ALTER TABLE custom_request_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_request_files FORCE ROW LEVEL SECURITY;
ALTER TABLE order_shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_shipments FORCE ROW LEVEL SECURITY;
ALTER TABLE order_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_incidents FORCE ROW LEVEL SECURITY;
ALTER TABLE order_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_notifications FORCE ROW LEVEL SECURITY;

CREATE POLICY checkout_batches_select_policy ON checkout_batches
FOR SELECT USING (app.is_admin() OR app.is_customer_actor(customer_user_id));
CREATE POLICY checkout_batches_insert_policy ON checkout_batches
FOR INSERT WITH CHECK (app.is_admin() OR app.is_customer_actor(customer_user_id));
CREATE POLICY checkout_batches_update_policy ON checkout_batches
FOR UPDATE USING (app.is_admin() OR app.is_customer_actor(customer_user_id))
WITH CHECK (app.is_admin() OR app.is_customer_actor(customer_user_id));

CREATE POLICY provider_orders_select_policy ON provider_orders
FOR SELECT USING (app.can_access_order(provider_id, customer_user_id));
CREATE POLICY provider_orders_insert_policy ON provider_orders
FOR INSERT WITH CHECK (app.is_admin() OR app.is_customer_actor(customer_user_id));
CREATE POLICY provider_orders_update_policy ON provider_orders
FOR UPDATE USING (app.can_access_order(provider_id, customer_user_id))
WITH CHECK (app.can_access_order(provider_id, customer_user_id));

CREATE POLICY order_items_select_policy ON order_items
FOR SELECT USING (app.can_access_order(provider_id, customer_user_id));
CREATE POLICY order_items_insert_policy ON order_items
FOR INSERT WITH CHECK (app.is_admin() OR app.is_customer_actor(customer_user_id));

CREATE POLICY order_events_select_policy ON order_events
FOR SELECT USING (app.can_access_order(provider_id, customer_user_id));
CREATE POLICY order_events_insert_policy ON order_events
FOR INSERT WITH CHECK (app.can_access_order(provider_id, customer_user_id));

CREATE POLICY custom_requests_select_policy ON custom_requests
FOR SELECT USING (app.can_access_order(provider_id, customer_user_id));
CREATE POLICY custom_requests_insert_policy ON custom_requests
FOR INSERT WITH CHECK (app.is_admin() OR app.is_customer_actor(customer_user_id));
CREATE POLICY custom_requests_update_policy ON custom_requests
FOR UPDATE USING (app.can_access_order(provider_id, customer_user_id))
WITH CHECK (app.can_access_order(provider_id, customer_user_id));

CREATE POLICY custom_request_messages_select_policy ON custom_request_messages
FOR SELECT USING (app.can_access_order(provider_id, customer_user_id));
CREATE POLICY custom_request_messages_insert_policy ON custom_request_messages
FOR INSERT WITH CHECK (app.can_access_order(provider_id, customer_user_id));

CREATE POLICY custom_request_files_select_policy ON custom_request_files
FOR SELECT USING (app.can_access_order(provider_id, customer_user_id));
CREATE POLICY custom_request_files_insert_policy ON custom_request_files
FOR INSERT WITH CHECK (app.can_access_order(provider_id, customer_user_id));
CREATE POLICY custom_request_files_update_policy ON custom_request_files
FOR UPDATE USING (app.can_access_order(provider_id, customer_user_id))
WITH CHECK (app.can_access_order(provider_id, customer_user_id));

CREATE POLICY order_shipments_select_policy ON order_shipments
FOR SELECT USING (app.can_access_order(provider_id, customer_user_id));
CREATE POLICY order_shipments_insert_policy ON order_shipments
FOR INSERT WITH CHECK (app.is_admin() OR app.is_provider_actor(provider_id));
CREATE POLICY order_shipments_update_policy ON order_shipments
FOR UPDATE USING (app.is_admin() OR app.is_provider_actor(provider_id))
WITH CHECK (app.is_admin() OR app.is_provider_actor(provider_id));

CREATE POLICY order_incidents_select_policy ON order_incidents
FOR SELECT USING (app.can_access_order(provider_id, customer_user_id));
CREATE POLICY order_incidents_insert_policy ON order_incidents
FOR INSERT WITH CHECK (app.can_access_order(provider_id, customer_user_id));
CREATE POLICY order_incidents_update_policy ON order_incidents
FOR UPDATE USING (app.can_access_order(provider_id, customer_user_id))
WITH CHECK (app.can_access_order(provider_id, customer_user_id));

CREATE POLICY order_notifications_select_policy ON order_notifications
FOR SELECT USING (
  app.is_admin()
  OR app.is_provider_actor(provider_id)
  OR recipient_user_id = app.current_user_id()
);
CREATE POLICY order_notifications_insert_policy ON order_notifications
FOR INSERT WITH CHECK (app.can_access_order(provider_id, customer_user_id));
CREATE POLICY order_notifications_update_policy ON order_notifications
FOR UPDATE USING (app.is_admin()) WITH CHECK (app.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON
  checkout_batches,
  provider_orders,
  order_items,
  order_events,
  custom_requests,
  custom_request_messages,
  custom_request_files,
  order_shipments,
  order_incidents,
  order_notifications
TO atelier_app_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO atelier_app_runtime;

COMMIT;

BEGIN;

ALTER TABLE order_shipments
  ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version >= 1);
ALTER TABLE order_incidents
  ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version >= 1);

ALTER TABLE order_shipments
  ADD CONSTRAINT order_shipments_tracking_url_https
  CHECK (tracking_url IS NULL OR tracking_url ~ '^https://[^[:space:]]+$');

ALTER TABLE order_shipments
  ADD CONSTRAINT order_shipments_tracking_required
  CHECK (
    status = 'PENDING'
    OR (carrier IS NOT NULL AND tracking_code IS NOT NULL)
  );

CREATE OR REPLACE FUNCTION app.enforce_order_shipment_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  order_row provider_orders%ROWTYPE;
BEGIN
  SELECT * INTO order_row
  FROM provider_orders
  WHERE id = NEW.order_id
    AND provider_id = NEW.provider_id
    AND customer_user_id = NEW.customer_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_SHIPMENT_SCOPE_INVALID' USING ERRCODE = '23503';
  END IF;

  IF NOT app.is_admin() AND NOT app.is_provider_actor(NEW.provider_id) THEN
    RAISE EXCEPTION 'ORDER_SHIPMENT_WRITE_NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;

  IF order_row.status = 'CANCELLED' THEN
    RAISE EXCEPTION 'ORDER_SHIPMENT_ORDER_CANCELLED' USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.version <> 1
       OR NEW.created_at IS DISTINCT FROM NEW.updated_at THEN
      RAISE EXCEPTION 'ORDER_SHIPMENT_METADATA_INVALID' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.order_id IS DISTINCT FROM OLD.order_id
       OR NEW.provider_id IS DISTINCT FROM OLD.provider_id
       OR NEW.customer_user_id IS DISTINCT FROM OLD.customer_user_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'ORDER_SHIPMENT_IDENTITY_IMMUTABLE' USING ERRCODE = '23514';
    END IF;

    IF OLD.status IN ('DELIVERED', 'RETURNED') THEN
      RAISE EXCEPTION 'ORDER_SHIPMENT_FINAL' USING ERRCODE = '23514';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
      (OLD.status = 'PENDING' AND NEW.status IN ('LABEL_CREATED', 'IN_TRANSIT', 'EXCEPTION', 'RETURNED'))
      OR (OLD.status = 'LABEL_CREATED' AND NEW.status IN ('IN_TRANSIT', 'EXCEPTION', 'RETURNED'))
      OR (OLD.status = 'IN_TRANSIT' AND NEW.status IN ('DELIVERED', 'EXCEPTION', 'RETURNED'))
      OR (OLD.status = 'EXCEPTION' AND NEW.status IN ('IN_TRANSIT', 'RETURNED'))
    ) THEN
      RAISE EXCEPTION 'ORDER_SHIPMENT_STATUS_TRANSITION_NOT_ALLOWED' USING ERRCODE = '23514';
    END IF;

    NEW.version := OLD.version + 1;
    NEW.updated_at := now();
  END IF;

  IF NEW.tracking_url IS NOT NULL
     AND NEW.tracking_url !~ '^https://[^[:space:]]+$' THEN
    RAISE EXCEPTION 'ORDER_SHIPMENT_TRACKING_URL_INVALID' USING ERRCODE = '23514';
  END IF;

  IF NEW.status <> 'PENDING'
     AND (NEW.carrier IS NULL OR NEW.tracking_code IS NULL) THEN
    RAISE EXCEPTION 'ORDER_SHIPMENT_TRACKING_REQUIRED' USING ERRCODE = '23514';
  END IF;

  IF NEW.status = 'IN_TRANSIT' AND NEW.shipped_at IS NULL THEN
    NEW.shipped_at := now();
  ELSIF NEW.status = 'DELIVERED' THEN
    NEW.shipped_at := COALESCE(NEW.shipped_at, OLD.shipped_at, now());
    NEW.delivered_at := COALESCE(NEW.delivered_at, now());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS order_shipments_guard ON order_shipments;
CREATE TRIGGER order_shipments_guard
BEFORE INSERT OR UPDATE ON order_shipments
FOR EACH ROW EXECUTE FUNCTION app.enforce_order_shipment_write();

CREATE OR REPLACE FUNCTION app.enforce_order_incident_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  order_row provider_orders%ROWTYPE;
BEGIN
  SELECT * INTO order_row
  FROM provider_orders
  WHERE id = NEW.order_id
    AND provider_id = NEW.provider_id
    AND customer_user_id = NEW.customer_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_INCIDENT_SCOPE_INVALID' USING ERRCODE = '23503';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NOT app.is_admin() AND (
      NEW.opened_by IS DISTINCT FROM app.current_user_id()
      OR NOT app.can_access_order(NEW.provider_id, NEW.customer_user_id)
    ) THEN
      RAISE EXCEPTION 'ORDER_INCIDENT_INSERT_NOT_ALLOWED' USING ERRCODE = '42501';
    END IF;

    IF order_row.status IN ('PENDING_CONFIRMATION', 'CANCELLED') THEN
      RAISE EXCEPTION 'ORDER_INCIDENT_ORDER_NOT_ACTIVE' USING ERRCODE = '23514';
    END IF;

    IF NEW.status <> 'OPEN'
       OR NEW.resolution <> ''
       OR NEW.resolved_at IS NOT NULL
       OR NEW.version <> 1 THEN
      RAISE EXCEPTION 'ORDER_INCIDENT_METADATA_INVALID' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.order_id IS DISTINCT FROM OLD.order_id
     OR NEW.provider_id IS DISTINCT FROM OLD.provider_id
     OR NEW.customer_user_id IS DISTINCT FROM OLD.customer_user_id
     OR NEW.opened_by IS DISTINCT FROM OLD.opened_by
     OR NEW.incident_type IS DISTINCT FROM OLD.incident_type
     OR NEW.description IS DISTINCT FROM OLD.description
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'ORDER_INCIDENT_IDENTITY_IMMUTABLE' USING ERRCODE = '23514';
  END IF;

  IF NOT app.is_admin() AND NOT app.is_provider_actor(OLD.provider_id) THEN
    RAISE EXCEPTION 'ORDER_INCIDENT_UPDATE_NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    (OLD.status = 'OPEN' AND NEW.status IN ('INVESTIGATING', 'RESOLVED', 'CLOSED'))
    OR (OLD.status = 'INVESTIGATING' AND NEW.status IN ('RESOLVED', 'CLOSED'))
    OR (OLD.status = 'RESOLVED' AND NEW.status = 'CLOSED')
  ) THEN
    RAISE EXCEPTION 'ORDER_INCIDENT_STATUS_TRANSITION_NOT_ALLOWED' USING ERRCODE = '23514';
  END IF;

  IF NEW.status IN ('RESOLVED', 'CLOSED') THEN
    IF char_length(trim(NEW.resolution)) < 10 THEN
      RAISE EXCEPTION 'ORDER_INCIDENT_RESOLUTION_REQUIRED' USING ERRCODE = '23514';
    END IF;
    NEW.resolved_at := COALESCE(OLD.resolved_at, now());
  ELSIF NEW.resolution IS DISTINCT FROM OLD.resolution AND NEW.resolution <> '' THEN
    RAISE EXCEPTION 'ORDER_INCIDENT_RESOLUTION_PREMATURE' USING ERRCODE = '23514';
  END IF;

  NEW.version := OLD.version + 1;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS order_incidents_guard ON order_incidents;
CREATE TRIGGER order_incidents_guard
BEFORE INSERT OR UPDATE ON order_incidents
FOR EACH ROW EXECUTE FUNCTION app.enforce_order_incident_write();

CREATE OR REPLACE FUNCTION app.record_order_shipment_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  actor_name text := COALESCE(app.current_role(), 'SYSTEM');
  event_name text;
BEGIN
  event_name := CASE
    WHEN TG_OP = 'INSERT' THEN 'SHIPMENT_CREATED'
    WHEN NEW.status IS DISTINCT FROM OLD.status THEN 'SHIPMENT_STATUS_' || NEW.status
    ELSE 'SHIPMENT_UPDATED'
  END;

  INSERT INTO order_events (
    order_id, provider_id, customer_user_id, actor_user_id,
    actor_role, event_type, metadata
  ) VALUES (
    NEW.order_id, NEW.provider_id, NEW.customer_user_id, app.current_user_id(),
    CASE WHEN actor_name IN ('ADMIN','PROVIDER_OWNER','PROVIDER_MEMBER','CUSTOMER')
      THEN actor_name ELSE 'SYSTEM' END,
    event_name,
    jsonb_build_object(
      'shipmentId', NEW.id,
      'status', NEW.status,
      'carrier', NEW.carrier,
      'trackingCode', NEW.tracking_code,
      'version', NEW.version
    )
  );

  INSERT INTO order_notifications (
    order_id, provider_id, customer_user_id, recipient_user_id,
    event_type, payload
  ) VALUES (
    NEW.order_id, NEW.provider_id, NEW.customer_user_id, NEW.customer_user_id,
    event_name,
    jsonb_build_object('shipmentId', NEW.id, 'status', NEW.status)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS order_shipments_event ON order_shipments;
CREATE TRIGGER order_shipments_event
AFTER INSERT OR UPDATE ON order_shipments
FOR EACH ROW EXECUTE FUNCTION app.record_order_shipment_event();

CREATE OR REPLACE FUNCTION app.record_order_incident_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  actor_name text := COALESCE(app.current_role(), 'SYSTEM');
  event_name text;
  recipient uuid;
BEGIN
  event_name := CASE
    WHEN TG_OP = 'INSERT' THEN 'INCIDENT_OPENED'
    ELSE 'INCIDENT_STATUS_' || NEW.status
  END;
  recipient := CASE WHEN actor_name = 'CUSTOMER' THEN NULL ELSE NEW.customer_user_id END;

  INSERT INTO order_events (
    order_id, provider_id, customer_user_id, actor_user_id,
    actor_role, event_type, message, metadata
  ) VALUES (
    NEW.order_id, NEW.provider_id, NEW.customer_user_id, app.current_user_id(),
    CASE WHEN actor_name IN ('ADMIN','PROVIDER_OWNER','PROVIDER_MEMBER','CUSTOMER')
      THEN actor_name ELSE 'SYSTEM' END,
    event_name,
    CASE WHEN TG_OP = 'INSERT' THEN NEW.description ELSE NEW.resolution END,
    jsonb_build_object(
      'incidentId', NEW.id,
      'type', NEW.incident_type,
      'status', NEW.status,
      'version', NEW.version
    )
  );

  INSERT INTO order_notifications (
    order_id, provider_id, customer_user_id, recipient_user_id,
    event_type, payload
  ) VALUES (
    NEW.order_id, NEW.provider_id, NEW.customer_user_id, recipient,
    event_name,
    jsonb_build_object('incidentId', NEW.id, 'type', NEW.incident_type, 'status', NEW.status)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS order_incidents_event ON order_incidents;
CREATE TRIGGER order_incidents_event
AFTER INSERT OR UPDATE ON order_incidents
FOR EACH ROW EXECUTE FUNCTION app.record_order_incident_event();

CREATE INDEX order_shipments_provider_active_idx
  ON order_shipments(provider_id, status, updated_at DESC)
  WHERE status NOT IN ('DELIVERED', 'RETURNED');
CREATE INDEX order_incidents_provider_active_idx
  ON order_incidents(provider_id, status, updated_at DESC)
  WHERE status IN ('OPEN', 'INVESTIGATING');

COMMIT;

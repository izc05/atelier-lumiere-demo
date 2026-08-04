BEGIN;

CREATE OR REPLACE FUNCTION app.is_pilot_checkout_service()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT app.current_role() = 'PILOT_CHECKOUT_SERVICE';
$$;

INSERT INTO users (
  id, email, display_name, status, email_verified_at, two_factor_enabled
) VALUES (
  '00000000-0000-4000-8000-000000000011',
  'pilot-checkout-service@atelier.invalid',
  'Servicio interno de checkout piloto',
  'ACTIVE',
  now(),
  false
)
ON CONFLICT (id) DO NOTHING;

-- AUTH_SERVICE ejecuta los flujos públicos de identidad sin adoptar permisos de Administración.
CREATE POLICY users_auth_service_insert ON users
FOR INSERT WITH CHECK (app.is_auth_service());
CREATE POLICY users_auth_service_update ON users
FOR UPDATE USING (app.is_auth_service()) WITH CHECK (app.is_auth_service());

CREATE POLICY providers_auth_service_select ON providers
FOR SELECT USING (app.is_auth_service());

CREATE POLICY provider_members_auth_service_select ON provider_members
FOR SELECT USING (app.is_auth_service());
CREATE POLICY provider_members_auth_service_insert ON provider_members
FOR INSERT WITH CHECK (app.is_auth_service());
CREATE POLICY provider_members_auth_service_update ON provider_members
FOR UPDATE USING (app.is_auth_service()) WITH CHECK (app.is_auth_service());

CREATE POLICY provider_invitations_auth_service_select ON provider_invitations
FOR SELECT USING (app.is_auth_service());
CREATE POLICY provider_invitations_auth_service_update ON provider_invitations
FOR UPDATE USING (app.is_auth_service()) WITH CHECK (app.is_auth_service());

CREATE POLICY user_credentials_auth_service_insert ON user_credentials
FOR INSERT WITH CHECK (app.is_auth_service());

CREATE POLICY email_verification_tokens_auth_service_all ON email_verification_tokens
FOR ALL USING (app.is_auth_service()) WITH CHECK (app.is_auth_service());
CREATE POLICY onboarding_continuations_auth_service_all ON onboarding_continuations
FOR ALL USING (app.is_auth_service()) WITH CHECK (app.is_auth_service());
CREATE POLICY user_totp_credentials_auth_service_all ON user_totp_credentials
FOR ALL USING (app.is_auth_service()) WITH CHECK (app.is_auth_service());
CREATE POLICY login_throttles_auth_service_all ON login_throttles
FOR ALL USING (app.is_auth_service()) WITH CHECK (app.is_auth_service());
CREATE POLICY provider_login_challenges_auth_service_all ON provider_login_challenges
FOR ALL USING (app.is_auth_service()) WITH CHECK (app.is_auth_service());
CREATE POLICY account_recovery_tokens_auth_service_all ON account_recovery_tokens
FOR ALL USING (app.is_auth_service()) WITH CHECK (app.is_auth_service());

CREATE POLICY customer_access_auth_service_all ON customer_order_access_tokens
FOR ALL USING (app.is_auth_service()) WITH CHECK (app.is_auth_service());
CREATE POLICY customer_sessions_auth_service_all ON customer_sessions
FOR ALL USING (app.is_auth_service()) WITH CHECK (app.is_auth_service());
CREATE POLICY checkout_batches_auth_service_select ON checkout_batches
FOR SELECT USING (app.is_auth_service());

-- El servicio de checkout solo ve catálogo publicado y las filas necesarias para crear un pedido.
CREATE POLICY providers_pilot_checkout_select ON providers
FOR SELECT USING (app.is_pilot_checkout_service() AND status = 'ACTIVE');
CREATE POLICY products_pilot_checkout_select ON products
FOR SELECT USING (app.is_pilot_checkout_service() AND status = 'PUBLISHED');
CREATE POLICY products_pilot_checkout_update ON products
FOR UPDATE USING (app.is_pilot_checkout_service() AND status = 'PUBLISHED')
WITH CHECK (app.is_pilot_checkout_service() AND status = 'PUBLISHED');
CREATE POLICY product_personalization_pilot_checkout_select ON product_personalization_options
FOR SELECT USING (app.is_pilot_checkout_service() AND active = true);

CREATE POLICY users_pilot_checkout_select ON users
FOR SELECT USING (app.is_pilot_checkout_service());
CREATE POLICY users_pilot_checkout_insert ON users
FOR INSERT WITH CHECK (app.is_pilot_checkout_service());

CREATE POLICY pilot_checkout_submissions_service_select ON pilot_checkout_submissions
FOR SELECT USING (app.is_pilot_checkout_service());
CREATE POLICY pilot_checkout_submissions_service_insert ON pilot_checkout_submissions
FOR INSERT WITH CHECK (app.is_pilot_checkout_service());
CREATE POLICY pilot_checkout_submissions_service_update ON pilot_checkout_submissions
FOR UPDATE USING (app.is_pilot_checkout_service()) WITH CHECK (app.is_pilot_checkout_service());

CREATE POLICY checkout_batches_pilot_service_select ON checkout_batches
FOR SELECT USING (app.is_pilot_checkout_service());
CREATE POLICY checkout_batches_pilot_service_insert ON checkout_batches
FOR INSERT WITH CHECK (app.is_pilot_checkout_service());
CREATE POLICY provider_orders_pilot_service_select ON provider_orders
FOR SELECT USING (app.is_pilot_checkout_service());
CREATE POLICY provider_orders_pilot_service_insert ON provider_orders
FOR INSERT WITH CHECK (app.is_pilot_checkout_service());
CREATE POLICY order_items_pilot_service_insert ON order_items
FOR INSERT WITH CHECK (app.is_pilot_checkout_service());
CREATE POLICY order_events_pilot_service_insert ON order_events
FOR INSERT WITH CHECK (app.is_pilot_checkout_service());
CREATE POLICY custom_requests_pilot_service_insert ON custom_requests
FOR INSERT WITH CHECK (app.is_pilot_checkout_service());
CREATE POLICY order_notifications_pilot_service_insert ON order_notifications
FOR INSERT WITH CHECK (app.is_pilot_checkout_service());
CREATE POLICY audit_events_pilot_service_insert ON audit_events
FOR INSERT WITH CHECK (app.is_pilot_checkout_service());

-- Solo se permite al servicio reservar stock de una pieza publicada.
CREATE OR REPLACE FUNCTION app.enforce_product_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  ready_images integer;
  pending_media integer;
BEGIN
  IF app.is_pilot_checkout_service() THEN
    IF TG_OP <> 'UPDATE'
       OR OLD.status <> 'PUBLISHED'
       OR NEW.status <> 'PUBLISHED'
       OR (to_jsonb(NEW) - ARRAY['stock_quantity','updated_at','updated_by','version'])
          IS DISTINCT FROM
          (to_jsonb(OLD) - ARRAY['stock_quantity','updated_at','updated_by','version'])
       OR OLD.stock_mode <> 'FINITE'
       OR NEW.stock_quantity IS NULL
       OR NEW.stock_quantity > OLD.stock_quantity THEN
      RAISE EXCEPTION 'PILOT_CHECKOUT_STOCK_UPDATE_NOT_ALLOWED' USING ERRCODE = '42501';
    END IF;
    NEW.updated_at := now();
    NEW.updated_by := app.current_user_id();
    NEW.version := OLD.version + 1;
    RETURN NEW;
  END IF;

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

CREATE OR REPLACE FUNCTION app.enforce_checkout_batch_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF app.is_pilot_checkout_service() THEN
      IF NEW.status <> 'SUBMITTED' OR NEW.submitted_at IS NULL THEN
        RAISE EXCEPTION 'PILOT_CHECKOUT_INSERT_NOT_ALLOWED' USING ERRCODE = '42501';
      END IF;
      RETURN NEW;
    END IF;
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

CREATE OR REPLACE FUNCTION app.enforce_provider_order_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF app.is_pilot_checkout_service() THEN
      IF NEW.status <> 'PENDING_CONFIRMATION' THEN
        RAISE EXCEPTION 'PILOT_ORDER_INSERT_NOT_ALLOWED' USING ERRCODE = '42501';
      END IF;
      RETURN NEW;
    END IF;
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

CREATE OR REPLACE FUNCTION app.enforce_custom_request_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF app.is_pilot_checkout_service() THEN
      IF NEW.status <> 'OPEN' THEN
        RAISE EXCEPTION 'PILOT_CUSTOM_REQUEST_INSERT_NOT_ALLOWED' USING ERRCODE = '42501';
      END IF;
      RETURN NEW;
    END IF;
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

COMMIT;

BEGIN;

CREATE OR REPLACE FUNCTION app.is_notification_service()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT app.current_role() = 'NOTIFICATION_SERVICE';
$$;

INSERT INTO users (
  id, email, display_name, status, email_verified_at, two_factor_enabled
) VALUES (
  '00000000-0000-4000-8000-000000000010',
  'notification-service@atelier.invalid',
  'Servicio interno de notificaciones',
  'ACTIVE',
  now(),
  false
)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE order_notifications
  ADD COLUMN template_key text,
  ADD COLUMN dedupe_key text,
  ADD COLUMN message_id text;

ALTER TABLE order_notifications
  ADD CONSTRAINT order_notifications_template_key_check
  CHECK (
    template_key IS NULL OR template_key IN (
      'PURCHASE_CONFIRMATION',
      'ORDER_STATUS',
      'CUSTOM_REQUEST',
      'SHIPMENT',
      'INCIDENT',
      'MESSAGE'
    )
  ),
  ADD CONSTRAINT order_notifications_dedupe_key_check
  CHECK (dedupe_key IS NULL OR char_length(dedupe_key) BETWEEN 8 AND 180),
  ADD CONSTRAINT order_notifications_message_id_check
  CHECK (message_id IS NULL OR char_length(message_id) BETWEEN 3 AND 500);

CREATE UNIQUE INDEX order_notifications_email_dedupe_idx
  ON order_notifications (
    dedupe_key,
    COALESCE(recipient_user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    channel
  )
  WHERE dedupe_key IS NOT NULL;

CREATE POLICY order_notifications_notification_service_all ON order_notifications
FOR ALL
USING (app.is_notification_service())
WITH CHECK (app.is_notification_service());

CREATE POLICY provider_orders_notification_service_select ON provider_orders
FOR SELECT USING (app.is_notification_service());

CREATE POLICY providers_notification_service_select ON providers
FOR SELECT USING (app.is_notification_service());

CREATE POLICY users_notification_service_select ON users
FOR SELECT USING (app.is_notification_service());

CREATE POLICY provider_members_notification_service_select ON provider_members
FOR SELECT USING (app.is_notification_service());

GRANT SELECT ON provider_orders, providers, users, provider_members TO atelier_app_runtime;
GRANT SELECT, INSERT, UPDATE ON order_notifications TO atelier_app_runtime;

CREATE OR REPLACE FUNCTION app.enqueue_order_event_email()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_customer boolean := false;
  target_provider boolean := false;
  selected_template text := NULL;
BEGIN
  IF NEW.event_type = 'ORDER_CREATED' THEN
    target_customer := true;
    target_provider := true;
    selected_template := 'PURCHASE_CONFIRMATION';
  ELSIF NEW.event_type LIKE 'ORDER_STATUS_%' OR NEW.event_type = 'PROVIDER_NOTE' THEN
    target_provider := NEW.actor_role = 'CUSTOMER';
    target_customer := NOT target_provider;
    selected_template := 'ORDER_STATUS';
  ELSIF NEW.event_type LIKE 'CUSTOM_REQUEST_STATUS_%' THEN
    target_provider := NEW.actor_role = 'CUSTOMER';
    target_customer := NOT target_provider;
    selected_template := 'CUSTOM_REQUEST';
  ELSIF NEW.event_type LIKE 'SHIPMENT_%' THEN
    target_customer := true;
    selected_template := 'SHIPMENT';
  ELSIF NEW.event_type = 'INCIDENT_OPENED' THEN
    target_provider := NEW.actor_role = 'CUSTOMER';
    target_customer := NOT target_provider;
    selected_template := 'INCIDENT';
  ELSIF NEW.event_type LIKE 'INCIDENT_STATUS_%' THEN
    target_customer := true;
    selected_template := 'INCIDENT';
  ELSE
    RETURN NEW;
  END IF;

  IF target_customer THEN
    INSERT INTO order_notifications (
      order_id, provider_id, customer_user_id, recipient_user_id,
      channel, event_type, payload, template_key, dedupe_key
    ) VALUES (
      NEW.order_id, NEW.provider_id, NEW.customer_user_id, NEW.customer_user_id,
      'EMAIL', NEW.event_type,
      jsonb_build_object('recipientKind', 'CUSTOMER', 'sourceEventId', NEW.id),
      selected_template, 'event:' || NEW.id::text || ':customer'
    )
    ON CONFLICT DO NOTHING;
  END IF;

  IF target_provider THEN
    INSERT INTO order_notifications (
      order_id, provider_id, customer_user_id, recipient_user_id,
      channel, event_type, payload, template_key, dedupe_key
    ) VALUES (
      NEW.order_id, NEW.provider_id, NEW.customer_user_id, NULL,
      'EMAIL', NEW.event_type,
      jsonb_build_object('recipientKind', 'PROVIDER', 'sourceEventId', NEW.id),
      selected_template, 'event:' || NEW.id::text || ':provider'
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.enqueue_custom_message_email()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_user uuid;
  recipient_kind text;
BEGIN
  IF NEW.author_role = 'CUSTOMER' THEN
    target_user := NULL;
    recipient_kind := 'PROVIDER';
  ELSE
    target_user := NEW.customer_user_id;
    recipient_kind := 'CUSTOMER';
  END IF;

  INSERT INTO order_notifications (
    order_id, provider_id, customer_user_id, recipient_user_id,
    channel, event_type, payload, template_key, dedupe_key
  ) VALUES (
    NEW.order_id, NEW.provider_id, NEW.customer_user_id, target_user,
    'EMAIL', 'CUSTOM_REQUEST_MESSAGE',
    jsonb_build_object(
      'recipientKind', recipient_kind,
      'requestId', NEW.request_id,
      'sourceMessageId', NEW.id
    ),
    'MESSAGE', 'message:' || NEW.id::text || ':' || lower(recipient_kind)
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER order_events_enqueue_email
AFTER INSERT ON order_events
FOR EACH ROW EXECUTE FUNCTION app.enqueue_order_event_email();

CREATE TRIGGER custom_request_messages_enqueue_email
AFTER INSERT ON custom_request_messages
FOR EACH ROW EXECUTE FUNCTION app.enqueue_custom_message_email();

COMMIT;

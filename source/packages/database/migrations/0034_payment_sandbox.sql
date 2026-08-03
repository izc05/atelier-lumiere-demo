BEGIN;

CREATE OR REPLACE FUNCTION app.is_payment_service()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT app.current_role() = 'PAYMENT_SERVICE';
$$;

INSERT INTO users (
  id, email, display_name, status, email_verified_at, two_factor_enabled
) VALUES (
  '00000000-0000-4000-8000-000000000009',
  'payment-service@atelier.invalid',
  'Servicio interno de pagos',
  'ACTIVE',
  now(),
  false
)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE payment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_id uuid NOT NULL UNIQUE REFERENCES checkout_batches(id) ON DELETE RESTRICT,
  order_id uuid NOT NULL UNIQUE,
  provider_id uuid NOT NULL,
  customer_user_id uuid NOT NULL,
  payment_provider text NOT NULL DEFAULT 'SANDBOX'
    CHECK (payment_provider = 'SANDBOX'),
  provider_reference text NOT NULL UNIQUE
    CHECK (provider_reference ~ '^AL-SANDBOX-[A-Z0-9]{16}$'),
  session_token_hash char(64) NOT NULL UNIQUE
    CHECK (session_token_hash ~ '^[a-f0-9]{64}$'),
  idempotency_key uuid NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'CREATED'
    CHECK (status IN (
      'CREATED', 'PENDING', 'AUTHORIZED', 'CAPTURED',
      'FAILED', 'CANCELLED', 'REFUNDED', 'EXPIRED'
    )),
  amount_cents integer NOT NULL CHECK (amount_cents BETWEEN 1 AND 100000000),
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  last_event_id text,
  failure_code text CHECK (failure_code IS NULL OR char_length(failure_code) <= 120),
  failure_message text CHECK (failure_message IS NULL OR char_length(failure_message) <= 500),
  expires_at timestamptz NOT NULL,
  authorized_at timestamptz,
  captured_at timestamptz,
  failed_at timestamptz,
  cancelled_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  FOREIGN KEY (order_id, provider_id, customer_user_id)
    REFERENCES provider_orders(id, provider_id, customer_user_id) ON DELETE RESTRICT,
  CHECK (expires_at > created_at),
  CHECK (status <> 'AUTHORIZED' OR authorized_at IS NOT NULL),
  CHECK (status <> 'CAPTURED' OR captured_at IS NOT NULL),
  CHECK (status <> 'FAILED' OR failed_at IS NOT NULL),
  CHECK (status <> 'CANCELLED' OR cancelled_at IS NOT NULL),
  CHECK (status <> 'REFUNDED' OR refunded_at IS NOT NULL)
);

CREATE TABLE payment_webhook_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  payment_provider text NOT NULL DEFAULT 'SANDBOX'
    CHECK (payment_provider = 'SANDBOX'),
  event_id text NOT NULL CHECK (char_length(event_id) BETWEEN 8 AND 180),
  event_type text NOT NULL
    CHECK (event_type IN (
      'payment.authorized', 'payment.captured', 'payment.failed',
      'payment.cancelled', 'payment.refunded'
    )),
  payload_hash char(64) NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  payment_id uuid REFERENCES payment_attempts(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'RECEIVED'
    CHECK (status IN ('RECEIVED', 'PROCESSED', 'IGNORED', 'REJECTED')),
  failure_reason text CHECK (failure_reason IS NULL OR char_length(failure_reason) <= 500),
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE (payment_provider, event_id),
  CHECK (status NOT IN ('PROCESSED', 'IGNORED', 'REJECTED') OR processed_at IS NOT NULL)
);

CREATE INDEX payment_attempts_customer_idx
  ON payment_attempts(customer_user_id, created_at DESC);
CREATE INDEX payment_attempts_status_idx
  ON payment_attempts(status, expires_at);
CREATE INDEX payment_webhook_events_payment_idx
  ON payment_webhook_events(payment_id, received_at DESC);

CREATE TRIGGER payment_attempts_set_updated_at
BEFORE UPDATE ON payment_attempts
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

ALTER TABLE payment_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_attempts FORCE ROW LEVEL SECURITY;
ALTER TABLE payment_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_webhook_events FORCE ROW LEVEL SECURITY;

CREATE POLICY payment_attempts_admin_all ON payment_attempts
FOR ALL USING (app.is_admin()) WITH CHECK (app.is_admin());
CREATE POLICY payment_attempts_service_all ON payment_attempts
FOR ALL USING (app.is_payment_service()) WITH CHECK (app.is_payment_service());
CREATE POLICY payment_attempts_customer_select ON payment_attempts
FOR SELECT USING (app.is_customer_actor(customer_user_id));

CREATE POLICY payment_webhook_events_admin_select ON payment_webhook_events
FOR SELECT USING (app.is_admin());
CREATE POLICY payment_webhook_events_service_all ON payment_webhook_events
FOR ALL USING (app.is_payment_service()) WITH CHECK (app.is_payment_service());

CREATE POLICY checkout_batches_payment_service_select ON checkout_batches
FOR SELECT USING (app.is_payment_service());
CREATE POLICY provider_orders_payment_service_select ON provider_orders
FOR SELECT USING (app.is_payment_service());
CREATE POLICY providers_payment_service_select ON providers
FOR SELECT USING (app.is_payment_service());
CREATE POLICY order_events_payment_service_insert ON order_events
FOR INSERT WITH CHECK (app.is_payment_service());
CREATE POLICY audit_events_payment_service_insert ON audit_events
FOR INSERT WITH CHECK (app.is_payment_service());

GRANT SELECT ON checkout_batches, provider_orders, providers TO atelier_app_runtime;
GRANT SELECT, INSERT, UPDATE ON payment_attempts TO atelier_app_runtime;
GRANT SELECT, INSERT, UPDATE ON payment_webhook_events TO atelier_app_runtime;
GRANT INSERT ON order_events, audit_events TO atelier_app_runtime;

COMMIT;

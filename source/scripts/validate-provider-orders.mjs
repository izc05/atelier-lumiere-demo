import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const paths = [
  "packages/database/migrations/0020_orders_and_custom_requests.sql",
  "packages/database/migrations/0021_order_fulfilment_snapshot.sql",
  "packages/database/migrations/0022_order_relationship_guards.sql",
  "apps/api/src/provider-orders-service.mjs",
  "apps/api/src/provider-orders-api.mjs",
  "apps/api/src/server.mjs"
];

const files = Object.fromEntries(await Promise.all(paths.map(async (path) => [
  path,
  await readFile(new URL(`../${path}`, import.meta.url), "utf8")
])));

const schema = files[paths[0]];
const snapshot = files[paths[1]];
const relationships = files[paths[2]];
const service = files[paths[3]];
const api = files[paths[4]];
const server = files[paths[5]];

for (const table of [
  "checkout_batches",
  "provider_orders",
  "order_items",
  "order_events",
  "custom_requests",
  "custom_request_messages",
  "custom_request_files",
  "order_shipments",
  "order_incidents",
  "order_notifications"
]) {
  assert.match(schema, new RegExp(`CREATE TABLE ${table}\\b`));
  assert.match(schema, new RegExp(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`));
}

assert.match(schema, /UNIQUE \(checkout_id, provider_id\)/);
assert.match(schema, /app\.can_access_order\(provider_id, customer_user_id\)/);
assert.match(schema, /ORDER_STATUS_TRANSITION_NOT_ALLOWED/);
assert.match(schema, /ORDER_CUSTOMER_UPDATE_NOT_ALLOWED/);
assert.match(schema, /ORDER_STATUS_' \|\| NEW\.status/);
assert.match(schema, /order_notifications_pending_idx/);
assert.match(snapshot, /ORDER_CHECKOUT_SNAPSHOT_MISMATCH/);
assert.match(snapshot, /ORDER_FULFILMENT_SNAPSHOT_IMMUTABLE/);
assert.match(relationships, /custom_requests_order_item_scope_fkey/);
assert.match(relationships, /custom_request_messages_request_scope_fkey/);
assert.match(relationships, /custom_request_files_message_scope_fkey/);

assert.match(service, /WHERE order_row\.provider_id = \$1/);
assert.match(service, /WHERE id = \$1 AND provider_id = \$2 AND version = \$5/);
assert.match(service, /ORDER_VERSION_CONFLICT/);
assert.match(service, /CUSTOM_REQUEST_VERSION_CONFLICT/);
assert.match(service, /CUSTOM_REQUEST_MESSAGE/);
assert.doesNotMatch(service, /stripe|paypal|payment_intent|card_number/i);

assert.match(api, /providerAuthService\.authenticate/);
assert.match(api, /\/api\\\/provider\\\/orders/);
assert.match(api, /\/api\\\/provider\\\/custom-requests/);
assert.match(api, /Content-Security-Policy/);
assert.match(server, /createProviderOrdersApiHandler/);
assert.match(server, /createProviderOrdersService/);

console.log("Pedidos y encargos del proveedor validados.");

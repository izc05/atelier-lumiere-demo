BEGIN;

ALTER TABLE order_items
  ADD CONSTRAINT order_items_identity_unique
  UNIQUE (id, order_id, provider_id, customer_user_id);

ALTER TABLE custom_requests
  ADD CONSTRAINT custom_requests_identity_unique
  UNIQUE (id, order_id, provider_id, customer_user_id),
  DROP CONSTRAINT custom_requests_order_item_id_fkey,
  ADD CONSTRAINT custom_requests_order_item_scope_fkey
  FOREIGN KEY (order_item_id, order_id, provider_id, customer_user_id)
  REFERENCES order_items(id, order_id, provider_id, customer_user_id)
  ON DELETE SET NULL (order_item_id);

ALTER TABLE custom_request_messages
  ADD CONSTRAINT custom_request_messages_identity_unique
  UNIQUE (id, request_id, order_id, provider_id, customer_user_id),
  DROP CONSTRAINT custom_request_messages_request_id_fkey,
  ADD CONSTRAINT custom_request_messages_request_scope_fkey
  FOREIGN KEY (request_id, order_id, provider_id, customer_user_id)
  REFERENCES custom_requests(id, order_id, provider_id, customer_user_id)
  ON DELETE CASCADE;

ALTER TABLE custom_request_files
  DROP CONSTRAINT custom_request_files_request_id_fkey,
  DROP CONSTRAINT custom_request_files_message_id_fkey,
  ADD CONSTRAINT custom_request_files_request_scope_fkey
  FOREIGN KEY (request_id, order_id, provider_id, customer_user_id)
  REFERENCES custom_requests(id, order_id, provider_id, customer_user_id)
  ON DELETE CASCADE,
  ADD CONSTRAINT custom_request_files_message_scope_fkey
  FOREIGN KEY (message_id, request_id, order_id, provider_id, customer_user_id)
  REFERENCES custom_request_messages(id, request_id, order_id, provider_id, customer_user_id)
  ON DELETE SET NULL (message_id);

COMMIT;

import { ServiceError } from "./providers-service.mjs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ORDER_STATUSES = new Set([
  "PENDING_CONFIRMATION",
  "ACCEPTED",
  "IN_PRODUCTION",
  "READY_TO_SHIP",
  "SHIPPED",
  "DELIVERED",
  "INCIDENT",
  "CANCELLED"
]);
const CUSTOM_STATUSES = new Set([
  "OPEN",
  "NEEDS_INFO",
  "QUOTED",
  "APPROVED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED"
]);

function requireProviderContext(context) {
  if (
    !context
    || !["PROVIDER_OWNER", "PROVIDER_MEMBER"].includes(context.role)
    || !UUID_PATTERN.test(context.userId ?? "")
    || !UUID_PATTERN.test(context.providerId ?? "")
  ) {
    throw new ServiceError(
      "PROVIDER_CONTEXT_REQUIRED",
      "La operación necesita una sesión válida del taller.",
      401
    );
  }
  return context;
}

function uuid(value, field) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new ServiceError("VALIDATION_ERROR", `${field} no es válido.`, 422, { field });
  }
  return value.toLowerCase();
}

function optionalText(value, maximum, field) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") {
    throw new ServiceError("VALIDATION_ERROR", `${field} no es válido.`, 422, { field });
  }
  const result = value.trim();
  if (result.length > maximum) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      `${field} supera el tamaño permitido.`,
      422,
      { field, maximum }
    );
  }
  return result;
}

function requiredText(value, minimum, maximum, field) {
  const result = optionalText(value, maximum, field);
  if (result.length < minimum) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      `${field} debe tener al menos ${minimum} caracteres.`,
      422,
      { field, minimum }
    );
  }
  return result;
}

function expectedVersion(value) {
  if (!Number.isInteger(value) || value < 1) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "La versión del registro no es válida.",
      422,
      { field: "expectedVersion" }
    );
  }
  return value;
}

function orderStatus(value) {
  const status = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!ORDER_STATUSES.has(status)) {
    throw new ServiceError("VALIDATION_ERROR", "El estado del pedido no es válido.", 422, {
      field: "status"
    });
  }
  return status;
}

function customStatus(value) {
  const status = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!CUSTOM_STATUSES.has(status)) {
    throw new ServiceError("VALIDATION_ERROR", "El estado del encargo no es válido.", 422, {
      field: "status"
    });
  }
  return status;
}

function money(value, field, { optional = false } = {}) {
  if ((value === undefined || value === null || value === "") && optional) return null;
  if (!Number.isInteger(value) || value < 0 || value > 100_000_000) {
    throw new ServiceError("VALIDATION_ERROR", `${field} no es válido.`, 422, { field });
  }
  return value;
}

function mapOrder(row) {
  return {
    id: row.id,
    checkoutId: row.checkout_id,
    orderNumber: row.order_number,
    status: row.status,
    currency: row.currency,
    subtotalCents: row.subtotal_cents,
    shippingCents: row.shipping_cents,
    totalCents: row.total_cents,
    preparationMinDays: row.preparation_min_days,
    preparationMaxDays: row.preparation_max_days,
    customerNote: row.customer_note,
    providerNote: row.provider_note,
    customer: {
      name: row.customer_name,
      email: row.contact_email,
      phone: row.contact_phone,
      shippingAddress: row.shipping_address
    },
    version: row.version,
    placedAt: row.placed_at,
    acceptedAt: row.accepted_at,
    productionStartedAt: row.production_started_at,
    readyToShipAt: row.ready_to_ship_at,
    shippedAt: row.shipped_at,
    deliveredAt: row.delivered_at,
    cancelledAt: row.cancelled_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    itemCount: Number(row.item_count ?? 0),
    openCustomRequests: Number(row.open_custom_requests ?? 0),
    openIncidents: Number(row.open_incidents ?? 0)
  };
}

function mapCustomRequest(row) {
  return {
    id: row.id,
    orderId: row.order_id,
    orderItemId: row.order_item_id,
    orderNumber: row.order_number,
    title: row.title,
    brief: row.brief,
    desiredDate: row.desired_date,
    status: row.status,
    quotedPriceCents: row.quoted_price_cents,
    currency: row.currency,
    version: row.version,
    customerName: row.customer_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    messageCount: Number(row.message_count ?? 0),
    fileCount: Number(row.file_count ?? 0)
  };
}

async function readOrder(transaction, providerId, orderId) {
  const result = await transaction.query(
    `SELECT order_row.*,
            COALESCE(items.total, 0) AS item_count,
            COALESCE(requests.total, 0) AS open_custom_requests,
            COALESCE(incidents.total, 0) AS open_incidents
     FROM provider_orders order_row
     LEFT JOIN LATERAL (
       SELECT count(*)::integer AS total
       FROM order_items item
       WHERE item.order_id = order_row.id
     ) items ON true
     LEFT JOIN LATERAL (
       SELECT count(*)::integer AS total
       FROM custom_requests request
       WHERE request.order_id = order_row.id
         AND request.status NOT IN ('COMPLETED', 'CANCELLED')
     ) requests ON true
     LEFT JOIN LATERAL (
       SELECT count(*)::integer AS total
       FROM order_incidents incident
       WHERE incident.order_id = order_row.id
         AND incident.status NOT IN ('RESOLVED', 'CLOSED')
     ) incidents ON true
     WHERE order_row.id = $1 AND order_row.provider_id = $2`,
    [orderId, providerId]
  );
  return result.rows[0] ?? null;
}

export function createProviderOrdersService({ database } = {}) {
  if (!database || typeof database.withContext !== "function") {
    throw new TypeError("createProviderOrdersService necesita una base de datos.");
  }

  return Object.freeze({
    async list(rawContext, input = {}) {
      const context = requireProviderContext(rawContext);
      const selectedStatus = input.status ? orderStatus(input.status) : "";
      const query = optionalText(input.query, 160, "query");
      const limit = Number.isInteger(input.limit)
        ? Math.min(Math.max(input.limit, 1), 100)
        : 60;

      return database.withContext(context, async (transaction) => {
        const result = await transaction.query(
          `SELECT order_row.*,
                  COALESCE(items.total, 0) AS item_count,
                  COALESCE(requests.total, 0) AS open_custom_requests,
                  COALESCE(incidents.total, 0) AS open_incidents
           FROM provider_orders order_row
           LEFT JOIN LATERAL (
             SELECT count(*)::integer AS total
             FROM order_items item WHERE item.order_id = order_row.id
           ) items ON true
           LEFT JOIN LATERAL (
             SELECT count(*)::integer AS total
             FROM custom_requests request
             WHERE request.order_id = order_row.id
               AND request.status NOT IN ('COMPLETED', 'CANCELLED')
           ) requests ON true
           LEFT JOIN LATERAL (
             SELECT count(*)::integer AS total
             FROM order_incidents incident
             WHERE incident.order_id = order_row.id
               AND incident.status NOT IN ('RESOLVED', 'CLOSED')
           ) incidents ON true
           WHERE order_row.provider_id = $1
             AND ($2 = '' OR order_row.status = $2)
             AND ($3 = '' OR order_row.order_number ILIKE '%' || $3 || '%'
               OR order_row.customer_name ILIKE '%' || $3 || '%'
               OR order_row.contact_email::text ILIKE '%' || $3 || '%')
           ORDER BY order_row.placed_at DESC, order_row.order_number
           LIMIT $4`,
          [context.providerId, selectedStatus, query, limit]
        );
        return result.rows.map(mapOrder);
      });
    },

    async get(rawContext, rawOrderId) {
      const context = requireProviderContext(rawContext);
      const orderId = uuid(rawOrderId, "orderId");

      return database.withContext(context, async (transaction) => {
        const row = await readOrder(transaction, context.providerId, orderId);
        if (!row) {
          throw new ServiceError("ORDER_NOT_FOUND", "No se ha encontrado el pedido.", 404);
        }

        const itemsResult = await transaction.query(
          `SELECT id, product_id, item_type, product_name, product_slug,
                  product_story_snapshot, quantity, unit_price_cents,
                  line_total_cents, currency, personalization, created_at
           FROM order_items
           WHERE order_id = $1 AND provider_id = $2
           ORDER BY created_at, id`,
          [orderId, context.providerId]
        );
        const eventsResult = await transaction.query(
          `SELECT id, actor_user_id, actor_role, event_type, message, metadata, created_at
           FROM order_events
           WHERE order_id = $1 AND provider_id = $2
           ORDER BY created_at, id`,
          [orderId, context.providerId]
        );
        const requestsResult = await transaction.query(
          `SELECT request.*, order_row.order_number, order_row.customer_name,
                  COALESCE(messages.total, 0) AS message_count,
                  COALESCE(files.total, 0) AS file_count
           FROM custom_requests request
           INNER JOIN provider_orders order_row ON order_row.id = request.order_id
           LEFT JOIN LATERAL (
             SELECT count(*)::integer AS total
             FROM custom_request_messages message WHERE message.request_id = request.id
           ) messages ON true
           LEFT JOIN LATERAL (
             SELECT count(*)::integer AS total
             FROM custom_request_files file
             WHERE file.request_id = request.id AND file.status <> 'DELETED'
           ) files ON true
           WHERE request.order_id = $1 AND request.provider_id = $2
           ORDER BY request.updated_at DESC`,
          [orderId, context.providerId]
        );
        const shipmentsResult = await transaction.query(
          `SELECT id, status, carrier, tracking_code, tracking_url,
                  shipped_at, delivered_at, created_at, updated_at
           FROM order_shipments
           WHERE order_id = $1 AND provider_id = $2
           ORDER BY created_at DESC`,
          [orderId, context.providerId]
        );
        const incidentsResult = await transaction.query(
          `SELECT id, opened_by, incident_type, status, description,
                  resolution, resolved_at, created_at, updated_at
           FROM order_incidents
           WHERE order_id = $1 AND provider_id = $2
           ORDER BY created_at DESC`,
          [orderId, context.providerId]
        );

        return {
          order: mapOrder(row),
          items: itemsResult.rows.map((item) => ({
            id: item.id,
            productId: item.product_id,
            itemType: item.item_type,
            productName: item.product_name,
            productSlug: item.product_slug,
            story: item.product_story_snapshot,
            quantity: item.quantity,
            unitPriceCents: item.unit_price_cents,
            lineTotalCents: item.line_total_cents,
            currency: item.currency,
            personalization: item.personalization,
            createdAt: item.created_at
          })),
          events: eventsResult.rows.map((event) => ({
            id: event.id,
            actorUserId: event.actor_user_id,
            actorRole: event.actor_role,
            type: event.event_type,
            message: event.message,
            metadata: event.metadata,
            createdAt: event.created_at
          })),
          customRequests: requestsResult.rows.map(mapCustomRequest),
          shipments: shipmentsResult.rows.map((shipment) => ({
            id: shipment.id,
            status: shipment.status,
            carrier: shipment.carrier,
            trackingCode: shipment.tracking_code,
            trackingUrl: shipment.tracking_url,
            shippedAt: shipment.shipped_at,
            deliveredAt: shipment.delivered_at,
            createdAt: shipment.created_at,
            updatedAt: shipment.updated_at
          })),
          incidents: incidentsResult.rows.map((incident) => ({
            id: incident.id,
            openedBy: incident.opened_by,
            type: incident.incident_type,
            status: incident.status,
            description: incident.description,
            resolution: incident.resolution,
            resolvedAt: incident.resolved_at,
            createdAt: incident.created_at,
            updatedAt: incident.updated_at
          }))
        };
      });
    },

    async transition(rawContext, rawOrderId, input = {}) {
      const context = requireProviderContext(rawContext);
      const orderId = uuid(rawOrderId, "orderId");
      const status = orderStatus(input.status);
      const version = expectedVersion(input.expectedVersion);
      const note = optionalText(input.note, 4000, "note");

      return database.withContext(context, async (transaction) => {
        const result = await transaction.query(
          `UPDATE provider_orders
           SET status = $3,
               provider_note = CASE WHEN $4 = '' THEN provider_note ELSE $4 END
           WHERE id = $1 AND provider_id = $2 AND version = $5
           RETURNING *`,
          [orderId, context.providerId, status, note, version]
        );

        if (result.rowCount !== 1) {
          const current = await transaction.query(
            "SELECT version FROM provider_orders WHERE id = $1 AND provider_id = $2",
            [orderId, context.providerId]
          );
          if (current.rowCount !== 1) {
            throw new ServiceError("ORDER_NOT_FOUND", "No se ha encontrado el pedido.", 404);
          }
          throw new ServiceError(
            "ORDER_VERSION_CONFLICT",
            "El pedido ha cambiado. Actualiza la ficha antes de continuar.",
            409,
            { currentVersion: current.rows[0].version }
          );
        }

        if (note) {
          const row = result.rows[0];
          await transaction.query(
            `INSERT INTO order_events (
               order_id, provider_id, customer_user_id, actor_user_id,
               actor_role, event_type, message
             ) VALUES ($1, $2, $3, $4, $5, 'PROVIDER_NOTE', $6)`,
            [orderId, context.providerId, row.customer_user_id, context.userId, context.role, note]
          );
        }

        const complete = await readOrder(transaction, context.providerId, orderId);
        return mapOrder(complete);
      });
    },

    async listCustomRequests(rawContext, input = {}) {
      const context = requireProviderContext(rawContext);
      const status = input.status ? customStatus(input.status) : "";
      const query = optionalText(input.query, 160, "query");

      return database.withContext(context, async (transaction) => {
        const result = await transaction.query(
          `SELECT request.*, order_row.order_number, order_row.customer_name,
                  COALESCE(messages.total, 0) AS message_count,
                  COALESCE(files.total, 0) AS file_count
           FROM custom_requests request
           INNER JOIN provider_orders order_row ON order_row.id = request.order_id
           LEFT JOIN LATERAL (
             SELECT count(*)::integer AS total
             FROM custom_request_messages message WHERE message.request_id = request.id
           ) messages ON true
           LEFT JOIN LATERAL (
             SELECT count(*)::integer AS total
             FROM custom_request_files file
             WHERE file.request_id = request.id AND file.status <> 'DELETED'
           ) files ON true
           WHERE request.provider_id = $1
             AND ($2 = '' OR request.status = $2)
             AND ($3 = '' OR request.title ILIKE '%' || $3 || '%'
               OR order_row.order_number ILIKE '%' || $3 || '%'
               OR order_row.customer_name ILIKE '%' || $3 || '%')
           ORDER BY request.updated_at DESC, request.created_at DESC`,
          [context.providerId, status, query]
        );
        return result.rows.map(mapCustomRequest);
      });
    },

    async getCustomRequest(rawContext, rawRequestId) {
      const context = requireProviderContext(rawContext);
      const requestId = uuid(rawRequestId, "requestId");

      return database.withContext(context, async (transaction) => {
        const result = await transaction.query(
          `SELECT request.*, order_row.order_number, order_row.customer_name,
                  COALESCE(messages.total, 0) AS message_count,
                  COALESCE(files.total, 0) AS file_count
           FROM custom_requests request
           INNER JOIN provider_orders order_row ON order_row.id = request.order_id
           LEFT JOIN LATERAL (
             SELECT count(*)::integer AS total
             FROM custom_request_messages message WHERE message.request_id = request.id
           ) messages ON true
           LEFT JOIN LATERAL (
             SELECT count(*)::integer AS total
             FROM custom_request_files file
             WHERE file.request_id = request.id AND file.status <> 'DELETED'
           ) files ON true
           WHERE request.id = $1 AND request.provider_id = $2`,
          [requestId, context.providerId]
        );
        const row = result.rows[0];
        if (!row) {
          throw new ServiceError("CUSTOM_REQUEST_NOT_FOUND", "No se ha encontrado el encargo.", 404);
        }

        const messagesResult = await transaction.query(
          `SELECT id, author_user_id, author_role, body, created_at
           FROM custom_request_messages
           WHERE request_id = $1 AND provider_id = $2
           ORDER BY created_at, id`,
          [requestId, context.providerId]
        );
        const filesResult = await transaction.query(
          `SELECT id, message_id, uploaded_by, mime_type, original_filename,
                  size_bytes, status, rejection_reason, ready_at, created_at
           FROM custom_request_files
           WHERE request_id = $1 AND provider_id = $2 AND status <> 'DELETED'
           ORDER BY created_at, id`,
          [requestId, context.providerId]
        );

        return {
          request: mapCustomRequest(row),
          messages: messagesResult.rows.map((message) => ({
            id: message.id,
            authorUserId: message.author_user_id,
            authorRole: message.author_role,
            body: message.body,
            createdAt: message.created_at
          })),
          files: filesResult.rows.map((file) => ({
            id: file.id,
            messageId: file.message_id,
            uploadedBy: file.uploaded_by,
            mimeType: file.mime_type,
            originalFilename: file.original_filename,
            sizeBytes: file.size_bytes,
            status: file.status,
            rejectionReason: file.rejection_reason,
            readyAt: file.ready_at,
            createdAt: file.created_at
          }))
        };
      });
    },

    async addCustomMessage(rawContext, rawRequestId, input = {}) {
      const context = requireProviderContext(rawContext);
      const requestId = uuid(rawRequestId, "requestId");
      const body = requiredText(input.body, 1, 8000, "body");

      return database.withContext(context, async (transaction) => {
        const requestResult = await transaction.query(
          `SELECT id, order_id, provider_id, customer_user_id
           FROM custom_requests
           WHERE id = $1 AND provider_id = $2`,
          [requestId, context.providerId]
        );
        const request = requestResult.rows[0];
        if (!request) {
          throw new ServiceError("CUSTOM_REQUEST_NOT_FOUND", "No se ha encontrado el encargo.", 404);
        }

        const result = await transaction.query(
          `INSERT INTO custom_request_messages (
             request_id, order_id, provider_id, customer_user_id,
             author_user_id, author_role, body
           ) VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id, author_user_id, author_role, body, created_at`,
          [
            requestId,
            request.order_id,
            context.providerId,
            request.customer_user_id,
            context.userId,
            context.role,
            body
          ]
        );
        const message = result.rows[0];

        await transaction.query(
          `INSERT INTO order_notifications (
             order_id, provider_id, customer_user_id, recipient_user_id,
             event_type, payload
           ) VALUES ($1, $2, $3, $3, 'CUSTOM_REQUEST_MESSAGE', $4::jsonb)`,
          [
            request.order_id,
            context.providerId,
            request.customer_user_id,
            JSON.stringify({ requestId, messageId: message.id })
          ]
        );

        return {
          id: message.id,
          authorUserId: message.author_user_id,
          authorRole: message.author_role,
          body: message.body,
          createdAt: message.created_at
        };
      });
    },

    async transitionCustomRequest(rawContext, rawRequestId, input = {}) {
      const context = requireProviderContext(rawContext);
      const requestId = uuid(rawRequestId, "requestId");
      const status = customStatus(input.status);
      const version = expectedVersion(input.expectedVersion);
      const quotedPriceCents = money(input.quotedPriceCents, "quotedPriceCents", { optional: true });
      const note = optionalText(input.note, 4000, "note");

      return database.withContext(context, async (transaction) => {
        const result = await transaction.query(
          `UPDATE custom_requests
           SET status = $3,
               quoted_price_cents = CASE
                 WHEN $4::integer IS NULL THEN quoted_price_cents
                 ELSE $4::integer
               END
           WHERE id = $1 AND provider_id = $2 AND version = $5
           RETURNING *`,
          [requestId, context.providerId, status, quotedPriceCents, version]
        );
        const row = result.rows[0];
        if (!row) {
          const current = await transaction.query(
            "SELECT version FROM custom_requests WHERE id = $1 AND provider_id = $2",
            [requestId, context.providerId]
          );
          if (current.rowCount !== 1) {
            throw new ServiceError(
              "CUSTOM_REQUEST_NOT_FOUND",
              "No se ha encontrado el encargo.",
              404
            );
          }
          throw new ServiceError(
            "CUSTOM_REQUEST_VERSION_CONFLICT",
            "El encargo ha cambiado. Actualiza la ficha antes de continuar.",
            409,
            { currentVersion: current.rows[0].version }
          );
        }

        await transaction.query(
          `INSERT INTO order_events (
             order_id, provider_id, customer_user_id, actor_user_id,
             actor_role, event_type, message,
             metadata
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
          [
            row.order_id,
            context.providerId,
            row.customer_user_id,
            context.userId,
            context.role,
            `CUSTOM_REQUEST_STATUS_${status}`,
            note,
            JSON.stringify({ requestId, status, version: row.version })
          ]
        );
        await transaction.query(
          `INSERT INTO order_notifications (
             order_id, provider_id, customer_user_id, recipient_user_id,
             event_type, payload
           ) VALUES ($1, $2, $3, $3, $4, $5::jsonb)`,
          [
            row.order_id,
            context.providerId,
            row.customer_user_id,
            `CUSTOM_REQUEST_STATUS_${status}`,
            JSON.stringify({ requestId, status })
          ]
        );

        return {
          id: row.id,
          status: row.status,
          quotedPriceCents: row.quoted_price_cents,
          currency: row.currency,
          version: row.version,
          updatedAt: row.updated_at
        };
      });
    }
  });
}

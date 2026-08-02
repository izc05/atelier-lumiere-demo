import { ServiceError } from "./providers-service.mjs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireCustomerContext(context) {
  if (
    !context
    || context.role !== "CUSTOMER"
    || !UUID_PATTERN.test(context.userId ?? "")
    || context.providerId !== null
  ) {
    throw new ServiceError(
      "CUSTOMER_CONTEXT_REQUIRED",
      "La operación necesita una sesión válida del cliente.",
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
function version(value) {
  if (!Number.isInteger(value) || value < 1) {
    throw new ServiceError("VALIDATION_ERROR", "La versión no es válida.", 422, {
      field: "expectedVersion"
    });
  }
  return value;
}
function text(value, minimum, maximum, field) {
  if (typeof value !== "string") {
    throw new ServiceError("VALIDATION_ERROR", `${field} no es válido.`, 422, { field });
  }
  const clean = value.trim();
  if (clean.length < minimum || clean.length > maximum) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      `${field} debe tener entre ${minimum} y ${maximum} caracteres.`,
      422,
      { field, minimum, maximum }
    );
  }
  return clean;
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
    provider: {
      id: row.provider_id,
      slug: row.provider_slug,
      displayName: row.provider_display_name,
      specialty: row.provider_specialty
    },
    itemCount: Number(row.item_count ?? 0),
    openCustomRequests: Number(row.open_custom_requests ?? 0),
    openIncidents: Number(row.open_incidents ?? 0)
  };
}
function mapRequest(row) {
  return {
    id: row.id,
    orderId: row.order_id,
    orderItemId: row.order_item_id,
    orderNumber: row.order_number,
    providerName: row.provider_display_name,
    title: row.title,
    brief: row.brief,
    desiredDate: row.desired_date,
    status: row.status,
    quotedPriceCents: row.quoted_price_cents,
    currency: row.currency,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    messageCount: Number(row.message_count ?? 0),
    fileCount: Number(row.file_count ?? 0)
  };
}

export function createCustomerOrdersService({ database } = {}) {
  if (!database || typeof database.withContext !== "function") {
    throw new TypeError("createCustomerOrdersService necesita una base de datos.");
  }

  return Object.freeze({
    async list(rawContext) {
      const context = requireCustomerContext(rawContext);
      return database.withContext(context, async (transaction) => {
        const result = await transaction.query(
          `SELECT order_row.*,
                  provider.slug AS provider_slug,
                  provider.display_name AS provider_display_name,
                  provider.specialty AS provider_specialty,
                  COALESCE(items.total, 0) AS item_count,
                  COALESCE(requests.total, 0) AS open_custom_requests,
                  COALESCE(incidents.total, 0) AS open_incidents
           FROM provider_orders order_row
           INNER JOIN providers provider ON provider.id = order_row.provider_id
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
           WHERE order_row.customer_user_id = $1
           ORDER BY order_row.placed_at DESC, order_row.order_number`,
          [context.userId]
        );
        return result.rows.map(mapOrder);
      });
    },

    async get(rawContext, rawOrderId) {
      const context = requireCustomerContext(rawContext);
      const orderId = uuid(rawOrderId, "orderId");
      return database.withContext(context, async (transaction) => {
        const orderResult = await transaction.query(
          `SELECT order_row.*,
                  provider.slug AS provider_slug,
                  provider.display_name AS provider_display_name,
                  provider.specialty AS provider_specialty,
                  COALESCE(items.total, 0) AS item_count,
                  COALESCE(requests.total, 0) AS open_custom_requests,
                  COALESCE(incidents.total, 0) AS open_incidents
           FROM provider_orders order_row
           INNER JOIN providers provider ON provider.id = order_row.provider_id
           LEFT JOIN LATERAL (
             SELECT count(*)::integer AS total FROM order_items item
             WHERE item.order_id = order_row.id
           ) items ON true
           LEFT JOIN LATERAL (
             SELECT count(*)::integer AS total FROM custom_requests request
             WHERE request.order_id = order_row.id
               AND request.status NOT IN ('COMPLETED', 'CANCELLED')
           ) requests ON true
           LEFT JOIN LATERAL (
             SELECT count(*)::integer AS total FROM order_incidents incident
             WHERE incident.order_id = order_row.id
               AND incident.status NOT IN ('RESOLVED', 'CLOSED')
           ) incidents ON true
           WHERE order_row.id = $1 AND order_row.customer_user_id = $2`,
          [orderId, context.userId]
        );
        const order = orderResult.rows[0];
        if (!order) throw new ServiceError("ORDER_NOT_FOUND", "No se ha encontrado el pedido.", 404);

        const items = await transaction.query(
          `SELECT id, product_id, item_type, product_name, product_slug,
                  product_story_snapshot, quantity, unit_price_cents,
                  line_total_cents, currency, personalization, created_at
           FROM order_items
           WHERE order_id = $1 AND customer_user_id = $2
           ORDER BY created_at, id`,
          [orderId, context.userId]
        );
        const events = await transaction.query(
          `SELECT id, actor_role, event_type, message, metadata, created_at
           FROM order_events
           WHERE order_id = $1 AND customer_user_id = $2
           ORDER BY created_at, id`,
          [orderId, context.userId]
        );
        const requests = await transaction.query(
          `SELECT request.*, order_row.order_number,
                  provider.display_name AS provider_display_name,
                  COALESCE(messages.total, 0) AS message_count,
                  COALESCE(files.total, 0) AS file_count
           FROM custom_requests request
           INNER JOIN provider_orders order_row ON order_row.id = request.order_id
           INNER JOIN providers provider ON provider.id = request.provider_id
           LEFT JOIN LATERAL (
             SELECT count(*)::integer AS total FROM custom_request_messages message
             WHERE message.request_id = request.id
           ) messages ON true
           LEFT JOIN LATERAL (
             SELECT count(*)::integer AS total FROM custom_request_files file
             WHERE file.request_id = request.id AND file.status <> 'DELETED'
           ) files ON true
           WHERE request.order_id = $1 AND request.customer_user_id = $2
           ORDER BY request.updated_at DESC`,
          [orderId, context.userId]
        );
        const shipments = await transaction.query(
          `SELECT id, status, carrier, tracking_code, tracking_url,
                  shipped_at, delivered_at, created_at, updated_at
           FROM order_shipments
           WHERE order_id = $1 AND customer_user_id = $2
           ORDER BY created_at DESC`,
          [orderId, context.userId]
        );
        const incidents = await transaction.query(
          `SELECT id, incident_type, status, description, resolution,
                  resolved_at, created_at, updated_at
           FROM order_incidents
           WHERE order_id = $1 AND customer_user_id = $2
           ORDER BY created_at DESC`,
          [orderId, context.userId]
        );

        return {
          order: mapOrder(order),
          items: items.rows.map((item) => ({
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
          events: events.rows.map((event) => ({
            id: event.id,
            actorRole: event.actor_role,
            type: event.event_type,
            message: event.message,
            metadata: event.metadata,
            createdAt: event.created_at
          })),
          customRequests: requests.rows.map(mapRequest),
          shipments: shipments.rows.map((shipment) => ({
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
          incidents: incidents.rows.map((incident) => ({
            id: incident.id,
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

    async getCustomRequest(rawContext, rawRequestId) {
      const context = requireCustomerContext(rawContext);
      const requestId = uuid(rawRequestId, "requestId");
      return database.withContext(context, async (transaction) => {
        const requestResult = await transaction.query(
          `SELECT request.*, order_row.order_number,
                  provider.display_name AS provider_display_name,
                  COALESCE(messages.total, 0) AS message_count,
                  COALESCE(files.total, 0) AS file_count
           FROM custom_requests request
           INNER JOIN provider_orders order_row ON order_row.id = request.order_id
           INNER JOIN providers provider ON provider.id = request.provider_id
           LEFT JOIN LATERAL (
             SELECT count(*)::integer AS total FROM custom_request_messages message
             WHERE message.request_id = request.id
           ) messages ON true
           LEFT JOIN LATERAL (
             SELECT count(*)::integer AS total FROM custom_request_files file
             WHERE file.request_id = request.id AND file.status <> 'DELETED'
           ) files ON true
           WHERE request.id = $1 AND request.customer_user_id = $2`,
          [requestId, context.userId]
        );
        const request = requestResult.rows[0];
        if (!request) {
          throw new ServiceError("CUSTOM_REQUEST_NOT_FOUND", "No se ha encontrado el encargo.", 404);
        }
        const messages = await transaction.query(
          `SELECT id, author_user_id, author_role, body, created_at
           FROM custom_request_messages
           WHERE request_id = $1 AND customer_user_id = $2
           ORDER BY created_at, id`,
          [requestId, context.userId]
        );
        const files = await transaction.query(
          `SELECT id, message_id, uploaded_by, mime_type, original_filename,
                  size_bytes, status, rejection_reason, ready_at, created_at
           FROM custom_request_files
           WHERE request_id = $1 AND customer_user_id = $2 AND status <> 'DELETED'
           ORDER BY created_at, id`,
          [requestId, context.userId]
        );
        return {
          request: mapRequest(request),
          messages: messages.rows.map((message) => ({
            id: message.id,
            authorUserId: message.author_user_id,
            authorRole: message.author_role,
            body: message.body,
            createdAt: message.created_at
          })),
          files: files.rows.map((file) => ({
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
      const context = requireCustomerContext(rawContext);
      const requestId = uuid(rawRequestId, "requestId");
      const body = text(input.body, 1, 8000, "body");
      return database.withContext(context, async (transaction) => {
        const requestResult = await transaction.query(
          `SELECT id, order_id, provider_id, customer_user_id
           FROM custom_requests
           WHERE id = $1 AND customer_user_id = $2`,
          [requestId, context.userId]
        );
        const request = requestResult.rows[0];
        if (!request) {
          throw new ServiceError("CUSTOM_REQUEST_NOT_FOUND", "No se ha encontrado el encargo.", 404);
        }
        const inserted = await transaction.query(
          `INSERT INTO custom_request_messages (
             request_id, order_id, provider_id, customer_user_id,
             author_user_id, author_role, body
           ) VALUES ($1, $2, $3, $4, $4, 'CUSTOMER', $5)
           RETURNING id, author_user_id, author_role, body, created_at`,
          [requestId, request.order_id, request.provider_id, context.userId, body]
        );
        const message = inserted.rows[0];
        await transaction.query(
          `INSERT INTO order_notifications (
             order_id, provider_id, customer_user_id, recipient_user_id,
             event_type, payload
           ) VALUES ($1, $2, $3, NULL, 'CUSTOMER_REQUEST_MESSAGE', $4::jsonb)`,
          [
            request.order_id,
            request.provider_id,
            context.userId,
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

    async approveQuote(rawContext, rawRequestId, input = {}) {
      const context = requireCustomerContext(rawContext);
      const requestId = uuid(rawRequestId, "requestId");
      const expectedVersion = version(input.expectedVersion);
      return database.withContext(context, async (transaction) => {
        const result = await transaction.query(
          `UPDATE custom_requests
           SET status = 'APPROVED'
           WHERE id = $1 AND customer_user_id = $2
             AND status = 'QUOTED' AND version = $3
           RETURNING id, order_id, provider_id, customer_user_id,
                     status, quoted_price_cents, currency, version, updated_at`,
          [requestId, context.userId, expectedVersion]
        );
        const row = result.rows[0];
        if (!row) {
          const current = await transaction.query(
            `SELECT status, version FROM custom_requests
             WHERE id = $1 AND customer_user_id = $2`,
            [requestId, context.userId]
          );
          if (current.rowCount !== 1) {
            throw new ServiceError("CUSTOM_REQUEST_NOT_FOUND", "No se ha encontrado el encargo.", 404);
          }
          if (current.rows[0].status !== "QUOTED") {
            throw new ServiceError(
              "CUSTOM_REQUEST_NOT_QUOTED",
              "El encargo no tiene un presupuesto pendiente de aprobación.",
              409
            );
          }
          throw new ServiceError(
            "CUSTOM_REQUEST_VERSION_CONFLICT",
            "El presupuesto ha cambiado. Actualiza la ficha antes de aprobarlo.",
            409,
            { currentVersion: current.rows[0].version }
          );
        }
        await transaction.query(
          `INSERT INTO order_events (
             order_id, provider_id, customer_user_id, actor_user_id,
             actor_role, event_type, metadata
           ) VALUES ($1, $2, $3, $3, 'CUSTOMER', 'CUSTOM_REQUEST_STATUS_APPROVED', $4::jsonb)`,
          [
            row.order_id,
            row.provider_id,
            context.userId,
            JSON.stringify({ requestId, quotedPriceCents: row.quoted_price_cents })
          ]
        );
        await transaction.query(
          `INSERT INTO order_notifications (
             order_id, provider_id, customer_user_id, recipient_user_id,
             event_type, payload
           ) VALUES ($1, $2, $3, NULL, 'CUSTOM_REQUEST_STATUS_APPROVED', $4::jsonb)`,
          [
            row.order_id,
            row.provider_id,
            context.userId,
            JSON.stringify({ requestId, quotedPriceCents: row.quoted_price_cents })
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
    },

    async cancelOrder(rawContext, rawOrderId, input = {}) {
      const context = requireCustomerContext(rawContext);
      const orderId = uuid(rawOrderId, "orderId");
      const expectedVersion = version(input.expectedVersion);
      return database.withContext(context, async (transaction) => {
        const result = await transaction.query(
          `UPDATE provider_orders
           SET status = 'CANCELLED'
           WHERE id = $1 AND customer_user_id = $2
             AND status = 'PENDING_CONFIRMATION' AND version = $3
           RETURNING *`,
          [orderId, context.userId, expectedVersion]
        );
        if (result.rowCount === 1) return mapOrder(result.rows[0]);
        const current = await transaction.query(
          `SELECT status, version FROM provider_orders
           WHERE id = $1 AND customer_user_id = $2`,
          [orderId, context.userId]
        );
        if (current.rowCount !== 1) {
          throw new ServiceError("ORDER_NOT_FOUND", "No se ha encontrado el pedido.", 404);
        }
        if (current.rows[0].status !== "PENDING_CONFIRMATION") {
          throw new ServiceError(
            "ORDER_CANNOT_BE_CANCELLED",
            "El pedido ya ha sido aceptado y no puede cancelarse desde esta pantalla.",
            409
          );
        }
        throw new ServiceError(
          "ORDER_VERSION_CONFLICT",
          "El pedido ha cambiado. Actualiza la ficha antes de cancelarlo.",
          409,
          { currentVersion: current.rows[0].version }
        );
      });
    }
  });
}

import { ServiceError } from "./providers-service.mjs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHIPMENT_STATUSES = new Set(["PENDING", "LABEL_CREATED", "IN_TRANSIT", "DELIVERED", "EXCEPTION", "RETURNED"]);
const SHIPMENT_CREATE_STATUSES = new Set(["PENDING", "LABEL_CREATED", "IN_TRANSIT"]);
const INCIDENT_TYPES = new Set(["DELAY", "DAMAGE", "WRONG_ITEM", "DELIVERY", "CUSTOMIZATION", "OTHER"]);
const INCIDENT_STATUSES = new Set(["INVESTIGATING", "RESOLVED", "CLOSED"]);

function uuid(value, field) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new ServiceError("VALIDATION_ERROR", `${field} no es válido.`, 422, { field });
  }
  return value.toLowerCase();
}

function actorContext(context) {
  if (!context || !UUID_PATTERN.test(context.userId ?? "")) {
    throw new ServiceError("UNAUTHORIZED", "La sesión no es válida.", 401);
  }
  if (context.role === "CUSTOMER") {
    return { role: "CUSTOMER", userId: context.userId.toLowerCase(), providerId: null };
  }
  if (["PROVIDER_OWNER", "PROVIDER_MEMBER"].includes(context.role) && UUID_PATTERN.test(context.providerId ?? "")) {
    return { role: context.role, userId: context.userId.toLowerCase(), providerId: context.providerId.toLowerCase() };
  }
  throw new ServiceError("UNAUTHORIZED", "La sesión no es válida.", 401);
}

function providerContext(context) {
  const actor = actorContext(context);
  if (actor.role === "CUSTOMER") {
    throw new ServiceError("FORBIDDEN", "Esta operación está reservada al taller.", 403);
  }
  return actor;
}

function requiredText(value, minimum, maximum, field) {
  const text = typeof value === "string" ? value.trim() : "";
  if (text.length < minimum || text.length > maximum) {
    throw new ServiceError("VALIDATION_ERROR", `${field} no es válido.`, 422, { field, minimum, maximum });
  }
  return text;
}

function optionalText(value, maximum, field) {
  if (value === undefined || value === null || value === "") return null;
  const text = String(value).trim();
  if (!text || text.length > maximum) {
    throw new ServiceError("VALIDATION_ERROR", `${field} no es válido.`, 422, { field, maximum });
  }
  return text;
}

function shipmentStatus(value, { creating = false } = {}) {
  const status = typeof value === "string" ? value.trim().toUpperCase() : "";
  const allowed = creating ? SHIPMENT_CREATE_STATUSES : SHIPMENT_STATUSES;
  if (!allowed.has(status)) {
    throw new ServiceError("VALIDATION_ERROR", "El estado del envío no es válido.", 422, { field: "status" });
  }
  return status;
}

function incidentType(value) {
  const type = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!INCIDENT_TYPES.has(type)) {
    throw new ServiceError("VALIDATION_ERROR", "El tipo de incidencia no es válido.", 422, { field: "type" });
  }
  return type;
}

function incidentStatus(value) {
  const status = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!INCIDENT_STATUSES.has(status)) {
    throw new ServiceError("VALIDATION_ERROR", "El estado de la incidencia no es válido.", 422, { field: "status" });
  }
  return status;
}

function httpsUrl(value) {
  const text = optionalText(value, 1000, "trackingUrl");
  if (!text) return null;
  let parsed;
  try { parsed = new URL(text); }
  catch { throw new ServiceError("VALIDATION_ERROR", "El enlace de seguimiento no es válido.", 422, { field: "trackingUrl" }); }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new ServiceError("VALIDATION_ERROR", "El seguimiento debe utilizar un enlace HTTPS sin credenciales.", 422, { field: "trackingUrl" });
  }
  return parsed.toString();
}

function timestamp(value, field) {
  const parsed = new Date(value ?? "");
  if (!value || Number.isNaN(parsed.getTime())) {
    throw new ServiceError("VALIDATION_ERROR", `${field} no es válido.`, 422, { field });
  }
  return parsed.toISOString();
}

function mapShipment(row) {
  return {
    id: row.id,
    orderId: row.order_id,
    status: row.status,
    carrier: row.carrier,
    trackingCode: row.tracking_code,
    trackingUrl: row.tracking_url,
    shippedAt: row.shipped_at,
    deliveredAt: row.delivered_at,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapIncident(row) {
  return {
    id: row.id,
    orderId: row.order_id,
    openedBy: row.opened_by,
    type: row.incident_type,
    status: row.status,
    description: row.description,
    resolution: row.resolution,
    resolvedAt: row.resolved_at,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function translateDatabaseError(error) {
  if (error instanceof ServiceError) return error;
  const message = String(error?.message ?? "");
  if (error?.code === "42501") {
    return new ServiceError("FORBIDDEN", "No tienes permiso para completar esta operación.", 403);
  }
  if (error?.code === "23514") {
    if (message.includes("ORDER_SHIPMENT_STATUS_TRANSITION_NOT_ALLOWED")) {
      return new ServiceError("SHIPMENT_STATUS_TRANSITION_NOT_ALLOWED", "Ese cambio de seguimiento no está permitido.", 409);
    }
    if (message.includes("ORDER_SHIPMENT_FINAL")) {
      return new ServiceError("SHIPMENT_FINAL", "El seguimiento ya está cerrado.", 409);
    }
    if (message.includes("ORDER_INCIDENT_STATUS_TRANSITION_NOT_ALLOWED")) {
      return new ServiceError("INCIDENT_STATUS_TRANSITION_NOT_ALLOWED", "Ese cambio de incidencia no está permitido.", 409);
    }
    if (message.includes("ORDER_INCIDENT_RESOLUTION_REQUIRED")) {
      return new ServiceError("INCIDENT_RESOLUTION_REQUIRED", "La resolución debe explicar la solución con al menos diez caracteres.", 422);
    }
    if (message.includes("ORDER_INCIDENT_ORDER_NOT_ACTIVE")) {
      return new ServiceError("ORDER_NOT_ACTIVE", "El pedido todavía no admite incidencias o está cancelado.", 409);
    }
    return new ServiceError("ORDER_LOGISTICS_VALIDATION_FAILED", "La operación no cumple las reglas del pedido.", 409);
  }
  if (error?.code === "23503") {
    return new ServiceError("ORDER_NOT_FOUND", "No se ha encontrado el pedido.", 404);
  }
  return error;
}

async function orderScope(transaction, context, orderId) {
  const predicate = context.role === "CUSTOMER"
    ? "customer_user_id = $2"
    : "provider_id = $2";
  const actorId = context.role === "CUSTOMER" ? context.userId : context.providerId;
  const result = await transaction.query(
    `SELECT id, provider_id, customer_user_id, status
     FROM provider_orders
     WHERE id = $1 AND ${predicate}`,
    [orderId, actorId]
  );
  if (result.rowCount !== 1) {
    throw new ServiceError("ORDER_NOT_FOUND", "No se ha encontrado el pedido.", 404);
  }
  return result.rows[0];
}

export function createOrderLogisticsService({ database } = {}) {
  if (!database || typeof database.withContext !== "function") {
    throw new TypeError("createOrderLogisticsService necesita una base de datos.");
  }

  return Object.freeze({
    async createShipment(rawContext, rawOrderId, input = {}) {
      const context = providerContext(rawContext);
      const orderId = uuid(rawOrderId, "orderId");
      const status = shipmentStatus(input.status ?? "PENDING", { creating: true });
      const carrier = optionalText(input.carrier, 120, "carrier");
      const trackingCode = optionalText(input.trackingCode, 180, "trackingCode");
      const trackingUrl = httpsUrl(input.trackingUrl);
      if (status !== "PENDING" && (!carrier || !trackingCode)) {
        throw new ServiceError("TRACKING_REQUIRED", "Indica transportista y código de seguimiento.", 422);
      }

      try {
        return await database.withContext(context, async (transaction) => {
          const order = await orderScope(transaction, context, orderId);
          if (!["ACCEPTED", "IN_PRODUCTION", "READY_TO_SHIP", "SHIPPED", "INCIDENT"].includes(order.status)) {
            throw new ServiceError("ORDER_NOT_READY_FOR_SHIPMENT", "El pedido todavía no admite seguimiento.", 409);
          }
          if (status === "IN_TRANSIT" && !["READY_TO_SHIP", "SHIPPED"].includes(order.status)) {
            throw new ServiceError("ORDER_NOT_READY_TO_SHIP", "Marca primero el pedido como listo para enviar.", 409);
          }

          const result = await transaction.query(
            `INSERT INTO order_shipments (
               order_id, provider_id, customer_user_id, status,
               carrier, tracking_code, tracking_url
             ) VALUES ($1,$2,$3,$4,$5,$6,$7)
             RETURNING *`,
            [order.id, order.provider_id, order.customer_user_id, status, carrier, trackingCode, trackingUrl]
          );
          if (status === "IN_TRANSIT" && order.status === "READY_TO_SHIP") {
            await transaction.query(
              "UPDATE provider_orders SET status = 'SHIPPED' WHERE id = $1 AND provider_id = $2",
              [order.id, order.provider_id]
            );
          }
          return mapShipment(result.rows[0]);
        });
      } catch (error) {
        throw translateDatabaseError(error);
      }
    },

    async updateShipment(rawContext, rawOrderId, rawShipmentId, input = {}) {
      const context = providerContext(rawContext);
      const orderId = uuid(rawOrderId, "orderId");
      const shipmentId = uuid(rawShipmentId, "shipmentId");
      const status = shipmentStatus(input.status);
      const carrier = optionalText(input.carrier, 120, "carrier");
      const trackingCode = optionalText(input.trackingCode, 180, "trackingCode");
      const trackingUrl = httpsUrl(input.trackingUrl);
      const expectedUpdatedAt = timestamp(input.expectedUpdatedAt, "expectedUpdatedAt");
      if (status !== "PENDING" && (!carrier || !trackingCode)) {
        throw new ServiceError("TRACKING_REQUIRED", "Indica transportista y código de seguimiento.", 422);
      }

      try {
        return await database.withContext(context, async (transaction) => {
          const order = await orderScope(transaction, context, orderId);
          if (status === "IN_TRANSIT" && !["READY_TO_SHIP", "SHIPPED"].includes(order.status)) {
            throw new ServiceError("ORDER_NOT_READY_TO_SHIP", "Marca primero el pedido como listo para enviar.", 409);
          }
          if (status === "DELIVERED" && order.status !== "SHIPPED") {
            throw new ServiceError("ORDER_NOT_SHIPPED", "El pedido debe constar como enviado antes de entregarlo.", 409);
          }

          const result = await transaction.query(
            `UPDATE order_shipments
             SET status = $4, carrier = $5, tracking_code = $6, tracking_url = $7
             WHERE id = $1 AND order_id = $2 AND provider_id = $3 AND updated_at = $8::timestamptz
             RETURNING *`,
            [shipmentId, order.id, order.provider_id, status, carrier, trackingCode, trackingUrl, expectedUpdatedAt]
          );
          if (result.rowCount !== 1) {
            const current = await transaction.query(
              "SELECT updated_at FROM order_shipments WHERE id=$1 AND order_id=$2 AND provider_id=$3",
              [shipmentId, order.id, order.provider_id]
            );
            if (current.rowCount !== 1) {
              throw new ServiceError("SHIPMENT_NOT_FOUND", "No se ha encontrado el seguimiento.", 404);
            }
            throw new ServiceError("SHIPMENT_VERSION_CONFLICT", "El seguimiento ha cambiado. Actualiza la ficha.", 409, {
              currentUpdatedAt: current.rows[0].updated_at
            });
          }

          if (status === "IN_TRANSIT" && order.status === "READY_TO_SHIP") {
            await transaction.query("UPDATE provider_orders SET status='SHIPPED' WHERE id=$1 AND provider_id=$2", [order.id, order.provider_id]);
          } else if (status === "DELIVERED" && order.status === "SHIPPED") {
            await transaction.query("UPDATE provider_orders SET status='DELIVERED' WHERE id=$1 AND provider_id=$2", [order.id, order.provider_id]);
          } else if (status === "EXCEPTION" && ["ACCEPTED", "IN_PRODUCTION", "READY_TO_SHIP", "SHIPPED"].includes(order.status)) {
            await transaction.query("UPDATE provider_orders SET status='INCIDENT' WHERE id=$1 AND provider_id=$2", [order.id, order.provider_id]);
          }
          return mapShipment(result.rows[0]);
        });
      } catch (error) {
        throw translateDatabaseError(error);
      }
    },

    async createIncident(rawContext, rawOrderId, input = {}) {
      const context = actorContext(rawContext);
      const orderId = uuid(rawOrderId, "orderId");
      const type = incidentType(input.type);
      const description = requiredText(input.description, 10, 8000, "description");

      try {
        return await database.withContext(context, async (transaction) => {
          const order = await orderScope(transaction, context, orderId);
          const result = await transaction.query(
            `INSERT INTO order_incidents (
               order_id, provider_id, customer_user_id, opened_by,
               incident_type, description
             ) VALUES ($1,$2,$3,$4,$5,$6)
             RETURNING *`,
            [order.id, order.provider_id, order.customer_user_id, context.userId, type, description]
          );
          return mapIncident(result.rows[0]);
        });
      } catch (error) {
        throw translateDatabaseError(error);
      }
    },

    async updateIncident(rawContext, rawOrderId, rawIncidentId, input = {}) {
      const context = providerContext(rawContext);
      const orderId = uuid(rawOrderId, "orderId");
      const incidentId = uuid(rawIncidentId, "incidentId");
      const status = incidentStatus(input.status);
      const resolution = status === "INVESTIGATING"
        ? ""
        : requiredText(input.resolution, 10, 8000, "resolution");
      const expectedUpdatedAt = timestamp(input.expectedUpdatedAt, "expectedUpdatedAt");

      try {
        return await database.withContext(context, async (transaction) => {
          const order = await orderScope(transaction, context, orderId);
          const result = await transaction.query(
            `UPDATE order_incidents
             SET status = $4, resolution = $5
             WHERE id = $1 AND order_id = $2 AND provider_id = $3 AND updated_at = $6::timestamptz
             RETURNING *`,
            [incidentId, order.id, order.provider_id, status, resolution, expectedUpdatedAt]
          );
          if (result.rowCount !== 1) {
            const current = await transaction.query(
              "SELECT updated_at FROM order_incidents WHERE id=$1 AND order_id=$2 AND provider_id=$3",
              [incidentId, order.id, order.provider_id]
            );
            if (current.rowCount !== 1) {
              throw new ServiceError("INCIDENT_NOT_FOUND", "No se ha encontrado la incidencia.", 404);
            }
            throw new ServiceError("INCIDENT_VERSION_CONFLICT", "La incidencia ha cambiado. Actualiza la ficha.", 409, {
              currentUpdatedAt: current.rows[0].updated_at
            });
          }
          return mapIncident(result.rows[0]);
        });
      } catch (error) {
        throw translateDatabaseError(error);
      }
    }
  });
}

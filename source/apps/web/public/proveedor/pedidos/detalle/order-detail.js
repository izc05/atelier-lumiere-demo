(() => {
  const {
    ORDER_LABELS, byId, element, money, date, statusBadge,
    requestJson, wireLogout, fact, keyValue, address, queryUuid, setMessage
  } = window.AtelierOrders;

  const TRANSITIONS = Object.freeze({
    PENDING_CONFIRMATION: ["ACCEPTED", "CANCELLED"],
    ACCEPTED: ["IN_PRODUCTION", "INCIDENT", "CANCELLED"],
    IN_PRODUCTION: ["READY_TO_SHIP", "INCIDENT", "CANCELLED"],
    READY_TO_SHIP: ["SHIPPED", "INCIDENT"],
    SHIPPED: ["DELIVERED", "INCIDENT"],
    INCIDENT: ["IN_PRODUCTION", "READY_TO_SHIP", "SHIPPED", "CANCELLED"],
    DELIVERED: [],
    CANCELLED: []
  });
  const SHIPMENT_TRANSITIONS = Object.freeze({
    PENDING: ["PENDING", "LABEL_CREATED", "IN_TRANSIT", "EXCEPTION", "RETURNED"],
    LABEL_CREATED: ["LABEL_CREATED", "IN_TRANSIT", "EXCEPTION", "RETURNED"],
    IN_TRANSIT: ["IN_TRANSIT", "DELIVERED", "EXCEPTION", "RETURNED"],
    EXCEPTION: ["EXCEPTION", "IN_TRANSIT", "RETURNED"],
    DELIVERED: [],
    RETURNED: []
  });
  const INCIDENT_TRANSITIONS = Object.freeze({
    OPEN: ["INVESTIGATING", "RESOLVED", "CLOSED"],
    INVESTIGATING: ["RESOLVED", "CLOSED"],
    RESOLVED: ["CLOSED"],
    CLOSED: []
  });
  const EVENT_LABELS = Object.freeze({
    ORDER_CREATED: "Pedido recibido",
    ORDER_STATUS_ACCEPTED: "Pedido aceptado",
    ORDER_STATUS_IN_PRODUCTION: "Elaboración iniciada",
    ORDER_STATUS_READY_TO_SHIP: "Pedido listo para enviar",
    ORDER_STATUS_SHIPPED: "Pedido enviado",
    ORDER_STATUS_DELIVERED: "Pedido entregado",
    ORDER_STATUS_INCIDENT: "Pedido con incidencia",
    ORDER_STATUS_CANCELLED: "Pedido cancelado",
    PROVIDER_NOTE: "Nota del taller",
    CUSTOM_REQUEST_MESSAGE: "Mensaje en un encargo",
    SHIPMENT_CREATED: "Seguimiento creado",
    SHIPMENT_UPDATED: "Seguimiento actualizado",
    SHIPMENT_STATUS_LABEL_CREATED: "Etiqueta de transporte creada",
    SHIPMENT_STATUS_IN_TRANSIT: "Envío en tránsito",
    SHIPMENT_STATUS_DELIVERED: "Envío entregado",
    SHIPMENT_STATUS_EXCEPTION: "Excepción en el envío",
    SHIPMENT_STATUS_RETURNED: "Envío devuelto",
    INCIDENT_OPENED: "Incidencia abierta",
    INCIDENT_STATUS_INVESTIGATING: "Incidencia en investigación",
    INCIDENT_STATUS_RESOLVED: "Incidencia resuelta",
    INCIDENT_STATUS_CLOSED: "Incidencia cerrada"
  });
  const SHIPMENT_LABELS = Object.freeze({
    PENDING: "Preparando datos",
    LABEL_CREATED: "Etiqueta creada",
    IN_TRANSIT: "En tránsito",
    DELIVERED: "Entregado",
    EXCEPTION: "Excepción",
    RETURNED: "Devuelto"
  });
  const INCIDENT_LABELS = Object.freeze({
    OPEN: "Abierta",
    INVESTIGATING: "En investigación",
    RESOLVED: "Resuelta",
    CLOSED: "Cerrada"
  });

  const orderId = queryUuid("id");
  let detail = null;

  function safeTrackingUrl(value) {
    if (!value) return null;
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
    } catch {
      return null;
    }
  }

  function itemNode(item) {
    const row = element("article", "item-row");
    const header = element("header");
    const title = element("div");
    title.append(element("h3", "", item.productName), element("small", "", item.itemType === "CUSTOM" ? "Diseño personalizado" : "Artículo del catálogo"));
    header.append(title, element("strong", "price", money(item.lineTotalCents, item.currency)));
    row.append(header, element("p", "", `${item.quantity} × ${money(item.unitPriceCents, item.currency)}${item.story ? ` · ${item.story}` : ""}`));
    const personalization = item.personalization && typeof item.personalization === "object" ? Object.entries(item.personalization) : [];
    if (personalization.length > 0) {
      const facts = element("div", "personalization");
      for (const [key, value] of personalization) facts.append(fact(`${key}: ${String(value)}`));
      row.append(facts);
    }
    return row;
  }

  function requestNode(request) {
    const row = element("article", "compact-row");
    const header = element("header");
    const title = element("div");
    title.append(element("h3", "", request.title), statusBadge(request.status, "request"));
    const link = element("a", "button secondary", "Abrir conversación");
    link.href = `/proveedor/encargos/detalle/?id=${encodeURIComponent(request.id)}`;
    header.append(title, link);
    row.append(header, element("p", "", `${request.messageCount} mensajes · ${request.fileCount} archivos · Actualizado ${date(request.updatedAt)}`));
    return row;
  }

  function eventNode(event) {
    const row = element("article", "timeline-item");
    row.append(
      element("strong", "", EVENT_LABELS[event.type] ?? event.type.replaceAll("_", " ")),
      element("small", "", `${date(event.createdAt, true)} · ${event.actorRole.replaceAll("_", " ")}`)
    );
    if (event.message) row.append(element("p", "", event.message));
    return row;
  }

  function shipmentNode(shipment) {
    const row = element("article", "compact-row logistics-row");
    const header = element("header");
    header.append(
      element("h3", "", shipment.carrier || "Seguimiento del envío"),
      element("strong", "", SHIPMENT_LABELS[shipment.status] ?? shipment.status)
    );
    row.append(header, element("p", "", shipment.trackingCode ? `Código: ${shipment.trackingCode}` : "Código pendiente"));
    const url = safeTrackingUrl(shipment.trackingUrl);
    if (url) {
      const actions = element("div", "logistics-actions");
      const link = element("a", "logistics-link", "Abrir seguimiento");
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      actions.append(link);
      row.append(actions);
    }
    return row;
  }

  async function updateIncident(incident, statusSelect, resolutionField, button, message) {
    const status = statusSelect.value;
    const resolution = resolutionField.value.trim();
    if (["RESOLVED", "CLOSED"].includes(status) && resolution.length < 10) {
      setMessage(message, "Explica la solución con al menos diez caracteres.", "error");
      return;
    }
    button.disabled = true;
    button.textContent = "Guardando…";
    setMessage(message, "");
    try {
      await requestJson(`/internal/provider/orders/${encodeURIComponent(orderId)}/incidents/${encodeURIComponent(incident.id)}`, {
        method: "PATCH",
        body: JSON.stringify({
          status,
          resolution,
          expectedUpdatedAt: incident.updatedAt
        })
      });
      await reloadDetail();
      setMessage(byId("incident-result"), "Incidencia actualizada.", "success");
    } catch (error) {
      setMessage(message, error.message, error.code?.includes("CONFLICT") ? "warning" : "error");
      button.disabled = false;
      button.textContent = "Actualizar";
    }
  }

  function incidentNode(incident) {
    const row = element("article", "compact-row logistics-row");
    const header = element("header");
    header.append(
      element("h3", "", incident.type.replaceAll("_", " ")),
      element("strong", "", INCIDENT_LABELS[incident.status] ?? incident.status)
    );
    row.append(header, element("p", "", incident.description));
    if (incident.resolution) row.append(element("p", "", `Resolución: ${incident.resolution}`));

    const options = INCIDENT_TRANSITIONS[incident.status] ?? [];
    if (options.length > 0) {
      const form = element("form", "incident-resolution");
      const statusLabel = element("label", "field", "Nuevo estado");
      const select = element("select");
      for (const status of options) {
        const option = element("option", "", INCIDENT_LABELS[status] ?? status);
        option.value = status;
        select.append(option);
      }
      statusLabel.append(select);
      const resolutionLabel = element("label", "field", "Resolución");
      const textarea = element("textarea");
      textarea.maxLength = 8000;
      textarea.placeholder = "Obligatoria al resolver o cerrar";
      resolutionLabel.append(textarea);
      const button = element("button", "button secondary", "Actualizar");
      button.type = "submit";
      const message = element("p", "message");
      message.setAttribute("role", "status");
      form.append(statusLabel, resolutionLabel, button, message);
      const syncRequired = () => {
        textarea.required = ["RESOLVED", "CLOSED"].includes(select.value);
      };
      select.addEventListener("change", syncRequired);
      syncRequired();
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        void updateIncident(incident, select, textarea, button, message);
      });
      row.append(form);
    }
    return row;
  }

  function updateTransitionForm() {
    const select = byId("next-status");
    const options = TRANSITIONS[detail.order.status] ?? [];
    select.replaceChildren();
    for (const status of options) {
      const option = element("option", "", ORDER_LABELS[status] ?? status);
      option.value = status;
      select.append(option);
    }
    const enabled = options.length > 0;
    select.disabled = !enabled;
    byId("provider-note").disabled = !enabled;
    byId("transition-button").disabled = !enabled;
    byId("transition-help").textContent = enabled
      ? "Selecciona el siguiente paso permitido. Los cambios quedan registrados."
      : "Este pedido ha llegado a un estado final y ya no admite cambios desde el taller.";
  }

  function updateShipmentForm() {
    const shipment = detail.shipments[0] ?? null;
    const select = byId("shipment-status");
    const allOptions = Array.from(select.options);
    const allowed = shipment
      ? (SHIPMENT_TRANSITIONS[shipment.status] ?? [])
      : ["PENDING", "LABEL_CREATED", "IN_TRANSIT"];
    for (const option of allOptions) option.hidden = !allowed.includes(option.value);
    if (shipment) {
      select.value = allowed.includes(shipment.status) ? shipment.status : allowed[0] ?? shipment.status;
      byId("shipment-carrier").value = shipment.carrier ?? "";
      byId("shipment-code").value = shipment.trackingCode ?? "";
      byId("shipment-url").value = shipment.trackingUrl ?? "";
    } else {
      select.value = "PENDING";
      byId("shipment-carrier").value = "";
      byId("shipment-code").value = "";
      byId("shipment-url").value = "";
    }
    const orderAllows = ["ACCEPTED", "IN_PRODUCTION", "READY_TO_SHIP", "SHIPPED", "INCIDENT"].includes(detail.order.status);
    const enabled = orderAllows && allowed.length > 0;
    for (const id of ["shipment-status", "shipment-carrier", "shipment-code", "shipment-url", "shipment-button"]) {
      byId(id).disabled = !enabled;
    }
    byId("shipment-button").textContent = shipment ? "Actualizar seguimiento" : "Crear seguimiento";
  }

  function updateIncidentForm() {
    const enabled = !["PENDING_CONFIRMATION", "CANCELLED"].includes(detail.order.status);
    byId("incident-type").disabled = !enabled;
    byId("incident-description").disabled = !enabled;
    byId("incident-button").disabled = !enabled;
  }

  function render() {
    const order = detail.order;
    byId("order-number").textContent = order.orderNumber;
    byId("order-status").replaceChildren(statusBadge(order.status));
    byId("order-summary").textContent = `${order.customer.name} · Recibido ${date(order.placedAt)} · Preparación prevista ${order.preparationMinDays ?? "?"}–${order.preparationMaxDays ?? "?"} días`;
    byId("order-total").textContent = money(order.totalCents, order.currency);
    byId("items-list").replaceChildren(...detail.items.map(itemNode));
    byId("requests-list").replaceChildren(...detail.customRequests.map(requestNode));
    byId("requests-empty").hidden = detail.customRequests.length !== 0;
    byId("events-list").replaceChildren(...detail.events.map(eventNode));
    byId("shipments-list").replaceChildren(...detail.shipments.map(shipmentNode));
    byId("shipments-empty").hidden = detail.shipments.length !== 0;
    byId("incidents-list").replaceChildren(...detail.incidents.map(incidentNode));
    byId("incidents-empty").hidden = detail.incidents.length !== 0;
    byId("customer-data").replaceChildren(
      keyValue("Nombre", order.customer.name),
      keyValue("Correo", order.customer.email),
      keyValue("Teléfono", order.customer.phone),
      keyValue("Dirección", address(order.customer.shippingAddress)),
      keyValue("Nota del cliente", order.customerNote || "Sin observaciones")
    );
    byId("money-data").replaceChildren(
      keyValue("Artículos", money(order.subtotalCents, order.currency)),
      keyValue("Envío", money(order.shippingCents, order.currency)),
      keyValue("Total", money(order.totalCents, order.currency)),
      keyValue("Versión", `v${order.version}`)
    );
    byId("provider-note").value = "";
    updateTransitionForm();
    updateShipmentForm();
    updateIncidentForm();
  }

  async function reloadDetail() {
    detail = await requestJson(`/internal/provider/orders/${encodeURIComponent(orderId)}`);
    render();
  }

  async function loadDetail() {
    if (!orderId) {
      byId("detail-loading").hidden = true;
      byId("detail-error-message").textContent = "El identificador del pedido no es válido.";
      byId("detail-error").hidden = false;
      return;
    }
    try {
      await reloadDetail();
      byId("detail-loading").hidden = true;
      byId("detail-content").hidden = false;
    } catch (error) {
      byId("detail-loading").hidden = true;
      byId("detail-error-message").textContent = error.message;
      byId("detail-error").hidden = false;
    }
  }

  byId("shipment-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const shipment = detail.shipments[0] ?? null;
    const status = byId("shipment-status").value;
    const carrier = byId("shipment-carrier").value.trim();
    const trackingCode = byId("shipment-code").value.trim();
    const trackingUrl = byId("shipment-url").value.trim();
    const result = byId("shipment-result");
    if (status !== "PENDING" && (!carrier || !trackingCode)) {
      setMessage(result, "Indica transportista y código de seguimiento.", "error");
      return;
    }
    if (trackingUrl && !safeTrackingUrl(trackingUrl)) {
      setMessage(result, "El enlace debe ser HTTPS y no puede incluir credenciales.", "error");
      return;
    }
    const button = byId("shipment-button");
    button.disabled = true;
    button.textContent = "Guardando…";
    setMessage(result, "");
    try {
      const path = shipment
        ? `/internal/provider/orders/${encodeURIComponent(orderId)}/shipments/${encodeURIComponent(shipment.id)}`
        : `/internal/provider/orders/${encodeURIComponent(orderId)}/shipments`;
      await requestJson(path, {
        method: shipment ? "PATCH" : "POST",
        body: JSON.stringify({
          status,
          carrier,
          trackingCode,
          trackingUrl,
          ...(shipment ? { expectedUpdatedAt: shipment.updatedAt } : {})
        })
      });
      await reloadDetail();
      setMessage(result, "Seguimiento actualizado y visible para el cliente.", "success");
    } catch (error) {
      setMessage(result, error.message, error.code?.includes("CONFLICT") ? "warning" : "error");
    } finally {
      updateShipmentForm();
    }
  });

  byId("incident-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = byId("incident-button");
    const result = byId("incident-result");
    const description = byId("incident-description").value.trim();
    if (description.length < 10) {
      setMessage(result, "Describe la incidencia con al menos diez caracteres.", "error");
      return;
    }
    button.disabled = true;
    button.textContent = "Registrando…";
    setMessage(result, "");
    try {
      await requestJson(`/internal/provider/orders/${encodeURIComponent(orderId)}/incidents`, {
        method: "POST",
        body: JSON.stringify({ type: byId("incident-type").value, description })
      });
      byId("incident-description").value = "";
      await reloadDetail();
      setMessage(result, "Incidencia registrada y añadida a la cronología.", "success");
    } catch (error) {
      setMessage(result, error.message, "error");
    } finally {
      updateIncidentForm();
      button.textContent = "Registrar incidencia";
    }
  });

  byId("transition-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = byId("transition-button");
    const message = byId("transition-message");
    button.disabled = true;
    button.textContent = "Guardando…";
    setMessage(message, "");
    try {
      const payload = await requestJson(`/internal/provider/orders/${encodeURIComponent(orderId)}/transitions`, {
        method: "POST",
        body: JSON.stringify({
          status: byId("next-status").value,
          expectedVersion: detail.order.version,
          note: byId("provider-note").value.trim()
        })
      });
      await reloadDetail();
      if (payload.order?.version !== detail.order.version) detail.order.version = payload.order.version;
      setMessage(message, "Avance guardado y añadido a la cronología.", "success");
    } catch (error) {
      setMessage(message, error.message, error.code?.includes("CONFLICT") ? "warning" : "error");
    } finally {
      button.textContent = "Guardar avance";
      button.disabled = (TRANSITIONS[detail?.order?.status] ?? []).length === 0;
    }
  });

  wireLogout();
  void loadDetail();
})();

(() => {
  const {
    ORDER_LABELS, byId, element, money, date, badge,
    requestJson, fact, keyValue, queryUuid, setMessage, wireLogout
  } = window.AtelierCustomerOrders;

  const orderId = queryUuid("id");
  let detail = null;
  const EVENT_LABELS = Object.freeze({
    ORDER_CREATED: "Pedido recibido",
    ORDER_STATUS_ACCEPTED: "Pedido aceptado",
    ORDER_STATUS_IN_PRODUCTION: "Elaboración iniciada",
    ORDER_STATUS_READY_TO_SHIP: "Listo para enviar",
    ORDER_STATUS_SHIPPED: "Pedido enviado",
    ORDER_STATUS_DELIVERED: "Pedido entregado",
    ORDER_STATUS_INCIDENT: "Pedido con incidencia",
    ORDER_STATUS_CANCELLED: "Pedido cancelado",
    PROVIDER_NOTE: "Nota del taller",
    CUSTOM_REQUEST_STATUS_APPROVED: "Presupuesto aprobado",
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
    header.append(element("h3", "", item.productName), element("strong", "price", money(item.lineTotalCents, item.currency)));
    row.append(header, element("p", "", `${item.quantity} × ${money(item.unitPriceCents, item.currency)}${item.story ? ` · ${item.story}` : ""}`));
    const entries = item.personalization && typeof item.personalization === "object" ? Object.entries(item.personalization) : [];
    if (entries.length) {
      const facts = element("div", "personalization");
      for (const [key, value] of entries) facts.append(fact(`${key}: ${String(value)}`));
      row.append(facts);
    }
    return row;
  }

  function requestNode(request) {
    const row = element("article", "compact-row");
    const header = element("header");
    const title = element("div");
    title.append(element("h3", "", request.title), badge(request.status, "request"));
    const link = element("a", "button primary", request.status === "QUOTED" ? "Revisar presupuesto" : "Abrir conversación");
    link.href = `/mis-pedidos/encargo/?id=${encodeURIComponent(request.id)}`;
    header.append(title, link);
    row.append(header, element("p", "", `${request.messageCount} mensajes · ${request.fileCount} archivos${request.quotedPriceCents === null ? "" : ` · ${money(request.quotedPriceCents, request.currency)}`}`));
    return row;
  }

  function eventNode(event) {
    const row = element("article", "timeline-item");
    row.append(
      element("strong", "", EVENT_LABELS[event.type] ?? event.type.replaceAll("_", " ")),
      element("small", "", `${date(event.createdAt, true)} · ${event.actorRole === "CUSTOMER" ? "Cliente" : event.actorRole === "SYSTEM" ? "Sistema" : "Taller"}`)
    );
    if (event.message) row.append(element("p", "", event.message));
    return row;
  }

  function shipmentNode(shipment) {
    const row = element("article", "compact-row logistics-row");
    const header = element("header");
    header.append(
      element("h3", "", shipment.carrier || "Seguimiento"),
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

  function incidentNode(incident) {
    const row = element("article", "compact-row logistics-row");
    const header = element("header");
    header.append(
      element("h3", "", incident.type.replaceAll("_", " ")),
      element("strong", "", INCIDENT_LABELS[incident.status] ?? incident.status)
    );
    row.append(header, element("p", "", incident.description));
    if (incident.resolution) row.append(element("p", "", `Resolución del taller: ${incident.resolution}`));
    return row;
  }

  function updateIncidentForm() {
    const enabled = !["PENDING_CONFIRMATION", "CANCELLED"].includes(detail.order.status);
    byId("incident-type").disabled = !enabled;
    byId("incident-description").disabled = !enabled;
    byId("incident-button").disabled = !enabled;
    if (!enabled) {
      setMessage(byId("incident-result"), "Este pedido todavía no admite incidencias o está cancelado.", "warning");
    }
  }

  function render() {
    const order = detail.order;
    byId("provider-name").textContent = order.provider.displayName;
    byId("order-number").textContent = order.orderNumber;
    byId("order-status").replaceChildren(badge(order.status));
    byId("order-summary").textContent = `${order.provider.specialty || "Taller artesanal"} · Pedido ${date(order.placedAt)} · Preparación prevista ${order.preparationMinDays ?? "?"}–${order.preparationMaxDays ?? "?"} días`;
    byId("order-total").textContent = money(order.totalCents, order.currency);
    byId("items-list").replaceChildren(...detail.items.map(itemNode));
    byId("requests-list").replaceChildren(...detail.customRequests.map(requestNode));
    byId("requests-empty").hidden = detail.customRequests.length !== 0;
    byId("events-list").replaceChildren(...detail.events.map(eventNode));
    byId("shipments-list").replaceChildren(...detail.shipments.map(shipmentNode));
    byId("shipments-empty").hidden = detail.shipments.length !== 0;
    byId("incidents-list").replaceChildren(...detail.incidents.map(incidentNode));
    byId("incidents-empty").hidden = detail.incidents.length !== 0;
    byId("order-data").replaceChildren(
      keyValue("Taller", order.provider.displayName),
      keyValue("Estado", ORDER_LABELS[order.status] ?? order.status),
      keyValue("Artículos", money(order.subtotalCents, order.currency)),
      keyValue("Envío", money(order.shippingCents, order.currency)),
      keyValue("Total", money(order.totalCents, order.currency)),
      keyValue("Nota del cliente", order.customerNote || "Sin observaciones"),
      keyValue("Nota del taller", order.providerNote || "Sin actualizaciones")
    );
    byId("cancel-card").hidden = order.status !== "PENDING_CONFIRMATION";
    updateIncidentForm();
  }

  async function reloadDetail() {
    detail = await requestJson(`/internal/customer/orders/${encodeURIComponent(orderId)}`);
    render();
  }

  async function load() {
    if (!orderId) {
      byId("detail-loading").hidden = true;
      byId("detail-error-message").textContent = "El identificador no es válido.";
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

  byId("incident-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const description = byId("incident-description").value.trim();
    const button = byId("incident-button");
    const result = byId("incident-result");
    if (description.length < 10) {
      setMessage(result, "Describe el problema con al menos diez caracteres.", "error");
      return;
    }
    button.disabled = true;
    button.textContent = "Enviando…";
    setMessage(result, "");
    try {
      await requestJson(`/internal/customer/orders/${encodeURIComponent(orderId)}/incidents`, {
        method: "POST",
        body: JSON.stringify({ type: byId("incident-type").value, description })
      });
      byId("incident-description").value = "";
      await reloadDetail();
      setMessage(result, "Incidencia comunicada al taller.", "success");
    } catch (error) {
      setMessage(result, error.message, "error");
    } finally {
      button.textContent = "Comunicar incidencia";
      updateIncidentForm();
    }
  });

  byId("cancel-button").addEventListener("click", async () => {
    const button = byId("cancel-button");
    const result = byId("cancel-result");
    button.disabled = true;
    button.textContent = "Cancelando…";
    setMessage(result, "");
    try {
      await requestJson(`/internal/customer/orders/${encodeURIComponent(orderId)}/cancel`, {
        method: "POST",
        body: JSON.stringify({ expectedVersion: detail.order.version })
      });
      await reloadDetail();
      setMessage(result, "El pedido se ha cancelado.", "success");
    } catch (error) {
      setMessage(result, error.message, error.code?.includes("CONFLICT") ? "warning" : "error");
    } finally {
      button.textContent = "Cancelar este pedido";
      button.disabled = detail?.order?.status !== "PENDING_CONFIRMATION";
    }
  });

  wireLogout();
  void load();
})();

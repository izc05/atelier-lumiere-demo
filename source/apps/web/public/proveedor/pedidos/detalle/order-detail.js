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
  const EVENT_LABELS = Object.freeze({
    ORDER_CREATED: "Pedido recibido",
    ORDER_STATUS_ACCEPTED: "Pedido aceptado",
    ORDER_STATUS_IN_PRODUCTION: "Elaboración iniciada",
    ORDER_STATUS_READY_TO_SHIP: "Pedido listo para enviar",
    ORDER_STATUS_SHIPPED: "Pedido enviado",
    ORDER_STATUS_DELIVERED: "Pedido entregado",
    ORDER_STATUS_INCIDENT: "Incidencia registrada",
    ORDER_STATUS_CANCELLED: "Pedido cancelado",
    PROVIDER_NOTE: "Nota del taller",
    CUSTOM_REQUEST_MESSAGE: "Mensaje en un encargo"
  });

  const orderId = queryUuid("id");
  let detail = null;

  function itemNode(item) {
    const row = element("article", "item-row");
    const header = element("header");
    const title = element("div");
    title.append(element("h3", "", item.productName), element("small", "", item.itemType === "CUSTOM" ? "Diseño personalizado" : "Artículo del catálogo"));
    header.append(title, element("strong", "price", money(item.lineTotalCents, item.currency)));
    const description = element("p", "", `${item.quantity} × ${money(item.unitPriceCents, item.currency)}${item.story ? ` · ${item.story}` : ""}`);
    row.append(header, description);

    const personalization = item.personalization && typeof item.personalization === "object"
      ? Object.entries(item.personalization)
      : [];
    if (personalization.length > 0) {
      const facts = element("div", "personalization");
      for (const [key, value] of personalization) {
        facts.append(fact(`${key}: ${String(value)}`));
      }
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
    row.append(
      header,
      element("p", "", `${request.messageCount} mensajes · ${request.fileCount} archivos · Actualizado ${date(request.updatedAt)}`)
    );
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
    const row = element("article", "compact-row");
    const header = element("header");
    header.append(
      element("h3", "", shipment.carrier || "Seguimiento del envío"),
      element("strong", "", shipment.status.replaceAll("_", " "))
    );
    row.append(header, element("p", "", shipment.trackingCode ? `Código: ${shipment.trackingCode}` : "Código pendiente"));
    return row;
  }

  function incidentNode(incident) {
    const row = element("article", "compact-row");
    const header = element("header");
    header.append(element("h3", "", incident.type.replaceAll("_", " ")), element("strong", "", incident.status));
    row.append(header, element("p", "", incident.description));
    if (incident.resolution) row.append(element("p", "", `Resolución: ${incident.resolution}`));
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
    byId("incidents-list").replaceChildren(...detail.incidents.map(incidentNode));
    byId("logistics-empty").hidden = detail.shipments.length + detail.incidents.length !== 0;

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
  }

  async function loadDetail() {
    if (!orderId) {
      byId("detail-loading").hidden = true;
      byId("detail-error-message").textContent = "El identificador del pedido no es válido.";
      byId("detail-error").hidden = false;
      return;
    }
    try {
      detail = await requestJson(`/internal/provider/orders/${encodeURIComponent(orderId)}`);
      render();
      byId("detail-loading").hidden = true;
      byId("detail-content").hidden = false;
    } catch (error) {
      byId("detail-loading").hidden = true;
      byId("detail-error-message").textContent = error.message;
      byId("detail-error").hidden = false;
    }
  }

  byId("transition-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = byId("transition-button");
    const message = byId("transition-message");
    button.disabled = true;
    button.textContent = "Guardando…";
    setMessage(message, "");
    try {
      const payload = await requestJson(
        `/internal/provider/orders/${encodeURIComponent(orderId)}/transitions`,
        {
          method: "POST",
          body: JSON.stringify({
            status: byId("next-status").value,
            expectedVersion: detail.order.version,
            note: byId("provider-note").value.trim()
          })
        }
      );
      detail = await requestJson(`/internal/provider/orders/${encodeURIComponent(orderId)}`);
      if (payload.order?.version !== detail.order.version) detail.order.version = payload.order.version;
      render();
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

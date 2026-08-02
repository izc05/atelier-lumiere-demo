(() => {
  const {
    byId, element, money, date, statusBadge,
    requestJson, wireLogout, fact
  } = window.AtelierOrders;

  let orders = [];

  function orderCard(order) {
    const card = element("article", "order-card");
    const top = element("div", "card-top");
    top.append(element("span", "order-number", order.orderNumber), statusBadge(order.status));

    const title = element("h2", "", order.customer?.name || "Cliente");
    const description = element(
      "p",
      "",
      order.customerNote || "El cliente no ha añadido observaciones al pedido."
    );
    const facts = element("div", "facts");
    facts.append(
      fact(`${order.itemCount} artículo${order.itemCount === 1 ? "" : "s"}`),
      fact(`${order.openCustomRequests} encargo${order.openCustomRequests === 1 ? "" : "s"} activo${order.openCustomRequests === 1 ? "" : "s"}`),
      fact(`${order.preparationMinDays ?? "?"}–${order.preparationMaxDays ?? "?"} días`),
      fact(`Recibido ${date(order.placedAt)}`)
    );
    if (order.openIncidents > 0) facts.append(fact(`${order.openIncidents} incidencia${order.openIncidents === 1 ? "" : "s"}`));

    const actions = element("div", "card-actions");
    actions.append(element("strong", "price", money(order.totalCents, order.currency)));
    const link = element("a", "button primary", order.status === "PENDING_CONFIRMATION" ? "Revisar pedido" : "Abrir ficha");
    link.href = `/proveedor/pedidos/detalle/?id=${encodeURIComponent(order.id)}`;
    actions.append(link);

    card.append(top, title, description, facts, actions);
    return card;
  }

  function updateMetrics() {
    byId("metric-total").textContent = String(orders.length);
    byId("metric-pending").textContent = String(
      orders.filter((order) => order.status === "PENDING_CONFIRMATION").length
    );
    byId("metric-active").textContent = String(
      orders.filter((order) => ["ACCEPTED", "IN_PRODUCTION", "READY_TO_SHIP", "SHIPPED"].includes(order.status)).length
    );
    byId("metric-attention").textContent = String(
      orders.filter((order) => order.status === "INCIDENT" || order.openCustomRequests > 0 || order.openIncidents > 0).length
    );
  }

  function render() {
    const query = byId("search-input").value.trim().toLocaleLowerCase("es");
    const status = byId("status-filter").value;
    const visible = orders.filter((order) => {
      const haystack = [
        order.orderNumber,
        order.customer?.name,
        order.customer?.email,
        order.customerNote
      ].filter(Boolean).join(" ").toLocaleLowerCase("es");
      return (status === "ALL" || order.status === status) && (!query || haystack.includes(query));
    });

    const list = byId("orders-list");
    list.replaceChildren(...visible.map(orderCard));
    byId("orders-empty").hidden = orders.length !== 0;
    byId("orders-no-results").hidden = orders.length === 0 || visible.length !== 0;
    list.hidden = visible.length === 0;
  }

  async function loadOrders() {
    byId("orders-loading").hidden = false;
    byId("orders-error").hidden = true;
    byId("orders-list").hidden = true;
    try {
      const payload = await requestJson("/internal/provider/orders");
      orders = Array.isArray(payload.orders) ? payload.orders : [];
      updateMetrics();
      render();
    } catch (error) {
      byId("orders-error-message").textContent = error.message;
      byId("orders-error").hidden = false;
    } finally {
      byId("orders-loading").hidden = true;
    }
  }

  byId("search-input").addEventListener("input", render);
  byId("status-filter").addEventListener("change", render);
  byId("retry-button").addEventListener("click", () => void loadOrders());
  wireLogout();
  void loadOrders();
})();

(() => {
  const { byId, element, money, date, badge, requestJson, fact, wireLogout } = window.AtelierCustomerOrders;
  const ACTIVE_STATUSES = new Set(["PENDING_CONFIRMATION", "ACCEPTED", "IN_PRODUCTION", "READY_TO_SHIP", "SHIPPED", "INCIDENT"]);
  const COMPLETED_STATUSES = new Set(["DELIVERED", "CANCELLED"]);
  const FLOW = ["PENDING_CONFIRMATION", "ACCEPTED", "IN_PRODUCTION", "READY_TO_SHIP", "SHIPPED", "DELIVERED"];
  let orders = [];
  let activeFilter = "all";
  let searchTimer = null;

  function attention(order) {
    return order.status === "INCIDENT" || order.openCustomRequests > 0 || order.openIncidents > 0;
  }

  function progressValue(order) {
    if (order.status === "CANCELLED") return 0;
    if (order.status === "INCIDENT") return Math.max(1, FLOW.indexOf("IN_PRODUCTION") + 1);
    const index = FLOW.indexOf(order.status);
    return index < 0 ? 1 : index + 1;
  }

  function nextAction(order) {
    if (order.openIncidents > 0) return "Hay una incidencia abierta. Consulta la respuesta del taller.";
    if (order.openCustomRequests > 0) return "Revisa el encargo: puede haber mensajes o un presupuesto pendiente.";
    const messages = {
      PENDING_CONFIRMATION: "El taller debe confirmar que puede preparar el pedido.",
      ACCEPTED: "Pedido aceptado. La siguiente actualización será el inicio de elaboración.",
      IN_PRODUCTION: "El taller está elaborando tus piezas.",
      READY_TO_SHIP: "El pedido está terminado y pendiente de recogida o envío.",
      SHIPPED: "Consulta el seguimiento desde el detalle del pedido.",
      DELIVERED: "Pedido entregado. Conserva el resumen para tus registros.",
      INCIDENT: "Abre el pedido para consultar la incidencia.",
      CANCELLED: "Este pedido fue cancelado y no continuará su preparación."
    };
    return messages[order.status] ?? "Abre el pedido para consultar la información disponible.";
  }

  function card(order) {
    const node = element("article", `order-card${attention(order) ? " needs-attention" : ""}`);
    const top = element("div", "card-top");
    top.append(element("span", "order-number", order.orderNumber), badge(order.status));

    const provider = element("div", "order-provider");
    provider.append(element("h2", "", order.provider?.displayName || "Taller artesanal"));
    if (order.provider?.specialty) provider.append(element("p", "provider-specialty", order.provider.specialty));

    const description = element("p", "order-description", order.providerNote || order.customerNote || "El taller actualizará aquí el avance de tu pedido.");
    const facts = element("div", "facts");
    facts.append(
      fact(`${order.itemCount} artículo${order.itemCount === 1 ? "" : "s"}`),
      fact(`${order.preparationMinDays ?? "?"}–${order.preparationMaxDays ?? "?"} días`),
      fact(`Pedido ${date(order.placedAt)}`)
    );
    if (order.openCustomRequests > 0) facts.append(fact(`${order.openCustomRequests} encargo${order.openCustomRequests === 1 ? "" : "s"} activo${order.openCustomRequests === 1 ? "" : "s"}`));
    if (order.openIncidents > 0) facts.append(fact(`${order.openIncidents} incidencia${order.openIncidents === 1 ? "" : "s"}`));

    const progressBlock = element("div", "order-progress");
    const progressHead = element("div", "order-progress-head");
    progressHead.append(element("span", "", "Avance del pedido"), element("strong", "", `${progressValue(order)} de ${FLOW.length}`));
    const progress = document.createElement("progress");
    progress.max = FLOW.length;
    progress.value = progressValue(order);
    progress.setAttribute("aria-label", `Avance de ${order.orderNumber}`);
    progressBlock.append(progressHead, progress, element("p", "next-action", nextAction(order)));

    const actions = element("div", "card-actions");
    actions.append(element("strong", "price", money(order.totalCents, order.currency)));
    const link = element("a", "button primary", attention(order) ? "Revisar ahora" : "Ver pedido");
    link.href = `/mis-pedidos/detalle/?id=${encodeURIComponent(order.id)}`;
    actions.append(link);
    node.append(top, provider, description, facts, progressBlock, actions);
    return node;
  }

  function metrics() {
    byId("metric-total").textContent = String(orders.length);
    byId("metric-active").textContent = String(orders.filter((order) => ACTIVE_STATUSES.has(order.status) && order.status !== "SHIPPED").length);
    byId("metric-shipped").textContent = String(orders.filter((order) => order.status === "SHIPPED").length);
    byId("metric-attention").textContent = String(orders.filter(attention).length);
  }

  function matchesFilter(order) {
    if (activeFilter === "active") return ACTIVE_STATUSES.has(order.status);
    if (activeFilter === "attention") return attention(order);
    if (activeFilter === "completed") return COMPLETED_STATUSES.has(order.status);
    return true;
  }

  function visibleOrders() {
    const query = byId("orders-search").value.trim().toLocaleLowerCase("es");
    return orders.filter((order) => {
      if (!matchesFilter(order)) return false;
      if (!query) return true;
      return [
        order.orderNumber,
        order.provider?.displayName,
        order.provider?.specialty,
        order.providerNote,
        order.customerNote
      ].filter(Boolean).some((value) => String(value).toLocaleLowerCase("es").includes(query));
    });
  }

  function render() {
    const visible = visibleOrders();
    const list = byId("orders-list");
    list.replaceChildren(...visible.map(card));
    list.hidden = visible.length === 0;
    byId("orders-result-count").textContent = `${visible.length} de ${orders.length} pedido${orders.length === 1 ? "" : "s"}`;

    const empty = byId("orders-empty");
    empty.hidden = visible.length !== 0;
    if (visible.length === 0) {
      const hasFilters = activeFilter !== "all" || byId("orders-search").value.trim().length > 0;
      byId("orders-empty-title").textContent = hasFilters ? "No hay coincidencias" : "No hay pedidos vinculados";
      byId("orders-empty-message").textContent = hasFilters ? "Prueba otro texto o muestra todos los estados." : "Este acceso no tiene compras disponibles.";
      byId("clear-filters-button").hidden = !hasFilters;
    }
  }

  function selectFilter(value) {
    activeFilter = value;
    for (const button of document.querySelectorAll("[data-filter]")) {
      const selected = button.dataset.filter === value;
      button.classList.toggle("active", selected);
      button.setAttribute("aria-pressed", String(selected));
    }
    render();
  }

  async function load() {
    byId("orders-loading").hidden = false;
    byId("orders-error").hidden = true;
    byId("orders-empty").hidden = true;
    try {
      const [session, payload] = await Promise.all([
        requestJson("/internal/customer/session"),
        requestJson("/internal/customer/orders")
      ]);
      orders = Array.isArray(payload.orders) ? payload.orders : [];
      byId("welcome-text").textContent = `Hola, ${session.user?.displayName || "cliente"}. Aquí tienes todas tus compras, separadas por taller y ordenadas de la más reciente a la más antigua.`;
      metrics();
      render();
    } catch (error) {
      byId("orders-error-message").textContent = error.message;
      byId("orders-error").hidden = false;
    } finally {
      byId("orders-loading").hidden = true;
    }
  }

  byId("orders-search").addEventListener("input", () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(render, 180);
  });
  for (const button of document.querySelectorAll("[data-filter]")) {
    button.addEventListener("click", () => selectFilter(button.dataset.filter));
  }
  byId("clear-filters-button").addEventListener("click", () => {
    byId("orders-search").value = "";
    selectFilter("all");
  });
  byId("retry-button").addEventListener("click", () => void load());
  wireLogout();
  void load();
})();

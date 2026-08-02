(() => {
  const {
    byId, element, money, date, statusBadge,
    requestJson, wireLogout, fact
  } = window.AtelierOrders;

  let requests = [];

  function requestCard(request) {
    const card = element("article", "request-card");
    const top = element("div", "card-top");
    top.append(element("span", "order-number", request.orderNumber), statusBadge(request.status, "request"));
    const title = element("h2", "", request.title);
    const description = element("p", "", request.brief);
    const facts = element("div", "facts");
    facts.append(
      fact(request.customerName || "Cliente"),
      fact(`${request.messageCount} mensaje${request.messageCount === 1 ? "" : "s"}`),
      fact(`${request.fileCount} archivo${request.fileCount === 1 ? "" : "s"}`),
      fact(`Actualizado ${date(request.updatedAt)}`)
    );
    if (request.desiredDate) facts.append(fact(`Deseado ${date(request.desiredDate)}`));

    const actions = element("div", "card-actions");
    actions.append(
      element(
        "strong",
        "price",
        request.quotedPriceCents === null
          ? "Sin presupuesto"
          : money(request.quotedPriceCents, request.currency)
      )
    );
    const link = element("a", "button primary", request.status === "OPEN" ? "Atender" : "Abrir conversación");
    link.href = `/proveedor/encargos/detalle/?id=${encodeURIComponent(request.id)}`;
    actions.append(link);
    card.append(top, title, description, facts, actions);
    return card;
  }

  function updateMetrics() {
    byId("metric-total").textContent = String(requests.length);
    byId("metric-open").textContent = String(
      requests.filter((request) => ["OPEN", "NEEDS_INFO"].includes(request.status)).length
    );
    byId("metric-quoted").textContent = String(
      requests.filter((request) => request.status === "QUOTED").length
    );
    byId("metric-active").textContent = String(
      requests.filter((request) => ["APPROVED", "IN_PROGRESS"].includes(request.status)).length
    );
  }

  function render() {
    const query = byId("search-input").value.trim().toLocaleLowerCase("es");
    const status = byId("status-filter").value;
    const visible = requests.filter((request) => {
      const haystack = [request.orderNumber, request.customerName, request.title, request.brief]
        .filter(Boolean).join(" ").toLocaleLowerCase("es");
      return (status === "ALL" || request.status === status) && (!query || haystack.includes(query));
    });
    const list = byId("requests-list");
    list.replaceChildren(...visible.map(requestCard));
    byId("requests-empty").hidden = requests.length !== 0;
    byId("requests-no-results").hidden = requests.length === 0 || visible.length !== 0;
    list.hidden = visible.length === 0;
  }

  async function loadRequests() {
    byId("requests-loading").hidden = false;
    byId("requests-error").hidden = true;
    try {
      const payload = await requestJson("/internal/provider/custom-requests");
      requests = Array.isArray(payload.requests) ? payload.requests : [];
      updateMetrics();
      render();
    } catch (error) {
      byId("requests-error-message").textContent = error.message;
      byId("requests-error").hidden = false;
    } finally {
      byId("requests-loading").hidden = true;
    }
  }

  byId("search-input").addEventListener("input", render);
  byId("status-filter").addEventListener("change", render);
  byId("retry-button").addEventListener("click", () => void loadRequests());
  wireLogout();
  void loadRequests();
})();

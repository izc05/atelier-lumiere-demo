(() => {
  const {
    REQUEST_LABELS, byId, element, money, date, statusBadge,
    requestJson, wireLogout, fact, keyValue, queryUuid, setMessage
  } = window.AtelierOrders;

  const TRANSITIONS = Object.freeze({
    OPEN: ["NEEDS_INFO", "QUOTED", "CANCELLED"],
    NEEDS_INFO: ["OPEN", "QUOTED", "CANCELLED"],
    QUOTED: ["NEEDS_INFO", "CANCELLED"],
    APPROVED: ["IN_PROGRESS", "CANCELLED"],
    IN_PROGRESS: ["COMPLETED", "CANCELLED"],
    COMPLETED: [],
    CANCELLED: []
  });

  const requestId = queryUuid("id");
  let detail = null;

  function messageNode(message) {
    const providerMessage = message.authorRole !== "CUSTOMER";
    const node = element("article", `bubble${providerMessage ? " provider" : ""}`);
    node.append(
      element("p", "", message.body),
      element("small", "", `${providerMessage ? "Taller" : "Cliente"} · ${date(message.createdAt, true)}`)
    );
    return node;
  }

  function fileNode(file) {
    const row = element("article", "compact-row");
    const header = element("header");
    header.append(
      element("h3", "", file.originalFilename),
      element("strong", "", file.status)
    );
    row.append(
      header,
      element("p", "", `${file.mimeType} · ${new Intl.NumberFormat("es-ES").format(file.sizeBytes)} bytes · ${date(file.createdAt)}`)
    );
    if (file.rejectionReason) row.append(element("p", "", `Motivo: ${file.rejectionReason}`));
    return row;
  }

  function updateTransitionForm() {
    const request = detail.request;
    const options = TRANSITIONS[request.status] ?? [];
    const select = byId("next-status");
    select.replaceChildren();
    for (const status of options) {
      const option = element("option", "", REQUEST_LABELS[status] ?? status);
      option.value = status;
      select.append(option);
    }
    const enabled = options.length > 0;
    select.disabled = !enabled;
    byId("transition-note").disabled = !enabled;
    byId("transition-button").disabled = !enabled;
    byId("transition-help").textContent = request.status === "QUOTED"
      ? "El presupuesto está esperando la decisión del cliente. El taller no puede aprobar su propia oferta."
      : enabled
        ? "Elige el siguiente paso. El cambio se añadirá a la cronología del pedido."
        : "El encargo está cerrado y ya no admite cambios.";
    updateQuoteField();
  }

  function updateQuoteField() {
    const quoted = byId("next-status").value === "QUOTED";
    byId("quote-field").hidden = !quoted;
    byId("quote-amount").required = quoted;
  }

  function render() {
    const request = detail.request;
    byId("request-title").textContent = request.title;
    byId("request-status").replaceChildren(statusBadge(request.status, "request"));
    byId("request-summary").textContent = `${request.orderNumber} · ${request.customerName} · Actualizado ${date(request.updatedAt)}`;
    byId("request-quote").textContent = request.quotedPriceCents === null
      ? "Presupuesto pendiente"
      : money(request.quotedPriceCents, request.currency);
    byId("request-brief").textContent = request.brief;
    const facts = [
      fact(`Creado ${date(request.createdAt)}`),
      fact(`Versión v${request.version}`),
      fact(`${request.messageCount} mensajes`),
      fact(`${request.fileCount} archivos`)
    ];
    if (request.desiredDate) facts.push(fact(`Fecha deseada ${date(request.desiredDate)}`));
    byId("request-facts").replaceChildren(...facts);

    byId("messages-list").replaceChildren(...detail.messages.map(messageNode));
    byId("messages-empty").hidden = detail.messages.length !== 0;
    byId("files-list").replaceChildren(...detail.files.map(fileNode));
    byId("files-empty").hidden = detail.files.length !== 0;
    byId("request-data").replaceChildren(
      keyValue("Pedido", request.orderNumber),
      keyValue("Cliente", request.customerName),
      keyValue("Estado", REQUEST_LABELS[request.status] ?? request.status),
      keyValue("Fecha deseada", request.desiredDate ? date(request.desiredDate) : "No indicada"),
      keyValue("Presupuesto", request.quotedPriceCents === null ? "Pendiente" : money(request.quotedPriceCents, request.currency))
    );
    byId("order-link").href = `/proveedor/pedidos/detalle/?id=${encodeURIComponent(request.orderId)}`;

    const quote = byId("current-quote");
    if (request.quotedPriceCents === null) {
      quote.hidden = true;
      quote.replaceChildren();
    } else {
      quote.hidden = false;
      quote.replaceChildren(
        element("span", "", "Presupuesto vigente"),
        element("strong", "", money(request.quotedPriceCents, request.currency)),
        element("small", "", request.status === "QUOTED" ? "Pendiente de aprobación del cliente" : REQUEST_LABELS[request.status])
      );
    }
    byId("message-body").value = "";
    byId("transition-note").value = "";
    byId("quote-amount").value = request.quotedPriceCents === null
      ? ""
      : (request.quotedPriceCents / 100).toFixed(2);
    updateTransitionForm();
  }

  async function loadDetail() {
    if (!requestId) {
      byId("detail-loading").hidden = true;
      byId("detail-error-message").textContent = "El identificador del encargo no es válido.";
      byId("detail-error").hidden = false;
      return;
    }
    try {
      detail = await requestJson(`/internal/provider/custom-requests/${encodeURIComponent(requestId)}`);
      render();
      byId("detail-loading").hidden = true;
      byId("detail-content").hidden = false;
    } catch (error) {
      byId("detail-loading").hidden = true;
      byId("detail-error-message").textContent = error.message;
      byId("detail-error").hidden = false;
    }
  }

  byId("next-status").addEventListener("change", updateQuoteField);

  byId("message-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = byId("message-button");
    const result = byId("message-result");
    button.disabled = true;
    button.textContent = "Enviando…";
    setMessage(result, "");
    try {
      await requestJson(`/internal/provider/custom-requests/${encodeURIComponent(requestId)}/messages`, {
        method: "POST",
        body: JSON.stringify({ body: byId("message-body").value.trim() })
      });
      detail = await requestJson(`/internal/provider/custom-requests/${encodeURIComponent(requestId)}`);
      render();
      setMessage(result, "Mensaje enviado al cliente.", "success");
    } catch (error) {
      setMessage(result, error.message, "error");
    } finally {
      button.disabled = false;
      button.textContent = "Enviar mensaje";
    }
  });

  byId("transition-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const status = byId("next-status").value;
    const amount = Number(byId("quote-amount").value);
    const result = byId("transition-result");
    if (status === "QUOTED" && (!Number.isFinite(amount) || amount < 0)) {
      setMessage(result, "Introduce un presupuesto válido.", "error");
      return;
    }
    const button = byId("transition-button");
    button.disabled = true;
    button.textContent = "Guardando…";
    setMessage(result, "");
    try {
      await requestJson(`/internal/provider/custom-requests/${encodeURIComponent(requestId)}/transitions`, {
        method: "POST",
        body: JSON.stringify({
          status,
          expectedVersion: detail.request.version,
          note: byId("transition-note").value.trim(),
          ...(status === "QUOTED" ? { quotedPriceCents: Math.round(amount * 100) } : {})
        })
      });
      detail = await requestJson(`/internal/provider/custom-requests/${encodeURIComponent(requestId)}`);
      render();
      setMessage(result, "Encargo actualizado correctamente.", "success");
    } catch (error) {
      setMessage(result, error.message, error.code?.includes("CONFLICT") ? "warning" : "error");
    } finally {
      button.textContent = "Guardar cambio";
      button.disabled = (TRANSITIONS[detail?.request?.status] ?? []).length === 0;
    }
  });

  wireLogout();
  void loadDetail();
})();

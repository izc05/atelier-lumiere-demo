(() => {
  const cart = window.AtelierCart;
  const byId = (id) => document.getElementById(id);
  let idempotencyKey = crypto.randomUUID();

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function money(cents, currency = "EUR") {
    return new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(Number(cents) / 100);
  }

  function setMessage(node, text, type = "") {
    node.textContent = text;
    node.className = `message${type ? ` ${type}` : ""}`;
  }

  function lineDescription(line) {
    const parts = line.personalizationLabels.map((item) => `${item.name}: ${item.value}`);
    if (line.customRequest) parts.push(`Diseño propio: ${line.customRequest.title}`);
    return parts.length ? parts.join(" · ") : "Sin personalización adicional";
  }

  function lineNode(line) {
    const row = element("article", "cart-line");
    const copy = element("div");
    copy.append(
      element("h3", "", line.productName),
      element("p", "", lineDescription(line)),
      element("p", "", `Precio estimado por unidad: ${money(cart.estimatedUnitPrice(line), line.currency)}`)
    );
    const actions = element("div", "cart-line-actions");
    actions.append(element("strong", "", money(cart.estimatedUnitPrice(line) * line.quantity, line.currency)));
    const quantity = element("input");
    quantity.type = "number";
    quantity.min = "1";
    quantity.max = String(cart.MAX_QUANTITY);
    quantity.value = String(line.quantity);
    quantity.setAttribute("aria-label", `Cantidad de ${line.productName}`);
    quantity.addEventListener("change", () => {
      try {
        cart.updateQuantity(line.lineId, Number(quantity.value));
        idempotencyKey = crypto.randomUUID();
        render();
      } catch (error) {
        window.alert(error.message);
        quantity.value = String(line.quantity);
      }
    });
    const remove = element("button", "button ghost", "Retirar");
    remove.type = "button";
    remove.addEventListener("click", () => {
      cart.remove(line.lineId);
      idempotencyKey = crypto.randomUUID();
      render();
    });
    actions.append(quantity, remove);
    row.append(copy, actions);
    return row;
  }

  function groupNode(providerName, lines) {
    const group = element("section", "cart-group");
    const header = element("header");
    header.append(
      element("h2", "", providerName),
      element("small", "", `${lines.length} ${lines.length === 1 ? "línea" : "líneas"} · pedido único`)
    );
    group.append(header, ...lines.map(lineNode));
    return group;
  }

  function renderSummary(lines) {
    const estimated = lines.reduce(
      (sum, line) => sum + cart.estimatedUnitPrice(line) * line.quantity,
      0
    );
    byId("checkout-summary").replaceChildren(
      summaryRow("Taller", lines[0]?.providerName ?? "Taller artesanal"),
      summaryRow("Artículos estimados", money(estimated, lines[0]?.currency ?? "EUR")),
      summaryRow("Envío compartido", "Se recalcula para este taller")
    );
  }

  function summaryRow(label, value) {
    const row = element("div");
    row.append(element("span", "", label), element("strong", "", value));
    return row;
  }

  function render() {
    const lines = cart.read();
    cart.wireCount(byId("cart-count"));
    byId("empty-cart").hidden = lines.length !== 0;
    byId("cart-content").hidden = lines.length === 0;
    if (!lines.length) return;
    byId("cart-groups").replaceChildren(groupNode(lines[0].providerName, lines));
    renderSummary(lines);
  }

  async function submitCheckout(payload) {
    const response = await fetch("/internal/checkout/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store"
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(body.message || "No se pudo registrar el pedido.");
      error.code = body.error;
      error.details = body.details;
      throw error;
    }
    return body;
  }

  function checkoutPayload(lines) {
    return {
      idempotencyKey,
      website: byId("website-field").value,
      customer: {
        name: byId("customer-name").value.trim(),
        email: byId("customer-email").value.trim(),
        phone: byId("customer-phone").value.trim(),
        shippingAddress: {
          line1: byId("address-line1").value.trim(),
          line2: byId("address-line2").value.trim(),
          postalCode: byId("address-postal").value.trim(),
          city: byId("address-city").value.trim(),
          province: byId("address-province").value.trim(),
          country: byId("address-country").value
        }
      },
      customerNote: byId("customer-note").value.trim(),
      items: lines.map((line) => ({
        productId: line.productId,
        quantity: line.quantity,
        personalization: line.personalization,
        customRequest: line.customRequest
      }))
    };
  }

  function showSuccess(result) {
    byId("checkout-form").hidden = true;
    byId("checkout-success").hidden = false;
    byId("success-message").textContent = result.access.delivery === "SENT"
      ? "Te hemos enviado el acceso privado por correo."
      : "El pedido está guardado. En el piloto local puedes abrir el acceso manual de abajo.";
    byId("order-results").replaceChildren(...result.orders.map((order) => {
      const row = element("article", "order-result");
      row.append(
        element("span", "", `${order.provider.displayName} · ${order.orderNumber}`),
        element("strong", "", money(order.totalCents, order.currency))
      );
      return row;
    }));

    const payment = byId("sandbox-payment-link");
    if (result.payment?.mode === "SANDBOX" && typeof result.payment.sessionPath === "string") {
      payment.href = result.payment.sessionPath;
      payment.hidden = false;
    } else {
      payment.hidden = true;
    }

    const manual = byId("manual-access-link");
    if (result.access.manualAccessUrl) {
      manual.href = result.access.manualAccessUrl;
      manual.hidden = false;
    } else {
      manual.hidden = true;
    }
    cart.clear();
  }

  byId("checkout-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const lines = cart.read();
    const button = byId("checkout-button");
    const resultNode = byId("checkout-result");
    if (!lines.length) {
      setMessage(resultNode, "El carrito está vacío.", "error");
      return;
    }
    button.disabled = true;
    button.textContent = "Registrando pedido…";
    setMessage(resultNode, "");
    try {
      const result = await submitCheckout(checkoutPayload(lines));
      showSuccess(result);
    } catch (error) {
      const type = error.code?.includes("STOCK")
        || error.code?.includes("IDEMPOTENCY")
        || error.code === "CHECKOUT_PROVIDER_MISMATCH"
        ? "warning"
        : "error";
      setMessage(resultNode, error.message, type);
      if (error.code === "PILOT_CHECKOUT_DISABLED") {
        setMessage(resultNode, "El checkout piloto está preparado, pero debe activarse en la configuración del servidor.", "warning");
      }
    } finally {
      button.disabled = false;
      button.textContent = "Registrar pedido sin pagar";
    }
  });

  render();
})();
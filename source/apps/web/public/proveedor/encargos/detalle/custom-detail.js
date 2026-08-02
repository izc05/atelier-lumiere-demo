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
  const ALLOWED_FILE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
  const MAX_FILE_BYTES = 12 * 1024 * 1024;
  const MAX_FILES = 20;

  const requestId = queryUuid("id");
  let detail = null;
  let currentUserId = null;

  function sessionUserId(payload) {
    return payload?.user?.id
      ?? payload?.session?.userId
      ?? payload?.context?.userId
      ?? payload?.membership?.userId
      ?? null;
  }

  function formatBytes(value) {
    const bytes = Number(value);
    if (!Number.isFinite(bytes) || bytes < 0) return "Tamaño desconocido";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function typeLabel(mimeType) {
    return ({
      "image/jpeg": "JPG",
      "image/png": "PNG",
      "image/webp": "WEBP",
      "application/pdf": "PDF"
    })[mimeType] ?? "FILE";
  }

  function messageNode(message) {
    const providerMessage = message.authorRole !== "CUSTOMER";
    const node = element("article", `bubble${providerMessage ? " provider" : ""}`);
    node.append(
      element("p", "", message.body),
      element("small", "", `${providerMessage ? "Taller" : "Cliente"} · ${date(message.createdAt, true)}`)
    );
    return node;
  }

  async function removeFile(file, button) {
    if (!window.confirm(`¿Retirar “${file.originalFilename}” de la conversación?`)) return;
    button.disabled = true;
    button.textContent = "Retirando…";
    setMessage(byId("file-result"), "");
    try {
      await requestJson(`/internal/provider/request-files/${encodeURIComponent(file.id)}`, {
        method: "DELETE"
      });
      await reloadDetail();
      setMessage(byId("file-result"), "Archivo retirado correctamente.", "success");
    } catch (error) {
      setMessage(byId("file-result"), error.message, "error");
      button.disabled = false;
      button.textContent = "Retirar";
    }
  }

  function fileNode(file) {
    const row = element("article", "compact-row file-row");
    const main = element("div", "file-main");
    const title = element("div", "file-title");
    title.append(
      element("span", "", typeLabel(file.mimeType)),
      element("h3", "", file.originalFilename)
    );
    const owner = currentUserId && file.uploadedBy === currentUserId
      ? "Subido por ti"
      : "Compartido por el cliente o tu equipo";
    main.append(
      title,
      element("p", "file-meta", `${formatBytes(file.sizeBytes)} · ${owner} · ${date(file.createdAt, true)}`)
    );

    const actions = element("div", "file-actions");
    const download = element("a", "file-action", "Descargar");
    download.href = `/internal/provider/request-files/${encodeURIComponent(file.id)}/content`;
    download.setAttribute("download", file.originalFilename);
    actions.append(download);

    if (currentUserId && file.uploadedBy === currentUserId) {
      const remove = element("button", "file-action remove", "Retirar");
      remove.type = "button";
      remove.addEventListener("click", () => void removeFile(file, remove));
      actions.append(remove);
    }

    row.append(main, actions);
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

  function updateFileForm() {
    const closed = ["COMPLETED", "CANCELLED"].includes(detail.request.status);
    const full = detail.files.length >= MAX_FILES;
    const disabled = closed || full;
    byId("file-input").disabled = disabled;
    byId("file-button").disabled = disabled;
    byId("file-count").textContent = `${detail.files.length} de ${MAX_FILES} archivos · máximo 12 MB`;
    if (closed) {
      setMessage(byId("file-result"), "El encargo está cerrado y ya no admite nuevos archivos.", "warning");
    } else if (full) {
      setMessage(byId("file-result"), "Se ha alcanzado el límite de veinte archivos.", "warning");
    }
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
    updateFileForm();
  }

  async function reloadDetail() {
    detail = await requestJson(`/internal/provider/custom-requests/${encodeURIComponent(requestId)}`);
    render();
  }

  async function loadDetail() {
    if (!requestId) {
      byId("detail-loading").hidden = true;
      byId("detail-error-message").textContent = "El identificador del encargo no es válido.";
      byId("detail-error").hidden = false;
      return;
    }
    try {
      const [loadedDetail, session] = await Promise.all([
        requestJson(`/internal/provider/custom-requests/${encodeURIComponent(requestId)}`),
        requestJson("/internal/provider/session")
      ]);
      detail = loadedDetail;
      currentUserId = sessionUserId(session);
      render();
      byId("detail-loading").hidden = true;
      byId("detail-content").hidden = false;
    } catch (error) {
      byId("detail-loading").hidden = true;
      byId("detail-error-message").textContent = error.message;
      byId("detail-error").hidden = false;
    }
  }

  function uploadFile(file) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const progress = byId("file-progress");
      xhr.open("POST", `/internal/provider/custom-requests/${encodeURIComponent(requestId)}/files`);
      xhr.responseType = "json";
      xhr.setRequestHeader("Content-Type", file.type);
      xhr.setRequestHeader("X-File-Name", encodeURIComponent(file.name));
      xhr.upload.addEventListener("progress", (event) => {
        progress.hidden = false;
        if (event.lengthComputable) progress.value = Math.round((event.loaded / event.total) * 100);
      });
      xhr.addEventListener("load", () => {
        const payload = xhr.response && typeof xhr.response === "object" ? xhr.response : {};
        if (xhr.status === 401) {
          window.location.replace("/proveedor/acceso/");
          reject(new Error("La sesión ha caducado."));
          return;
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(payload);
          return;
        }
        const error = new Error(payload.message || "No se pudo subir el archivo.");
        error.code = payload.error;
        reject(error);
      });
      xhr.addEventListener("error", () => reject(new Error("No se pudo conectar con el almacenamiento privado.")));
      xhr.addEventListener("timeout", () => reject(new Error("La carga ha tardado demasiado.")));
      xhr.timeout = 90000;
      xhr.send(file);
    });
  }

  byId("file-input").addEventListener("change", () => {
    const file = byId("file-input").files?.[0];
    byId("file-name").textContent = file ? `${file.name} · ${formatBytes(file.size)}` : "JPEG, PNG, WebP o PDF";
  });

  byId("file-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const file = byId("file-input").files?.[0];
    const result = byId("file-result");
    if (!file) {
      setMessage(result, "Selecciona un archivo.", "error");
      return;
    }
    if (!ALLOWED_FILE_TYPES.has(file.type)) {
      setMessage(result, "Solo se admiten imágenes JPEG, PNG, WebP o documentos PDF.", "error");
      return;
    }
    if (file.size < 1 || file.size > MAX_FILE_BYTES) {
      setMessage(result, "El archivo debe ocupar como máximo 12 MB.", "error");
      return;
    }
    const button = byId("file-button");
    const progress = byId("file-progress");
    button.disabled = true;
    button.textContent = "Subiendo…";
    progress.value = 0;
    progress.hidden = false;
    setMessage(result, "");
    try {
      await uploadFile(file);
      byId("file-input").value = "";
      byId("file-name").textContent = "JPEG, PNG, WebP o PDF";
      await reloadDetail();
      setMessage(result, "Archivo compartido con el cliente.", "success");
    } catch (error) {
      setMessage(result, error.message, "error");
    } finally {
      progress.hidden = true;
      button.textContent = "Adjuntar archivo";
      updateFileForm();
    }
  });

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
      await reloadDetail();
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
      await reloadDetail();
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

(() => {
  const {
    REQUEST_LABELS, byId, element, money, date, badge,
    requestJson, keyValue, queryUuid, setMessage, wireLogout
  } = window.AtelierCustomerOrders;

  const ALLOWED_FILE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
  const MAX_FILE_BYTES = 12 * 1024 * 1024;
  const MAX_FILES = 20;
  const requestId = queryUuid("id");
  let detail = null;
  let currentUserId = null;

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
    const customer = message.authorRole === "CUSTOMER";
    const node = element("article", `bubble${customer ? " customer" : ""}`);
    node.append(
      element("p", "", message.body),
      element("small", "", `${customer ? "Tú" : "Taller"} · ${date(message.createdAt, true)}`)
    );
    return node;
  }

  async function removeFile(file, button) {
    if (!window.confirm(`¿Retirar “${file.originalFilename}” de la conversación?`)) return;
    button.disabled = true;
    button.textContent = "Retirando…";
    setMessage(byId("file-result"), "");
    try {
      await requestJson(`/internal/customer/request-files/${encodeURIComponent(file.id)}`, {
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
    const own = currentUserId && file.uploadedBy === currentUserId;
    main.append(
      title,
      element("p", "file-meta", `${formatBytes(file.sizeBytes)} · ${own ? "Subido por ti" : "Compartido por el taller"} · ${date(file.createdAt, true)}`)
    );

    const actions = element("div", "file-actions");
    const download = element("a", "file-action", "Descargar");
    download.href = `/internal/customer/request-files/${encodeURIComponent(file.id)}/content`;
    download.setAttribute("download", file.originalFilename);
    actions.append(download);
    if (own) {
      const remove = element("button", "file-action remove", "Retirar");
      remove.type = "button";
      remove.addEventListener("click", () => void removeFile(file, remove));
      actions.append(remove);
    }
    row.append(main, actions);
    return row;
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
    byId("provider-name").textContent = request.providerName;
    byId("order-number").textContent = request.orderNumber;
    byId("request-title").textContent = request.title;
    byId("request-status").replaceChildren(badge(request.status, "request"));
    byId("request-brief").textContent = request.brief;
    byId("request-quote").textContent = request.quotedPriceCents === null
      ? "Presupuesto pendiente"
      : money(request.quotedPriceCents, request.currency);
    byId("messages-list").replaceChildren(...detail.messages.map(messageNode));
    byId("messages-empty").hidden = detail.messages.length !== 0;
    byId("files-list").replaceChildren(...detail.files.map(fileNode));
    byId("files-empty").hidden = detail.files.length !== 0;
    byId("request-data").replaceChildren(
      keyValue("Taller", request.providerName),
      keyValue("Pedido", request.orderNumber),
      keyValue("Estado", REQUEST_LABELS[request.status] ?? request.status),
      keyValue("Fecha deseada", request.desiredDate ? date(request.desiredDate) : "No indicada"),
      keyValue("Presupuesto", request.quotedPriceCents === null ? "Pendiente" : money(request.quotedPriceCents, request.currency)),
      keyValue("Versión", `v${request.version}`)
    );
    byId("order-link").href = `/mis-pedidos/detalle/?id=${encodeURIComponent(request.orderId)}`;
    byId("approval-card").hidden = request.status !== "QUOTED";
    byId("approved-card").hidden = !["APPROVED", "IN_PROGRESS", "COMPLETED"].includes(request.status);
    if (request.status === "QUOTED") {
      byId("approval-quote").replaceChildren(
        element("span", "", "Importe propuesto por el taller"),
        element("strong", "", money(request.quotedPriceCents, request.currency)),
        element("small", "", "Esta aprobación no realiza todavía ningún cobro.")
      );
    }
    byId("message-body").value = "";
    updateFileForm();
  }

  async function reloadDetail() {
    detail = await requestJson(`/internal/customer/custom-requests/${encodeURIComponent(requestId)}`);
    render();
  }

  async function load() {
    if (!requestId) {
      byId("detail-loading").hidden = true;
      byId("detail-error-message").textContent = "El identificador no es válido.";
      byId("detail-error").hidden = false;
      return;
    }
    try {
      const [loadedDetail, session] = await Promise.all([
        requestJson(`/internal/customer/custom-requests/${encodeURIComponent(requestId)}`),
        requestJson("/internal/customer/session")
      ]);
      detail = loadedDetail;
      currentUserId = session?.user?.id ?? session?.session?.userId ?? null;
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
      xhr.open("POST", `/internal/customer/custom-requests/${encodeURIComponent(requestId)}/files`);
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
          window.location.replace("/pedido/acceso/");
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
      setMessage(result, "Archivo compartido con el taller.", "success");
    } catch (error) {
      setMessage(result, error.message, "error");
    } finally {
      progress.hidden = true;
      button.textContent = "Adjuntar archivo";
      updateFileForm();
    }
  });

  byId("message-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = byId("message-button");
    const result = byId("message-result");
    button.disabled = true;
    button.textContent = "Enviando…";
    setMessage(result, "");
    try {
      await requestJson(`/internal/customer/custom-requests/${encodeURIComponent(requestId)}/messages`, {
        method: "POST",
        body: JSON.stringify({ body: byId("message-body").value.trim() })
      });
      await reloadDetail();
      setMessage(result, "Mensaje enviado al taller.", "success");
    } catch (error) {
      setMessage(result, error.message, "error");
    } finally {
      button.disabled = false;
      button.textContent = "Enviar mensaje";
    }
  });

  byId("approve-button").addEventListener("click", async () => {
    const button = byId("approve-button");
    const result = byId("approve-result");
    button.disabled = true;
    button.textContent = "Aprobando…";
    setMessage(result, "");
    try {
      await requestJson(`/internal/customer/custom-requests/${encodeURIComponent(requestId)}/approve`, {
        method: "POST",
        body: JSON.stringify({ expectedVersion: detail.request.version })
      });
      await reloadDetail();
      setMessage(result, "Presupuesto aprobado. El taller ya puede continuar.", "success");
    } catch (error) {
      setMessage(result, error.message, error.code?.includes("CONFLICT") || error.code?.includes("QUOTED") ? "warning" : "error");
    } finally {
      button.textContent = "Aprobar presupuesto";
      button.disabled = detail?.request?.status !== "QUOTED";
    }
  });

  wireLogout();
  void load();
})();

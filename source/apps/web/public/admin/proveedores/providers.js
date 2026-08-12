const elements = {
  loginView: document.querySelector("#login-view"),
  adminView: document.querySelector("#admin-view"),
  loginForm: document.querySelector("#login-form"),
  accessKey: document.querySelector("#access-key"),
  loginMessage: document.querySelector("#login-message"),
  logoutButton: document.querySelector("#logout-button"),
  refreshButton: document.querySelector("#refresh-button"),
  openCreateButton: document.querySelector("#open-create-button"),
  closeCreateButton: document.querySelector("#close-create-button"),
  createPanel: document.querySelector("#create-panel"),
  providerForm: document.querySelector("#provider-form"),
  providerFormMessage: document.querySelector("#provider-form-message"),
  providerSearch: document.querySelector("#provider-search"),
  providersList: document.querySelector("#providers-list"),
  globalMessage: document.querySelector("#global-message"),
  metricTotal: document.querySelector("#metric-total"),
  metricActive: document.querySelector("#metric-active"),
  metricInvited: document.querySelector("#metric-invited"),
  metricSuspended: document.querySelector("#metric-suspended"),
  renewInvitationDialog: document.querySelector("#renew-invitation-dialog"),
  renewInvitationForm: document.querySelector("#renew-invitation-form"),
  renewInvitationTitle: document.querySelector("#renew-invitation-title"),
  renewInvitationEmail: document.querySelector("#renew-invitation-email"),
  renewInvitationMessage: document.querySelector("#renew-invitation-message"),
  cancelRenewInvitation: document.querySelector("#cancel-renew-invitation"),
  invitationDialog: document.querySelector("#invitation-dialog"),
  invitationDeliveryStatus: document.querySelector("#invitation-delivery-status"),
  invitationCopyFields: document.querySelector("#invitation-copy-fields"),
  invitationLink: document.querySelector("#invitation-link"),
  invitationToken: document.querySelector("#invitation-token"),
  copyLinkButton: document.querySelector("#copy-link-button"),
  copyTokenButton: document.querySelector("#copy-token-button"),
  auditDialog: document.querySelector("#audit-dialog"),
  auditTitle: document.querySelector("#audit-title"),
  auditList: document.querySelector("#audit-list"),
  applicationsList: document.querySelector("#applications-list"),
  applicationsCount: document.querySelector("#applications-count"),
  applicationsMessage: document.querySelector("#applications-message")
};

const state = {
  providers: [],
  applications: [],
  search: "",
  renewalProvider: null
};

const statusLabels = {
  ACTIVE: "Activo",
  INVITED: "Invitado",
  SUSPENDED: "Pausado"
};

const invitationLabels = {
  PENDING: "Invitación pendiente",
  ACCEPTED: "Invitación aceptada",
  EXPIRED: "Invitación caducada",
  REVOKED: "Invitación revocada"
};

const auditLabels = {
  PROVIDER_CREATED: "Proveedor creado",
  PROVIDER_ACTIVATED: "Proveedor activado",
  PROVIDER_SUSPENDED: "Proveedor pausado",
  PROVIDER_INVITATION_RENEWED: "Invitación renovada"
};

class RequestError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.name = "RequestError";
    this.status = status;
    this.payload = payload;
  }
}

async function requestJson(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers
    },
    ...options
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new RequestError(payload.message ?? "No se pudo completar la operación.", response.status, payload);
  }
  return payload;
}

function setMessage(element, message = "", kind = "") {
  element.textContent = message;
  element.classList.remove("error", "success");
  if (kind) element.classList.add(kind);
}

function setBusy(button, busy, busyLabel = "Procesando…") {
  if (!button) return;
  if (busy) {
    button.dataset.originalLabel = button.textContent;
    button.textContent = busyLabel;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalLabel ?? button.textContent;
    button.disabled = false;
    delete button.dataset.originalLabel;
  }
}

function createElement(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function formatDate(value, withTime = false) {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha no disponible";
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    ...(withTime ? { timeStyle: "short" } : {})
  }).format(date);
}

function initials(name) {
  return String(name ?? "AL")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "AL";
}

function showLogin(message = "") {
  elements.adminView.hidden = true;
  elements.loginView.hidden = false;
  elements.accessKey.value = "";
  setMessage(elements.loginMessage, message, message ? "error" : "");
  requestAnimationFrame(() => elements.accessKey.focus());
}

async function showAdmin() {
  elements.loginView.hidden = true;
  elements.adminView.hidden = false;
  await Promise.all([loadProviders(), loadApplications()]);
}

function renderApplications() {
  elements.applicationsList.replaceChildren();
  elements.applicationsCount.textContent = `${state.applications.length} ${state.applications.length === 1 ? "pendiente" : "pendientes"}`;
  if (state.applications.length === 0) {
    elements.applicationsList.append(createElement("div", "empty-card", "No hay solicitudes pendientes."));
    return;
  }
  for (const application of state.applications) {
    const card = createElement("article", "application-row");
    const copy = createElement("div", "application-copy");
    const title = createElement("div", "application-title");
    title.append(createElement("h3", "", application.displayName), createElement("span", "application-badge", "Pendiente"));
    const meta = createElement("p", "application-meta", `${application.specialty} · ${application.contactName} · ${application.contactEmail}`);
    copy.append(title, meta);
    if (application.websiteUrl) {
      const link = createElement("a", "application-link", "Ver web o red social");
      link.href = application.websiteUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      copy.append(link);
    }
    if (application.message) copy.append(createElement("p", "application-note", application.message));
    copy.append(createElement("time", "application-date", `Recibida ${formatDate(application.createdAt, true)}`));

    const actions = createElement("div", "application-actions");
    actions.append(
      actionButton("Aprobar e invitar", "primary", (button) => reviewApplication(application, "approve", button)),
      actionButton("Rechazar", "danger", (button) => reviewApplication(application, "reject", button))
    );
    card.append(copy, actions);
    elements.applicationsList.append(card);
  }
}

async function loadApplications({ quiet = false } = {}) {
  if (!elements.applicationsList) return;
  if (!quiet) elements.applicationsList.replaceChildren(createElement("div", "loading-card", "Cargando solicitudes…"));
  setMessage(elements.applicationsMessage);
  try {
    const payload = await requestJson("/internal/admin/workshop-applications?status=PENDING");
    state.applications = Array.isArray(payload.applications) ? payload.applications : [];
    renderApplications();
  } catch (error) {
    if (error.status === 401) return showLogin("La sesión ha caducado.");
    elements.applicationsList.replaceChildren(createElement("div", "empty-card", "No se han podido cargar las solicitudes."));
    setMessage(elements.applicationsMessage, error.message, "error");
  }
}

async function reviewApplication(application, action, button) {
  const approving = action === "approve";
  const question = approving
    ? `¿Aprobar “${application.displayName}” y enviar su invitación de acceso?`
    : `¿Rechazar la solicitud de “${application.displayName}”?`;
  if (!window.confirm(question)) return;
  const reviewNote = window.prompt(
    approving ? "Nota interna opcional:" : "Mensaje opcional para explicar la decisión:",
    ""
  );
  if (reviewNote === null) return;
  setBusy(button, true, approving ? "Aprobando…" : "Rechazando…");
  setMessage(elements.applicationsMessage);
  try {
    const payload = await requestJson(`/internal/admin/workshop-applications/${application.id}/${action}`, {
      method: "POST",
      body: JSON.stringify(reviewNote.trim() ? { reviewNote: reviewNote.trim() } : {})
    });
    if (approving && payload.activationPath) showInvitation(payload);
    setMessage(
      elements.applicationsMessage,
      approving
        ? `“${application.displayName}” ha sido aprobado y su invitación está preparada.`
        : `La solicitud de “${application.displayName}” ha sido rechazada.`,
      "success"
    );
    await Promise.all([loadApplications({ quiet: true }), loadProviders({ quiet: true })]);
  } catch (error) {
    if (error.status === 401) return showLogin("La sesión ha caducado.");
    setMessage(elements.applicationsMessage, error.message, "error");
  } finally {
    setBusy(button, false);
  }
}

function updateMetrics() {
  elements.metricTotal.textContent = String(state.providers.length);
  elements.metricActive.textContent = String(state.providers.filter((provider) => provider.status === "ACTIVE").length);
  elements.metricInvited.textContent = String(state.providers.filter((provider) => provider.status === "INVITED").length);
  elements.metricSuspended.textContent = String(state.providers.filter((provider) => provider.status === "SUSPENDED").length);
}

function filteredProviders() {
  const query = state.search.trim().toLocaleLowerCase("es");
  if (!query) return state.providers;
  return state.providers.filter((provider) => [
    provider.displayName,
    provider.contactName,
    provider.contactEmail,
    provider.specialty,
    provider.slug
  ].some((value) => String(value ?? "").toLocaleLowerCase("es").includes(query)));
}

function statusBadge(provider) {
  return createElement(
    "span",
    `status-badge status-${provider.status.toLowerCase()}`,
    statusLabels[provider.status] ?? provider.status
  );
}

function invitationBadge(invitation) {
  if (!invitation) return null;
  return createElement(
    "span",
    "invitation-badge",
    invitationLabels[invitation.status] ?? invitation.status
  );
}

function actionButton(label, className, handler) {
  const button = createElement("button", `button ${className}`, label);
  button.type = "button";
  button.addEventListener("click", () => void handler(button));
  return button;
}

function renderProviderCard(provider) {
  const card = createElement("article", "provider-card");
  card.dataset.providerId = provider.id;

  const main = createElement("div", "provider-main");
  main.append(createElement("div", "provider-avatar", initials(provider.displayName)));

  const content = createElement("div");
  const titleRow = createElement("div", "provider-title-row");
  titleRow.append(createElement("h3", "", provider.displayName), statusBadge(provider));
  const inviteBadge = invitationBadge(provider.latestInvitation);
  if (inviteBadge) titleRow.append(inviteBadge);

  const meta = createElement("div", "provider-meta");
  for (const text of [
    provider.specialty,
    provider.contactName,
    provider.contactEmail,
    provider.latestInvitation
      ? `Invitación: ${formatDate(provider.latestInvitation.expiresAt)}`
      : "Sin invitación"
  ]) {
    if (text) meta.append(createElement("span", "", text));
  }
  content.append(titleRow, meta);
  main.append(content);

  const actions = createElement("div", "provider-actions");
  const pendingApproval = provider.status === "INVITED";
  const nextStatus = provider.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
  const statusLabel = pendingApproval
    ? "Aprobar taller"
    : nextStatus === "ACTIVE"
      ? "Reactivar"
      : "Pausar";
  actions.append(
    actionButton(statusLabel, nextStatus === "ACTIVE" ? "secondary" : "danger", (button) => changeStatus(provider, nextStatus, button)),
    actionButton("Nueva invitación", "secondary", () => openRenewInvitation(provider)),
    actionButton("Auditoría", "secondary", (button) => openAudit(provider, button))
  );

  card.append(main, actions);
  return card;
}

function renderProviders() {
  updateMetrics();
  elements.providersList.replaceChildren();
  const providers = filteredProviders();

  if (providers.length === 0) {
    const empty = createElement(
      "div",
      "empty-card",
      state.providers.length === 0
        ? "Todavía no hay talleres registrados. Crea el primero desde el formulario."
        : "No hay proveedores que coincidan con la búsqueda."
    );
    elements.providersList.append(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const provider of providers) fragment.append(renderProviderCard(provider));
  elements.providersList.append(fragment);
}

async function loadProviders({ quiet = false } = {}) {
  if (!quiet) {
    elements.providersList.replaceChildren(createElement("div", "loading-card", "Cargando proveedores…"));
    setMessage(elements.globalMessage);
  }

  try {
    const payload = await requestJson("/internal/admin/providers");
    state.providers = Array.isArray(payload.providers) ? payload.providers : [];
    renderProviders();
  } catch (error) {
    if (error.status === 401) {
      showLogin("La sesión ha caducado. Vuelve a introducir la clave.");
      return;
    }
    elements.providersList.replaceChildren(createElement("div", "empty-card", "No se ha podido cargar el directorio."));
    setMessage(elements.globalMessage, error.message, "error");
  }
}

async function changeStatus(provider, status, button) {
  const approving = provider.status === "INVITED" && status === "ACTIVE";
  const action = approving ? "aprobar" : status === "ACTIVE" ? "reactivar" : "pausar";
  if (!window.confirm(`¿Confirmas que deseas ${action} “${provider.displayName}”?`)) return;

  setBusy(button, true);
  setMessage(elements.globalMessage);
  try {
    await requestJson(`/internal/admin/providers/${provider.id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status })
    });
    setMessage(
      elements.globalMessage,
      approving
        ? `El taller “${provider.displayName}” ha sido aprobado y activado.`
        : `El taller “${provider.displayName}” se ha actualizado.`,
      "success"
    );
    await loadProviders({ quiet: true });
  } catch (error) {
    if (error.status === 401) return showLogin("La sesión ha caducado.");
    setMessage(elements.globalMessage, error.message, "error");
  } finally {
    setBusy(button, false);
  }
}

function showInvitation(payload) {
  const path = payload.activationPath ?? "";
  elements.invitationLink.value = path ? new URL(path, window.location.origin).toString() : "";
  elements.invitationToken.value = payload.activationToken ?? "";
  const hasManualAccess = Boolean(elements.invitationLink.value || elements.invitationToken.value);
  elements.invitationCopyFields.hidden = !hasManualAccess;

  const recipient = payload.invitation?.email ?? "el correo indicado";
  if (payload.delivery === "sent") {
    setMessage(elements.invitationDeliveryStatus, `La invitación se ha enviado a ${recipient}.`, "success");
  } else if (payload.delivery === "failed") {
    setMessage(elements.invitationDeliveryStatus, "La invitación se creó, pero el correo no pudo entregarse. Revisa la dirección o la configuración SMTP y genera otra invitación.", "error");
  } else if (payload.delivery === "disabled" && !hasManualAccess) {
    setMessage(elements.invitationDeliveryStatus, "La invitación se creó, pero el envío de correo no está configurado. No hay un enlace manual disponible en producción.", "error");
  } else if (hasManualAccess) {
    setMessage(elements.invitationDeliveryStatus, "La invitación está disponible para copiar en este entorno.", "success");
  } else {
    setMessage(elements.invitationDeliveryStatus, "La invitación se creó, pero no se recibió confirmación de entrega.", "error");
  }
  elements.invitationDialog.showModal();
}

function openRenewInvitation(provider) {
  state.renewalProvider = provider;
  elements.renewInvitationTitle.textContent = `Nueva invitación · ${provider.displayName}`;
  elements.renewInvitationEmail.value = provider.contactEmail ?? "";
  setMessage(elements.renewInvitationMessage);
  elements.renewInvitationDialog.showModal();
  elements.renewInvitationEmail.focus();
  elements.renewInvitationEmail.select();
}

async function renewInvitation(provider, email, button) {
  setBusy(button, true);
  setMessage(elements.renewInvitationMessage);
  try {
    const payload = await requestJson(`/internal/admin/providers/${provider.id}/invitations`, {
      method: "POST",
      body: JSON.stringify({ role: "PROVIDER_OWNER", email })
    });
    elements.renewInvitationDialog.close();
    showInvitation(payload);
    setMessage(
      elements.globalMessage,
      payload.delivery === "sent"
        ? `La invitación se ha enviado a ${payload.invitation?.email ?? email}.`
        : "Se ha generado una invitación nueva. Revisa el resultado de entrega.",
      payload.delivery === "sent" || payload.activationPath ? "success" : "error"
    );
    await loadProviders({ quiet: true });
  } catch (error) {
    if (error.status === 401) {
      elements.renewInvitationDialog.close();
      return showLogin("La sesión ha caducado.");
    }
    setMessage(elements.renewInvitationMessage, error.message, "error");
  } finally {
    setBusy(button, false);
  }
}

function auditDescription(event) {
  const metadata = event.metadata && typeof event.metadata === "object" ? event.metadata : {};
  if (event.action === "PROVIDER_CREATED") return "Alta inicial del taller y creación de su primera invitación.";
  if (event.action === "PROVIDER_SUSPENDED") return "El acceso operativo del taller quedó pausado.";
  if (event.action === "PROVIDER_ACTIVATED") return "El taller volvió a quedar activo.";
  if (event.action === "PROVIDER_INVITATION_RENEWED") {
    return `Invitación renovada${metadata.email ? ` para ${metadata.email}` : ""}.`;
  }
  return event.entityType ? `Acción registrada sobre ${event.entityType}.` : "Actividad registrada.";
}

async function openAudit(provider, button) {
  setBusy(button, true, "Abriendo…");
  try {
    const payload = await requestJson(`/internal/admin/providers/${provider.id}/audit?limit=50`);
    elements.auditTitle.textContent = `Auditoría · ${provider.displayName}`;
    elements.auditList.replaceChildren();

    if (!payload.events?.length) {
      elements.auditList.append(createElement("div", "empty-card", "Este taller todavía no tiene actividad registrada."));
    } else {
      for (const event of payload.events) {
        const row = createElement("article", "audit-event");
        row.append(createElement("span", "audit-dot"));
        const copy = createElement("div");
        copy.append(
          createElement("strong", "", auditLabels[event.action] ?? event.action),
          createElement("p", "", auditDescription(event))
        );
        const time = createElement("time", "", formatDate(event.createdAt, true));
        time.dateTime = event.createdAt ?? "";
        row.append(copy, time);
        elements.auditList.append(row);
      }
    }
    elements.auditDialog.showModal();
  } catch (error) {
    if (error.status === 401) return showLogin("La sesión ha caducado.");
    setMessage(elements.globalMessage, error.message, "error");
  } finally {
    setBusy(button, false);
  }
}

async function copyValue(input, button) {
  if (!input.value) return;
  try {
    await navigator.clipboard.writeText(input.value);
    const original = button.textContent;
    button.textContent = "Copiado";
    window.setTimeout(() => {
      button.textContent = original;
    }, 1400);
  } catch {
    input.focus();
    input.select();
  }
}

elements.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = elements.loginForm.querySelector('button[type="submit"]');
  setBusy(button, true, "Comprobando…");
  setMessage(elements.loginMessage);

  try {
    await requestJson("/internal/admin/session", {
      method: "POST",
      body: JSON.stringify({ accessKey: elements.accessKey.value })
    });
    await showAdmin();
  } catch (error) {
    setMessage(elements.loginMessage, error.message, "error");
    elements.accessKey.select();
  } finally {
    setBusy(button, false);
  }
});

elements.logoutButton.addEventListener("click", async () => {
  setBusy(elements.logoutButton, true, "Saliendo…");
  try {
    await requestJson("/internal/admin/session", { method: "DELETE" });
  } catch {
    // Aunque la API falle, se vuelve a la pantalla de acceso.
  }
  state.providers = [];
  showLogin();
  setBusy(elements.logoutButton, false);
});

elements.refreshButton.addEventListener("click", async () => {
  setBusy(elements.refreshButton, true, "Actualizando…");
  await Promise.all([loadProviders(), loadApplications()]);
  setBusy(elements.refreshButton, false);
});

elements.providerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = elements.providerForm.querySelector('button[type="submit"]');
  const formData = new FormData(elements.providerForm);
  const input = Object.fromEntries(
    [...formData.entries()]
      .map(([key, value]) => [key, String(value).trim()])
      .filter(([, value]) => value !== "")
  );

  setBusy(button, true, "Creando…");
  setMessage(elements.providerFormMessage);
  try {
    const payload = await requestJson("/internal/admin/providers", {
      method: "POST",
      body: JSON.stringify(input)
    });
    elements.providerForm.reset();
    setMessage(elements.providerFormMessage, "Proveedor creado correctamente.", "success");
    showInvitation(payload);
    await loadProviders({ quiet: true });
  } catch (error) {
    if (error.status === 401) return showLogin("La sesión ha caducado.");
    setMessage(elements.providerFormMessage, error.message, "error");
  } finally {
    setBusy(button, false);
  }
});

elements.providerSearch.addEventListener("input", () => {
  state.search = elements.providerSearch.value;
  renderProviders();
});

elements.openCreateButton.addEventListener("click", () => {
  elements.createPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  elements.providerForm.elements.displayName.focus();
});

elements.closeCreateButton.addEventListener("click", () => {
  elements.providersList.scrollIntoView({ behavior: "smooth", block: "start" });
});

elements.renewInvitationForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!state.renewalProvider) return;
  const button = elements.renewInvitationForm.querySelector('button[type="submit"]');
  const email = elements.renewInvitationEmail.value.trim();
  void renewInvitation(state.renewalProvider, email, button);
});

elements.cancelRenewInvitation.addEventListener("click", () => elements.renewInvitationDialog.close());

elements.renewInvitationDialog.addEventListener("close", () => {
  state.renewalProvider = null;
  elements.renewInvitationForm.reset();
  setMessage(elements.renewInvitationMessage);
});

elements.copyLinkButton.addEventListener("click", () => void copyValue(elements.invitationLink, elements.copyLinkButton));
elements.copyTokenButton.addEventListener("click", () => void copyValue(elements.invitationToken, elements.copyTokenButton));

elements.invitationDialog.addEventListener("close", () => {
  elements.invitationLink.value = "";
  elements.invitationToken.value = "";
  elements.invitationCopyFields.hidden = true;
  setMessage(elements.invitationDeliveryStatus);
});

async function initialize() {
  try {
    await requestJson("/internal/admin/session");
    await showAdmin();
  } catch {
    showLogin();
  }
}

void initialize();

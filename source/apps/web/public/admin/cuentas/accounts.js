const state = {
  session: null,
  accounts: [],
  selectedAccount: null
};

const elements = {
  adminAccount: document.querySelector("#admin-account"),
  content: document.querySelector("#accounts-content"),
  forbidden: document.querySelector("#forbidden-panel"),
  list: document.querySelector("#accounts-list"),
  search: document.querySelector("#account-search"),
  message: document.querySelector("#global-message"),
  form: document.querySelector("#account-form"),
  formMessage: document.querySelector("#form-message"),
  createDialog: document.querySelector("#create-dialog"),
  setupDialog: document.querySelector("#setup-dialog"),
  setupTitle: document.querySelector("#setup-title"),
  setupDescription: document.querySelector("#setup-description"),
  setupLinkField: document.querySelector("#setup-link-field"),
  setupLink: document.querySelector("#setup-link"),
  sessionsDialog: document.querySelector("#sessions-dialog"),
  sessionsTitle: document.querySelector("#sessions-title"),
  sessionsMessage: document.querySelector("#sessions-message"),
  sessionsList: document.querySelector("#sessions-list"),
  revokeAll: document.querySelector("#revoke-all-button"),
  metrics: {
    total: document.querySelector("#metric-total"),
    active: document.querySelector("#metric-active"),
    pending: document.querySelector("#metric-pending"),
    sessions: document.querySelector("#metric-sessions")
  }
};

const roleNames = {
  PLATFORM_OWNER: "Propietario de plataforma",
  PROVIDER_MANAGER: "Gestión de proveedores",
  EDITORIAL_REVIEWER: "Revisión editorial"
};

function formatDate(value) {
  if (!value) return "Sin actividad";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin actividad";
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function setMessage(element, text = "", type = "") {
  element.textContent = text;
  element.classList.remove("error", "success");
  if (type) element.classList.add(type);
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {})
    },
    ...options
  });
  const text = await response.text();
  let payload = {};
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = {}; }
  if (response.status === 401) {
    window.location.replace("/admin/proveedores/");
    throw new Error("La sesión ha caducado.");
  }
  if (!response.ok) {
    const error = new Error(payload.message || "No se ha podido completar la operación.");
    error.code = payload.error;
    error.details = payload.details;
    throw error;
  }
  return payload;
}

function button(label, className, action) {
  const item = document.createElement("button");
  item.type = "button";
  item.className = className;
  item.textContent = label;
  item.addEventListener("click", action);
  return item;
}

function accountCard(account) {
  const card = document.createElement("article");
  card.className = `account-card ${account.status === "SUSPENDED" ? "suspended" : ""}`;

  const header = document.createElement("div");
  header.className = "account-card-header";
  const identity = document.createElement("div");
  identity.className = "account-identity";
  const name = document.createElement("h3");
  name.textContent = account.displayName;
  const email = document.createElement("p");
  email.textContent = account.email;
  identity.append(name, email);
  const status = document.createElement("span");
  status.className = `status-pill ${account.status === "ACTIVE" ? "active" : "suspended"}`;
  status.textContent = account.status === "ACTIVE" ? "Activa" : "Suspendida";
  header.append(identity, status);

  const badges = document.createElement("div");
  badges.className = "account-actions";
  const role = document.createElement("span");
  role.className = "role-pill";
  role.textContent = roleNames[account.role] || account.role;
  const security = document.createElement("span");
  security.className = `security-pill ${account.securityReady ? "ready" : "pending"}`;
  security.textContent = account.securityReady ? "Seguridad completa" : "Activación pendiente";
  badges.append(role, security);

  const meta = document.createElement("div");
  meta.className = "account-meta";
  const sessions = document.createElement("div");
  sessions.innerHTML = `<span>Sesiones activas</span><strong>${Number(account.activeSessions || 0)}</strong>`;
  const activity = document.createElement("div");
  const activityLabel = document.createElement("span");
  activityLabel.textContent = "Última actividad";
  const activityValue = document.createElement("strong");
  activityValue.textContent = formatDate(account.lastSeenAt);
  activity.append(activityLabel, activityValue);
  meta.append(sessions, activity);

  const actions = document.createElement("div");
  actions.className = "account-actions";
  actions.append(
    button("Sesiones", "button secondary", () => openSessions(account)),
    button(
      account.securityReady ? "Restablecer acceso" : "Reenviar activación",
      "button secondary",
      () => sendSetup(account)
    )
  );
  if (account.status === "ACTIVE") {
    actions.append(button("Suspender", "button danger", () => updateStatus(account, "SUSPENDED")));
  } else {
    actions.append(button("Reactivar", "button success", () => updateStatus(account, "ACTIVE")));
  }

  card.append(header, badges, meta, actions);
  return card;
}

function render() {
  const term = elements.search.value.trim().toLocaleLowerCase("es");
  const filtered = state.accounts.filter((account) => {
    const haystack = `${account.displayName} ${account.email} ${roleNames[account.role] || account.role}`
      .toLocaleLowerCase("es");
    return !term || haystack.includes(term);
  });

  elements.list.replaceChildren();
  if (!filtered.length) {
    const empty = document.createElement("div");
    empty.className = "loading-card";
    empty.textContent = term ? "No hay cuentas que coincidan con la búsqueda." : "Todavía no hay cuentas administrativas.";
    elements.list.append(empty);
    return;
  }
  for (const account of filtered) elements.list.append(accountCard(account));
}

function updateMetrics() {
  elements.metrics.total.textContent = String(state.accounts.length);
  elements.metrics.active.textContent = String(
    state.accounts.filter((account) => account.status === "ACTIVE").length
  );
  elements.metrics.pending.textContent = String(
    state.accounts.filter((account) => !account.securityReady).length
  );
  elements.metrics.sessions.textContent = String(
    state.accounts.reduce((total, account) => total + Number(account.activeSessions || 0), 0)
  );
}

async function loadAccounts() {
  setMessage(elements.message, "Cargando cuentas…");
  try {
    const payload = await request("/internal/admin/accounts");
    state.accounts = Array.isArray(payload.accounts) ? payload.accounts : [];
    updateMetrics();
    render();
    setMessage(elements.message);
  } catch (error) {
    if (error.code === "ADMIN_ROLE_FORBIDDEN") {
      elements.content.hidden = true;
      elements.forbidden.hidden = false;
      return;
    }
    setMessage(elements.message, error.message, "error");
  }
}

function showSetup(account, setup = {}) {
  elements.setupTitle.textContent = account.securityReady
    ? "Acceso de recuperación preparado"
    : "Activación administrativa preparada";
  const delivery = setup.delivery || "disabled";
  const descriptions = {
    sent: "El enlace se ha enviado mediante el correo transaccional configurado.",
    failed: "La cuenta está guardada, pero el servidor de correo no pudo entregar el enlace.",
    disabled: "El correo está desactivado. La cuenta queda pendiente hasta configurar SMTP o generar otro enlace.",
    "manual-development": "El correo está desactivado en desarrollo. Usa el enlace provisional mostrado abajo."
  };
  elements.setupDescription.textContent = descriptions[delivery] || "El acceso se ha preparado.";
  const path = setup.recoveryPath || setup.setupPath || "";
  elements.setupLinkField.hidden = !path;
  elements.setupLink.value = path ? new URL(path, window.location.origin).toString() : "";
  elements.setupDialog.showModal();
}

async function updateStatus(account, status) {
  const action = status === "SUSPENDED" ? "suspender" : "reactivar";
  if (!window.confirm(`¿Confirmas que quieres ${action} la cuenta de ${account.displayName}?`)) return;
  setMessage(elements.message, "Actualizando cuenta…");
  try {
    await request(`/internal/admin/accounts/${account.id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status })
    });
    setMessage(elements.message, `Cuenta ${status === "ACTIVE" ? "reactivada" : "suspendida"}.`, "success");
    await loadAccounts();
  } catch (error) {
    setMessage(elements.message, error.message, "error");
  }
}

async function sendSetup(account) {
  const label = account.securityReady ? "restablecer el acceso" : "reenviar la activación";
  if (!window.confirm(`¿Preparar un enlace nuevo para ${label} de ${account.displayName}?`)) return;
  setMessage(elements.message, "Preparando acceso seguro…");
  try {
    const payload = await request(`/internal/admin/accounts/${account.id}/setup-link`, {
      method: "POST"
    });
    showSetup(payload.account || account, payload.setup || {});
    setMessage(elements.message);
  } catch (error) {
    setMessage(elements.message, error.message, "error");
  }
}

function renderSessions(sessions) {
  elements.sessionsList.replaceChildren();
  if (!sessions.length) {
    const empty = document.createElement("div");
    empty.className = "empty-sessions";
    empty.textContent = "Esta cuenta no tiene sesiones administrativas activas.";
    elements.sessionsList.append(empty);
    elements.revokeAll.hidden = true;
    return;
  }
  elements.revokeAll.hidden = false;
  for (const session of sessions) {
    const card = document.createElement("article");
    card.className = "session-card";
    const info = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = session.userAgent || "Navegador sin identificar";
    const details = document.createElement("p");
    details.textContent = `Último uso: ${formatDate(session.lastSeenAt)} · Caduca: ${formatDate(session.expiresAt)}`;
    info.append(title, details);
    card.append(info, button("Cerrar sesión", "button danger", () => revokeSession(session.id)));
    elements.sessionsList.append(card);
  }
}

async function openSessions(account) {
  state.selectedAccount = account;
  elements.sessionsTitle.textContent = `Sesiones de ${account.displayName}`;
  setMessage(elements.sessionsMessage, "Cargando sesiones…");
  elements.sessionsList.replaceChildren();
  elements.revokeAll.hidden = true;
  elements.sessionsDialog.showModal();
  try {
    const payload = await request(`/internal/admin/accounts/${account.id}/sessions`);
    renderSessions(Array.isArray(payload.sessions) ? payload.sessions : []);
    setMessage(elements.sessionsMessage);
  } catch (error) {
    setMessage(elements.sessionsMessage, error.message, "error");
  }
}

async function revokeSession(sessionId) {
  const account = state.selectedAccount;
  if (!account || !window.confirm("¿Cerrar esta sesión inmediatamente?")) return;
  try {
    await request(`/internal/admin/accounts/${account.id}/sessions/${sessionId}`, { method: "DELETE" });
    await openSessions(account);
    await loadAccounts();
  } catch (error) {
    setMessage(elements.sessionsMessage, error.message, "error");
  }
}

async function revokeAllSessions() {
  const account = state.selectedAccount;
  if (!account || !window.confirm(`¿Cerrar todas las sesiones de ${account.displayName}?`)) return;
  try {
    await request(`/internal/admin/accounts/${account.id}/sessions`, { method: "DELETE" });
    renderSessions([]);
    setMessage(elements.sessionsMessage, "Todas las sesiones han sido cerradas.", "success");
    await loadAccounts();
  } catch (error) {
    setMessage(elements.sessionsMessage, error.message, "error");
  }
}

async function createAccount(event) {
  event.preventDefault();
  const formData = new FormData(elements.form);
  const input = {
    displayName: String(formData.get("displayName") || ""),
    email: String(formData.get("email") || ""),
    role: String(formData.get("role") || "")
  };
  setMessage(elements.formMessage, "Creando cuenta…");
  try {
    const payload = await request("/internal/admin/accounts", {
      method: "POST",
      body: JSON.stringify(input)
    });
    elements.form.reset();
    elements.createDialog.close();
    showSetup(payload.account, payload.setup || {});
    await loadAccounts();
  } catch (error) {
    setMessage(elements.formMessage, error.message, "error");
  }
}

async function bootstrap() {
  try {
    const payload = await request("/internal/admin/session");
    state.session = payload.account;
    elements.adminAccount.textContent = `${payload.account.displayName} · ${roleNames[payload.account.role] || payload.account.role}`;
    if (payload.account.role !== "PLATFORM_OWNER") {
      elements.content.hidden = true;
      elements.forbidden.hidden = false;
      return;
    }
    await loadAccounts();
  } catch (error) {
    setMessage(elements.message, error.message, "error");
  }
}

document.querySelector("#open-create-button").addEventListener("click", () => {
  setMessage(elements.formMessage);
  elements.createDialog.showModal();
});
document.querySelector("#refresh-button").addEventListener("click", loadAccounts);
document.querySelector("#logout-button").addEventListener("click", async () => {
  await fetch("/internal/admin/session", { method: "DELETE", credentials: "same-origin" });
  window.location.replace("/admin/proveedores/");
});
document.querySelector("#copy-setup-link").addEventListener("click", async () => {
  await navigator.clipboard.writeText(elements.setupLink.value);
  document.querySelector("#copy-setup-link").textContent = "Copiado";
});
elements.form.addEventListener("submit", createAccount);
elements.search.addEventListener("input", render);
elements.revokeAll.addEventListener("click", revokeAllSessions);

bootstrap();

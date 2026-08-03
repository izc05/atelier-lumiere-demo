const state = {
  session: null,
  accounts: [],
  selectedAccount: null,
  pendingConfirmation: null
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
  confirmationDialog: document.querySelector("#confirmation-dialog"),
  confirmationForm: document.querySelector("#confirmation-form"),
  confirmationTitle: document.querySelector("#confirmation-title"),
  confirmationDescription: document.querySelector("#confirmation-description"),
  confirmationPassword: document.querySelector("#confirmation-password"),
  confirmationCode: document.querySelector("#confirmation-code"),
  confirmationMessage: document.querySelector("#confirmation-message"),
  confirmationSubmit: document.querySelector("#confirmation-submit"),
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
  if (!element) return;
  element.textContent = text;
  element.classList.remove("error", "success");
  if (type) element.classList.add(type);
}

function setFormBusy(form, busy) {
  if (!form) return;
  for (const control of form.elements) control.disabled = busy;
}

function errorText(error) {
  if (error.code === "ADMIN_SENSITIVE_CONFIRMATION_THROTTLED") {
    const seconds = Number(error.details?.retryAfterSeconds);
    return Number.isFinite(seconds)
      ? `Demasiados intentos. Vuelve a probar dentro de ${Math.ceil(seconds / 60)} minuto(s).`
      : "Demasiados intentos. Espera antes de volver a probar.";
  }
  if (error.code === "INVALID_ADMIN_SENSITIVE_CONFIRMATION") {
    const remaining = Number(error.details?.attemptsRemaining);
    return Number.isFinite(remaining)
      ? `${error.message} Quedan ${remaining} intento(s).`
      : error.message;
  }
  return error.message;
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
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = {};
  }
  if (response.status === 401 && payload.error !== "INVALID_ADMIN_SENSITIVE_CONFIRMATION") {
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

function pill(label, className) {
  const item = document.createElement("span");
  item.className = className;
  item.textContent = label;
  return item;
}

function metric(label, value) {
  const item = document.createElement("div");
  const caption = document.createElement("span");
  caption.textContent = label;
  const strong = document.createElement("strong");
  strong.textContent = value;
  item.append(caption, strong);
  return item;
}

function roleEditor(account) {
  const wrapper = document.createElement("div");
  wrapper.className = "role-editor";
  const label = document.createElement("label");
  label.textContent = "Rol asignado";
  const select = document.createElement("select");
  select.setAttribute("aria-label", `Rol de ${account.displayName}`);
  for (const [value, name] of Object.entries(roleNames)) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = name;
    option.selected = value === account.role;
    select.append(option);
  }
  const current = account.id === state.session?.id;
  select.disabled = current;
  label.append(select);
  const change = button("Cambiar rol", "button secondary", () => changeRole(account, select.value));
  change.disabled = current;
  wrapper.append(label, change);
  return wrapper;
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
  const status = pill(
    account.status === "ACTIVE" ? "Activa" : "Suspendida",
    `status-pill ${account.status === "ACTIVE" ? "active" : "suspended"}`
  );
  header.append(identity, status);

  const badges = document.createElement("div");
  badges.className = "account-badges";
  badges.append(
    pill(roleNames[account.role] || account.role, "role-pill"),
    pill(
      account.securityReady ? "Seguridad completa" : "Activación pendiente",
      `security-pill ${account.securityReady ? "ready" : "pending"}`
    )
  );
  const current = account.id === state.session?.id;
  if (current) badges.append(pill("Tu cuenta", "current-pill"));

  const meta = document.createElement("div");
  meta.className = "account-meta";
  meta.append(
    metric("Sesiones activas", String(Number(account.activeSessions || 0))),
    metric("Última actividad", formatDate(account.lastSeenAt))
  );

  const actions = document.createElement("div");
  actions.className = "account-actions";
  actions.append(button("Sesiones", "button secondary", () => openSessions(account)));

  if (!current) {
    actions.append(
      account.securityReady
        ? button("Restablecer seguridad", "button danger", () => resetSecurity(account))
        : button("Reenviar activación", "button secondary", () => sendSetup(account))
    );
    if (account.status === "ACTIVE") {
      actions.append(button("Suspender", "button danger", () => updateStatus(account, "SUSPENDED")));
    } else {
      actions.append(button("Reactivar", "button success", () => updateStatus(account, "ACTIVE")));
    }
  }

  card.append(header, badges, meta, roleEditor(account), actions);
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
    empty.textContent = term
      ? "No hay cuentas que coincidan con la búsqueda."
      : "Todavía no hay cuentas administrativas.";
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

function showSetup(account, setup = {}, { forced = false } = {}) {
  elements.setupTitle.textContent = forced
    ? "Recuperación obligatoria preparada"
    : account.securityReady
      ? "Acceso de recuperación preparado"
      : "Activación administrativa preparada";
  const delivery = setup.delivery || "disabled";
  const descriptions = {
    sent: forced
      ? "La cuenta ha quedado bloqueada, sus sesiones se han cerrado y el enlace de recuperación se ha enviado por correo."
      : "El enlace se ha enviado mediante el correo transaccional configurado.",
    failed: "La cuenta está guardada, pero el servidor de correo no pudo entregar el enlace.",
    disabled: "El correo está desactivado. La cuenta queda pendiente hasta configurar SMTP o generar otro enlace.",
    "manual-development": forced
      ? "La cuenta ha quedado bloqueada en desarrollo. Utiliza el enlace provisional para registrar una contraseña y un autenticador nuevos."
      : "El correo está desactivado en desarrollo. Usa el enlace provisional mostrado abajo."
  };
  elements.setupDescription.textContent = descriptions[delivery] || "El acceso se ha preparado.";
  const path = setup.recoveryPath || setup.setupPath || "";
  elements.setupLinkField.hidden = !path;
  elements.setupLink.value = path ? new URL(path, window.location.origin).toString() : "";
  if (!elements.setupDialog.open) elements.setupDialog.showModal();
}

function openSensitiveConfirmation({ title, description, submitLabel, execute }) {
  state.pendingConfirmation = execute;
  elements.confirmationTitle.textContent = title;
  elements.confirmationDescription.textContent = description;
  elements.confirmationSubmit.textContent = submitLabel;
  elements.confirmationForm.reset();
  setMessage(elements.confirmationMessage);
  if (!elements.confirmationDialog.open) elements.confirmationDialog.showModal();
  window.setTimeout(() => elements.confirmationPassword.focus(), 0);
}

async function updateStatus(account, status) {
  const action = status === "SUSPENDED" ? "suspender" : "reactivar";
  const execute = async (confirmationValue) => {
    setMessage(elements.message, "Actualizando cuenta…");
    await request(`/internal/admin/accounts/${account.id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status, ...(confirmationValue ? { confirmation: confirmationValue } : {}) })
    });
    setMessage(
      elements.message,
      `Cuenta ${status === "ACTIVE" ? "reactivada" : "suspendida"}.`,
      "success"
    );
    await loadAccounts();
  };

  if (account.role === "PLATFORM_OWNER") {
    openSensitiveConfirmation({
      title: `${status === "ACTIVE" ? "Reactivar" : "Suspender"} propietario`,
      description: `${account.displayName} tiene control total de la plataforma. Confirma tu identidad antes de ${action} esta cuenta.`,
      submitLabel: status === "ACTIVE" ? "Confirmar reactivación" : "Confirmar suspensión",
      execute
    });
    return;
  }
  if (!window.confirm(`¿Confirmas que quieres ${action} la cuenta de ${account.displayName}?`)) return;
  try {
    await execute(null);
  } catch (error) {
    setMessage(elements.message, error.message, "error");
  }
}

async function changeRole(account, role) {
  if (role === account.role) {
    setMessage(elements.message, "La cuenta ya tiene ese rol.");
    return;
  }
  openSensitiveConfirmation({
    title: "Cambiar permisos administrativos",
    description: `${account.displayName} pasará de «${roleNames[account.role]}» a «${roleNames[role]}». Sus sesiones actuales se cerrarán.`,
    submitLabel: "Confirmar cambio de rol",
    execute: async (confirmationValue) => {
      const payload = await request(`/internal/admin/accounts/${account.id}/role`, {
        method: "PATCH",
        body: JSON.stringify({ role, confirmation: confirmationValue })
      });
      setMessage(
        elements.message,
        payload.unchanged ? "La cuenta ya tenía ese rol." : "Rol actualizado y sesiones anteriores cerradas.",
        "success"
      );
      await loadAccounts();
    }
  });
}

async function resetSecurity(account) {
  openSensitiveConfirmation({
    title: "Forzar recuperación de seguridad",
    description: `Se cerrarán todas las sesiones de ${account.displayName}, se invalidará su autenticador actual y deberá crear una contraseña, un TOTP y códigos de recuperación nuevos.`,
    submitLabel: "Bloquear y enviar recuperación",
    execute: async (confirmationValue) => {
      const payload = await request(`/internal/admin/accounts/${account.id}/security-reset`, {
        method: "POST",
        body: JSON.stringify({ confirmation: confirmationValue })
      });
      showSetup(payload.account || account, payload.setup || {}, { forced: true });
      setMessage(elements.message, "Recuperación obligatoria iniciada.", "success");
      await loadAccounts();
    }
  });
}

async function sendSetup(account) {
  if (!window.confirm(`¿Reenviar la activación de ${account.displayName}?`)) return;
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

async function loadSessions(account) {
  setMessage(elements.sessionsMessage, "Cargando sesiones…");
  elements.sessionsList.replaceChildren();
  elements.revokeAll.hidden = true;
  try {
    const payload = await request(`/internal/admin/accounts/${account.id}/sessions`);
    renderSessions(Array.isArray(payload.sessions) ? payload.sessions : []);
    setMessage(elements.sessionsMessage);
  } catch (error) {
    setMessage(elements.sessionsMessage, error.message, "error");
  }
}

async function openSessions(account) {
  state.selectedAccount = account;
  elements.sessionsTitle.textContent = `Sesiones de ${account.displayName}`;
  if (!elements.sessionsDialog.open) elements.sessionsDialog.showModal();
  await loadSessions(account);
}

async function revokeSession(sessionId) {
  const account = state.selectedAccount;
  if (!account || !window.confirm("¿Cerrar esta sesión inmediatamente?")) return;
  try {
    await request(`/internal/admin/accounts/${account.id}/sessions/${sessionId}`, { method: "DELETE" });
    await loadSessions(account);
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

async function submitCreate(input, confirmationValue) {
  setMessage(elements.formMessage, "Creando cuenta…");
  const payload = await request("/internal/admin/accounts", {
    method: "POST",
    body: JSON.stringify({
      ...input,
      ...(confirmationValue ? { confirmation: confirmationValue } : {})
    })
  });
  elements.form.reset();
  if (elements.createDialog.open) elements.createDialog.close();
  showSetup(payload.account, payload.setup || {});
  await loadAccounts();
}

async function createAccount(event) {
  event.preventDefault();
  const formData = new FormData(elements.form);
  const input = {
    displayName: String(formData.get("displayName") || "").trim(),
    email: String(formData.get("email") || "").trim(),
    role: String(formData.get("role") || "")
  };
  if (!input.displayName || !input.email || !input.role) {
    setMessage(elements.formMessage, "Completa nombre, correo y rol.", "error");
    return;
  }

  if (input.role === "PLATFORM_OWNER") {
    if (elements.createDialog.open) elements.createDialog.close();
    openSensitiveConfirmation({
      title: "Crear otro propietario",
      description: `${input.displayName} recibirá control total sobre cuentas, proveedores, catálogo y contenido.`,
      submitLabel: "Confirmar nuevo propietario",
      execute: (confirmationValue) => submitCreate(input, confirmationValue)
    });
    return;
  }

  try {
    await submitCreate(input, null);
  } catch (error) {
    setMessage(elements.formMessage, error.message, "error");
  }
}

async function confirmSensitiveAction(event) {
  event.preventDefault();
  if (typeof state.pendingConfirmation !== "function") return;
  const password = elements.confirmationPassword.value;
  const code = elements.confirmationCode.value.trim();
  if (!password || !/^\d{6}$/.test(code)) {
    setMessage(
      elements.confirmationMessage,
      "Introduce tu contraseña y un código de seis dígitos.",
      "error"
    );
    return;
  }

  const execute = state.pendingConfirmation;
  setFormBusy(elements.confirmationForm, true);
  setMessage(elements.confirmationMessage, "Verificando identidad…");
  try {
    await execute({ password, code });
    state.pendingConfirmation = null;
    elements.confirmationForm.reset();
    elements.confirmationDialog.close();
  } catch (error) {
    setMessage(elements.confirmationMessage, errorText(error), "error");
  } finally {
    setFormBusy(elements.confirmationForm, false);
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
  if (!elements.createDialog.open) elements.createDialog.showModal();
});
document.querySelector("#refresh-button").addEventListener("click", loadAccounts);
document.querySelector("#logout-button").addEventListener("click", async () => {
  await fetch("/internal/admin/session", { method: "DELETE", credentials: "same-origin" });
  window.location.replace("/admin/proveedores/");
});
document.querySelector("#copy-setup-link").addEventListener("click", async (event) => {
  try {
    await navigator.clipboard.writeText(elements.setupLink.value);
    event.currentTarget.textContent = "Copiado";
  } catch {
    elements.setupLink.select();
  }
});
elements.confirmationDialog.addEventListener("close", () => {
  state.pendingConfirmation = null;
  elements.confirmationForm.reset();
  setMessage(elements.confirmationMessage);
});
elements.form.addEventListener("submit", createAccount);
elements.confirmationForm.addEventListener("submit", confirmSensitiveAction);
elements.search.addEventListener("input", render);
elements.revokeAll.addEventListener("click", revokeAllSessions);

void bootstrap();

const loginElements = {
  loginView: document.querySelector("#login-view"),
  passwordStep: document.querySelector("#password-step"),
  passwordForm: document.querySelector("#admin-password-form"),
  email: document.querySelector("#admin-email"),
  password: document.querySelector("#admin-password"),
  passwordMessage: document.querySelector("#admin-password-message"),
  factorStep: document.querySelector("#factor-step"),
  factorForm: document.querySelector("#admin-factor-form"),
  factorMethod: document.querySelector("#factor-method"),
  factorLabel: document.querySelector("#factor-label"),
  factorCode: document.querySelector("#admin-factor-code"),
  factorMessage: document.querySelector("#admin-factor-message"),
  factorAccount: document.querySelector("#factor-account"),
  backButton: document.querySelector("#back-to-password"),
  adminAccount: document.querySelector("#admin-account")
};

const roleLabels = {
  PLATFORM_OWNER: "Propietario de plataforma",
  PROVIDER_MANAGER: "Gestión de proveedores",
  EDITORIAL_REVIEWER: "Revisión editorial"
};

let challengeToken = null;
let submitting = false;

function message(element, text, type = "") {
  if (!element) return;
  element.textContent = text;
  element.className = `form-message${type ? ` ${type}` : ""}`;
}

function setFormBusy(form, busy) {
  if (!form) return;
  for (const control of form.elements) control.disabled = busy;
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
    payload = { error: "INVALID_RESPONSE", message: "El servidor ha devuelto una respuesta no válida." };
  }
  return { response, payload };
}

function resetFactor() {
  challengeToken = null;
  loginElements.factorForm?.reset();
  if (loginElements.factorStep) loginElements.factorStep.hidden = true;
  if (loginElements.passwordStep) loginElements.passwordStep.hidden = false;
  message(loginElements.factorMessage, "");
}

function showFactor(account) {
  if (loginElements.passwordStep) loginElements.passwordStep.hidden = true;
  if (loginElements.factorStep) loginElements.factorStep.hidden = false;
  if (loginElements.factorAccount) {
    const name = account?.displayName || "Cuenta administrativa";
    const role = roleLabels[account?.role] || account?.role || "Administración";
    loginElements.factorAccount.textContent = `${name} · ${role}`;
  }
  message(loginElements.passwordMessage, "");
  window.setTimeout(() => loginElements.factorCode?.focus(), 0);
}

function configureFactorInput() {
  if (!loginElements.factorCode || !loginElements.factorLabel) return;
  const recovery = loginElements.factorMethod?.value === "recovery";
  loginElements.factorLabel.textContent = recovery
    ? "Código de recuperación"
    : "Código de seis dígitos";
  loginElements.factorCode.placeholder = recovery
    ? "ABCD-EFGH-IJKL-MNOP"
    : "000000";
  loginElements.factorCode.inputMode = recovery ? "text" : "numeric";
  loginElements.factorCode.maxLength = recovery ? 19 : 6;
  loginElements.factorCode.value = "";
  loginElements.factorCode.focus();
}

function errorText(payload, fallback) {
  if (payload?.error === "ADMIN_LOGIN_THROTTLED") {
    const seconds = Number(payload?.details?.retryAfterSeconds);
    return Number.isFinite(seconds)
      ? `Demasiados intentos. Vuelve a probar dentro de ${Math.ceil(seconds / 60)} minuto(s).`
      : "Demasiados intentos. Espera antes de volver a probar.";
  }
  if (payload?.error === "ADMIN_ACCOUNT_NOT_READY") {
    return "La cuenta todavía no ha completado su activación de seguridad.";
  }
  if (payload?.error === "ADMIN_LOGIN_CHALLENGE_UNAVAILABLE") {
    return "La verificación ha caducado. Vuelve a introducir la contraseña.";
  }
  return payload?.message || fallback;
}

function ensureAccountsLink(role) {
  const actions = document.querySelector(".topbar-actions");
  if (!actions) return;
  let link = document.querySelector("#admin-accounts-link");
  if (role !== "PLATFORM_OWNER") {
    link?.remove();
    return;
  }
  if (link) return;
  link = document.createElement("a");
  link.id = "admin-accounts-link";
  link.className = "button secondary";
  link.href = "/admin/cuentas/";
  link.textContent = "Cuentas";
  const refreshButton = document.querySelector("#refresh-button");
  actions.insertBefore(link, refreshButton || null);
}

function applyRoleInterface(role) {
  ensureAccountsLink(role);
  const productLink = document.querySelector('a[href="/admin/articulos/"]');
  const blogLink = document.querySelector('a[href="/admin/publicaciones/"]');
  if (role === "PROVIDER_MANAGER") {
    if (productLink) productLink.hidden = true;
    if (blogLink) blogLink.hidden = true;
    return;
  }
  if (role === "EDITORIAL_REVIEWER") {
    window.location.replace("/admin/articulos/");
    return;
  }
  if (role !== "PLATFORM_OWNER") {
    const adminView = document.querySelector("#admin-view");
    if (adminView) adminView.hidden = true;
    message(loginElements.passwordMessage, "El rol administrativo no está reconocido.", "error");
  }
}

loginElements.passwordForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (submitting) return;
  const email = loginElements.email?.value.trim() ?? "";
  const password = loginElements.password?.value ?? "";
  if (!email || !password) {
    message(loginElements.passwordMessage, "Introduce el correo y la contraseña.", "error");
    return;
  }

  submitting = true;
  setFormBusy(loginElements.passwordForm, true);
  message(loginElements.passwordMessage, "Comprobando la cuenta…");
  try {
    const { response, payload } = await request("/internal/admin-auth/password", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
    if (!response.ok || typeof payload.challengeToken !== "string") {
      throw Object.assign(new Error(errorText(payload, "No se pudo iniciar sesión.")), { payload });
    }
    challengeToken = payload.challengeToken;
    loginElements.password.value = "";
    showFactor(payload.account);
  } catch (error) {
    message(loginElements.passwordMessage, error.message, "error");
  } finally {
    submitting = false;
    setFormBusy(loginElements.passwordForm, false);
  }
});

loginElements.factorForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (submitting || !challengeToken) return;
  const value = loginElements.factorCode?.value.trim().toUpperCase() ?? "";
  if (!value) {
    message(loginElements.factorMessage, "Introduce el código de verificación.", "error");
    return;
  }

  const recovery = loginElements.factorMethod?.value === "recovery";
  submitting = true;
  setFormBusy(loginElements.factorForm, true);
  message(loginElements.factorMessage, "Verificando el segundo factor…");
  try {
    const { response, payload } = await request("/internal/admin-auth/second-factor", {
      method: "POST",
      body: JSON.stringify({
        challengeToken,
        ...(recovery ? { recoveryCode: value } : { code: value })
      })
    });
    if (!response.ok || payload.authenticated !== true) {
      const remaining = Number(payload?.details?.attemptsRemaining);
      const suffix = Number.isFinite(remaining) ? ` Quedan ${remaining} intento(s).` : "";
      throw new Error(`${errorText(payload, "El código no es correcto.")}${suffix}`);
    }
    message(loginElements.factorMessage, "Acceso confirmado. Abriendo Administración…", "success");
    challengeToken = null;
    window.location.reload();
  } catch (error) {
    message(loginElements.factorMessage, error.message, "error");
  } finally {
    submitting = false;
    setFormBusy(loginElements.factorForm, false);
  }
});

loginElements.factorMethod?.addEventListener("change", configureFactorInput);
loginElements.backButton?.addEventListener("click", () => {
  resetFactor();
  window.setTimeout(() => loginElements.email?.focus(), 0);
});

async function updateAccountBadge() {
  try {
    const { response, payload } = await request("/internal/admin/session", { method: "GET" });
    if (!response.ok || payload.authenticated !== true) return;
    const name = payload.account?.displayName || payload.account?.email || "Administración";
    const role = roleLabels[payload.account?.role] || payload.account?.role || "Sesión verificada";
    if (loginElements.adminAccount) loginElements.adminAccount.textContent = `${name} · ${role}`;
    applyRoleInterface(payload.account?.role);
  } catch {
    // La pantalla principal ya gestiona una sesión no disponible.
  }
}

if (loginElements.loginView) {
  new MutationObserver(() => {
    if (!loginElements.loginView.hidden && !challengeToken) {
      resetFactor();
      window.setTimeout(() => loginElements.email?.focus(), 0);
    }
  }).observe(loginElements.loginView, { attributes: true, attributeFilter: ["hidden"] });
}

function addRecoveryLink() {
  const form = loginElements.passwordForm;
  if (!form || document.querySelector("#admin-recovery-link")) return;
  const link = document.createElement("a");
  link.id = "admin-recovery-link";
  link.className = "text-button full";
  link.href = "/admin/recuperar/";
  link.textContent = "He olvidado la contraseña o perdido el autenticador";
  form.append(link);
}

addRecoveryLink();
configureFactorInput();
void updateAccountBadge();

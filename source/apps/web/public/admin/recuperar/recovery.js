const elements = {
  requestView: document.querySelector("#request-view"),
  requestForm: document.querySelector("#request-form"),
  email: document.querySelector("#recovery-email"),
  requestMessage: document.querySelector("#request-message"),
  developmentBox: document.querySelector("#development-link-box"),
  developmentLink: document.querySelector("#development-link"),
  setupView: document.querySelector("#setup-view"),
  accountLabel: document.querySelector("#account-label"),
  qr: document.querySelector("#recovery-qr"),
  manualKey: document.querySelector("#manual-key"),
  confirmForm: document.querySelector("#confirm-form"),
  password: document.querySelector("#new-password"),
  repeatPassword: document.querySelector("#repeat-password"),
  code: document.querySelector("#totp-code"),
  confirmMessage: document.querySelector("#confirm-message"),
  successView: document.querySelector("#success-view"),
  recoveryCodes: document.querySelector("#recovery-codes"),
  copyCodes: document.querySelector("#copy-codes"),
  copyMessage: document.querySelector("#copy-message"),
  invalidView: document.querySelector("#invalid-view"),
  invalidMessage: document.querySelector("#invalid-message"),
  restartButton: document.querySelector("#restart-button")
};

const roleLabels = {
  PLATFORM_OWNER: "Propietario de plataforma",
  PROVIDER_MANAGER: "Gestión de proveedores",
  EDITORIAL_REVIEWER: "Revisión editorial"
};

let recoveryToken = null;
let visibleCodes = [];
let submitting = false;

function message(element, text, type = "") {
  if (!element) return;
  element.textContent = text;
  element.className = `form-message${type ? ` ${type}` : ""}`;
}

function show(view) {
  for (const element of [
    elements.requestView,
    elements.setupView,
    elements.successView,
    elements.invalidView
  ]) {
    if (element) element.hidden = element !== view;
  }
}

function setBusy(form, busy) {
  if (!form) return;
  for (const control of form.elements) control.disabled = busy;
}

async function request(path, body) {
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = {
      error: "INVALID_RESPONSE",
      message: "El servidor ha devuelto una respuesta no válida."
    };
  }
  return { response, payload };
}

function unavailableText(payload) {
  if (payload?.error === "INVALID_ADMIN_RECOVERY_CODE") {
    const remaining = Number(payload?.details?.attemptsRemaining);
    return Number.isFinite(remaining)
      ? `El código no es correcto. Quedan ${remaining} intento(s).`
      : "El código no es correcto.";
  }
  if (payload?.error === "VALIDATION_ERROR") return payload.message;
  if (payload?.error === "ADMIN_RECOVERY_UNAVAILABLE") {
    return "El enlace ha caducado, ya se utilizó o fue sustituido por otro más reciente.";
  }
  return payload?.message || "No se pudo completar la recuperación.";
}

function invalidate(text) {
  recoveryToken = null;
  if (elements.invalidMessage) elements.invalidMessage.textContent = text;
  show(elements.invalidView);
}

async function beginRecovery(token) {
  recoveryToken = token;
  show(elements.setupView);
  message(elements.confirmMessage, "Preparando un autenticador nuevo…");
  try {
    const { response, payload } = await request("/internal/admin-recovery/begin", { token });
    if (!response.ok || typeof payload.qrDataUrl !== "string" || typeof payload.manualKey !== "string") {
      invalidate(unavailableText(payload));
      return;
    }
    const accountName = payload.account?.displayName || payload.account?.email || "Cuenta administrativa";
    const role = roleLabels[payload.account?.role] || payload.account?.role || "Administración";
    if (elements.accountLabel) {
      elements.accountLabel.textContent = `${accountName} · ${role}. Escanea el QR antes de guardar la contraseña nueva.`;
    }
    if (elements.qr) elements.qr.src = payload.qrDataUrl;
    if (elements.manualKey) elements.manualKey.textContent = payload.manualKey;
    message(elements.confirmMessage, "");
    window.setTimeout(() => elements.password?.focus(), 0);
  } catch {
    invalidate("La recuperación no responde. Vuelve a solicitar un enlace más tarde.");
  }
}

elements.requestForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (submitting) return;
  const email = elements.email?.value.trim() ?? "";
  if (!email) {
    message(elements.requestMessage, "Introduce el correo administrativo.", "error");
    return;
  }

  submitting = true;
  setBusy(elements.requestForm, true);
  message(elements.requestMessage, "Solicitando un enlace seguro…");
  if (elements.developmentBox) elements.developmentBox.hidden = true;
  try {
    const { response, payload } = await request("/internal/admin-recovery/request", { email });
    if (!response.ok || payload.accepted !== true) {
      throw new Error(payload?.message || "No se pudo solicitar la recuperación.");
    }
    message(
      elements.requestMessage,
      "Si la cuenta está activa, recibirás un correo con un enlace de un solo uso.",
      "success"
    );
    if (typeof payload.recoveryPath === "string" && elements.developmentLink && elements.developmentBox) {
      elements.developmentLink.href = payload.recoveryPath;
      elements.developmentBox.hidden = false;
    }
  } catch (error) {
    message(elements.requestMessage, error.message, "error");
  } finally {
    submitting = false;
    setBusy(elements.requestForm, false);
  }
});

elements.confirmForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (submitting || !recoveryToken) return;
  const password = elements.password?.value ?? "";
  const repeated = elements.repeatPassword?.value ?? "";
  const code = elements.code?.value.trim() ?? "";
  if (password !== repeated) {
    message(elements.confirmMessage, "Las dos contraseñas no coinciden.", "error");
    return;
  }
  if (password.length < 12) {
    message(elements.confirmMessage, "La contraseña debe tener al menos 12 caracteres.", "error");
    return;
  }
  if (!/^\d{6}$/.test(code)) {
    message(elements.confirmMessage, "Introduce los seis dígitos del autenticador nuevo.", "error");
    return;
  }

  submitting = true;
  setBusy(elements.confirmForm, true);
  message(elements.confirmMessage, "Sustituyendo las credenciales y cerrando sesiones…");
  try {
    const { response, payload } = await request("/internal/admin-recovery/confirm", {
      token: recoveryToken,
      password,
      code
    });
    if (!response.ok || payload.recovered !== true || !Array.isArray(payload.recoveryCodes)) {
      if (payload?.error === "ADMIN_RECOVERY_UNAVAILABLE") {
        invalidate(unavailableText(payload));
        return;
      }
      throw new Error(unavailableText(payload));
    }

    recoveryToken = null;
    visibleCodes = payload.recoveryCodes.filter((value) => typeof value === "string");
    if (elements.password) elements.password.value = "";
    if (elements.repeatPassword) elements.repeatPassword.value = "";
    if (elements.code) elements.code.value = "";
    if (elements.qr) elements.qr.removeAttribute("src");
    if (elements.manualKey) elements.manualKey.textContent = "";
    if (elements.recoveryCodes) {
      const nodes = visibleCodes.map((value) => {
        const codeElement = document.createElement("code");
        codeElement.textContent = value;
        return codeElement;
      });
      elements.recoveryCodes.replaceChildren(...nodes);
    }
    show(elements.successView);
  } catch (error) {
    message(elements.confirmMessage, error.message, "error");
  } finally {
    submitting = false;
    setBusy(elements.confirmForm, false);
  }
});

elements.copyCodes?.addEventListener("click", async () => {
  if (visibleCodes.length === 0) return;
  try {
    await navigator.clipboard.writeText(visibleCodes.join("\n"));
    message(elements.copyMessage, "Códigos copiados. Guárdalos en un lugar seguro.", "success");
  } catch {
    message(elements.copyMessage, "No se pudieron copiar. Selecciónalos y guárdalos manualmente.", "error");
  }
});

elements.restartButton?.addEventListener("click", () => {
  show(elements.requestView);
  message(elements.requestMessage, "");
  window.setTimeout(() => elements.email?.focus(), 0);
});

const initialUrl = new URL(window.location.href);
const initialToken = initialUrl.searchParams.get("token");
if (initialToken) {
  history.replaceState({}, "", "/admin/recuperar/");
  void beginRecovery(initialToken);
} else {
  show(elements.requestView);
  window.setTimeout(() => elements.email?.focus(), 0);
}

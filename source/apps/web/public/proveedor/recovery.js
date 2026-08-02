const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,180}$/;
const TWO_FACTOR_SESSION_KEY = "atelier_provider_2fa_setup";

function byId(id) {
  return document.getElementById(id);
}

function queryToken() {
  const value = new URL(window.location.href).searchParams.get("token")?.trim() ?? "";
  return TOKEN_PATTERN.test(value) ? value : null;
}

function setMessage(element, text = "", type = "") {
  if (!element) return;
  element.textContent = text;
  element.className = `message${type ? ` ${type}` : ""}`;
}

function setBusy(button, busy, text = "Procesando…") {
  if (!button) return;
  if (busy) {
    button.dataset.originalText = button.textContent;
    button.textContent = text;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
    button.disabled = false;
    delete button.dataset.originalText;
  }
}

async function postJson(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({
    message: "El servidor ha devuelto una respuesta no válida."
  }));
  if (!response.ok) {
    const error = new Error(payload.message || "No se pudo completar la operación.");
    error.code = payload.error;
    error.details = payload.details;
    throw error;
  }
  return payload;
}

function showDevelopmentLink(result, linkId) {
  const link = byId(linkId);
  if (!link || !result.recoveryPath) return;
  link.href = result.recoveryPath;
  link.hidden = false;
}

function requestPage() {
  const passwordForm = byId("password-request-form");
  const twoFactorForm = byId("two-factor-request-form");

  passwordForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = byId("password-request-submit");
    const message = byId("password-request-message");
    setBusy(button, true, "Enviando…");
    setMessage(message);
    try {
      const result = await postJson("/internal/provider-recovery/password/request", {
        email: byId("password-request-email").value.trim()
      });
      setMessage(
        message,
        "Si la cuenta puede recuperarse, recibirás un correo con los siguientes pasos.",
        "success"
      );
      showDevelopmentLink(result, "password-development-link");
    } catch (error) {
      setMessage(message, error.message, "error");
    } finally {
      setBusy(button, false);
    }
  });

  twoFactorForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = byId("two-factor-request-submit");
    const message = byId("two-factor-request-message");
    setBusy(button, true, "Comprobando…");
    setMessage(message);
    try {
      const result = await postJson("/internal/provider-recovery/two-factor/request", {
        email: byId("two-factor-request-email").value.trim(),
        password: byId("two-factor-request-password").value
      });
      setMessage(
        message,
        "Si los datos son correctos, recibirás un enlace para sustituir el autenticador.",
        "success"
      );
      byId("two-factor-request-password").value = "";
      showDevelopmentLink(result, "two-factor-development-link");
    } catch (error) {
      setMessage(message, error.message, "error");
    } finally {
      setBusy(button, false);
    }
  });
}

function passwordResetPage() {
  const token = queryToken();
  const form = byId("password-reset-form");
  const unavailable = byId("recovery-unavailable");
  if (!token) {
    form.hidden = true;
    unavailable.hidden = false;
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const password = byId("new-password").value;
    const confirmation = byId("new-password-confirmation").value;
    const message = byId("password-reset-message");
    const button = byId("password-reset-submit");
    if (password !== confirmation) {
      setMessage(message, "Las contraseñas no coinciden.", "error");
      return;
    }

    setBusy(button, true, "Guardando…");
    setMessage(message);
    try {
      await postJson("/internal/provider-recovery/password/confirm", { token, password });
      form.hidden = true;
      byId("password-reset-success").hidden = false;
    } catch (error) {
      setMessage(message, error.message, "error");
    } finally {
      setBusy(button, false);
    }
  });
}

function twoFactorResetPage() {
  const token = queryToken();
  const action = byId("two-factor-reset-action");
  const unavailable = byId("recovery-unavailable");
  if (!token) {
    action.hidden = true;
    unavailable.hidden = false;
    return;
  }

  byId("two-factor-reset-submit").addEventListener("click", async () => {
    const button = byId("two-factor-reset-submit");
    const message = byId("two-factor-reset-message");
    setBusy(button, true, "Preparando…");
    setMessage(message);
    try {
      const result = await postJson("/internal/provider-recovery/two-factor/confirm", { token });
      sessionStorage.setItem(TWO_FACTOR_SESSION_KEY, JSON.stringify({
        token: result.twoFactorSetupToken,
        expiresAt: result.twoFactorSetupExpiresAt,
        providerName: result.provider.displayName
      }));
      window.location.assign("/proveedor/configurar-2fa/");
    } catch (error) {
      setMessage(message, error.message, "error");
      setBusy(button, false);
    }
  });
}

const page = document.body.dataset.page;
if (page === "recovery-request") requestPage();
if (page === "password-reset") passwordResetPage();
if (page === "two-factor-reset") twoFactorResetPage();

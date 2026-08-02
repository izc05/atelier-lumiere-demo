const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,180}$/;
const TWO_FACTOR_SESSION_KEY = "atelier_provider_2fa_setup";
const RECOVERY_SESSION_KEY = "atelier_provider_recovery_once";

function byId(id) {
  return document.getElementById(id);
}

function queryToken() {
  const token = new URL(window.location.href).searchParams.get("token")?.trim() ?? "";
  return TOKEN_PATTERN.test(token) ? token : null;
}

function setMessage(element, text = "", type = "") {
  if (!element) return;
  element.textContent = text;
  element.className = `message${type ? ` ${type}` : ""}`;
}

function setBusy(button, busy, busyText = "Procesando…") {
  if (!button) return;
  if (busy) {
    button.dataset.originalText = button.textContent;
    button.textContent = busyText;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
    button.disabled = false;
  }
}

async function postJson(path, payload) {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  let body;
  try {
    body = await response.json();
  } catch {
    body = { message: "El servidor ha devuelto una respuesta no válida." };
  }

  if (!response.ok) {
    const error = new Error(body.message || "No se pudo completar la operación.");
    error.code = body.error;
    error.details = body.details;
    error.status = response.status;
    throw error;
  }
  return body;
}

function formatDate(value) {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat("es-ES", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(value));
  } catch {
    return "";
  }
}

async function activationPage() {
  const token = queryToken();
  const loading = byId("activation-loading");
  const unavailable = byId("activation-unavailable");
  const content = byId("activation-content");
  const form = byId("activation-form");
  const message = byId("activation-message");

  if (!token) {
    loading.hidden = true;
    unavailable.hidden = false;
    return;
  }

  try {
    const preview = await postJson("/internal/provider/invitation-preview", { token });
    byId("provider-name").textContent = preview.provider.displayName;
    byId("provider-specialty").textContent = preview.provider.specialty;
    byId("provider-email").textContent = preview.invitation.emailMasked;
    byId("invitation-expiry").textContent = formatDate(preview.invitation.expiresAt);
    loading.hidden = true;
    content.hidden = false;
  } catch (error) {
    loading.hidden = true;
    unavailable.hidden = false;
    setMessage(byId("activation-unavailable-message"), error.message, "error");
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = byId("activation-submit");
    const displayName = byId("display-name").value.trim();
    const password = byId("password").value;
    const confirmation = byId("password-confirmation").value;

    if (password !== confirmation) {
      setMessage(message, "Las contraseñas no coinciden.", "error");
      return;
    }

    setBusy(submit, true, "Creando cuenta…");
    setMessage(message);
    try {
      const result = await postJson("/internal/provider/invitation-accept", {
        token,
        displayName,
        password
      });
      form.hidden = true;
      byId("activation-success").hidden = false;
      if (result.verificationPath) {
        byId("continue-verification").href = result.verificationPath;
        byId("continue-verification").hidden = false;
      } else {
        byId("verification-email-note").hidden = false;
      }
    } catch (error) {
      setMessage(message, error.message, "error");
    } finally {
      setBusy(submit, false);
    }
  });
}

async function emailVerificationPage() {
  const token = queryToken();
  const verifyButton = byId("verify-email-button");
  const resendButton = byId("resend-email-button");
  const message = byId("email-message");

  if (!token) {
    byId("email-actions").hidden = true;
    setMessage(message, "Este enlace de verificación no es válido.", "error");
    return;
  }

  verifyButton.addEventListener("click", async () => {
    setBusy(verifyButton, true, "Verificando…");
    resendButton.disabled = true;
    setMessage(message);
    try {
      const result = await postJson("/internal/provider/email-verify", { token });
      sessionStorage.setItem(TWO_FACTOR_SESSION_KEY, JSON.stringify({
        token: result.twoFactorSetupToken,
        expiresAt: result.twoFactorSetupExpiresAt,
        providerName: result.provider.displayName
      }));
      window.location.assign("/proveedor/configurar-2fa/");
    } catch (error) {
      setMessage(message, error.message, "error");
      resendButton.disabled = false;
    } finally {
      setBusy(verifyButton, false);
    }
  });

  resendButton.addEventListener("click", async () => {
    setBusy(resendButton, true, "Enviando…");
    verifyButton.disabled = true;
    setMessage(message);
    try {
      const result = await postJson("/internal/provider/email-resend", { token });
      if (result.verificationPath) {
        setMessage(message, "Se ha generado un enlace nuevo. Abriéndolo ahora…", "success");
        window.location.assign(result.verificationPath);
      } else {
        setMessage(message, "Te hemos enviado un enlace nuevo. Revisa tu correo.", "success");
      }
    } catch (error) {
      if (error.code === "EMAIL_VERIFICATION_RESEND_TOO_SOON") {
        const seconds = error.details?.retryAfterSeconds;
        setMessage(message, `Espera ${seconds || "unos"} segundos antes de solicitar otro enlace.`, "warning");
      } else {
        setMessage(message, error.message, "error");
      }
    } finally {
      setBusy(resendButton, false);
      verifyButton.disabled = false;
    }
  });
}

function readTwoFactorSession() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(TWO_FACTOR_SESSION_KEY));
    if (!parsed || !TOKEN_PATTERN.test(parsed.token)) return null;
    if (parsed.expiresAt && new Date(parsed.expiresAt).getTime() <= Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function twoFactorPage() {
  const session = readTwoFactorSession();
  const loading = byId("two-factor-loading");
  const unavailable = byId("two-factor-unavailable");
  const content = byId("two-factor-content");
  const message = byId("two-factor-message");

  if (!session) {
    loading.hidden = true;
    unavailable.hidden = false;
    return;
  }

  let setup;
  try {
    setup = await postJson("/internal/provider/two-factor-setup", { token: session.token });
    byId("two-factor-provider").textContent = setup.provider.displayName;
    byId("two-factor-qr").src = setup.qrDataUrl;
    byId("two-factor-secret").textContent = setup.secret;
    byId("open-authenticator").href = setup.otpauthUri;
    byId("setup-expiry").textContent = formatDate(setup.setupExpiresAt);
    byId("attempts-remaining").textContent = String(setup.attemptsRemaining);
    loading.hidden = true;
    content.hidden = false;
  } catch (error) {
    loading.hidden = true;
    unavailable.hidden = false;
    setMessage(byId("two-factor-unavailable-message"), error.message, "error");
    return;
  }

  byId("copy-secret").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(setup.secret);
      setMessage(message, "Clave copiada.", "success");
    } catch {
      setMessage(message, "No se pudo copiar. Mantén pulsada la clave para seleccionarla.", "warning");
    }
  });

  byId("two-factor-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = byId("two-factor-submit");
    const code = byId("two-factor-code").value.replace(/\s/g, "");
    setBusy(submit, true, "Comprobando…");
    setMessage(message);
    try {
      const result = await postJson("/internal/provider/two-factor-confirm", {
        token: session.token,
        code
      });
      sessionStorage.removeItem(TWO_FACTOR_SESSION_KEY);
      sessionStorage.setItem(RECOVERY_SESSION_KEY, JSON.stringify({
        recoveryCodes: result.recoveryCodes,
        provider: result.provider,
        user: result.user,
        membership: result.membership,
        createdAt: new Date().toISOString()
      }));
      window.location.assign("/proveedor/codigos-recuperacion/");
    } catch (error) {
      if (error.code === "INVALID_TWO_FACTOR_CODE") {
        const remaining = error.details?.attemptsRemaining;
        if (Number.isInteger(remaining)) byId("attempts-remaining").textContent = String(remaining);
        byId("two-factor-code").select();
      }
      setMessage(message, error.message, "error");
    } finally {
      setBusy(submit, false);
    }
  });
}

function readRecoverySession() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(RECOVERY_SESSION_KEY));
    if (!parsed || !Array.isArray(parsed.recoveryCodes) || parsed.recoveryCodes.length !== 10) return null;
    if (Date.now() - new Date(parsed.createdAt).getTime() > 30 * 60 * 1000) return null;
    return parsed;
  } catch {
    return null;
  }
}

function recoveryPage() {
  const data = readRecoverySession();
  const unavailable = byId("recovery-unavailable");
  const content = byId("recovery-content");
  const message = byId("recovery-message");

  if (!data) {
    unavailable.hidden = false;
    return;
  }

  byId("recovery-provider").textContent = data.provider.displayName;
  const grid = byId("recovery-grid");
  for (const code of data.recoveryCodes) {
    const item = document.createElement("code");
    item.className = "recovery-code";
    item.textContent = code;
    grid.append(item);
  }
  content.hidden = false;

  const plainText = [
    "Atelier Lumière — códigos de recuperación",
    `Taller: ${data.provider.displayName}`,
    "",
    ...data.recoveryCodes,
    "",
    "Cada código solo puede utilizarse una vez. Guárdalos fuera del dispositivo habitual."
  ].join("\n");

  byId("copy-codes").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(data.recoveryCodes.join("\n"));
      setMessage(message, "Códigos copiados.", "success");
    } catch {
      setMessage(message, "No se pudieron copiar automáticamente.", "warning");
    }
  });

  byId("download-codes").addEventListener("click", () => {
    const blob = new Blob([plainText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "atelier-lumiere-codigos-recuperacion.txt";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  byId("print-codes").addEventListener("click", () => window.print());

  const saved = byId("codes-saved");
  const finish = byId("finish-onboarding");
  saved.addEventListener("change", () => {
    finish.disabled = !saved.checked;
  });
  finish.addEventListener("click", () => {
    if (!saved.checked) return;
    sessionStorage.removeItem(RECOVERY_SESSION_KEY);
    content.hidden = true;
    byId("onboarding-complete").hidden = false;
    byId("complete-provider").textContent = data.provider.displayName;
  });
}

const page = document.body.dataset.page;
if (page === "activation") void activationPage();
if (page === "email-verification") void emailVerificationPage();
if (page === "two-factor") void twoFactorPage();
if (page === "recovery") recoveryPage();

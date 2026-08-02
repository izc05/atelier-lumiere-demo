const CHALLENGE_KEY = "atelier_provider_login_challenge";

function byId(id) {
  return document.getElementById(id);
}

function setMessage(element, text = "", type = "") {
  if (!element) return;
  element.textContent = text;
  element.className = `message${type ? ` ${type}` : ""}`;
}

function setBusy(button, busy, busyText) {
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

async function requestJson(path, { method = "POST", body } = {}) {
  const response = await fetch(path, {
    method,
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const payload = await response.json().catch(() => ({
    message: "El servidor ha devuelto una respuesta no válida."
  }));
  if (!response.ok) {
    const error = new Error(payload.message || "No se pudo completar el acceso.");
    error.code = payload.error;
    error.details = payload.details;
    error.status = response.status;
    throw error;
  }
  return payload;
}

function formatDate(value) {
  try {
    return new Intl.DateTimeFormat("es-ES", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(value));
  } catch {
    return "";
  }
}

function saveChallenge(value) {
  sessionStorage.setItem(CHALLENGE_KEY, JSON.stringify(value));
}

function loadChallenge() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(CHALLENGE_KEY));
    if (!parsed?.challengeToken || !parsed?.expiresAt) return null;
    if (new Date(parsed.expiresAt).getTime() <= Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

function clearChallenge() {
  sessionStorage.removeItem(CHALLENGE_KEY);
}

function showPasswordStage() {
  clearChallenge();
  byId("password-stage").hidden = false;
  byId("factor-stage").hidden = true;
  byId("pending-approval").hidden = true;
  byId("access-title").textContent = "Inicia sesión";
  byId("access-description").textContent = "Tu taller debe estar aprobado por Administración para poder crear una sesión.";
  byId("access-progress-password").className = "current";
  byId("access-progress-factor").className = "";
  byId("access-progress-label").textContent = "Paso 1 de 2 · Correo y contraseña";
}

function showFactorStage(challenge) {
  byId("password-stage").hidden = true;
  byId("factor-stage").hidden = false;
  byId("pending-approval").hidden = true;
  byId("access-title").textContent = "Confirma el segundo factor";
  byId("access-description").textContent = "Utiliza tu aplicación autenticadora o uno de los códigos de recuperación.";
  byId("login-provider").textContent = challenge.provider?.displayName || "Tu taller";
  byId("challenge-expiry").textContent = formatDate(challenge.expiresAt);
  byId("login-attempts").textContent = String(challenge.attemptsRemaining ?? 5);
  byId("access-progress-password").className = "done";
  byId("access-progress-factor").className = "current";
  byId("access-progress-label").textContent = "Paso 2 de 2 · Segundo factor";
  byId("login-code").focus();
}

function showPendingApproval() {
  clearChallenge();
  byId("password-stage").hidden = true;
  byId("factor-stage").hidden = true;
  byId("pending-approval").hidden = false;
  byId("access-title").textContent = "Pendiente de aprobación";
  byId("access-description").textContent = "La cuenta está protegida y lista para que Administración active el taller.";
}

async function redirectIfAuthenticated() {
  try {
    const session = await requestJson("/internal/provider/session", { method: "GET" });
    if (session.authenticated) window.location.replace("/proveedor/panel/");
  } catch {
    // Correcto: no existe una sesión activa.
  }
}

byId("password-stage").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = byId("password-submit");
  const message = byId("password-message");
  setBusy(button, true, "Comprobando…");
  setMessage(message);

  try {
    const challenge = await requestJson("/internal/provider-auth/password", {
      body: {
        email: byId("login-email").value.trim(),
        password: byId("login-password").value
      }
    });
    const stored = {
      challengeToken: challenge.challengeToken,
      expiresAt: challenge.expiresAt,
      provider: challenge.provider,
      attemptsRemaining: challenge.attemptsRemaining
    };
    saveChallenge(stored);
    byId("login-password").value = "";
    showFactorStage(stored);
  } catch (error) {
    if (error.code === "PROVIDER_PENDING_APPROVAL") {
      showPendingApproval();
    } else if (error.code === "LOGIN_THROTTLED") {
      const seconds = error.details?.retryAfterSeconds;
      setMessage(message, `Demasiados intentos. Espera ${seconds || "unos"} segundos.`, "warning");
    } else {
      setMessage(message, error.message, "error");
    }
  } finally {
    setBusy(button, false);
  }
});

byId("factor-stage").addEventListener("submit", async (event) => {
  event.preventDefault();
  const challenge = loadChallenge();
  const button = byId("factor-submit");
  const message = byId("factor-message");

  if (!challenge) {
    setMessage(message, "El desafío ha caducado. Vuelve a iniciar el acceso.", "error");
    return;
  }

  setBusy(button, true, "Verificando…");
  setMessage(message);
  try {
    await requestJson("/internal/provider-auth/second-factor", {
      body: {
        challengeToken: challenge.challengeToken,
        code: byId("login-code").value.trim().toUpperCase()
      }
    });
    clearChallenge();
    window.location.assign("/proveedor/panel/");
  } catch (error) {
    if (error.code === "INVALID_SECOND_FACTOR") {
      const remaining = error.details?.attemptsRemaining;
      if (Number.isInteger(remaining)) {
        byId("login-attempts").textContent = String(remaining);
        challenge.attemptsRemaining = remaining;
        saveChallenge(challenge);
      }
      if (error.details?.locked) clearChallenge();
      byId("login-code").select();
    }
    setMessage(message, error.message, "error");
  } finally {
    setBusy(button, false);
  }
});

byId("restart-login").addEventListener("click", () => {
  byId("login-code").value = "";
  setMessage(byId("factor-message"));
  showPasswordStage();
});

const existingChallenge = loadChallenge();
if (existingChallenge) showFactorStage(existingChallenge);
else showPasswordStage();
void redirectIfAuthenticated();

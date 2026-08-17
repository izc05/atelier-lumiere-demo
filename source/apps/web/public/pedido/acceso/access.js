(() => {
  const message = document.getElementById("access-message");
  const spinner = document.getElementById("access-spinner");
  const home = document.getElementById("access-home");
  const recoveryForm = document.getElementById("access-recovery-form");
  const recoveryEmail = document.getElementById("recovery-email");
  const recoveryOrder = document.getElementById("recovery-order");
  const recoveryButton = document.getElementById("recovery-button");
  const recoveryResult = document.getElementById("recovery-result");
  const tokenPattern = /^[A-Za-z0-9_-]{32,180}$/;
  const genericRecoveryMessage = "Si los datos corresponden a un pedido, enviaremos un nuevo enlace privado al correo de compra.";

  function accessTokenFromHash() {
    const raw = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
    if (tokenPattern.test(raw)) return raw;
    const value = new URLSearchParams(raw).get("token") ?? "";
    return tokenPattern.test(value) ? value : "";
  }

  const token = accessTokenFromHash();
  window.history.replaceState(null, "", window.location.pathname);

  function showRecovery(text) {
    message.textContent = text;
    spinner.hidden = true;
    recoveryForm.hidden = false;
    home.hidden = false;
  }

  recoveryForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    recoveryButton.disabled = true;
    recoveryButton.textContent = "Solicitando acceso…";
    recoveryResult.textContent = "";
    recoveryResult.className = "message";
    try {
      const response = await fetch("/internal/customer/access/request", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          email: recoveryEmail.value.trim(),
          orderNumber: recoveryOrder.value.trim()
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || "No se ha podido solicitar un nuevo acceso.");
      recoveryResult.textContent = genericRecoveryMessage;
      recoveryResult.className = "message success";
      recoveryForm.reset();
    } catch (error) {
      recoveryResult.textContent = error.message;
      recoveryResult.className = "message error";
    } finally {
      recoveryButton.disabled = false;
      recoveryButton.textContent = "Enviar nuevo acceso";
    }
  });

  async function activate() {
    if (!token) {
      showRecovery("Este enlace ya no contiene una clave de acceso válida. Puedes solicitar un nuevo acceso de forma segura.");
      return;
    }
    try {
      const response = await fetch("/internal/customer/access", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ token })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || "El enlace no es válido o ha caducado.");
      message.textContent = `Acceso confirmado para ${payload.user?.displayName || "tu pedido"}.`;
      spinner.textContent = "Acceso confirmado";
      spinner.className = "status delivered";
      window.setTimeout(() => window.location.replace("/mis-pedidos/"), 250);
    } catch (error) {
      showRecovery(`${error.message} Puedes solicitar un nuevo acceso con los datos de tu pedido.`);
    }
  }

  void activate();
})();

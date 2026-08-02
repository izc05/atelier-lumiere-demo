(() => {
  const message = document.getElementById("access-message");
  const spinner = document.getElementById("access-spinner");
  const home = document.getElementById("access-home");
  const token = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
  window.history.replaceState(null, "", window.location.pathname);

  async function activate() {
    if (!/^[A-Za-z0-9_-]{32,180}$/.test(token)) {
      message.textContent = "El enlace no es válido o ya no contiene la clave de acceso. Abre el enlace original recibido para este pedido.";
      spinner.hidden = true;
      home.hidden = false;
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
      message.textContent = error.message;
      spinner.hidden = true;
      home.hidden = false;
    }
  }

  void activate();
})();

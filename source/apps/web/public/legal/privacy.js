function byId(id) {
  return document.getElementById(id);
}

function setMessage(text = "", type = "") {
  const item = byId("privacy-message");
  item.textContent = text;
  item.className = `message${type ? ` ${type}` : ""}`;
}

function apply(preferences) {
  byId("necessary").checked = true;
  byId("preferences").checked = Boolean(preferences.preferences);
  byId("analytics").checked = Boolean(preferences.analytics);
  byId("marketing").checked = Boolean(preferences.marketing);
  byId("privacy-version").textContent = preferences.version > 0
    ? `Preferencias guardadas · versión ${preferences.version}`
    : "Todavía no has guardado preferencias";
}

async function request(method = "GET", body) {
  const response = await fetch("/internal/privacy/preferences", {
    method,
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || "No se pudieron guardar las preferencias.");
  return payload.preferences;
}

async function save(values) {
  const buttons = [...document.querySelectorAll("button[data-privacy-action]")];
  buttons.forEach((button) => { button.disabled = true; });
  setMessage("Guardando preferencias…");
  try {
    const preferences = await request("PUT", values);
    apply(preferences);
    setMessage("Preferencias guardadas. No se ha activado ningún servicio externo.", "success");
  } catch (error) {
    setMessage(error.message, "error");
  } finally {
    buttons.forEach((button) => { button.disabled = false; });
  }
}

async function load() {
  try {
    apply(await request());
  } catch (error) {
    setMessage(error.message, "error");
  } finally {
    byId("privacy-loading").hidden = true;
    byId("privacy-content").hidden = false;
  }
}

byId("reject-optional").addEventListener("click", () => void save({
  preferences: false,
  analytics: false,
  marketing: false
}));
byId("accept-optional").addEventListener("click", () => void save({
  preferences: true,
  analytics: true,
  marketing: true
}));
byId("save-preferences").addEventListener("click", () => void save({
  preferences: byId("preferences").checked,
  analytics: byId("analytics").checked,
  marketing: byId("marketing").checked
}));

void load();

const form = document.querySelector("#workshop-application-form");
const message = document.querySelector("#application-message");
const formView = document.querySelector("#form-view");
const successView = document.querySelector("#success-view");
const reference = document.querySelector("#application-reference");

function showMessage(text = "", kind = "") {
  message.textContent = text;
  message.className = `form-message${kind ? ` ${kind}` : ""}`;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  const button = form.querySelector('button[type="submit"]');
  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = "Enviando…";
  showMessage();

  const values = Object.fromEntries(
    [...new FormData(form).entries()]
      .filter(([key]) => key !== "privacyAccepted")
      .map(([key, value]) => [key, String(value).trim()])
  );
  values.privacyAccepted = form.elements.privacyAccepted.checked;

  try {
    const response = await fetch("/internal/workshop-applications", {
      method: "POST",
      credentials: "same-origin",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(values)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message ?? "No hemos podido guardar la solicitud.");
    reference.textContent = payload.application.id;
    form.reset();
    formView.hidden = true;
    successView.hidden = false;
    successView.focus();
  } catch (error) {
    showMessage(error.message, "error");
  } finally {
    button.disabled = false;
    button.textContent = originalLabel;
  }
});

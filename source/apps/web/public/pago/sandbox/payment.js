const elements = {
  loading: document.querySelector("#loading-view"),
  paymentView: document.querySelector("#payment-view"),
  resultView: document.querySelector("#result-view"),
  errorView: document.querySelector("#error-view"),
  providerName: document.querySelector("#provider-name"),
  status: document.querySelector("#payment-status"),
  orderNumber: document.querySelector("#order-number"),
  providerReference: document.querySelector("#provider-reference"),
  amount: document.querySelector("#payment-amount"),
  actions: document.querySelector("#payment-actions"),
  approve: document.querySelector("#approve-button"),
  decline: document.querySelector("#decline-button"),
  paymentMessage: document.querySelector("#payment-message"),
  resultTitle: document.querySelector("#result-title"),
  resultMessage: document.querySelector("#result-message"),
  resultMark: document.querySelector("#result-mark"),
  errorMessage: document.querySelector("#error-message")
};

const statusLabels = {
  CREATED: "Creado",
  PENDING: "Pendiente",
  AUTHORIZED: "Autorizado",
  CAPTURED: "Confirmado",
  FAILED: "Rechazado",
  CANCELLED: "Cancelado",
  REFUNDED: "Reembolsado",
  EXPIRED: "Caducado"
};

let sessionToken = null;
let busy = false;

function money(cents, currency = "EUR") {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency
  }).format(Number(cents) / 100);
}

function show(view) {
  for (const element of [elements.loading, elements.paymentView, elements.resultView, elements.errorView]) {
    if (element) element.hidden = element !== view;
  }
}

function setMessage(text, type = "") {
  if (!elements.paymentMessage) return;
  elements.paymentMessage.textContent = text;
  elements.paymentMessage.className = `payment-message${type ? ` ${type}` : ""}`;
}

function setBusy(value) {
  busy = value;
  if (elements.approve) elements.approve.disabled = value;
  if (elements.decline) elements.decline.disabled = value;
}

async function request(path, body) {
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body),
    cache: "no-store"
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || "El simulador no ha respondido.");
    error.code = payload.error;
    throw error;
  }
  return payload;
}

function renderStatus(status) {
  if (!elements.status) return;
  elements.status.textContent = statusLabels[status] || status;
  elements.status.className = `payment-status ${String(status).toLowerCase()}`;
}

function finalResult(payment) {
  const success = payment.status === "CAPTURED";
  if (elements.resultTitle) {
    elements.resultTitle.textContent = success
      ? "Pago de prueba confirmado"
      : "Pago de prueba rechazado";
  }
  if (elements.resultMessage) {
    elements.resultMessage.textContent = success
      ? "El pedido ha recibido un evento de cobro sandbox y su cronología ya refleja el resultado. No se ha movido dinero real."
      : "El pedido conserva el resultado rechazado para probar mensajes, reintentos y atención al cliente. No se ha movido dinero real.";
  }
  if (elements.resultMark) {
    elements.resultMark.textContent = success ? "✓" : "×";
    elements.resultMark.className = `result-mark${success ? "" : " failure"}`;
  }
  show(elements.resultView);
}

function renderPayment(payment) {
  if (elements.providerName) elements.providerName.textContent = payment.provider?.displayName || "Taller artesanal";
  if (elements.orderNumber) elements.orderNumber.textContent = payment.orderNumber || "—";
  if (elements.providerReference) elements.providerReference.textContent = payment.providerReference || "—";
  if (elements.amount) elements.amount.textContent = money(payment.amountCents, payment.currency);
  renderStatus(payment.status);

  if (["CAPTURED", "FAILED", "CANCELLED", "REFUNDED", "EXPIRED"].includes(payment.status)) {
    finalResult(payment);
    return;
  }
  show(elements.paymentView);
}

function fail(text) {
  sessionToken = null;
  if (elements.errorMessage) elements.errorMessage.textContent = text;
  show(elements.errorView);
}

async function begin(token) {
  sessionToken = token;
  show(elements.loading);
  try {
    renderPayment(await request("/internal/payment-sandbox/begin", { token }));
  } catch (error) {
    fail(error.code === "PAYMENT_SANDBOX_DISABLED"
      ? "El sandbox está preparado, pero no se encuentra activado en este servidor."
      : error.message);
  }
}

async function simulate(outcome) {
  if (busy || !sessionToken) return;
  setBusy(true);
  setMessage(outcome === "success"
    ? "Generando un webhook de pago confirmado…"
    : "Generando un webhook de pago rechazado…");
  try {
    const payment = await request("/internal/payment-sandbox/simulate", {
      token: sessionToken,
      outcome
    });
    sessionToken = null;
    renderPayment(payment);
  } catch (error) {
    setMessage(error.message, "error");
  } finally {
    setBusy(false);
  }
}

elements.approve?.addEventListener("click", () => void simulate("success"));
elements.decline?.addEventListener("click", () => void simulate("failure"));

const initialUrl = new URL(window.location.href);
const token = initialUrl.searchParams.get("token");
if (token) {
  history.replaceState({}, "", "/pago/sandbox/");
  void begin(token);
} else {
  fail("Falta la sesión de pago. Registra primero un pedido desde el carrito piloto.");
}

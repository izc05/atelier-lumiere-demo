const statusElements = {
  adminView: document.querySelector("#admin-view"),
  providersList: document.querySelector("#providers-list"),
  statusList: document.querySelector("#activation-status-list"),
  summary: document.querySelector("#activation-summary"),
  refreshButton: document.querySelector("#refresh-button"),
  providerForm: document.querySelector("#provider-form")
};

const stageLabels = {
  INVITED: "Invitación pendiente",
  ACCOUNT_CREATED: "Cuenta creada",
  EMAIL_VERIFIED: "Correo verificado",
  TWO_FACTOR_ENABLED: "Doble factor activo",
  PENDING_APPROVAL: "Pendiente de aprobación",
  ACTIVE: "Taller activo",
  SUSPENDED: "Taller pausado"
};

const steps = [
  ["invitationCreated", "Invitación"],
  ["accountCreated", "Cuenta"],
  ["emailVerified", "Correo"],
  ["twoFactorEnabled", "2FA"],
  ["approved", "Aprobación"]
];

let refreshTimer;
let loading = false;

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function placeholder(message) {
  if (!statusElements.statusList) return;
  statusElements.statusList.replaceChildren(
    createElement("div", "activation-placeholder", message)
  );
}

function stageClass(stage) {
  if (stage === "ACTIVE") return " stage-active";
  if (stage === "SUSPENDED") return " stage-suspended";
  return "";
}

function renderProvider(provider) {
  const onboarding = provider.onboarding ?? {};
  const stage = onboarding.stage ?? provider.status ?? "INVITED";
  const card = createElement("article", "activation-card");

  const identity = createElement("div", "activation-identity");
  identity.append(
    createElement("strong", "", provider.displayName ?? "Taller sin nombre"),
    createElement("small", "", provider.contactEmail ?? "Correo no disponible"),
    createElement(
      "span",
      `activation-stage${stageClass(stage)}`,
      stageLabels[stage] ?? stage
    )
  );

  const progress = createElement("ol", "activation-steps");
  const firstPending = steps.findIndex(([field]) => !onboarding[field]);
  steps.forEach(([field, label], index) => {
    const done = Boolean(onboarding[field]);
    const current = !done && index === firstPending && stage !== "SUSPENDED";
    progress.append(
      createElement(
        "li",
        `activation-step${done ? " done" : ""}${current ? " current" : ""}`,
        label
      )
    );
  });

  card.append(identity, progress);
  return card;
}

function render(providers) {
  if (!statusElements.statusList || !statusElements.summary) return;
  statusElements.statusList.replaceChildren();

  if (!providers.length) {
    placeholder("Todavía no hay talleres para mostrar en el proceso de activación.");
    statusElements.summary.textContent = "0 talleres";
    return;
  }

  const pendingApproval = providers.filter(
    (provider) => provider.onboarding?.stage === "PENDING_APPROVAL"
  ).length;
  const active = providers.filter((provider) => provider.onboarding?.stage === "ACTIVE").length;
  statusElements.summary.textContent = pendingApproval
    ? `${pendingApproval} pendiente${pendingApproval === 1 ? "" : "s"} de aprobación`
    : `${active} activo${active === 1 ? "" : "s"}`;

  const fragment = document.createDocumentFragment();
  for (const provider of providers) fragment.append(renderProvider(provider));
  statusElements.statusList.append(fragment);
}

async function loadStatus() {
  if (
    loading
    || !statusElements.adminView
    || statusElements.adminView.hidden
    || !statusElements.statusList
  ) return;

  loading = true;
  try {
    const response = await fetch("/internal/admin/providers", {
      credentials: "same-origin",
      headers: { Accept: "application/json" }
    });
    if (response.status === 401) {
      placeholder("Inicia sesión para consultar el progreso de los talleres.");
      return;
    }
    if (!response.ok) throw new Error("No se pudo consultar el progreso.");
    const payload = await response.json();
    render(Array.isArray(payload.providers) ? payload.providers : []);
  } catch {
    placeholder("No se ha podido cargar el estado de incorporación.");
  } finally {
    loading = false;
  }
}

function scheduleRefresh(delay = 120) {
  window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(() => void loadStatus(), delay);
}

if (statusElements.adminView) {
  new MutationObserver(() => {
    if (!statusElements.adminView.hidden) scheduleRefresh();
  }).observe(statusElements.adminView, { attributes: true, attributeFilter: ["hidden"] });
}

if (statusElements.providersList) {
  new MutationObserver(() => scheduleRefresh(180)).observe(statusElements.providersList, {
    childList: true
  });
}

statusElements.refreshButton?.addEventListener("click", () => scheduleRefresh(300));
statusElements.providerForm?.addEventListener("submit", () => scheduleRefresh(700));

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") scheduleRefresh();
});

scheduleRefresh();

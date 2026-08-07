const STATUS_LABELS = Object.freeze({
  DRAFT: "Borrador",
  IN_REVIEW: "En revisión",
  CHANGES_REQUESTED: "Cambios solicitados",
  APPROVED: "Aprobado",
  PUBLISHED: "Publicado"
});

let visibleProfiles = [];
let allProfiles = [];
let searchTimer = null;

function byId(id) { return document.getElementById(id); }
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function formatDate(value) {
  if (!value) return "Sin fecha";
  try {
    return new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  } catch {
    return "Sin fecha";
  }
}

async function requestJson(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { Accept: "application/json", ...(options.headers ?? {}) }
  });
  const payload = await response.json().catch(() => ({}));
  if (response.status === 401) {
    window.location.replace("/admin/proveedores/");
    throw new Error("La sesión administrativa ha caducado.");
  }
  if (!response.ok) throw new Error(payload.message || "No se pudo completar la operación.");
  return payload;
}

function chips(values) {
  const container = element("div", "chips");
  for (const value of (Array.isArray(values) ? values : []).slice(0, 12)) {
    container.append(element("span", "", value));
  }
  return container;
}

function flash(panel, value, type = "") {
  const node = panel.querySelector(".flash");
  if (!node) return;
  node.textContent = value;
  node.className = `flash${type ? ` ${type}` : ""}`;
}

async function review(profile, panel, decision) {
  const note = panel.querySelector("textarea")?.value.trim() ?? "";
  if (decision === "REQUEST_CHANGES" && !note) {
    flash(panel, "Escribe qué debe corregir el taller antes de solicitar cambios.", "error");
    return;
  }
  for (const button of panel.querySelectorAll("button")) button.disabled = true;
  flash(panel, decision === "APPROVE" ? "Aprobando perfil…" : "Enviando indicaciones al taller…");
  try {
    await requestJson(`/internal/admin/provider-profiles/${encodeURIComponent(profile.providerId)}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, note })
    });
    flash(panel, decision === "APPROVE" ? "Perfil aprobado. Ya puede publicarse." : "Cambios solicitados al taller.", "success");
    await load();
  } catch (error) {
    flash(panel, error.message, "error");
    for (const button of panel.querySelectorAll("button")) button.disabled = false;
  }
}

async function publish(profile, panel) {
  for (const button of panel.querySelectorAll("button")) button.disabled = true;
  flash(panel, "Publicando nueva versión…");
  try {
    await requestJson(`/internal/admin/provider-profiles/${encodeURIComponent(profile.providerId)}/publish`, {
      method: "POST"
    });
    flash(panel, "Perfil publicado correctamente.", "success");
    await load();
  } catch (error) {
    flash(panel, error.message, "error");
    for (const button of panel.querySelectorAll("button")) button.disabled = false;
  }
}

function identityBlock(profile) {
  const block = element("div", "identity");
  block.append(element("span", "status", STATUS_LABELS[profile.status] ?? profile.status));
  block.append(element("h2", "", profile.publicName));
  block.append(element("p", "", profile.specialtyLabel));
  if (profile.locationLabel) block.append(element("p", "", profile.locationLabel));
  block.append(element("p", "", `Versión privada v${profile.version}`));
  if (profile.publication?.revision) {
    block.append(element("p", "", `Publicación activa r${profile.publication.revision}`));
  }
  return block;
}

function contentBlock(profile) {
  const content = element("div", "profile-content");
  content.append(element("p", "tagline", profile.tagline || "Sin frase de presentación"));

  const copy = element("div", "copy");
  const story = element("div");
  story.append(element("h3", "", "Historia"));
  story.append(element("p", "", profile.story || "Historia pendiente."));
  const craft = element("div");
  craft.append(element("h3", "", "Oficio"));
  craft.append(element("p", "", profile.craftDescription || "Descripción del oficio pendiente."));
  copy.append(story, craft);
  content.append(copy);

  if ((profile.materials ?? []).length) {
    content.append(element("h3", "", "Materiales"));
    content.append(chips(profile.materials));
  }
  if ((profile.techniques ?? []).length) {
    content.append(element("h3", "", "Técnicas"));
    content.append(chips(profile.techniques));
  }

  const operational = [];
  if (profile.acceptsCustomRequests) operational.push("Acepta encargos personalizados");
  if (profile.preparationNote) operational.push(profile.preparationNote);
  if (profile.shippingNote) operational.push(profile.shippingNote);
  if (operational.length) content.append(element("p", "", operational.join(" · ")));
  return content;
}

function reviewPanel(profile) {
  const panel = element("div", "review-panel");
  const publicInfo = profile.publication?.revision
    ? `Versión pública actual r${profile.publication.revision}, publicada ${formatDate(profile.publication.publishedAt)}.`
    : "Este taller todavía no tiene una versión editorial publicada.";
  panel.append(element("small", "", publicInfo));

  if (profile.status === "IN_REVIEW") {
    const textarea = document.createElement("textarea");
    textarea.maxLength = 1200;
    textarea.placeholder = "Nota para el taller. Es obligatoria si solicitas cambios.";
    panel.append(textarea);
    const actions = element("div", "review-actions");
    const approve = element("button", "button primary", "Aprobar perfil");
    approve.type = "button";
    approve.addEventListener("click", () => void review(profile, panel, "APPROVE"));
    const changes = element("button", "button danger", "Solicitar cambios");
    changes.type = "button";
    changes.addEventListener("click", () => void review(profile, panel, "REQUEST_CHANGES"));
    actions.append(approve, changes);
    panel.append(actions);
  } else if (profile.status === "APPROVED") {
    panel.append(element("small", "", "La versión está aprobada. Publicarla sustituirá el snapshot público actual de forma atómica."));
    const publishButton = element("button", "button primary", "Publicar versión");
    publishButton.type = "button";
    publishButton.addEventListener("click", () => void publish(profile, panel));
    panel.append(publishButton);
  } else if (profile.status === "PUBLISHED") {
    panel.append(element("p", "published", "✓ Esta es la versión editorial publicada del taller."));
  } else if (profile.status === "CHANGES_REQUESTED") {
    panel.append(element("small", "", profile.editorialNote ? `Indicación enviada: ${profile.editorialNote}` : "Esperando una nueva versión del taller."));
  } else {
    panel.append(element("small", "", "El taller todavía está preparando esta versión."));
  }

  panel.append(element("p", "flash", ""));
  return panel;
}

function profileCard(profile) {
  const card = element("article", "profile-card");
  card.append(identityBlock(profile), contentBlock(profile), reviewPanel(profile));
  return card;
}

function updateMetrics() {
  byId("metric-total").textContent = String(allProfiles.length);
  byId("metric-review").textContent = String(allProfiles.filter((profile) => profile.status === "IN_REVIEW").length);
  byId("metric-approved").textContent = String(allProfiles.filter((profile) => profile.status === "APPROVED").length);
  byId("metric-published").textContent = String(allProfiles.filter((profile) => profile.status === "PUBLISHED").length);
}

function render() {
  const list = byId("profiles-list");
  list.replaceChildren(...visibleProfiles.map(profileCard));
  list.hidden = visibleProfiles.length === 0;
  byId("empty-view").hidden = visibleProfiles.length !== 0;
  updateMetrics();
}

async function load() {
  byId("loading-view").hidden = false;
  byId("error-view").hidden = true;
  byId("empty-view").hidden = true;
  byId("profiles-list").hidden = true;
  try {
    const params = new URLSearchParams();
    const status = byId("status-filter").value;
    const query = byId("search-input").value.trim();
    if (status && status !== "ALL") params.set("status", status);
    if (query) params.set("q", query);
    const suffix = params.toString() ? `?${params}` : "";
    const [visiblePayload, totalsPayload] = await Promise.all([
      requestJson(`/internal/admin/provider-profiles${suffix}`),
      requestJson("/internal/admin/provider-profiles?status=ALL")
    ]);
    visibleProfiles = Array.isArray(visiblePayload.profiles) ? visiblePayload.profiles : [];
    allProfiles = Array.isArray(totalsPayload.profiles) ? totalsPayload.profiles : [];
    render();
  } catch (error) {
    byId("error-message").textContent = error.message;
    byId("error-view").hidden = false;
  } finally {
    byId("loading-view").hidden = true;
  }
}

byId("status-filter").addEventListener("change", () => void load());
byId("search-input").addEventListener("input", () => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => void load(), 250);
});
byId("refresh-button").addEventListener("click", () => void load());
byId("logout-button").addEventListener("click", async () => {
  const button = byId("logout-button");
  button.disabled = true;
  try {
    await fetch("/internal/admin/session", { method: "DELETE" });
  } finally {
    window.location.replace("/admin/proveedores/");
  }
});

void load();

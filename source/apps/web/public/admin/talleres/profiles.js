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
function internalPath(path) {
  return typeof path === "string" && path.startsWith("/api/") ? path.replace(/^\/api\//, "/internal/") : null;
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

function mediaFigure(item, label) {
  const figure = element("figure", `review-media review-media-${String(item.kind || "gallery").toLowerCase()}`);
  const image = document.createElement("img");
  const source = internalPath(item.previewPath);
  if (source) image.src = source;
  image.alt = item.altText || label;
  image.loading = "lazy";
  image.decoding = "async";
  const caption = element("figcaption");
  caption.append(element("strong", "", label));
  caption.append(element("span", "", item.altText || "Sin descripción alternativa"));
  figure.append(image, caption);
  return figure;
}

function mediaBlock(profile) {
  const section = element("section", "review-media-section");
  const heading = element("div", "review-media-heading");
  heading.append(element("h3", "", "Imagen del taller"));
  const media = Array.isArray(profile.media) ? profile.media : [];
  const logo = media.find((item) => item.kind === "LOGO");
  const cover = media.find((item) => item.kind === "COVER");
  const gallery = media.filter((item) => item.kind === "GALLERY").slice(0, 6);
  heading.append(element("small", "", `${cover ? "Portada lista" : "Sin portada"} · ${logo ? "Logo listo" : "Sin logo"} · ${gallery.length} foto${gallery.length === 1 ? "" : "s"} de galería`));
  section.append(heading);

  if (profile.mediaError) {
    section.append(element("p", "media-review-error", "No se pudieron cargar las imágenes privadas de esta revisión."));
    return section;
  }

  const featured = element("div", "review-media-featured");
  if (cover) featured.append(mediaFigure(cover, "Portada"));
  else featured.append(element("div", "review-media-missing", "Falta la portada obligatoria."));
  if (logo) featured.append(mediaFigure(logo, "Logo"));
  section.append(featured);

  if (gallery.length) {
    const grid = element("div", "review-media-gallery");
    gallery.forEach((item, index) => grid.append(mediaFigure(item, `Galería ${index + 1}`)));
    section.append(grid);
  }
  return section;
}

function reviewPanel(profile) {
  const panel = element("div", "review-panel");
  const publicInfo = profile.publication?.revision
    ? `Versión pública actual r${profile.publication.revision}, publicada ${formatDate(profile.publication.publishedAt)}.`
    : "Este taller todavía no tiene una versión editorial publicada.";
  panel.append(element("small", "", publicInfo));

  const hasCover = Array.isArray(profile.media) && profile.media.some((item) => item.kind === "COVER" && item.status === "READY");
  if (profile.status === "IN_REVIEW") {
    if (!hasCover) panel.append(element("p", "media-review-error", "Esta revisión no tiene la portada obligatoria y no debería aprobarse."));
    const textarea = document.createElement("textarea");
    textarea.maxLength = 1200;
    textarea.placeholder = "Nota para el taller. Es obligatoria si solicitas cambios.";
    panel.append(textarea);
    const actions = element("div", "review-actions");
    const approve = element("button", "button primary", "Aprobar perfil");
    approve.type = "button";
    approve.disabled = !hasCover || Boolean(profile.mediaError);
    approve.addEventListener("click", () => void review(profile, panel, "APPROVE"));
    const changes = element("button", "button danger", "Solicitar cambios");
    changes.type = "button";
    changes.addEventListener("click", () => void review(profile, panel, "REQUEST_CHANGES"));
    actions.append(approve, changes);
    panel.append(actions);
  } else if (profile.status === "APPROVED") {
    panel.append(element("small", "", "La versión está aprobada. Publicarla sustituirá texto e imágenes del snapshot público de forma atómica."));
    const publishButton = element("button", "button primary", "Publicar versión");
    publishButton.type = "button";
    publishButton.disabled = !hasCover || Boolean(profile.mediaError);
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
  const center = element("div", "profile-center");
  center.append(contentBlock(profile), mediaBlock(profile));
  card.append(identityBlock(profile), center, reviewPanel(profile));
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

async function attachMedia(profile) {
  try {
    const payload = await requestJson(`/internal/admin/provider-profiles/${encodeURIComponent(profile.providerId)}/media`);
    return { ...profile, media: Array.isArray(payload.media) ? payload.media : [], mediaError: false };
  } catch (error) {
    if (error.message === "La sesión administrativa ha caducado.") throw error;
    return { ...profile, media: [], mediaError: true };
  }
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
    const rawVisible = Array.isArray(visiblePayload.profiles) ? visiblePayload.profiles : [];
    visibleProfiles = await Promise.all(rawVisible.map(attachMedia));
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

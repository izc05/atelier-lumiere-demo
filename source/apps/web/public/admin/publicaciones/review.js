const STATUS_LABELS = Object.freeze({
  DRAFT: "Borrador",
  IN_REVIEW: "En revisión",
  CHANGES_REQUESTED: "Cambios solicitados",
  APPROVED: "Aprobada",
  PUBLISHED: "Publicada",
  ARCHIVED: "Archivada"
});
const STATUS_CLASSES = Object.freeze({
  DRAFT: "draft",
  IN_REVIEW: "review",
  CHANGES_REQUESTED: "changes",
  APPROVED: "approved",
  PUBLISHED: "published",
  ARCHIVED: "archived"
});

let posts = [];

function byId(id) { return document.getElementById(id); }
function node(tag, className, text) {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (text !== undefined) item.textContent = text;
  return item;
}
function formatDate(value) {
  if (!value) return "Sin fecha";
  try {
    return new Intl.DateTimeFormat("es-ES", { dateStyle: "medium" }).format(new Date(value));
  } catch { return "Sin fecha"; }
}
async function requestJson(path) {
  const response = await fetch(path, { headers: { Accept: "application/json" } });
  const payload = await response.json().catch(() => ({}));
  if (response.status === 401) {
    window.location.replace("/admin/proveedores/");
    throw new Error("La sesión administrativa ha caducado.");
  }
  if (!response.ok) throw new Error(payload.message || "No se pudo completar la operación.");
  return payload;
}
function fact(text) { return node("span", "", text); }
function postCard(post) {
  const card = node("article", "review-card");
  const content = node("div");
  const status = node(
    "span",
    `status ${STATUS_CLASSES[post.status] ?? "archived"}`,
    STATUS_LABELS[post.status] ?? post.status
  );
  const cover = node(
    "span",
    `cover-state ${post.hasCover ? "ready" : "missing"}`,
    post.hasCover ? "Con portada" : "Sin portada"
  );
  const badges = node("div", "card-meta");
  badges.append(status, cover);
  content.append(
    badges,
    node("h2", "blog-card-title", post.title),
    node("p", "", post.excerpt || "Sin introducción editorial.")
  );
  const facts = node("div", "card-meta");
  facts.append(
    fact(post.provider.displayName),
    fact(post.category || "Sin categoría"),
    fact(`${post.imageCount} imagen${post.imageCount === 1 ? "" : "es"}`),
    fact(`${post.tagCount} etiqueta${post.tagCount === 1 ? "" : "s"}`),
    fact(`${post.relatedProductCount} artículo${post.relatedProductCount === 1 ? "" : "s"}`),
    fact(`Enviada ${formatDate(post.submittedAt || post.updatedAt)}`)
  );
  content.append(facts);

  const link = node("a", "button primary", "Revisar historia");
  link.href = `/admin/publicaciones/revisar/?id=${encodeURIComponent(post.id)}`;
  card.append(content, link);
  return card;
}
function updateMetrics() {
  byId("metric-total").textContent = String(posts.length);
  byId("metric-review").textContent = String(posts.filter((post) => post.status === "IN_REVIEW").length);
  byId("metric-approved").textContent = String(posts.filter((post) => post.status === "APPROVED").length);
  byId("metric-published").textContent = String(posts.filter((post) => post.status === "PUBLISHED").length);
}
function render() {
  const query = byId("search-input").value.trim().toLocaleLowerCase("es");
  const selectedStatus = byId("status-filter").value;
  const visible = posts.filter((post) => {
    const statusMatches = selectedStatus === "ALL" || post.status === selectedStatus;
    const haystack = [post.title, post.excerpt, post.category, post.provider.displayName]
      .filter(Boolean).join(" ").toLocaleLowerCase("es");
    return statusMatches && (!query || haystack.includes(query));
  });
  byId("review-list").replaceChildren(...visible.map(postCard));
  byId("review-list").hidden = visible.length === 0;
  byId("empty-view").hidden = visible.length !== 0;
}
async function load() {
  byId("loading-view").hidden = false;
  byId("error-view").hidden = true;
  byId("review-list").hidden = true;
  byId("empty-view").hidden = true;
  try {
    const payload = await requestJson("/internal/admin/blog-posts?status=ALL");
    posts = Array.isArray(payload.posts) ? payload.posts : [];
    updateMetrics();
    render();
  } catch (error) {
    byId("error-message").textContent = error.message;
    byId("error-view").hidden = false;
  } finally {
    byId("loading-view").hidden = true;
  }
}

byId("search-input").addEventListener("input", render);
byId("status-filter").addEventListener("change", render);
byId("refresh-button").addEventListener("click", () => void load());
byId("retry-button").addEventListener("click", () => void load());
byId("logout-button").addEventListener("click", async () => {
  try { await fetch("/internal/admin/session", { method: "DELETE" }); }
  finally { window.location.replace("/admin/proveedores/"); }
});

void load();

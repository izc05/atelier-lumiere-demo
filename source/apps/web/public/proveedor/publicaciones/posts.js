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
    window.location.replace("/proveedor/acceso/");
    throw new Error("La sesión ha caducado.");
  }
  if (!response.ok) throw new Error(payload.message || "No se pudo completar la operación.");
  return payload;
}
function fact(text) { return node("span", "", text); }
function postCard(post) {
  const card = node("article", "post-card");
  const content = node("div");
  const badge = node(
    "span",
    `status ${STATUS_CLASSES[post.status] ?? "archived"}`,
    STATUS_LABELS[post.status] ?? post.status
  );
  const title = node("h2", "", post.title);
  const excerpt = node("p", "", post.excerpt || "La introducción todavía está pendiente.");
  const facts = node("div", "post-facts");
  facts.append(
    fact(post.category || "Sin categoría"),
    fact(`${post.tagCount} etiqueta${post.tagCount === 1 ? "" : "s"}`),
    fact(`${post.relatedProductCount} artículo${post.relatedProductCount === 1 ? "" : "s"}`),
    fact(`${post.imageCount} imagen${post.imageCount === 1 ? "" : "es"}`),
    fact(`Actualizada ${formatDate(post.updatedAt)}`),
    fact(`v${post.version}`)
  );
  content.append(badge, title, excerpt, facts);

  const link = node(
    "a",
    `button ${["DRAFT", "CHANGES_REQUESTED"].includes(post.status) ? "primary" : "secondary"}`,
    ["DRAFT", "CHANGES_REQUESTED"].includes(post.status) ? "Editar" : "Consultar"
  );
  link.href = `/proveedor/publicaciones/editar/?id=${encodeURIComponent(post.id)}`;
  card.append(content, link);
  return card;
}
function updateMetrics() {
  byId("metric-total").textContent = String(posts.length);
  byId("metric-drafts").textContent = String(
    posts.filter((post) => ["DRAFT", "CHANGES_REQUESTED"].includes(post.status)).length
  );
  byId("metric-review").textContent = String(posts.filter((post) => post.status === "IN_REVIEW").length);
  byId("metric-published").textContent = String(posts.filter((post) => post.status === "PUBLISHED").length);
}
function render() {
  const query = byId("search-input").value.trim().toLocaleLowerCase("es");
  const status = byId("status-filter").value;
  const visible = posts.filter((post) => {
    const matchesStatus = status === "ALL" || post.status === status;
    const haystack = [post.title, post.category, post.excerpt]
      .filter(Boolean).join(" ").toLocaleLowerCase("es");
    return matchesStatus && (!query || haystack.includes(query));
  });
  byId("posts-list").replaceChildren(...visible.map(postCard));
  byId("posts-empty").hidden = posts.length !== 0;
  byId("posts-no-results").hidden = posts.length === 0 || visible.length !== 0;
  byId("posts-list").hidden = visible.length === 0;
}
async function loadPosts() {
  byId("posts-loading").hidden = false;
  byId("posts-error").hidden = true;
  byId("posts-list").hidden = true;
  try {
    const payload = await requestJson("/internal/provider/blog-posts");
    posts = Array.isArray(payload.posts) ? payload.posts : [];
    updateMetrics();
    render();
  } catch (error) {
    byId("posts-error-message").textContent = error.message;
    byId("posts-error").hidden = false;
  } finally {
    byId("posts-loading").hidden = true;
  }
}

byId("search-input").addEventListener("input", render);
byId("status-filter").addEventListener("change", render);
byId("retry-button").addEventListener("click", () => void loadPosts());
byId("logout-button").addEventListener("click", async () => {
  try { await fetch("/internal/provider/session", { method: "DELETE" }); }
  finally { window.location.replace("/proveedor/acceso/"); }
});

void loadPosts();

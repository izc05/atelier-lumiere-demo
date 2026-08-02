const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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

let currentPost = null;

function byId(id) { return document.getElementById(id); }
function node(tag, className, text) {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (text !== undefined) item.textContent = text;
  return item;
}
function queryId() {
  const value = new URL(window.location.href).searchParams.get("id")?.trim() ?? "";
  return UUID_PATTERN.test(value) ? value : null;
}
function formatDate(value) {
  if (!value) return "Sin fecha";
  try {
    return new Intl.DateTimeFormat("es-ES", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(value));
  } catch { return "Sin fecha"; }
}
function money(cents, currency = "EUR") {
  if (!Number.isInteger(cents)) return "Precio pendiente";
  return new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(cents / 100);
}
function setMessage(id, text = "", type = "") {
  const item = byId(id);
  item.textContent = text;
  item.className = `message${type ? ` ${type}` : ""}`;
}
async function requestJson(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers ?? {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (response.status === 401) {
    window.location.replace("/admin/proveedores/");
    throw new Error("La sesión administrativa ha caducado.");
  }
  if (!response.ok) {
    const error = new Error(payload.message || "No se pudo completar la operación.");
    error.code = payload.error;
    throw error;
  }
  return payload;
}
function appendMarkdownBlock(container, tag, text) {
  const item = document.createElement(tag);
  item.textContent = text;
  container.append(item);
}
function renderMarkdown(source) {
  const container = byId("markdown-content");
  container.replaceChildren();
  if (!String(source ?? "").trim()) {
    container.append(node("p", "copy", "La publicación no contiene texto."));
    return;
  }
  let currentList = null;
  for (const rawLine of String(source).replaceAll("\r\n", "\n").split("\n")) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      currentList = null;
      continue;
    }
    if (line.startsWith("### ")) {
      appendMarkdownBlock(container, "h3", line.slice(4).trim());
      currentList = null;
    } else if (line.startsWith("## ")) {
      appendMarkdownBlock(container, "h2", line.slice(3).trim());
      currentList = null;
    } else if (line.startsWith("# ")) {
      appendMarkdownBlock(container, "h1", line.slice(2).trim());
      currentList = null;
    } else if (line.startsWith("- ")) {
      if (!currentList) {
        currentList = document.createElement("ul");
        container.append(currentList);
      }
      appendMarkdownBlock(currentList, "li", line.slice(2).trim());
    } else {
      appendMarkdownBlock(container, "p", line.trim());
      currentList = null;
    }
  }
}
function renderTags(tags) {
  const items = tags.length
    ? tags.map((tag) => node("span", "tag", `#${tag}`))
    : [node("span", "copy", "Sin etiquetas")];
  byId("tags-list").replaceChildren(...items);
}
function renderMedia(media) {
  const ready = media.filter((item) => item.status === "READY");
  if (ready.length === 0) {
    byId("media-grid").replaceChildren(node("p", "copy", "No hay imágenes listas."));
    return;
  }
  const cards = ready.map((item) => {
    const card = node("article", "blog-image");
    const figure = document.createElement("figure");
    const image = document.createElement("img");
    image.src = `/internal/admin/blog-posts/${currentPost.id}/media/${item.id}/preview`;
    image.alt = item.altText || item.originalFilename;
    image.loading = "lazy";
    const caption = document.createElement("figcaption");
    caption.append(
      node("strong", "", item.placement === "COVER" ? "Portada" : "Imagen interior"),
      node("span", "", item.altText || item.originalFilename),
      node("span", "", `${item.width || "?"} × ${item.height || "?"} px`)
    );
    figure.append(image, caption);
    card.append(figure);
    return card;
  });
  byId("media-grid").replaceChildren(...cards);
}
function renderProducts(products) {
  const items = products.length ? products.map((product) => {
    const item = node("article", "related-product");
    item.append(
      node("strong", "", product.name),
      node("small", "", `${product.category || "Sin categoría"} · ${money(product.priceCents, product.currency)} · ${product.status}`)
    );
    return item;
  }) : [node("p", "copy", "No hay artículos relacionados.")];
  byId("related-products").replaceChildren(...items);
}
function renderHistory(reviews) {
  const items = reviews.length ? reviews.map((review) => {
    const item = node("article", "history-item");
    item.append(
      node("strong", "", `Envío ${review.submissionNumber} · ${review.status}`),
      node("small", "", `Enviado ${formatDate(review.submittedAt)}${review.reviewedAt ? ` · Resuelto ${formatDate(review.reviewedAt)}` : ""}`)
    );
    if (review.providerNote) item.append(node("p", "copy", `Proveedor: ${review.providerNote}`));
    if (review.reviewerNote) item.append(node("p", "copy", `Administración: ${review.reviewerNote}`));
    return item;
  }) : [node("p", "copy", "No existe historial editorial.")];
  byId("history-list").replaceChildren(...items);
}
function renderPost(post) {
  currentPost = post;
  const readyMedia = post.media.filter((item) => item.status === "READY");
  const hasCover = readyMedia.some((item) => item.placement === "COVER");
  byId("provider-eyebrow").textContent = post.provider.displayName;
  byId("post-title").textContent = post.title;
  byId("post-excerpt").textContent = post.excerpt;
  const status = byId("post-status");
  status.textContent = STATUS_LABELS[post.status] ?? post.status;
  status.className = `status ${STATUS_CLASSES[post.status] ?? "archived"}`;
  byId("category-value").textContent = post.category || "Sin categoría";
  byId("version-value").textContent = `v${post.version}`;
  byId("updated-value").textContent = formatDate(post.updatedAt);
  byId("images-value").textContent = String(readyMedia.length);
  byId("products-value").textContent = String(post.relatedProducts.length);
  byId("cover-value").textContent = hasCover ? "Preparada" : "Pendiente";
  byId("provider-name").textContent = post.provider.displayName;
  byId("provider-contact").textContent = [post.provider.contactName, post.provider.contactEmail]
    .filter(Boolean).join(" · ") || "Sin contacto disponible";

  const latest = post.reviews[0];
  byId("provider-note").textContent = latest?.providerNote || "Sin nota adicional.";
  byId("reviewer-note").value = "";
  renderTags(post.tags);
  renderMarkdown(post.bodyMarkdown);
  renderMedia(post.media);
  renderProducts(post.relatedProducts);
  renderHistory(post.reviews);

  byId("decision-panel").hidden = post.status !== "IN_REVIEW";
  byId("publish-panel").hidden = post.status !== "APPROVED";
  const publishButton = byId("publish-button");
  publishButton.disabled = !hasCover;
  byId("publish-notice").textContent = hasCover
    ? "La aprobación está registrada. Publica solo cuando la historia esté lista para aparecer en el blog."
    : "No se puede publicar todavía: falta una portada lista.";
  byId("publish-notice").className = `notice${hasCover ? "" : " cover-warning"}`;
}
async function load() {
  const postId = queryId();
  if (!postId) {
    byId("loading-view").hidden = true;
    byId("error-message").textContent = "El identificador de la publicación no es válido.";
    byId("error-view").hidden = false;
    return;
  }
  try {
    const payload = await requestJson(`/internal/admin/blog-posts/${postId}`);
    renderPost(payload.post);
    byId("loading-view").hidden = true;
    byId("detail-view").hidden = false;
  } catch (error) {
    byId("loading-view").hidden = true;
    byId("error-message").textContent = error.message;
    byId("error-view").hidden = false;
  }
}
async function decide(decision) {
  if (!currentPost) return;
  const note = byId("reviewer-note").value.trim();
  if (decision === "CHANGES_REQUESTED" && note.length < 10) {
    setMessage("decision-message", "Explica los cambios con al menos 10 caracteres.", "warning");
    return;
  }
  const buttons = [byId("request-changes-button"), byId("approve-button")];
  buttons.forEach((button) => { button.disabled = true; });
  setMessage("decision-message", "Registrando la decisión…");
  try {
    await requestJson(`/internal/admin/blog-posts/${currentPost.id}/review`, {
      method: "POST",
      body: JSON.stringify({ decision, reviewerNote: note })
    });
    setMessage("decision-message", "Decisión registrada.", "success");
    await load();
  } catch (error) {
    setMessage("decision-message", error.message, "error");
    buttons.forEach((button) => { button.disabled = false; });
  }
}
async function publish() {
  if (!currentPost) return;
  const button = byId("publish-button");
  button.disabled = true;
  setMessage("publish-message", "Publicando la historia…");
  try {
    await requestJson(`/internal/admin/blog-posts/${currentPost.id}/publish`, { method: "POST" });
    setMessage("publish-message", "Historia publicada.", "success");
    await load();
  } catch (error) {
    setMessage("publish-message", error.message, "error");
    button.disabled = false;
  }
}

byId("request-changes-button").addEventListener("click", () => void decide("CHANGES_REQUESTED"));
byId("approve-button").addEventListener("click", () => void decide("APPROVED"));
byId("publish-button").addEventListener("click", () => void publish());
byId("logout-button").addEventListener("click", async () => {
  try { await fetch("/internal/admin/session", { method: "DELETE" }); }
  finally { window.location.replace("/admin/proveedores/"); }
});

void load();

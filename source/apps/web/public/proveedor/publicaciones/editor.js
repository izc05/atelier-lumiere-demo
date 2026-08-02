const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EDITABLE = new Set(["DRAFT", "CHANGES_REQUESTED"]);
const STATUS_LABELS = Object.freeze({
  DRAFT: "Borrador",
  IN_REVIEW: "En revisión",
  CHANGES_REQUESTED: "Cambios solicitados",
  APPROVED: "Aprobada",
  PUBLISHED: "Publicada",
  ARCHIVED: "Archivada"
});

const state = {
  post: null,
  products: [],
  selectedProductIds: new Set(),
  saving: false
};

function byId(id) { return document.getElementById(id); }
function node(tag, className, text) {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (text !== undefined) item.textContent = text;
  return item;
}
function setMessage(id, text = "", type = "") {
  const item = byId(id);
  item.textContent = text;
  item.className = `message${type ? ` ${type}` : ""}`;
}
function queryPostId() {
  const value = new URL(window.location.href).searchParams.get("id")?.trim() ?? "";
  return UUID_PATTERN.test(value) ? value : null;
}
function isEditable() { return !state.post || EDITABLE.has(state.post.status); }
function formatDate(value) {
  if (!value) return "Sin guardar";
  try {
    return new Intl.DateTimeFormat("es-ES", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(value));
  } catch { return "Sin guardar"; }
}
function slugify(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
function selectedTags() {
  return [...new Set(byId("tags").value.split(",").map(slugify).filter(Boolean))].slice(0, 12);
}
function formInput() {
  return {
    title: byId("title").value.trim(),
    excerpt: byId("excerpt").value.trim(),
    bodyMarkdown: byId("body-markdown").value.trim(),
    category: byId("category").value.trim() || null
  };
}

async function api(path, options = {}) {
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
    window.location.replace("/proveedor/acceso/");
    throw new Error("La sesión ha caducado.");
  }
  if (!response.ok) {
    const error = new Error(payload.message || "No se pudo completar la operación.");
    error.code = payload.error;
    error.details = payload.details;
    throw error;
  }
  return payload;
}

function appendMarkdownBlock(container, tag, text) {
  const item = document.createElement(tag);
  item.textContent = text;
  container.append(item);
}

function renderMarkdown() {
  const preview = byId("markdown-preview");
  const source = byId("body-markdown").value.replaceAll("\r\n", "\n");
  preview.replaceChildren();
  if (!source.trim()) {
    preview.append(node("p", "preview-placeholder", "La vista previa aparecerá mientras escribes."));
    return;
  }

  let currentList = null;
  for (const rawLine of source.split("\n")) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      currentList = null;
      continue;
    }
    if (line.startsWith("### ")) {
      appendMarkdownBlock(preview, "h3", line.slice(4).trim());
      currentList = null;
    } else if (line.startsWith("## ")) {
      appendMarkdownBlock(preview, "h2", line.slice(3).trim());
      currentList = null;
    } else if (line.startsWith("# ")) {
      appendMarkdownBlock(preview, "h1", line.slice(2).trim());
      currentList = null;
    } else if (line.startsWith("- ")) {
      if (!currentList) {
        currentList = document.createElement("ul");
        preview.append(currentList);
      }
      appendMarkdownBlock(currentList, "li", line.slice(2).trim());
    } else {
      appendMarkdownBlock(preview, "p", line.trim());
      currentList = null;
    }
  }
}

function renderTagsPreview() {
  byId("tags-preview").replaceChildren(
    ...selectedTags().map((tag) => node("span", "tag", `#${tag}`))
  );
  updateSummary();
}

function updateCounters() {
  const excerpt = byId("excerpt").value;
  const body = byId("body-markdown").value;
  byId("excerpt-count").textContent = String(excerpt.length);
  byId("body-count").textContent = body.length.toLocaleString("es-ES");
  byId("word-count").textContent = String(body.trim() ? body.trim().split(/\s+/).length : 0);
}

function updateSummary() {
  byId("status-title").textContent = state.post
    ? STATUS_LABELS[state.post.status] ?? state.post.status
    : "Borrador nuevo";
  byId("version-label").textContent = state.post ? `v${state.post.version}` : "—";
  byId("tag-count").textContent = `${selectedTags().length}/12`;
  byId("product-count").textContent = `${state.selectedProductIds.size}/8`;
  byId("updated-label").textContent = formatDate(state.post?.updatedAt);
}

function productChoice(product) {
  const label = node("label", "product-choice");
  const input = document.createElement("input");
  input.type = "checkbox";
  input.value = product.id;
  input.checked = state.selectedProductIds.has(product.id);
  input.disabled = !isEditable();
  const details = node("span");
  details.append(
    node("strong", "", product.name),
    node("small", "", `${product.category || "Sin categoría"} · ${product.status}`)
  );
  input.addEventListener("change", () => {
    if (input.checked && state.selectedProductIds.size >= 8) {
      input.checked = false;
      setMessage("products-message", "Puedes relacionar un máximo de ocho artículos.", "warning");
      return;
    }
    if (input.checked) state.selectedProductIds.add(product.id);
    else state.selectedProductIds.delete(product.id);
    setMessage("products-message");
    updateSummary();
  });
  label.append(input, details);
  return label;
}

function renderProducts() {
  const available = state.products.filter((product) => product.status !== "ARCHIVED");
  byId("products-selector").replaceChildren(...available.map(productChoice));
  byId("products-loading").hidden = true;
  byId("products-selector").hidden = available.length === 0;
  if (available.length === 0) {
    setMessage("products-message", "Todavía no hay artículos disponibles para relacionar.", "warning");
  }
  updateSummary();
}

function applyEditableState() {
  const editable = isEditable();
  for (const control of byId("post-form").querySelectorAll("input,select,textarea,button")) {
    control.disabled = !editable;
  }
  byId("save-button").disabled = !editable;
  byId("submit-review-button").disabled = !editable || !state.post;
  byId("locked-banner").hidden = editable;
  if (!editable) {
    byId("locked-banner").textContent = state.post.status === "IN_REVIEW"
      ? "La publicación está en revisión y permanece bloqueada hasta que Atelier Lumière la apruebe o solicite cambios."
      : "La publicación no puede modificarse en su estado actual.";
  } else if (state.post?.status === "CHANGES_REQUESTED") {
    const review = state.post.reviews?.find((item) => item.reviewerNote);
    if (review?.reviewerNote) {
      byId("locked-banner").hidden = false;
      byId("locked-banner").textContent = `Cambios solicitados: ${review.reviewerNote}`;
    }
  }
  renderProducts();
}

function fillPost(post) {
  byId("title").value = post.title ?? "";
  byId("category").value = post.category ?? "";
  byId("tags").value = Array.isArray(post.tags) ? post.tags.join(", ") : "";
  byId("excerpt").value = post.excerpt ?? "";
  byId("body-markdown").value = post.bodyMarkdown ?? "";
  state.selectedProductIds = new Set((post.relatedProducts ?? []).map((product) => product.id));
  updateCounters();
  renderMarkdown();
  renderTagsPreview();
  applyEditableState();
}

async function savePost({ quiet = false } = {}) {
  if (state.saving || !isEditable()) return state.post;
  if (!byId("post-form").reportValidity()) return null;
  const input = formInput();
  if (!input.title) {
    setMessage("save-message", "Escribe un título para la publicación.", "error");
    return null;
  }
  if (selectedTags().length > 12 || state.selectedProductIds.size > 8) {
    setMessage("save-message", "Revisa el número de etiquetas y artículos relacionados.", "error");
    return null;
  }

  state.saving = true;
  const button = byId("save-button");
  const previousText = button.textContent;
  button.disabled = true;
  button.textContent = "Guardando…";
  if (!quiet) setMessage("save-message", "Guardando la publicación…");

  try {
    const response = state.post
      ? await api(`/internal/provider/blog-posts/${state.post.id}`, {
          method: "PATCH",
          body: JSON.stringify({ ...input, expectedVersion: state.post.version })
        })
      : await api("/internal/provider/blog-posts", {
          method: "POST",
          body: JSON.stringify(input)
        });

    const saved = response.post;
    state.post = {
      ...(state.post ?? {}),
      ...saved,
      tags: selectedTags(),
      relatedProducts: state.products.filter((product) => state.selectedProductIds.has(product.id)),
      reviews: state.post?.reviews ?? [],
      media: state.post?.media ?? []
    };
    if (!queryPostId()) {
      history.replaceState(null, "", `/proveedor/publicaciones/editar/?id=${encodeURIComponent(saved.id)}`);
    }

    await api(`/internal/provider/blog-posts/${saved.id}/tags`, {
      method: "PUT",
      body: JSON.stringify({ tags: state.post.tags })
    });
    await api(`/internal/provider/blog-posts/${saved.id}/products`, {
      method: "PUT",
      body: JSON.stringify({ productIds: [...state.selectedProductIds] })
    });

    byId("page-title").textContent = saved.title;
    updateSummary();
    applyEditableState();
    if (!quiet) setMessage("save-message", "Borrador guardado.", "success");
    return state.post;
  } catch (error) {
    setMessage(
      "save-message",
      error.code === "BLOG_POST_VERSION_CONFLICT"
        ? "La publicación ha cambiado en otra ventana. Recárgala antes de guardar."
        : error.message,
      error.code === "BLOG_POST_VERSION_CONFLICT" ? "warning" : "error"
    );
    return null;
  } finally {
    state.saving = false;
    button.textContent = previousText;
    button.disabled = !isEditable();
  }
}

async function submitReview() {
  if (!isEditable()) return;
  setMessage("review-message", "Guardando antes de enviar…");
  const saved = await savePost({ quiet: true });
  if (!saved) {
    setMessage("review-message", "No se pudo guardar la publicación antes de enviarla.", "error");
    return;
  }

  const button = byId("submit-review-button");
  button.disabled = true;
  button.textContent = "Enviando…";
  try {
    const response = await api(`/internal/provider/blog-posts/${saved.id}/submit`, {
      method: "POST",
      body: JSON.stringify({
        expectedVersion: saved.version,
        providerNote: byId("review-note").value.trim()
      })
    });
    state.post = {
      ...state.post,
      ...response.post,
      reviews: [response.review, ...(state.post.reviews ?? [])]
    };
    updateSummary();
    applyEditableState();
    setMessage("review-message", "Publicación enviada a revisión.", "success");
  } catch (error) {
    setMessage(
      "review-message",
      error.message,
      error.code === "BLOG_POST_NOT_READY_FOR_REVIEW" ? "warning" : "error"
    );
    button.disabled = false;
  } finally {
    button.textContent = "Enviar a revisión";
  }
}

async function loadProducts() {
  try {
    const response = await api("/internal/provider/products");
    state.products = Array.isArray(response.products) ? response.products : [];
    renderProducts();
  } catch (error) {
    byId("products-loading").hidden = true;
    setMessage("products-message", error.message, "error");
  }
}

async function loadEditor() {
  const postId = queryPostId();
  const productsPromise = loadProducts();
  if (!postId) {
    updateCounters();
    renderMarkdown();
    renderTagsPreview();
    applyEditableState();
    byId("editor-loading").hidden = true;
    byId("editor-content").hidden = false;
    await productsPromise;
    return;
  }

  try {
    const response = await api(`/internal/provider/blog-posts/${postId}`);
    state.post = response.post;
    byId("page-title").textContent = state.post.title;
    fillPost(state.post);
    byId("editor-loading").hidden = true;
    byId("editor-content").hidden = false;
    await productsPromise;
    renderProducts();
  } catch (error) {
    byId("editor-loading").hidden = true;
    byId("editor-error-message").textContent = error.message;
    byId("editor-error").hidden = false;
  }
}

byId("post-form").addEventListener("submit", (event) => {
  event.preventDefault();
  void savePost();
});
for (const id of ["excerpt", "body-markdown"]) {
  byId(id).addEventListener("input", () => {
    updateCounters();
    renderMarkdown();
  });
}
byId("tags").addEventListener("input", renderTagsPreview);
byId("submit-review-button").addEventListener("click", () => void submitReview());
byId("logout-button").addEventListener("click", async () => {
  try { await fetch("/internal/provider/session", { method: "DELETE" }); }
  finally { window.location.replace("/proveedor/acceso/"); }
});

void loadEditor();

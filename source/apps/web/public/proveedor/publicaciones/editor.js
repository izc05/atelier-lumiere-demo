const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EDITABLE = new Set(["DRAFT", "CHANGES_REQUESTED"]);
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_IMAGES = 12;
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
  saving: false,
  uploading: false
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
function formatBytes(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 1) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
function mediaItems() {
  return Array.isArray(state.post?.media)
    ? state.post.media.filter((item) => item.status === "READY")
    : [];
}
function hasCover() {
  return mediaItems().some((item) => item.placement === "COVER");
}
function mediaUrl(item, variant = "preview") {
  return `/internal/provider/blog-posts/${state.post.id}/media/${item.id}/${variant}`;
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
  const images = mediaItems();
  byId("status-title").textContent = state.post
    ? STATUS_LABELS[state.post.status] ?? state.post.status
    : "Borrador nuevo";
  byId("version-label").textContent = state.post ? `v${state.post.version}` : "—";
  byId("tag-count").textContent = `${selectedTags().length}/12`;
  byId("product-count").textContent = `${state.selectedProductIds.size}/8`;
  byId("image-count").textContent = `${images.length}/12`;
  byId("cover-label").textContent = images.some((item) => item.placement === "COVER")
    ? "Preparada"
    : "Pendiente";
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

function mediaCard(item) {
  const card = node("article", "blog-media-card");
  const visual = node("div", "blog-media-visual");
  const image = document.createElement("img");
  image.src = mediaUrl(item, "preview");
  image.alt = item.altText || item.originalFilename;
  image.loading = "lazy";
  visual.append(image, node(
    "span",
    "placement-badge",
    item.placement === "COVER" ? "Portada" : "Interior"
  ));

  const body = node("div", "blog-media-body");
  body.append(
    node("div", "media-name", item.originalFilename),
    node("div", "media-meta", `${formatBytes(item.sizeBytes)} · ${item.width || "?"} × ${item.height || "?"} px`)
  );

  const alt = document.createElement("input");
  alt.type = "text";
  alt.maxLength = 240;
  alt.placeholder = "Describe la fotografía";
  alt.value = item.altText || "";
  alt.disabled = !isEditable();

  const selectedPlacement = document.createElement("select");
  for (const [value, label] of [["COVER", "Portada"], ["INLINE", "Imagen interior"]]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    option.selected = item.placement === value;
    selectedPlacement.append(option);
  }
  selectedPlacement.disabled = !isEditable();

  const order = document.createElement("input");
  order.type = "number";
  order.min = "0";
  order.max = "1000";
  order.step = "1";
  order.value = String(item.sortOrder ?? 0);
  order.disabled = !isEditable();

  const actions = node("div", "blog-media-actions");
  const save = node("button", "button secondary", "Guardar datos");
  save.type = "button";
  save.disabled = !isEditable();
  save.addEventListener("click", async () => {
    save.disabled = true;
    setMessage("media-message", "Guardando información de la imagen…");
    try {
      const response = await api(
        `/internal/provider/blog-posts/${state.post.id}/media/${item.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            altText: alt.value.trim(),
            placement: selectedPlacement.value,
            sortOrder: Number(order.value) || 0
          })
        }
      );
      Object.assign(item, response.media);
      renderMedia();
      setMessage("media-message", "Información guardada.", "success");
    } catch (error) {
      selectedPlacement.value = item.placement;
      setMessage("media-message", error.message, "error");
      save.disabled = !isEditable();
    }
  });

  const remove = node("button", "button ghost", "Retirar");
  remove.type = "button";
  remove.disabled = !isEditable();
  remove.addEventListener("click", async () => {
    if (!window.confirm(`¿Retirar ${item.originalFilename} de la publicación?`)) return;
    remove.disabled = true;
    try {
      await api(`/internal/provider/blog-posts/${state.post.id}/media/${item.id}`, {
        method: "DELETE"
      });
      state.post.media = (state.post.media ?? []).filter((media) => media.id !== item.id);
      renderMedia();
      setMessage("media-message", "Imagen retirada.", "success");
    } catch (error) {
      setMessage("media-message", error.message, "error");
      remove.disabled = false;
    }
  });

  actions.append(save, remove);
  body.append(alt, selectedPlacement, order, actions);
  card.append(visual, body);
  return card;
}

function renderMedia() {
  const images = mediaItems().sort((a, b) => {
    if (a.placement !== b.placement) return a.placement === "COVER" ? -1 : 1;
    return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  });
  byId("media-grid").replaceChildren(...images.map(mediaCard));
  byId("media-grid").hidden = images.length === 0;
  byId("media-empty").hidden = images.length !== 0;
  byId("cover-input").disabled = !isEditable() || state.uploading || hasCover();
  byId("inline-input").disabled = !isEditable() || state.uploading || images.length >= MAX_IMAGES;
  updateSummary();
}

function applyEditableState() {
  const editable = isEditable();
  for (const control of byId("post-form").querySelectorAll("input,select,textarea,button")) {
    control.disabled = !editable;
  }
  byId("save-button").disabled = !editable;
  byId("submit-review-button").disabled = !editable || !state.post;
  byId("media-needs-save").hidden = Boolean(state.post);
  byId("media-controls").hidden = !state.post;
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
  renderMedia();
}

function fillPost(post) {
  byId("title").value = post.title ?? "";
  byId("category").value = post.category ?? "";
  byId("tags").value = Array.isArray(post.tags) ? post.tags.join(", ") : "";
  byId("excerpt").value = post.excerpt ?? "";
  byId("body-markdown").value = post.bodyMarkdown ?? "";
  state.selectedProductIds = new Set((post.relatedProducts ?? []).map((product) => product.id));
  state.post.media = Array.isArray(post.media) ? post.media : [];
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

async function uploadOne(file, selectedPlacement) {
  if (!IMAGE_TYPES.has(file.type)) {
    throw new Error(`${file.name}: solo se admiten JPEG, PNG o WebP.`);
  }
  if (file.size < 1 || file.size > MAX_IMAGE_BYTES) {
    throw new Error(`${file.name}: supera el límite de 12 MB.`);
  }
  const response = await fetch(`/internal/provider/blog-posts/${state.post.id}/media`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": file.type,
      "X-File-Name": encodeURIComponent(file.name),
      "X-Alt-Text": "",
      "X-Media-Placement": selectedPlacement
    },
    body: file
  });
  const payload = await response.json().catch(() => ({}));
  if (response.status === 401) {
    window.location.replace("/proveedor/acceso/");
    throw new Error("La sesión ha caducado.");
  }
  if (!response.ok) throw new Error(payload.message || `No se pudo subir ${file.name}.`);
  state.post.media ??= [];
  state.post.media.push(payload.media);
}

async function uploadFiles(files, selectedPlacement) {
  if (!state.post || !isEditable() || state.uploading || files.length === 0) return;
  if (selectedPlacement === "COVER" && hasCover()) {
    setMessage("media-message", "Ya existe una portada. Retírala o conviértela en imagen interior.", "warning");
    return;
  }
  const freeSlots = MAX_IMAGES - mediaItems().length;
  const selected = files.slice(0, Math.max(0, freeSlots));
  if (selected.length === 0) {
    setMessage("media-message", "La publicación ya tiene doce imágenes.", "warning");
    return;
  }

  state.uploading = true;
  const status = byId("upload-status");
  const progress = byId("upload-progress");
  status.hidden = false;
  progress.value = 0;
  setMessage("media-message");
  renderMedia();

  for (let index = 0; index < selected.length; index += 1) {
    const file = selected[index];
    byId("upload-label").textContent = `Subiendo ${index + 1} de ${selected.length}: ${file.name}`;
    progress.value = Math.round((index / selected.length) * 100);
    try {
      await uploadOne(file, selectedPlacement === "COVER" ? "COVER" : "INLINE");
      renderMedia();
    } catch (error) {
      setMessage("media-message", error.message, "error");
      break;
    }
  }

  progress.value = 100;
  byId("upload-label").textContent = "Carga terminada.";
  state.uploading = false;
  byId("cover-input").value = "";
  byId("inline-input").value = "";
  renderMedia();
  window.setTimeout(() => {
    status.hidden = true;
    progress.value = 0;
  }, 1200);
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
    renderMedia();
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
byId("cover-input").addEventListener("change", (event) => {
  void uploadFiles([...event.target.files].slice(0, 1), "COVER");
});
byId("inline-input").addEventListener("change", (event) => {
  void uploadFiles([...event.target.files], "INLINE");
});
byId("submit-review-button").addEventListener("click", () => void submitReview());
byId("logout-button").addEventListener("click", async () => {
  try { await fetch("/internal/provider/session", { method: "DELETE" }); }
  finally { window.location.replace("/proveedor/acceso/"); }
});

void loadEditor();

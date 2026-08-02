const STATUS_LABELS = Object.freeze({
  DRAFT: "Borrador",
  IN_REVIEW: "En revisión",
  CHANGES_REQUESTED: "Cambios solicitados",
  APPROVED: "Aprobado",
  PUBLISHED: "Publicado",
  ARCHIVED: "Archivado"
});

const STATUS_CLASSES = Object.freeze({
  DRAFT: "draft",
  IN_REVIEW: "review",
  CHANGES_REQUESTED: "changes",
  APPROVED: "approved",
  PUBLISHED: "published",
  ARCHIVED: "archived"
});

let products = [];
let searchTimer = null;

function byId(id) {
  return document.getElementById(id);
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function money(cents, currency = "EUR") {
  if (!Number.isInteger(cents)) return "Precio pendiente";
  return new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(cents / 100);
}

function formatDate(value) {
  if (!value) return "Sin fecha";
  try {
    return new Intl.DateTimeFormat("es-ES", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(value));
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

function badge(status) {
  return element(
    "span",
    `status ${STATUS_CLASSES[status] ?? "archived"}`,
    STATUS_LABELS[status] ?? status
  );
}

function card(product) {
  const article = element("article", "review-card");
  const content = element("div");
  content.append(badge(product.status));
  content.append(element("h2", "", product.name));
  content.append(element(
    "p",
    "",
    `${product.provider.displayName} · ${product.category || "Sin categoría"}`
  ));

  const meta = element("div", "card-meta");
  const values = [
    money(product.priceCents, product.currency),
    `${product.imageCount} foto${product.imageCount === 1 ? "" : "s"}`,
    `${product.videoCount} vídeo${product.videoCount === 1 ? "" : "s"}`,
    product.latestSubmissionNumber ? `Envío ${product.latestSubmissionNumber}` : "Sin envío",
    `Actualizado ${formatDate(product.updatedAt)}`
  ];
  for (const value of values) meta.append(element("span", "", value));
  content.append(meta);

  const link = element("a", "button primary", product.status === "IN_REVIEW" ? "Revisar ahora" : "Abrir ficha");
  link.href = `/admin/articulos/revisar/?id=${encodeURIComponent(product.id)}`;
  article.append(content, link);
  return article;
}

function updateMetrics() {
  byId("metric-total").textContent = String(products.length);
  byId("metric-review").textContent = String(products.filter((item) => item.status === "IN_REVIEW").length);
  byId("metric-approved").textContent = String(products.filter((item) => item.status === "APPROVED").length);
  byId("metric-published").textContent = String(products.filter((item) => item.status === "PUBLISHED").length);
}

function render() {
  const list = byId("review-list");
  list.replaceChildren(...products.map(card));
  list.hidden = products.length === 0;
  byId("empty-view").hidden = products.length !== 0;
  updateMetrics();
}

async function load() {
  byId("loading-view").hidden = false;
  byId("error-view").hidden = true;
  byId("empty-view").hidden = true;
  byId("review-list").hidden = true;
  try {
    const params = new URLSearchParams();
    const status = byId("status-filter").value;
    const query = byId("search-input").value.trim();
    if (status && status !== "ALL") params.set("status", status);
    if (query) params.set("q", query);
    const suffix = params.toString() ? `?${params}` : "";
    const payload = await requestJson(`/internal/admin/products${suffix}`);
    products = Array.isArray(payload.products) ? payload.products : [];
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
  searchTimer = window.setTimeout(() => void load(), 280);
});
byId("refresh-button").addEventListener("click", () => void load());
byId("retry-button").addEventListener("click", () => void load());
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

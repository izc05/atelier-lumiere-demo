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
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency
  }).format(cents / 100);
}

function formatDate(value) {
  if (!value) return "Sin fecha";
  try {
    return new Intl.DateTimeFormat("es-ES", { dateStyle: "medium" }).format(new Date(value));
  } catch {
    return "Sin fecha";
  }
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
    window.location.replace("/proveedor/acceso/");
    throw new Error("La sesión ha caducado.");
  }
  if (!response.ok) throw new Error(payload.message || "No se pudo completar la operación.");
  return payload;
}

function statusBadge(product) {
  return element(
    "span",
    `status ${STATUS_CLASSES[product.status] ?? "archived"}`,
    STATUS_LABELS[product.status] ?? product.status
  );
}

function fact(text) {
  return element("span", "", text);
}

function productCard(product) {
  const card = element("article", "product-card");
  const cover = element("div", "product-cover", product.imageCount > 0 ? `${product.imageCount} foto${product.imageCount === 1 ? "" : "s"}` : "Sin fotos");
  const body = element("div", "product-body");
  const meta = element("div", "product-meta");
  meta.append(statusBadge(product), element("small", "", `v${product.version}`));

  const title = element("h2", "", product.name);
  const description = element(
    "p",
    "",
    product.shortDescription || "La descripción breve está pendiente."
  );
  const facts = element("div", "product-facts");
  facts.append(
    fact(product.category || "Sin categoría"),
    fact(`${product.imageCount} imágenes`),
    fact(`${product.videoCount} vídeo${product.videoCount === 1 ? "" : "s"}`),
    fact(`Actualizado ${formatDate(product.updatedAt)}`)
  );

  const actions = element("div", "card-actions");
  actions.append(
    element("strong", "price", money(product.priceCents, product.currency))
  );
  const link = element(
    "a",
    `button ${["DRAFT", "CHANGES_REQUESTED"].includes(product.status) ? "primary" : "secondary"}`,
    ["DRAFT", "CHANGES_REQUESTED"].includes(product.status) ? "Editar" : "Consultar"
  );
  link.href = `/proveedor/articulos/editar/?id=${encodeURIComponent(product.id)}`;
  actions.append(link);

  body.append(meta, title, description, facts, actions);
  card.append(cover, body);
  return card;
}

function updateMetrics() {
  byId("metric-total").textContent = String(products.length);
  byId("metric-drafts").textContent = String(
    products.filter((product) => ["DRAFT", "CHANGES_REQUESTED"].includes(product.status)).length
  );
  byId("metric-review").textContent = String(
    products.filter((product) => product.status === "IN_REVIEW").length
  );
  byId("metric-published").textContent = String(
    products.filter((product) => product.status === "PUBLISHED").length
  );
}

function render() {
  const query = byId("search-input").value.trim().toLocaleLowerCase("es");
  const status = byId("status-filter").value;
  const visible = products.filter((product) => {
    const matchesStatus = status === "ALL" || product.status === status;
    const haystack = [product.name, product.category, product.shortDescription]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("es");
    return matchesStatus && (!query || haystack.includes(query));
  });

  const list = byId("products-list");
  list.replaceChildren(...visible.map(productCard));
  byId("products-empty").hidden = products.length !== 0;
  byId("products-no-results").hidden = products.length === 0 || visible.length !== 0;
  list.hidden = visible.length === 0;
}

async function loadProducts() {
  byId("products-loading").hidden = false;
  byId("products-error").hidden = true;
  byId("products-list").hidden = true;
  try {
    const payload = await requestJson("/internal/provider/products");
    products = Array.isArray(payload.products) ? payload.products : [];
    updateMetrics();
    render();
  } catch (error) {
    byId("products-error-message").textContent = error.message;
    byId("products-error").hidden = false;
  } finally {
    byId("products-loading").hidden = true;
  }
}

byId("search-input").addEventListener("input", render);
byId("status-filter").addEventListener("change", render);
byId("retry-button").addEventListener("click", () => void loadProducts());
byId("logout-button").addEventListener("click", async () => {
  const button = byId("logout-button");
  button.disabled = true;
  button.textContent = "Cerrando…";
  try {
    await fetch("/internal/provider/session", { method: "DELETE" });
  } finally {
    window.location.replace("/proveedor/acceso/");
  }
});

void loadProducts();

const ORDER = [
  "aviso-legal",
  "privacidad",
  "cookies",
  "condiciones-compra",
  "envios-devoluciones",
  "productos-personalizados",
  "proveedores",
  "licencias-contenido"
];

function node(tag, className, text) {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (text !== undefined) item.textContent = text;
  return item;
}

async function load() {
  const loading = document.getElementById("legal-loading");
  const grid = document.getElementById("legal-grid");
  const error = document.getElementById("legal-error");
  try {
    const response = await fetch("/internal/legal/documents", {
      headers: { Accept: "application/json" }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || "No se pudieron cargar los documentos.");
    const documents = Array.isArray(payload.documents) ? payload.documents : [];
    documents.sort((a, b) => ORDER.indexOf(a.slug) - ORDER.indexOf(b.slug));
    const cards = documents.map((document) => {
      const link = node("a", "legal-card");
      link.href = `/legal/${document.slug}/`;
      link.append(
        node("p", "eyebrow", document.status === "PUBLISHED" ? "Documento vigente" : "Borrador técnico"),
        node("h2", "", document.title),
        node("p", "", document.summary),
        node("small", "", `Versión ${document.version}`)
      );
      return link;
    });
    grid.replaceChildren(...cards);
    grid.hidden = false;
  } catch (failure) {
    document.getElementById("legal-error-message").textContent = failure.message;
    error.hidden = false;
  } finally {
    loading.hidden = true;
  }
}

void load();

function node(tag, className, text) {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (text !== undefined) item.textContent = text;
  return item;
}

function appendInline(parent, text) {
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]*(?:PENDIENTE|NO APLICA)[^\]]*\])/gi;
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > cursor) parent.append(document.createTextNode(text.slice(cursor, match.index)));
    const token = match[0];
    if (token.startsWith("**")) {
      parent.append(node("strong", "", token.slice(2, -2)));
    } else if (token.startsWith("`")) {
      parent.append(node("code", "", token.slice(1, -1)));
    } else {
      parent.append(node("span", "placeholder", token));
    }
    cursor = match.index + token.length;
  }
  if (cursor < text.length) parent.append(document.createTextNode(text.slice(cursor)));
}

function renderMarkdown(markdown) {
  const fragment = document.createDocumentFragment();
  const lines = String(markdown ?? "").replaceAll("\r\n", "\n").split("\n");
  let paragraph = [];
  let list = null;

  function flushParagraph() {
    if (paragraph.length === 0) return;
    const item = node("p");
    appendInline(item, paragraph.join(" "));
    fragment.append(item);
    paragraph = [];
  }
  function flushList() {
    if (!list) return;
    fragment.append(list);
    list = null;
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const item = node(`h${heading[1].length}`);
      appendInline(item, heading[2]);
      fragment.append(item);
      continue;
    }
    if (line.startsWith("> ")) {
      flushParagraph();
      flushList();
      const item = node("blockquote");
      appendInline(item, line.slice(2));
      fragment.append(item);
      continue;
    }
    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      list ??= node("ul");
      const item = node("li");
      appendInline(item, bullet[1]);
      list.append(item);
      continue;
    }
    flushList();
    paragraph.push(line.trim());
  }
  flushParagraph();
  flushList();
  return fragment;
}

function formatDate(value) {
  if (!value) return "Pendiente";
  try {
    return new Intl.DateTimeFormat("es-ES", { dateStyle: "long" }).format(new Date(value));
  } catch {
    return "Pendiente";
  }
}

async function load() {
  const slug = document.body.dataset.legalSlug;
  const loading = document.getElementById("document-loading");
  const content = document.getElementById("document-content");
  const error = document.getElementById("document-error");
  try {
    const response = await fetch(`/internal/legal/documents/${encodeURIComponent(slug)}`, {
      headers: { Accept: "application/json" }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || "No se pudo cargar el documento.");
    const legalDocument = payload.document;
    document.title = `${legalDocument.title} · Atelier Lumière`;
    document.getElementById("document-title").textContent = legalDocument.title;
    document.getElementById("document-summary").textContent = legalDocument.summary;
    document.getElementById("document-body").replaceChildren(renderMarkdown(legalDocument.contentMd));
    document.getElementById("document-version").textContent = legalDocument.version;
    document.getElementById("document-status").textContent = legalDocument.status === "PUBLISHED"
      ? "Publicado"
      : "Borrador técnico";
    document.getElementById("document-effective").textContent = formatDate(legalDocument.effectiveAt);
    document.getElementById("document-hash").textContent = legalDocument.contentSha256;
    document.getElementById("draft-banner").hidden = !legalDocument.professionalReviewRequired;
    content.hidden = false;
  } catch (failure) {
    document.getElementById("document-error-message").textContent = failure.message;
    error.hidden = false;
  } finally {
    loading.hidden = true;
  }
}

void load();

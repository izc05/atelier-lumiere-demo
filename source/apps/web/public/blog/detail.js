const byId = (id) => document.getElementById(id);
const element = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

function date(value) {
  try {
    return new Intl.DateTimeFormat("es-ES", { dateStyle: "long" }).format(new Date(value));
  } catch {
    return "";
  }
}

function inline(text) {
  const fragment = document.createDocumentFragment();
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > last) fragment.append(document.createTextNode(text.slice(last, match.index)));
    const token = match[0];
    if (token.startsWith("**")) {
      fragment.append(element("strong", "", token.slice(2, -2)));
    } else if (token.startsWith("`")) {
      fragment.append(element("code", "", token.slice(1, -1)));
    } else {
      const parts = token.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
      const link = element("a", "", parts[1]);
      link.href = parts[2];
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      fragment.append(link);
    }
    last = match.index + token.length;
  }
  if (last < text.length) fragment.append(document.createTextNode(text.slice(last)));
  return fragment;
}

function markdown(source) {
  const container = document.createDocumentFragment();
  const lines = String(source || "").replace(/\r/g, "").split("\n");
  let paragraph = [];
  let list = null;
  const flush = () => {
    if (paragraph.length) {
      const node = element("p");
      node.append(inline(paragraph.join(" ")));
      container.append(node);
      paragraph = [];
    }
    if (list) {
      container.append(list);
      list = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const heading = line.match(/^(#{2,3})\s+(.+)$/);
    if (heading) {
      flush();
      const node = element(heading[1].length === 2 ? "h2" : "h3");
      node.append(inline(heading[2]));
      container.append(node);
      continue;
    }
    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      if (paragraph.length) flush();
      list ??= element("ul");
      const item = element("li");
      item.append(inline(bullet[1]));
      list.append(item);
      continue;
    }
    paragraph.push(line);
  }
  flush();
  return container;
}

function productCard(product) {
  const link = element("a", "product");
  link.href = `/tienda/articulo/?taller=${encodeURIComponent(product.providerSlug)}&articulo=${encodeURIComponent(product.slug)}`;
  if (product.cover) {
    const image = document.createElement("img");
    window.AtelierImages.configure(image, {
      path: product.cover.path,
      alt: product.cover.altText || product.name,
      sizes: "(max-width: 760px) 32vw, 150px",
      loading: "lazy",
      priority: "low",
      defaultWidth: 320
    });
    link.append(image);
  } else {
    link.append(element("span", "", "Sin foto"));
  }
  const body = element("span");
  body.append(
    element("strong", "", product.name),
    element("small", "", product.shortDescription || product.category || "Pieza artesanal")
  );
  link.append(body);
  return link;
}

async function load() {
  const params = new URL(window.location.href).searchParams;
  const provider = params.get("taller") || "";
  const post = params.get("historia") || "";
  if (!/^[a-z0-9-]+$/i.test(provider) || !/^[a-z0-9-]+$/i.test(post)) {
    showError("La dirección de esta historia no es válida.");
    return;
  }

  try {
    const response = await fetch(
      `/internal/blog/posts/${encodeURIComponent(provider)}/${encodeURIComponent(post)}`,
      { headers: { Accept: "application/json" } }
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || "La historia no está disponible.");

    const item = payload.post;
    document.title = `${item.title} · Atelier Lumière`;
    byId("eyebrow").textContent = [item.category, item.provider.displayName].filter(Boolean).join(" · ");
    byId("title").textContent = item.title;
    byId("excerpt").textContent = item.excerpt;
    byId("provider").textContent = item.provider.displayName;
    byId("specialty").textContent = item.provider.specialty || "Taller artesano";
    byId("published").textContent = `Publicado el ${date(item.publishedAt)}`;
    byId("tags").replaceChildren(...item.tags.map((tag) => element("span", "tag", tag)));

    window.AtelierImages.configure(byId("cover"), {
      path: item.cover.path,
      alt: item.cover.altText || item.title,
      width: item.cover.width,
      height: item.cover.height,
      sizes: "(max-width: 1000px) calc(100vw - 28px), 1160px",
      loading: "eager",
      priority: "high",
      defaultWidth: 960
    });

    byId("prose").replaceChildren(markdown(item.bodyMarkdown));
    const gallery = (item.media || []).filter((media) => media.placement !== "COVER");
    byId("gallery").replaceChildren(...gallery.map((media) => {
      const image = document.createElement("img");
      window.AtelierImages.configure(image, {
        path: media.path,
        alt: media.altText || item.title,
        width: media.width,
        height: media.height,
        sizes: "(max-width: 760px) calc(100vw - 36px), 760px",
        loading: "lazy",
        priority: "low",
        defaultWidth: 640
      });
      return image;
    }));

    const related = item.relatedProducts || [];
    byId("related").replaceChildren(...related.map(productCard));
    byId("related-wrap").hidden = related.length === 0;
    byId("loading").hidden = true;
    byId("article").hidden = false;
  } catch (error) {
    showError(error.message);
  }
}

function showError(text) {
  byId("loading").hidden = true;
  byId("error-message").textContent = text;
  byId("error").hidden = false;
}

void load();

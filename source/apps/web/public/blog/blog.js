let posts = [];

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

function card(post) {
  const article = element("article", "card");
  const link = element("a", "card-link");
  link.href = `/blog/historia/?taller=${encodeURIComponent(post.provider.slug)}&historia=${encodeURIComponent(post.slug)}`;

  const image = document.createElement("img");
  image.className = "cover";
  window.AtelierImages.configure(image, {
    path: post.cover.path,
    alt: post.cover.altText || post.title,
    width: post.cover.width,
    height: post.cover.height,
    sizes: "(max-width: 720px) calc(100vw - 38px), (max-width: 1040px) 50vw, 390px",
    loading: "lazy",
    priority: "low",
    defaultWidth: 640
  });

  const body = element("div", "card-body");
  const meta = element("div", "meta");
  meta.append(
    element("span", "", post.category || "Historia artesana"),
    element("span", "", post.provider.displayName),
    element("span", "", date(post.publishedAt))
  );
  body.append(meta, element("h2", "", post.title), element("p", "", post.excerpt));

  const tags = element("div", "tags");
  for (const tag of post.tags.slice(0, 4)) tags.append(element("span", "tag", tag));
  body.append(tags);
  link.append(image, body);
  article.append(link);
  return article;
}

function render() {
  const query = byId("search").value.trim().toLocaleLowerCase("es");
  const category = byId("category").value;
  const tag = byId("tag").value
    .trim()
    .toLocaleLowerCase("es")
    .replace(/[^a-z0-9áéíóúüñ -]/g, "");
  const visible = posts.filter((post) => {
    const haystack = [
      post.title,
      post.excerpt,
      post.category,
      post.provider.displayName,
      ...post.tags
    ].filter(Boolean).join(" ").toLocaleLowerCase("es");
    return (!query || haystack.includes(query))
      && (!category || post.category === category)
      && (!tag || post.tags.some((item) => item.includes(tag.replace(/\s+/g, "-"))));
  });
  byId("grid").replaceChildren(...visible.map(card));
  byId("grid").hidden = visible.length === 0;
  byId("empty").hidden = visible.length !== 0;
}

async function load() {
  byId("loading").hidden = false;
  byId("error").hidden = true;
  try {
    const response = await fetch("/internal/blog/posts", { headers: { Accept: "application/json" } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || "El blog no responde.");
    posts = Array.isArray(payload.posts) ? payload.posts : [];
    const categories = [...new Set(posts.map((item) => item.category).filter(Boolean))]
      .sort((left, right) => left.localeCompare(right, "es"));
    byId("category").replaceChildren(
      new Option("Todas las categorías", ""),
      ...categories.map((value) => new Option(value, value))
    );
    render();
  } catch (error) {
    byId("error-message").textContent = error.message;
    byId("error").hidden = false;
    byId("grid").hidden = true;
    byId("empty").hidden = true;
  } finally {
    byId("loading").hidden = true;
  }
}

byId("search").addEventListener("input", render);
byId("category").addEventListener("change", render);
byId("tag").addEventListener("input", render);
byId("retry").addEventListener("click", () => void load());
void load();

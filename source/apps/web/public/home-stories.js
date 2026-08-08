(() => {
  const byId = (id) => document.getElementById(id);

  function element(tag, className, text) {
    const value = document.createElement(tag);
    if (className) value.className = className;
    if (text !== undefined) value.textContent = text;
    return value;
  }

  function formatDate(value) {
    try {
      return new Intl.DateTimeFormat("es-ES", {
        day: "numeric",
        month: "short",
        year: "numeric"
      }).format(new Date(value));
    } catch {
      return "";
    }
  }

  function compactText(value, maximum = 180) {
    const text = String(value || "").trim().replace(/\s+/g, " ");
    if (text.length <= maximum) return text;
    return `${text.slice(0, maximum - 1).trimEnd()}…`;
  }

  function configureImage(image, media, options = {}) {
    if (!media?.path || !window.AtelierImages?.configure) return false;
    return window.AtelierImages.configure(image, {
      path: media.path,
      alt: media.altText || options.alt || "",
      width: media.width,
      height: media.height,
      sizes: options.sizes || "100vw",
      loading: options.loading || "lazy",
      priority: options.priority || "low",
      defaultWidth: options.defaultWidth || 640
    });
  }

  function storyCard(post, index) {
    const article = element("article", "home-story-card");
    const link = element("a", "home-story-link");
    const providerSlug = encodeURIComponent(post.provider?.slug || "");
    const storySlug = encodeURIComponent(post.slug || "");
    link.href = `/blog/historia/?taller=${providerSlug}&historia=${storySlug}`;
    link.setAttribute("aria-label", `Leer ${post.title || "historia artesana"}`);

    const media = element("div", "home-story-media");
    const image = document.createElement("img");
    if (configureImage(image, post.cover, {
      alt: post.cover?.altText || post.title || "Historia artesana",
      sizes: index === 0
        ? "(max-width: 780px) calc(100vw - 40px), (max-width: 1080px) 55vw, 760px"
        : "(max-width: 780px) calc(100vw - 40px), (max-width: 1080px) 50vw, 360px",
      defaultWidth: index === 0 ? 960 : 640
    })) media.append(image);
    media.append(element("span", "home-story-number", String(index + 1).padStart(2, "0")));

    const body = element("div", "home-story-body");
    const meta = element("div", "home-story-meta");
    const metaValues = [
      post.category || "Historia artesana",
      post.provider?.displayName || "Taller invitado",
      formatDate(post.publishedAt)
    ].filter(Boolean);
    for (const value of metaValues) meta.append(element("span", "", value));

    body.append(meta, element("h3", "", post.title || "Historia desde el taller"));
    body.append(element("p", "home-story-excerpt", compactText(
      post.excerpt || "Una mirada al proceso, los materiales y las personas que dan forma a cada pieza."
    )));
    body.append(element("span", "home-story-action", "Leer la historia →"));

    link.append(media, body);
    article.append(link);
    return article;
  }

  async function requestStories() {
    const response = await fetch("/internal/blog/posts", {
      headers: { Accept: "application/json" }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || "Las historias no están disponibles.");
    return Array.isArray(payload.posts) ? payload.posts : [];
  }

  async function loadStories() {
    const loading = byId("home-stories-loading");
    const grid = byId("home-stories-grid");
    const empty = byId("home-stories-empty");
    if (!loading || !grid || !empty) return;

    try {
      const posts = (await requestStories()).slice(0, 3);
      if (posts.length === 0) {
        empty.hidden = false;
        return;
      }
      grid.replaceChildren(...posts.map(storyCard));
      grid.hidden = false;
    } catch {
      empty.hidden = false;
    } finally {
      loading.hidden = true;
    }
  }

  void loadStories();
})();

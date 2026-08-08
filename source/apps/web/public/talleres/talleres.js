let publishedWorkshops = [];
let searchTimer = null;

function byId(id) {
  return document.getElementById(id);
}

function node(tag, className, text) {
  const value = document.createElement(tag);
  if (className) value.className = className;
  if (text !== undefined) value.textContent = text;
  return value;
}

function initials(value) {
  const parts = String(value || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "AL";
  if (parts.length === 1) return parts[0].slice(0, 2).toLocaleUpperCase("es");
  return `${parts[0][0]}${parts.at(-1)[0]}`.toLocaleUpperCase("es");
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .trim();
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
    priority: options.priority || "auto",
    defaultWidth: options.defaultWidth || 640
  });
}

function preferredMedia(workshop) {
  return workshop.cover || workshop.gallery?.[0] || workshop.logo || null;
}

function workshopSearchText(workshop) {
  return normalize([
    workshop.displayName,
    workshop.specialty,
    workshop.tagline,
    workshop.locationLabel,
    workshop.story,
    workshop.craftDescription,
    ...(workshop.materials || []),
    ...(workshop.techniques || [])
  ].filter(Boolean).join(" "));
}

function workshopCard(workshop) {
  const displayName = workshop.displayName || "Taller invitado";
  const article = node("article", "workshop-directory-card");
  const link = node("a", "workshop-directory-link");
  link.href = `/taller/?slug=${encodeURIComponent(workshop.slug || "")}`;
  link.setAttribute("aria-label", `Entrar al taller ${displayName}`);

  const media = node("div", "workshop-directory-media");
  const image = document.createElement("img");
  const visual = preferredMedia(workshop);
  if (configureImage(image, visual, {
    alt: visual?.altText || `Trabajo y espacio del taller ${displayName}`,
    sizes: "(max-width: 620px) calc(100vw - 36px), (max-width: 1120px) 50vw, 460px",
    defaultWidth: 720
  })) {
    media.append(image);
  } else {
    media.append(node("span", "workshop-directory-placeholder", initials(displayName)));
  }
  media.append(node("span", "workshop-directory-shade"));

  if (workshop.logo && workshop.logo.id !== visual?.id) {
    const logo = document.createElement("img");
    logo.className = "workshop-directory-logo";
    if (configureImage(logo, workshop.logo, {
      alt: `Logotipo de ${displayName}`,
      sizes: "76px",
      defaultWidth: 320
    })) media.append(logo);
  }

  const mediaMeta = node("div", "workshop-directory-media-meta");
  if (workshop.locationLabel) mediaMeta.append(node("span", "", workshop.locationLabel));
  if (workshop.acceptsCustomRequests) mediaMeta.append(node("span", "", "Encargos disponibles"));
  if (mediaMeta.childElementCount) media.append(mediaMeta);

  const body = node("div", "workshop-directory-body");
  body.append(
    node("p", "workshop-directory-specialty", workshop.specialty || "Oficio artesanal"),
    node("h2", "", displayName)
  );

  const description = workshop.tagline || workshop.craftDescription || workshop.story ||
    "Piezas hechas con oficio y seleccionadas por Atelier Lumière.";
  body.append(node("p", "workshop-directory-tagline", description));

  const tagValues = [
    ...(Array.isArray(workshop.materials) ? workshop.materials : []),
    ...(Array.isArray(workshop.techniques) ? workshop.techniques : [])
  ].filter(Boolean).filter((value, index, values) => values.indexOf(value) === index).slice(0, 4);
  if (tagValues.length) {
    const tags = node("div", "workshop-directory-tags");
    for (const value of tagValues) tags.append(node("span", "", value));
    body.append(tags);
  }

  const action = node("div", "workshop-directory-action");
  const productCount = Number.isFinite(workshop.publishedProductCount) ? workshop.publishedProductCount : 0;
  action.append(
    node("span", "", productCount === 0
      ? "Colección en preparación"
      : `${productCount} ${productCount === 1 ? "pieza publicada" : "piezas publicadas"}`),
    node("span", "", "Entrar al taller →")
  );
  body.append(action);

  link.append(media, body);
  article.append(link);
  return article;
}

function populateSpecialties(workshops) {
  const select = byId("workshop-specialty");
  const values = [...new Set(workshops
    .map((workshop) => String(workshop.specialty || "").trim())
    .filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, "es", { sensitivity: "base" }));

  for (const value of values) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.append(option);
  }
}

function visibleWorkshops() {
  const query = normalize(byId("workshop-search").value);
  const specialty = normalize(byId("workshop-specialty").value);
  const customOnly = byId("workshop-custom").value === "custom";

  return publishedWorkshops.filter((workshop) => {
    if (query && !workshopSearchText(workshop).includes(query)) return false;
    if (specialty && normalize(workshop.specialty) !== specialty) return false;
    if (customOnly && !workshop.acceptsCustomRequests) return false;
    return true;
  });
}

function render() {
  const visible = visibleWorkshops();
  const grid = byId("workshops-grid");
  const empty = byId("workshops-empty");
  const count = byId("visible-count");
  const label = byId("visible-label");

  count.textContent = String(visible.length);
  label.textContent = visible.length === 1 ? "taller" : "talleres";

  if (visible.length === 0) {
    grid.hidden = true;
    grid.replaceChildren();
    empty.hidden = false;
    return;
  }

  empty.hidden = true;
  grid.replaceChildren(...visible.map(workshopCard));
  grid.hidden = false;
}

function clearFilters() {
  byId("workshop-search").value = "";
  byId("workshop-specialty").value = "";
  byId("workshop-custom").value = "all";
  render();
  byId("workshop-search").focus();
}

async function requestWorkshops() {
  const response = await fetch("/internal/catalog/providers", {
    headers: { Accept: "application/json" }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || "No se pudo abrir el directorio de talleres.");
  return Array.isArray(payload.providers) ? payload.providers : [];
}

async function load() {
  const loading = byId("workshops-loading");
  const errorView = byId("workshops-error");
  const grid = byId("workshops-grid");
  const empty = byId("workshops-empty");

  loading.hidden = false;
  errorView.hidden = true;
  grid.hidden = true;
  empty.hidden = true;

  try {
    publishedWorkshops = await requestWorkshops();
    byId("workshops-total").textContent = String(publishedWorkshops.length);
    populateSpecialties(publishedWorkshops);
    render();
  } catch (error) {
    byId("workshops-error-message").textContent = error.message;
    errorView.hidden = false;
    byId("visible-count").textContent = "0";
    byId("workshops-total").textContent = "—";
  } finally {
    loading.hidden = true;
  }
}

byId("workshop-search").addEventListener("input", () => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(render, 140);
});
byId("workshop-specialty").addEventListener("change", render);
byId("workshop-custom").addEventListener("change", render);
byId("workshops-clear").addEventListener("click", clearFilters);
byId("workshops-retry").addEventListener("click", () => {
  byId("workshop-specialty").replaceChildren(new Option("Todas las especialidades", ""));
  void load();
});

void load();

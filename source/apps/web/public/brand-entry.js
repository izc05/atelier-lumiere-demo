(() => {
  "use strict";

  const SESSION_KEY = "atelier_brand_entry_seen";
  const ARRIVAL_KEY = "atelier_arrival_from_entry";
  const OFFICIAL_LOGO = "/assets/brand/atelier-logo-official-light.svg";
  const VILLAGE_URL = "/entrada/webgl/";
  const ENTRY_MEDIA_QUERY = "(max-width: 760px)";
  const ENTRY_MEDIA_SLOTS = Object.freeze({
    desktop: "ENTRY_HERO_DESKTOP",
    mobile: "ENTRY_HERO_MOBILE"
  });
  const entry = document.getElementById("brand-entry");
  const enterButton = document.getElementById("brand-entry-action");
  const entryLogo = entry?.querySelector(".brand-entry-logo");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  if (!entry || !enterButton) return;
  if (entryLogo instanceof HTMLImageElement) entryLogo.src = OFFICIAL_LOGO;

  const ensureCinematicStyles = () => {
    const sheets = [
      ["unified-entry", "/visual-unified-entry.css"],
      ["unified-entry-responsive", "/visual-unified-entry-responsive.css"],
      ["unified-entry-media", "/visual-unified-entry-media.css"]
    ];
    for (const [key, href] of sheets) {
      if (document.querySelector(`link[data-${key}]`)) continue;
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      link.setAttribute(`data-${key}`, "true");
      document.head.append(link);
    }
  };

  const enhanceEntryMarkup = () => {
    entry.classList.add("brand-entry--cinematic");
    enterButton.textContent = "Entrar";

    const copy = entry.querySelector(".brand-entry-copy");
    if (copy) copy.textContent = "Artesanía para momentos que permanecen.";

    const inner = entry.querySelector(".brand-entry-inner");
    if (inner && !inner.querySelector(".brand-entry-title")) {
      const welcome = document.createElement("p");
      welcome.className = "brand-entry-welcome";
      welcome.textContent = "Bienvenido a";

      const title = document.createElement("h1");
      title.className = "brand-entry-title";
      title.textContent = "Atelier Lumière";

      if (copy) {
        inner.insertBefore(welcome, copy);
        inner.insertBefore(title, copy);
      } else {
        inner.append(welcome, title);
      }
    }

    if (!entry.querySelector(".brand-entry-values")) {
      const values = document.createElement("aside");
      values.className = "brand-entry-values";
      values.setAttribute("aria-label", "Valores de Atelier Lumière");
      values.innerHTML = `
        <div class="brand-entry-value"><span class="brand-entry-value-mark" aria-hidden="true">01</span><div><strong>Artesanía</strong><span>Hecha a mano, pieza a pieza.</span></div></div>
        <div class="brand-entry-value"><span class="brand-entry-value-mark" aria-hidden="true">02</span><div><strong>Tradición</strong><span>Oficios que permanecen.</span></div></div>
        <div class="brand-entry-value"><span class="brand-entry-value-mark" aria-hidden="true">03</span><div><strong>Exclusividad</strong><span>Piezas únicas y pequeñas series.</span></div></div>
        <div class="brand-entry-value"><span class="brand-entry-value-mark" aria-hidden="true">04</span><div><strong>Emoción</strong><span>Creado para cada celebración.</span></div></div>`;
      entry.append(values);
    }

    if (!entry.querySelector(".brand-entry-skip")) {
      const skip = document.createElement("a");
      skip.className = "brand-entry-skip";
      skip.href = "/?intro=0";
      skip.textContent = "Ir directamente a la web";
      entry.append(skip);
    }

    const hint = entry.querySelector(".brand-entry-hint");
    if (hint) hint.textContent = "Entra y explora el pueblo de los talleres";
  };

  const entryMediaMap = (items) => new Map(
    (Array.isArray(items) ? items : []).map((item) => [item.slotKey, item])
  );

  const entryMediaForViewport = (items, mobile) => {
    if (mobile) return items.get(ENTRY_MEDIA_SLOTS.mobile) || items.get(ENTRY_MEDIA_SLOTS.desktop) || null;
    return items.get(ENTRY_MEDIA_SLOTS.desktop) || null;
  };

  const removeEntryMedia = () => {
    entry.classList.remove("brand-entry--has-media");
    entry.removeAttribute("data-entry-media-slot");
    entry.querySelector(".brand-entry-media")?.remove();
  };

  const configureEntryMedia = (media, mobile) => {
    if (!media?.previewPath) {
      removeEntryMedia();
      return;
    }

    let figure = entry.querySelector(".brand-entry-media");
    if (!figure) {
      figure = document.createElement("figure");
      figure.className = "brand-entry-media";
      const image = document.createElement("img");
      image.decoding = "async";
      image.loading = "eager";
      image.fetchPriority = "high";
      figure.append(image);
      entry.prepend(figure);
    }

    const image = figure.querySelector("img");
    const alt = media.altText || "";
    let configured = false;
    if (window.AtelierImages?.configure) {
      configured = window.AtelierImages.configure(image, {
        path: media.previewPath,
        alt,
        width: media.width,
        height: media.height,
        sizes: "100vw",
        loading: "eager",
        priority: "high",
        defaultWidth: mobile ? 640 : 960
      }) === true;
    }

    if (!configured) {
      image.src = media.previewPath;
      image.alt = alt;
      if (Number(media.width) > 0) image.width = Number(media.width);
      if (Number(media.height) > 0) image.height = Number(media.height);
    }

    image.style.objectPosition = `${Number(media.focalX) || 50}% ${Number(media.focalY) || 50}%`;
    entry.dataset.entryMediaSlot = media.slotKey;
    entry.classList.add("brand-entry--has-media");
  };

  const loadEntryShowcase = async () => {
    const response = await fetch("/internal/showcase", {
      headers: { Accept: "application/json" }
    }).catch(() => null);
    if (!response?.ok) return;
    const payload = await response.json().catch(() => ({}));
    const items = entryMediaMap(payload.slots);
    if (items.size === 0) return;

    const mediaQuery = window.matchMedia(ENTRY_MEDIA_QUERY);
    const render = () => configureEntryMedia(entryMediaForViewport(items, mediaQuery.matches), mediaQuery.matches);
    render();
    mediaQuery.addEventListener?.("change", render);
  };

  ensureCinematicStyles();
  enhanceEntryMarkup();

  const params = new URLSearchParams(window.location.search);
  const forceEntry = params.get("intro") === "1";
  const skipEntry = params.get("intro") === "0";
  const background = [
    document.querySelector(".skip-link"),
    document.querySelector(".site-header"),
    document.getElementById("main-content"),
    ...document.querySelectorAll("body > .site-footer")
  ].filter(Boolean);

  const sessionGet = () => {
    try { return sessionStorage.getItem(SESSION_KEY); } catch { return null; }
  };

  const sessionSet = () => {
    try { sessionStorage.setItem(SESSION_KEY, "1"); } catch { /* almacenamiento no disponible */ }
  };

  const markArrival = () => {
    try { sessionStorage.setItem(ARRIVAL_KEY, "1"); } catch { /* almacenamiento no disponible */ }
  };

  const cameFromInternalPage = () => {
    if (!document.referrer) return false;
    try {
      const referrer = new URL(document.referrer);
      return referrer.origin === window.location.origin && referrer.pathname !== window.location.pathname;
    } catch {
      return false;
    }
  };

  const setBackgroundInert = (value) => {
    for (const element of background) {
      if (value) element.setAttribute("inert", "");
      else element.removeAttribute("inert");
    }
  };

  const showHomeWithoutEntry = () => {
    entry.hidden = true;
    entry.removeAttribute("aria-modal");
    setBackgroundInert(false);
    document.body.classList.remove("brand-entry-active");
  };

  if (skipEntry) {
    sessionSet();
    entry.hidden = true;
    return;
  }

  if (!forceEntry && sessionGet() === "1") {
    entry.hidden = true;
    return;
  }

  if (!forceEntry && cameFromInternalPage()) {
    sessionSet();
    entry.hidden = true;
    return;
  }

  entry.setAttribute("role", "dialog");
  entry.setAttribute("aria-modal", "true");
  document.body.classList.add("brand-entry-active");
  setBackgroundInert(true);
  entry.hidden = false;
  void loadEntryShowcase();

  let opening = false;
  let pointerFrame = 0;

  const updateLight = (event) => {
    if (reducedMotion.matches || opening) return;
    if (pointerFrame) window.cancelAnimationFrame(pointerFrame);
    pointerFrame = window.requestAnimationFrame(() => {
      const x = Math.max(24, Math.min(76, event.clientX / Math.max(1, window.innerWidth) * 100));
      const y = Math.max(20, Math.min(72, event.clientY / Math.max(1, window.innerHeight) * 100));
      entry.style.setProperty("--entry-light-x", `${x}%`);
      entry.style.setProperty("--entry-light-y", `${y}%`);
      pointerFrame = 0;
    });
  };

  entry.addEventListener("pointermove", updateLight, { passive: true });

  const openVillage = () => {
    if (opening) return;
    opening = true;
    if (pointerFrame) window.cancelAnimationFrame(pointerFrame);
    sessionSet();
    markArrival();
    entry.classList.add("is-opening");
    entry.setAttribute("aria-busy", "true");

    const delay = reducedMotion.matches ? 40 : 760;
    window.setTimeout(() => {
      window.location.assign(VILLAGE_URL);
    }, delay);
  };

  enterButton.addEventListener("click", openVillage);

  entry.querySelector(".brand-entry-skip")?.addEventListener("click", (event) => {
    event.preventDefault();
    sessionSet();
    showHomeWithoutEntry();
    document.getElementById("main-content")?.focus({ preventScroll: true });
  });

  document.addEventListener("keydown", (event) => {
    if (entry.hidden || opening) return;
    if (event.key === "Enter") {
      event.preventDefault();
      openVillage();
    }
  });

  window.requestAnimationFrame(() => enterButton.focus({ preventScroll: true }));
})();

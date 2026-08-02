(() => {
  "use strict";

  const frame = document.getElementById("site-preview");
  const badge = document.getElementById("preview-badge");
  const PREVIEW_BASE = "/atelier-lumiere-demo/preview-scroll/";

  if (!frame) return;

  setTimeout(() => badge?.classList.add("is-muted"), 4200);

  frame.addEventListener("load", () => {
    let win;
    let doc;

    try {
      win = frame.contentWindow;
      doc = frame.contentDocument || win.document;
    } catch (error) {
      console.error("No se pudo iniciar la vista previa de efectos.", error);
      return;
    }

    if (!win || !doc || doc.documentElement.dataset.lumierePreviewReady === "true") return;

    const hero = doc.querySelector(".hilo-hero");
    const visual = doc.querySelector(".hilo-hero-visual");
    const copy = doc.querySelector(".hilo-hero-copy");
    const storySection = doc.querySelector(".atelier-story-section");

    if (!hero || !visual || !copy || !storySection) {
      console.warn("La portada no contiene los elementos esperados para la animación.");
      return;
    }

    const stylesheet = doc.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = `${PREVIEW_BASE}scroll-effects.css`;
    doc.head.append(stylesheet);

    doc.documentElement.dataset.lumierePreviewReady = "true";

    const thread = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    thread.setAttribute("class", "lumiere-scroll-thread");
    thread.setAttribute("viewBox", "0 0 100 340");
    thread.setAttribute("aria-hidden", "true");
    thread.innerHTML = `
      <path pathLength="1" d="M72 0 C 35 50, 92 87, 54 132 S 18 212, 62 247 S 86 304, 48 340" />
      <circle cx="48" cy="340" r="2.7" />`;
    storySection.prepend(thread);

    const revealTargets = [
      doc.querySelector(".atelier-story-heading"),
      ...doc.querySelectorAll(".atelier-story-card"),
      ...doc.querySelectorAll(".featured-product-card, .home-product-card, .product-card")
    ].filter(Boolean);

    revealTargets.forEach((element, index) => {
      element.classList.add("lumiere-reveal");
      element.style.setProperty("--lumiere-delay", `${Math.min(index, 5) * 85}ms`);
    });

    const reducedMotion = win.matchMedia("(prefers-reduced-motion: reduce)");
    const mobile = win.matchMedia("(max-width: 700px)");

    if ("IntersectionObserver" in win && !reducedMotion.matches) {
      const observer = new win.IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      }, { rootMargin: "0px 0px -7% 0px", threshold: 0.12 });

      revealTargets.forEach((element) => observer.observe(element));
    } else {
      revealTargets.forEach((element) => element.classList.add("is-visible"));
    }

    let ticking = false;

    const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

    const update = () => {
      ticking = false;

      if (reducedMotion.matches) {
        doc.documentElement.classList.add("lumiere-effects-preview");
        return;
      }

      const scrollY = win.scrollY || doc.documentElement.scrollTop || 0;
      const heroTop = hero.offsetTop;
      const heroHeight = Math.max(hero.offsetHeight, 1);
      const heroProgress = clamp((scrollY - heroTop) / (heroHeight * 0.9), 0, 1);
      const isMobile = mobile.matches;

      const imageShift = heroProgress * (isMobile ? 28 : 58);
      const imageScale = 1.025 + heroProgress * (isMobile ? 0.026 : 0.045);
      const copyShift = heroProgress * (isMobile ? -7 : -15);
      const copyOpacity = 1 - heroProgress * (isMobile ? 0.12 : 0.22);

      const storyStart = storySection.offsetTop - win.innerHeight * 0.9;
      const threadProgress = clamp((scrollY - storyStart) / (win.innerHeight * 0.7), 0, 1);

      const rootStyle = doc.documentElement.style;
      rootStyle.setProperty("--lumiere-hero-shift", `${imageShift.toFixed(2)}px`);
      rootStyle.setProperty("--lumiere-hero-scale", imageScale.toFixed(4));
      rootStyle.setProperty("--lumiere-copy-shift", `${copyShift.toFixed(2)}px`);
      rootStyle.setProperty("--lumiere-copy-opacity", copyOpacity.toFixed(3));
      rootStyle.setProperty("--lumiere-thread-progress", threadProgress.toFixed(3));
    };

    const requestUpdate = () => {
      if (ticking) return;
      ticking = true;
      win.requestAnimationFrame(update);
    };

    win.addEventListener("scroll", requestUpdate, { passive: true });
    win.addEventListener("resize", requestUpdate, { passive: true });
    mobile.addEventListener?.("change", requestUpdate);
    reducedMotion.addEventListener?.("change", requestUpdate);

    setTimeout(() => {
      doc.documentElement.classList.add("lumiere-effects-preview");
      requestUpdate();
    }, 850);
  });
})();

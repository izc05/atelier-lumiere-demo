(() => {
  "use strict";

  const frame = document.getElementById("site-preview");
  const badge = document.getElementById("preview-badge");
  const PREVIEW_BASE = "/atelier-lumiere-demo/preview-scroll/";

  if (!frame) return;

  if (badge) badge.textContent = "Efectos reforzados";
  setTimeout(() => badge?.classList.add("is-muted"), 4800);

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
    stylesheet.href = `${PREVIEW_BASE}scroll-effects.css?v=2`;
    doc.head.append(stylesheet);

    doc.documentElement.dataset.lumierePreviewReady = "true";

    const thread = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    thread.setAttribute("class", "lumiere-scroll-thread");
    thread.setAttribute("viewBox", "0 0 120 440");
    thread.setAttribute("aria-hidden", "true");
    thread.innerHTML = `
      <path pathLength="1" d="M88 0 C 28 66, 108 118, 52 170 S 10 270, 78 314 S 104 386, 52 438" />
      <circle cx="52" cy="438" r="3.3" />`;
    storySection.prepend(thread);

    const revealTargets = [
      doc.querySelector(".atelier-story-heading"),
      ...doc.querySelectorAll(".atelier-story-card"),
      ...doc.querySelectorAll(".featured-product-card, .home-product-card, .product-card")
    ].filter(Boolean);

    revealTargets.forEach((element, index) => {
      element.classList.add("lumiere-reveal");
      element.style.setProperty("--lumiere-delay", `${Math.min(index, 6) * 110}ms`);
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
      }, { rootMargin: "0px 0px -11% 0px", threshold: 0.16 });

      revealTargets.forEach((element) => observer.observe(element));
    } else {
      revealTargets.forEach((element) => element.classList.add("is-visible"));
    }

    let ticking = false;
    const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
    const easeOutCubic = value => 1 - Math.pow(1 - value, 3);
    const smoothstep = value => value * value * (3 - 2 * value);

    const update = () => {
      ticking = false;
      doc.documentElement.classList.add("lumiere-effects-preview");

      if (reducedMotion.matches) return;

      const scrollY = win.scrollY || doc.documentElement.scrollTop || 0;
      const heroTop = hero.offsetTop;
      const heroHeight = Math.max(hero.offsetHeight, 1);
      const rawProgress = clamp((scrollY - heroTop) / (heroHeight * 0.92), 0, 1);
      const heroProgress = easeOutCubic(rawProgress);
      const isMobile = mobile.matches;

      const imageShift = heroProgress * (isMobile ? 82 : 138);
      const imageScale = 1.025 + heroProgress * (isMobile ? 0.072 : 0.105);

      // El texto se mueve a menor velocidad que la página, dando una sensación de fijación.
      const copyHold = rawProgress < 0.64 ? rawProgress / 0.64 : 1;
      const copyShift = smoothstep(copyHold) * (isMobile ? 112 : 176);
      const fadeProgress = clamp((rawProgress - 0.62) / 0.38, 0, 1);
      const copyOpacity = 1 - fadeProgress * (isMobile ? 0.52 : 0.66);

      const storyStart = storySection.offsetTop - win.innerHeight * 0.92;
      const threadProgress = clamp((scrollY - storyStart) / (win.innerHeight * 0.72), 0, 1);

      const rootStyle = doc.documentElement.style;
      rootStyle.setProperty("--lumiere-hero-shift", `${imageShift.toFixed(2)}px`);
      rootStyle.setProperty("--lumiere-hero-scale", imageScale.toFixed(4));
      rootStyle.setProperty("--lumiere-copy-shift", `${copyShift.toFixed(2)}px`);
      rootStyle.setProperty("--lumiere-copy-opacity", copyOpacity.toFixed(3));
      rootStyle.setProperty("--lumiere-thread-progress", threadProgress.toFixed(3));
      rootStyle.setProperty("--lumiere-hero-progress", rawProgress.toFixed(3));
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

    setTimeout(requestUpdate, 900);
  });
})();
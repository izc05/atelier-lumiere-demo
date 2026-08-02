(() => {
  'use strict';

  const ROOT = '/atelier-lumiere-demo/';
  const ASSETS = `${ROOT}assets/brand/`;
  const BRAND_NAME = 'Atelier Lumière';
  const OLD_NAME = 'Alma de Fiesta';
  let scheduled = false;

  const replaceTextNodes = (root = document.body) => {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent || /^(SCRIPT|STYLE|NOSCRIPT|SVG|TEXTAREA)$/i.test(parent.tagName)) {
          return NodeFilter.FILTER_REJECT;
        }
        return node.nodeValue?.includes(OLD_NAME) || node.nodeValue?.includes('Entrar al atelier')
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      }
    });

    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => {
      node.nodeValue = node.nodeValue
        .replaceAll(OLD_NAME, BRAND_NAME)
        .replaceAll('Entrar al atelier', 'Entrar al taller');
    });
  };

  const applyHeaderLogo = () => {
    document.querySelectorAll('a.brand').forEach((brand) => {
      const header = brand.closest('.site-header');
      const isOverlay = header?.classList.contains('site-header-overlay');
      const src = `${ASSETS}${isOverlay ? 'logo-horizontal-light.svg' : 'logo-horizontal.svg'}`;
      if (brand.dataset.atelierBrand === 'true' && brand.querySelector('img')?.getAttribute('src') === src) return;

      brand.dataset.atelierBrand = 'true';
      brand.setAttribute('aria-label', `${BRAND_NAME}, inicio`);
      brand.innerHTML = `<img class="atelier-header-logo" src="${src}" alt="${BRAND_NAME}">`;
    });
  };

  const applyEntryLogo = () => {
    const content = document.querySelector('.entry-content');
    if (!content || content.querySelector('.entry-brand-logo')) return;

    const heading = content.querySelector('h1');
    if (!heading) return;

    const logo = document.createElement('img');
    logo.className = 'entry-brand-logo';
    logo.src = `${ASSETS}logo-stacked-light.svg`;
    logo.alt = BRAND_NAME;
    heading.classList.add('atelier-visually-hidden');
    heading.textContent = BRAND_NAME;
    heading.before(logo);

    const buttonLabel = content.querySelector('#enter-button span:first-child');
    if (buttonLabel) buttonLabel.textContent = 'Entrar al taller';
  };

  const applyMetadata = () => {
    document.title = document.title.replaceAll(OLD_NAME, BRAND_NAME);
    document.querySelectorAll('[aria-label*="Alma de Fiesta"]').forEach((element) => {
      element.setAttribute('aria-label', element.getAttribute('aria-label').replaceAll(OLD_NAME, BRAND_NAME));
    });
  };

  const applyBrand = () => {
    scheduled = false;
    replaceTextNodes();
    applyHeaderLogo();
    applyEntryLogo();
    applyMetadata();
  };

  const scheduleApply = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(applyBrand);
  };

  const sessionGet = (key) => {
    try { return sessionStorage.getItem(key); } catch { return null; }
  };

  const sessionSet = (key, value) => {
    try { sessionStorage.setItem(key, value); } catch { /* almacenamiento no disponible */ }
  };

  const createPublicIntro = () => {
    const normalizedPath = location.pathname.endsWith('index.html')
      ? location.pathname.slice(0, -'index.html'.length)
      : location.pathname;
    const params = new URLSearchParams(location.search);
    const forceIntro = params.get('intro') === '1';
    const isHomepage = normalizedPath === ROOT;

    if (!isHomepage || params.has('preview') || (!forceIntro && sessionGet('atelierIntroSeen') === '1')) return;
    if (document.querySelector('.atelier-site-intro')) return;

    const intro = document.createElement('section');
    intro.className = 'atelier-site-intro';
    intro.setAttribute('aria-label', 'Bienvenida a Atelier Lumière');
    intro.innerHTML = `
      <div class="atelier-intro-panel atelier-intro-panel-left" aria-hidden="true"></div>
      <div class="atelier-intro-panel atelier-intro-panel-right" aria-hidden="true"></div>
      <div class="atelier-intro-seam" aria-hidden="true"></div>
      <div class="atelier-intro-content">
        <img class="atelier-intro-logo" src="${ASSETS}logo-stacked-light.svg" alt="Atelier Lumière. Artesanía para celebrar.">
        <p class="atelier-intro-copy">Piezas hechas despacio para instantes que merecen ser recordados.</p>
        <button class="atelier-intro-enter" type="button"><span>Entrar al taller</span><span aria-hidden="true">→</span></button>
        <button class="atelier-intro-skip" type="button">Saltar introducción</button>
      </div>`;

    const finish = () => {
      if (intro.classList.contains('is-opening')) return;
      intro.classList.add('is-opening');
      sessionSet('atelierIntroSeen', '1');
      window.setTimeout(() => {
        intro.remove();
        document.body.classList.remove('atelier-intro-locked');
      }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 260 : 1250);
    };

    intro.querySelector('.atelier-intro-enter')?.addEventListener('click', finish);
    intro.querySelector('.atelier-intro-skip')?.addEventListener('click', finish);
    document.body.classList.add('atelier-intro-locked');
    document.body.append(intro);
    intro.querySelector('.atelier-intro-enter')?.focus({ preventScroll: true });
  };

  const start = () => {
    applyBrand();
    createPublicIntro();
    const observer = new MutationObserver(scheduleApply);
    observer.observe(document.documentElement, { childList: true, subtree: true });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();

/* Atelier Lumière · U3.27B · continuidad visual Pueblo → taller */
(() => {
  const STORAGE_KEY = 'atelier_village_workshop_transition';
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const slug = new URLSearchParams(window.location.search).get('slug') || '';

  const accents = {
    CERAMICS: ['#6f342a','#d6a06f','#211315'],
    TEXTILE: ['#7b2739','#d7a8a0','#211216'],
    JEWELRY: ['#4d4540','#d3b46f','#181516'],
    WOOD: ['#68422b','#c99a68','#1d1511'],
    FLORAL: ['#385245','#b9a46f','#121a17'],
    PAPER: ['#6b5147','#d8bb88','#211817'],
    CANDLE: ['#6b3a2b','#e3b166','#211411'],
    LEATHER: ['#543126','#b88961','#1d1310'],
    FAN: ['#681a2f','#d3a05d','#211116'],
    GLASS: ['#38535b','#abc7c2','#11191d'],
    NEUTRAL: ['#65162a','#cba867','#1b1114']
  };

  function readContext() {
    let raw = null;
    try {
      raw = sessionStorage.getItem(STORAGE_KEY);
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      return null;
    }
    if (!raw) return null;
    try {
      const value = JSON.parse(raw);
      const fresh = Number.isFinite(value?.at) && Date.now() - value.at < 10 * 60 * 1000;
      if (value?.version !== 'u3.27' || value?.source !== 'village' || value?.slug !== slug || !fresh) return null;
      return value;
    } catch {
      return null;
    }
  }

  const context = readContext();
  if (!context) {
    document.documentElement.dataset.workshopArrival = 'direct';
    return;
  }

  const family = accents[context.family] ? context.family : 'NEUTRAL';
  const [accent, warm, night] = accents[family];
  const root = document.documentElement;
  root.dataset.workshopArrival = 'village';
  root.dataset.workshopArrivalFamily = family.toLowerCase();
  root.style.setProperty('--u327-accent', accent);
  root.style.setProperty('--u327-warm', warm);
  root.style.setProperty('--u327-night', night);

  const overlay = document.createElement('div');
  overlay.className = 'u327-workshop-arrival';
  overlay.setAttribute('aria-hidden','true');
  const initials = String(context.displayName || 'AL').trim().split(/\s+/).filter(Boolean).slice(0,3).map((part) => part[0]).join('').toUpperCase() || 'AL';
  overlay.innerHTML = `
    <div class="u327-workshop-arrival__glow"></div>
    <div class="u327-workshop-arrival__copy">
      <span class="u327-workshop-arrival__mark">${initials.replace(/[<>&]/g,'')}</span>
      <small>Atelier Lumière · Pueblo de oficios</small>
      <strong></strong>
      <em></em>
    </div>`;
  overlay.querySelector('strong').textContent = context.displayName || 'Taller';
  overlay.querySelector('em').textContent = context.specialty || 'Taller artesano';
  document.body.prepend(overlay);

  function reveal() {
    if (root.dataset.workshopArrivalStage === 'revealed') return;
    root.dataset.workshopArrivalStage = 'revealed';
    overlay.classList.add('is-revealing');
    window.setTimeout(() => overlay.remove(), reduced.matches ? 30 : 920);
  }

  function waitForHero() {
    const hero = document.getElementById('provider-hero');
    if (!hero) {
      reveal();
      return;
    }
    if (!hero.hidden) {
      requestAnimationFrame(() => requestAnimationFrame(reveal));
      return;
    }
    const observer = new MutationObserver(() => {
      if (hero.hidden) return;
      observer.disconnect();
      requestAnimationFrame(() => requestAnimationFrame(reveal));
    });
    observer.observe(hero,{attributes:true,attributeFilter:['hidden']});
    window.setTimeout(() => { observer.disconnect(); reveal(); }, 2600);
  }

  root.dataset.workshopArrivalStage = 'holding';
  waitForHero();
  window.AtelierWorkshopVillageArrival = Object.freeze({ context: { ...context }, family });
})();

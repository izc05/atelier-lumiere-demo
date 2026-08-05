const menuButton = document.querySelector(".menu-button");
const navigation = document.querySelector(".desktop-nav");

function closeMenu() {
  if (!menuButton || !navigation) return;
  navigation.classList.remove("is-open");
  menuButton.setAttribute("aria-expanded", "false");
  menuButton.setAttribute("aria-label", "Abrir menú");
}

if (menuButton && navigation) {
  menuButton.addEventListener("click", () => {
    const open = !navigation.classList.contains("is-open");
    navigation.classList.toggle("is-open", open);
    menuButton.setAttribute("aria-expanded", String(open));
    menuButton.setAttribute("aria-label", open ? "Cerrar menú" : "Abrir menú");
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenu();
  });

  document.addEventListener("click", (event) => {
    if (!navigation.classList.contains("is-open")) return;
    if (navigation.contains(event.target) || menuButton.contains(event.target)) return;
    closeMenu();
  });

  navigation.addEventListener("click", closeMenu);
}

const heroVisual = document.querySelector(".hilo-hero-visual");
let animationFrame = null;

function updateHeroParallax() {
  animationFrame = null;
  if (!heroVisual || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const offset = Math.min(window.scrollY * 0.08, 34);
  heroVisual.style.transform = `translate3d(0, ${offset}px, 0) scale(1.025)`;
}

if (heroVisual) {
  window.addEventListener("scroll", () => {
    if (animationFrame !== null) return;
    animationFrame = window.requestAnimationFrame(updateHeroParallax);
  }, { passive: true });
}

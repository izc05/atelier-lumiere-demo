(() => {
  "use strict";

  const entry = document.getElementById("entry");
  const enterButton = document.getElementById("enter-button");
  const skipButton = document.getElementById("skip-button");
  const replayButton = document.getElementById("replay-button");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  if (!entry || !enterButton || !skipButton || !replayButton) return;

  let opening = false;

  const setParallax = (clientX, clientY) => {
    if (opening || reducedMotion.matches) return;
    const x = (clientX / window.innerWidth - 0.5) * 20;
    const y = (clientY / window.innerHeight - 0.5) * 14;
    entry.style.setProperty("--entry-x", `${x.toFixed(2)}px`);
    entry.style.setProperty("--entry-y", `${y.toFixed(2)}px`);
    entry.style.setProperty("--entry-scale", "1.065");
  };

  const resetParallax = () => {
    entry.style.setProperty("--entry-x", "0px");
    entry.style.setProperty("--entry-y", "0px");
    entry.style.setProperty("--entry-scale", "1.055");
  };

  const finish = (immediate = false) => {
    if (opening) return;
    opening = true;
    resetParallax();
    entry.classList.add("is-opening");

    const delay = immediate || reducedMotion.matches ? 40 : 1080;
    window.setTimeout(() => {
      entry.classList.add("is-finished");
      replayButton.hidden = false;
      opening = false;
    }, delay);
  };

  const replay = () => {
    replayButton.hidden = true;
    entry.classList.remove("is-finished", "is-opening");
    resetParallax();
    enterButton.focus({ preventScroll: true });
  };

  entry.addEventListener("pointermove", event => setParallax(event.clientX, event.clientY), { passive: true });
  entry.addEventListener("pointerleave", resetParallax, { passive: true });
  entry.addEventListener("click", event => {
    if (event.target === skipButton) return;
    finish(false);
  });
  enterButton.addEventListener("click", event => {
    event.stopPropagation();
    finish(false);
  });
  skipButton.addEventListener("click", event => {
    event.stopPropagation();
    finish(true);
  });
  replayButton.addEventListener("click", replay);

  document.addEventListener("keydown", event => {
    if (entry.classList.contains("is-finished")) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      finish(false);
    }
    if (event.key === "Escape") finish(true);
  });
})();

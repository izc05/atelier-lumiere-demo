(() => {
  const provider = document.getElementById("product-provider");
  const cartContent = document.getElementById("cart-content");
  const emptyCart = document.getElementById("empty-cart");

  function workshopSlug() {
    const value = new URLSearchParams(window.location.search).get("taller") || "";
    return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) ? value : null;
  }

  function enhanceProviderLink() {
    if (!provider || provider.querySelector(".product-provider-link")) return;
    const slug = workshopSlug();
    const raw = provider.textContent.trim();
    if (!slug || !raw) return;

    const [displayName, ...specialtyParts] = raw.split(" · ");
    const name = displayName.trim();
    if (!name) return;

    const link = document.createElement("a");
    link.className = "product-provider-link";
    link.href = `/taller/?slug=${encodeURIComponent(slug)}`;
    link.textContent = `Creado por ${name} →`;
    link.setAttribute("aria-label", `Conocer el taller ${name}`);

    const specialty = specialtyParts.join(" · ").trim();
    if (specialty) {
      const meta = document.createElement("span");
      meta.className = "product-provider-specialty";
      meta.textContent = specialty;
      provider.replaceChildren(link, meta);
    } else {
      provider.replaceChildren(link);
    }
  }

  if (provider) {
    enhanceProviderLink();
    const providerObserver = new MutationObserver(() => enhanceProviderLink());
    providerObserver.observe(provider, { childList: true, characterData: true, subtree: true });
  }

  function syncCartMode() {
    if (!cartContent || !emptyCart) return;
    const active = !cartContent.hidden;
    document.body.dataset.cartMode = active ? "active" : "empty";
  }

  if (cartContent && emptyCart) {
    syncCartMode();
    const cartObserver = new MutationObserver(syncCartMode);
    cartObserver.observe(cartContent, { attributes: true, attributeFilter: ["hidden"] });
    cartObserver.observe(emptyCart, { attributes: true, attributeFilter: ["hidden"] });
  }
})();

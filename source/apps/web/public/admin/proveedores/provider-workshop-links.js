const providerList = document.querySelector("#providers-list");

function enhanceProviderCards() {
  if (!providerList) return;

  for (const card of providerList.querySelectorAll(".provider-card:not([data-workshop-link-ready])")) {
    const title = card.querySelector(".provider-title-row h3")?.textContent?.trim();
    const actions = card.querySelector(".provider-actions");
    if (!title || !actions) continue;

    const profileLink = document.createElement("a");
    profileLink.className = "button secondary";
    profileLink.textContent = "Perfil del taller";
    profileLink.href = `/admin/talleres/?status=ALL&q=${encodeURIComponent(title)}`;
    actions.prepend(profileLink);
    card.dataset.workshopLinkReady = "true";
  }
}

if (providerList) {
  enhanceProviderCards();
  const observer = new MutationObserver(enhanceProviderCards);
  observer.observe(providerList, { childList: true, subtree: true });
}

/* Atelier Lumière · U3.27B · puente visual Pueblo → página de taller */
(() => {
  if (!root || root.dataset.workshopPageBridge === 'u3.27') return;

  const STORAGE_KEY = 'atelier_village_workshop_transition';
  const taxonomy = window.AtelierCraftTaxonomy;

  function selectedPlace() {
    return typeof webglSelectedPlace === 'string' ? webglSelectedPlace : 'overview';
  }

  function providerFor(name) {
    return typeof webglProviderByPlace !== 'undefined' ? webglProviderByPlace?.get?.(name) || null : null;
  }

  function configFor(name) {
    const dynamic = typeof webglDynamicProviderPlaces !== 'undefined' ? webglDynamicProviderPlaces?.[name] : null;
    const base = typeof webglInteractionPlaces !== 'undefined' ? webglInteractionPlaces?.[name] : null;
    return dynamic || base || null;
  }

  function familyFor(name, provider, config) {
    const resolved = taxonomy?.resolve?.(config?.workshopType || provider?.specialty || '');
    return resolved?.key || 'NEUTRAL';
  }

  function remember(anchor) {
    const name = selectedPlace();
    if (!name || name === 'overview') return;
    if (!anchor?.matches?.('a.webgl-provider-enter')) return;
    const provider = providerFor(name);
    if (!provider?.slug) return;
    const config = configFor(name);
    const payload = {
      version: 'u3.27',
      source: 'village',
      place: name,
      slug: provider.slug,
      displayName: provider.displayName || config?.title || 'Taller',
      specialty: config?.workshopType || provider.specialty || '',
      family: familyFor(name, provider, config),
      at: Date.now()
    };
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* La navegación sigue funcionando aunque sessionStorage no esté disponible. */
    }
  }

  root.addEventListener('click', (event) => {
    const anchor = event.target.closest('a.webgl-provider-enter');
    if (!anchor || event.defaultPrevented) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    remember(anchor);
  }, { capture: true });

  root.dataset.workshopPageBridge = 'u3.27';
  root.dataset.workshopPageBridgeStorage = STORAGE_KEY;
  window.AtelierVillageWorkshopBridge = Object.freeze({ key: STORAGE_KEY, remember });
})();

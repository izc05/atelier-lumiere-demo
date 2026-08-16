/* Atelier Lumière · U3.3B · parcelas estables y asignación desacoplada */
(() => {
  const registry = Object.freeze([
    { zoneKey: 'ZONE_01', x: -11, z: 7, scale: 1.25, existingPlace: 'izc', family: 'SIGNATURE' },
    { zoneKey: 'ZONE_02', x: 12, z: -7, scale: 1.25, existingPlace: 'stitch', family: 'SIGNATURE' },
    { zoneKey: 'ZONE_03', x: -16, z: -9, scale: .84, family: 'HOUSE' },
    { zoneKey: 'ZONE_04', x: -8, z: -7, scale: .78, family: 'HOUSE' },
    { zoneKey: 'ZONE_05', x: 9, z: -10, scale: .78, family: 'HOUSE' },
    { zoneKey: 'ZONE_06', x: 17, z: -3, scale: .74, family: 'HOUSE' },
    { zoneKey: 'ZONE_07', x: -16, z: 5, scale: .76, family: 'HOUSE' },
    { zoneKey: 'ZONE_08', x: -7, z: 8, scale: .78, family: 'HOUSE' },
    { zoneKey: 'ZONE_09', x: 6, z: 8, scale: .75, family: 'HOUSE' },
    { zoneKey: 'ZONE_10', x: 15, z: 7, scale: .78, family: 'HOUSE' },
    { zoneKey: 'ZONE_11', x: -13, z: 11, scale: .72, family: 'HOUSE' },
    { zoneKey: 'ZONE_12', x: -3, z: 10, scale: .70, family: 'HOUSE' },
    { zoneKey: 'ZONE_13', x: 8, z: 11, scale: .72, family: 'HOUSE' },
    { zoneKey: 'ZONE_14', x: 16, z: 10, scale: .70, family: 'HOUSE' }
  ]);

  const settingsByKey = new Map();
  const registryByKey = new Map(registry.map((zone) => [zone.zoneKey, zone]));

  function normalize(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('es')
      .trim();
  }

  function providerSlug(provider) {
    return normalize(provider?.slug).replace(/\s+/g, '-');
  }

  function configured(zoneKey) {
    return settingsByKey.get(zoneKey) || null;
  }

  function isHidden(zoneKey) {
    return configured(zoneKey)?.status === 'HIDDEN';
  }

  function explicitProvider(zoneKey) {
    return normalize(configured(zoneKey)?.providerSlug);
  }

  function legacySignature(provider) {
    const name = normalize(provider?.displayName);
    const slug = normalize(provider?.slug);
    if (name === 'izc' || slug === 'izc') return 'ZONE_01';
    if (name.includes('gentle stitch') || slug.includes('gentle-stitch')) return 'ZONE_02';
    return null;
  }

  function assignment(zone, provider, source) {
    const config = configured(zone.zoneKey);
    return {
      zone,
      provider,
      source,
      config: config || {
        zoneKey: zone.zoneKey,
        workshopType: '',
        displayLabel: '',
        providerSlug: null,
        status: 'RESERVED',
        configured: false
      }
    };
  }

  function assignProviders(providers = []) {
    const availableProviders = Array.isArray(providers) ? providers.filter(Boolean) : [];
    const bySlug = new Map(availableProviders.map((provider) => [providerSlug(provider), provider]));
    const usedProviders = new Set();
    const usedZones = new Set();
    const result = [];

    /* 1. Lo configurado por el propietario siempre manda. */
    for (const zone of registry) {
      if (isHidden(zone.zoneKey)) continue;
      const slug = explicitProvider(zone.zoneKey);
      const provider = slug ? bySlug.get(slug) : null;
      if (!provider || usedProviders.has(slug)) continue;
      result.push(assignment(zone, provider, 'configured'));
      usedProviders.add(slug);
      usedZones.add(zone.zoneKey);
    }

    /* 2. Compatibilidad de laboratorio solo para zonas todavía sin configurar. */
    for (const provider of availableProviders) {
      const slug = providerSlug(provider);
      if (usedProviders.has(slug)) continue;
      const signatureKey = legacySignature(provider);
      if (!signatureKey || usedZones.has(signatureKey) || isHidden(signatureKey)) continue;
      if (configured(signatureKey)) continue;
      const zone = registryByKey.get(signatureKey);
      if (!zone) continue;
      result.push(assignment(zone, provider, 'legacy-signature'));
      usedProviders.add(slug);
      usedZones.add(signatureKey);
    }

    /* 3. Solo las zonas nunca configuradas aceptan relleno automático. */
    const freeZones = registry.filter((zone) => {
      if (usedZones.has(zone.zoneKey) || isHidden(zone.zoneKey)) return false;
      if (configured(zone.zoneKey)) return false;
      return !zone.existingPlace;
    });
    let freeIndex = 0;
    for (const provider of availableProviders) {
      const slug = providerSlug(provider);
      if (usedProviders.has(slug)) continue;
      const zone = freeZones[freeIndex++];
      if (!zone) break;
      result.push(assignment(zone, provider, 'automatic'));
      usedProviders.add(slug);
      usedZones.add(zone.zoneKey);
    }

    return result;
  }

  function reservedZones(assignments = []) {
    const assigned = new Set(assignments.map((item) => item.zone.zoneKey));
    return registry
      .filter((zone) => !assigned.has(zone.zoneKey) && !isHidden(zone.zoneKey))
      .map((zone) => ({ zone, config: configured(zone.zoneKey) }))
      .filter(({ config }) => Boolean(config?.workshopType || config?.displayLabel || config?.status === 'ACTIVE'));
  }

  async function load() {
    try {
      const response = await fetch('/internal/village-zones', { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('village-zones');
      const payload = await response.json().catch(() => ({}));
      const zones = Array.isArray(payload.zones) ? payload.zones : [];
      settingsByKey.clear();
      zones.forEach((zone) => {
        if (registryByKey.has(zone?.zoneKey)) settingsByKey.set(zone.zoneKey, zone);
      });
      if (root) root.dataset.villageZoneConfig = String(settingsByKey.size);
      return zones;
    } catch {
      if (root) root.dataset.villageZoneConfig = 'fallback';
      return [];
    }
  }

  const ready = load();

  window.AtelierVillageZones = Object.freeze({
    registry,
    ready,
    getZone: (zoneKey) => registryByKey.get(String(zoneKey || '').toUpperCase()) || null,
    configuration: (zoneKey) => configured(String(zoneKey || '').toUpperCase()),
    assignProviders,
    reservedZones,
    reload: load
  });
})();

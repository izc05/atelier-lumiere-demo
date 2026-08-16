/* Atelier Lumière · U3.4 · arquitectura derivada del oficio */
(() => {
  if (!root || !window.AtelierVillageZones || !window.AtelierCraftTaxonomy) return;

  const zoneModel = window.AtelierVillageZones;
  const taxonomy = window.AtelierCraftTaxonomy;
  const decorated = new Set();
  const familyCounts = new Map();

  const memory = Number(navigator.deviceMemory);
  const narrow = window.matchMedia('(max-width: 760px)').matches;
  const tablet = !narrow && window.matchMedia('(max-width: 1050px)').matches;
  const lowMemory = Number.isFinite(memory) && memory > 0 && memory <= 4;
  const detailLevel = narrow || lowMemory ? 1 : tablet ? 2 : 3;

  const clay = p9Mix(palette.gold, palette.roof, .42);
  const timber = p9Mix(palette.roof, palette.ink, .10);
  const textile = p9Mix(palette.wine, palette.paperLight, .22);
  const botanical = p9Mix(palette.green, palette.paperLight, .16);
  const glass = p9Mix(palette.paperLight, palette.green, .12, .72);
  const leather = p9Mix(palette.roof, palette.gold, .16);

  function addBox(x, z, y, sx, sy, sz, color, rotation = 0, edges = true) {
    return p9Box(x, z, y, sx, sy, sz, color, rotation, edges);
  }

  function addCylinder(x, z, y, sx, sy, sz, color, edges = true) {
    return p9Add(p9Meshes.cylinder, x, z, y, sx, sy, sz, color, 0, edges);
  }

  function familyCount(key) {
    familyCounts.set(key, (familyCounts.get(key) || 0) + 1);
  }

  function ceramics(zone) {
    const { x, z, scale: s } = zone;
    /* Horno bajo + chimenea y piezas de barro secando en patio. */
    addBox(x + 1.18*s, z - .42*s, .36*s, .48*s, .36*s, .50*s, p9Stone, 0, true);
    addBox(x + 1.18*s, z - .42*s, 1.08*s, .14*s, .58*s, .14*s, p9StoneDark, 0, true);
    addBox(x, z + 1.42*s, .075, .94*s, .018, .46*s, p9Mix(palette.paperDeep, palette.gold, .10), 0, false);
    if (detailLevel >= 2) {
      [-.48, 0, .48].forEach((dx, i) => addCylinder(x + dx*s, z + 1.42*s, .16, .10*s, (.11 + i*.018)*s, .10*s, clay, false));
    }
    if (detailLevel >= 3) addBox(x - 1.02*s, z + 1.32*s, .58*s, .055*s, .58*s, .48*s, timber, 0, true);
  }

  function textileStudio(zone) {
    const { x, z, scale: s } = zone;
    /* Pérgola frontal y bastidor abstracto de telar. */
    addBox(x, z + 1.26*s, 1.04*s, .92*s, .045*s, .48*s, textile, 0, false);
    [-.82, .82].forEach((dx) => addBox(x + dx*s, z + 1.26*s, .52*s, .035*s, .52*s, .035*s, p9StoneDark, 0, false));
    addBox(x - 1.18*s, z + .20*s, .68*s, .055*s, .64*s, .52*s, p9Gold, 0, true);
    if (detailLevel >= 2) {
      [-.30, 0, .30].forEach((dx, i) => addBox(x - 1.18*s + dx*s, z + .21*s, .70*s, .012*s, .42*s, .05*s, i % 2 ? p9Wine : p9Linen, 0, false));
    }
    if (detailLevel >= 3) p9Path(x, z + 1.82*s, .72*s, .045*s, Math.PI/2, p9Mix(palette.road, palette.paperLight, .3));
  }

  function jewelryAtelier(zone) {
    const { x, z, scale: s } = zone;
    /* Linterna superior y escaparate compacto: lectura de precisión/luz. */
    addCylinder(x, z, 2.02*s, .28*s, .26*s, .28*s, p9Paper, true);
    p9Add(meshes.cone, x, z, 2.46*s, .36*s, .22*s, .36*s, p9Gold, 0, true);
    addBox(x + 1.06*s, z + .62*s, .72*s, .46*s, .48*s, .055*s, p9Mix(palette.paperLight, palette.gold, .22), 0, false);
    if (detailLevel >= 2) addBox(x + 1.06*s, z + .68*s, .22*s, .52*s, .06*s, .24*s, p9StoneDark, 0, true);
    if (detailLevel >= 3) {
      addCylinder(x + 1.45*s, z + 1.28*s, .42*s, .07*s, .42*s, .07*s, p9Gold, false);
      addCylinder(x - 1.35*s, z + 1.15*s, .36*s, .06*s, .36*s, .06*s, p9Gold, false);
    }
  }

  function woodYard(zone) {
    const { x, z, scale: s } = zone;
    /* Cobertizo posterior + listones apilados. */
    addBox(x, z - 1.20*s, .34*s, .88*s, .34*s, .50*s, p9Mix(palette.paperDeep, palette.paperLight, .72), 0, true);
    p9Roof(x, z - 1.20*s, .84*s, .98*s, .18*s, .58*s, timber, 0);
    [-.44, -.14, .16, .46].forEach((dx, i) => addBox(x + dx*s, z + 1.30*s, (.11 + i*.025)*s, .34*s, .035*s, .10*s, leather, .04*i, false));
    if (detailLevel >= 2) addBox(x + 1.24*s, z + .86*s, .55*s, .055*s, .55*s, .42*s, timber, 0, true);
    if (detailLevel >= 3) p9Path(x, z - 1.88*s, .64*s, .05*s, Math.PI/2, p9Mix(palette.road, palette.paperLight, .22));
  }

  function floralStudio(zone) {
    const { x, z, scale: s } = zone;
    /* Invernadero ligero + jardineras. */
    addBox(x + 1.12*s, z - .10*s, .50*s, .54*s, .50*s, .48*s, glass, 0, true);
    p9Roof(x + 1.12*s, z - .10*s, 1.18*s, .62*s, .28*s, .56*s, p9Mix(palette.paperLight, palette.green, .18), 0);
    [-.72, 0, .72].forEach((dx) => {
      addBox(x + dx*s, z + 1.38*s, .12*s, .28*s, .10*s, .18*s, p9Stone, 0, false);
      if (detailLevel >= 2) addBox(x + dx*s, z + 1.38*s, .31*s, .22*s, .12*s, .14*s, botanical, 0, false);
    });
    if (detailLevel >= 3) p9Hedge(x - 1.22*s, z + .72*s, .62*s, Math.PI/2, .11*s);
  }

  function paperArcade(zone) {
    const { x, z, scale: s } = zone;
    /* Galería frontal y bastidores finos para papel/grabado. */
    const front = z + 1.10*s;
    [-.62, 0, .62].forEach((dx) => addBox(x + dx*s, front, .52*s, .032*s, .52*s, .032*s, p9StoneDark, 0, false));
    addBox(x, front, 1.03*s, .82*s, .045*s, .20*s, p9Linen, 0, false);
    addBox(x - 1.18*s, z + .18*s, .64*s, .05*s, .62*s, .46*s, p9Gold, 0, true);
    if (detailLevel >= 2) {
      [-.28, .02, .32].forEach((dz, i) => addBox(x - 1.18*s, z + (.18 + dz)*s, (.42 + i*.16)*s, .32*s, .012*s, .025*s, p9Paper, 0, false));
    }
  }

  function candleWorkshop(zone) {
    const { x, z, scale: s } = zone;
    /* Chimenea fina + pequeñas luminarias alrededor del acceso. */
    addBox(x + .62*s, z - .20*s, 1.76*s, .12*s, .42*s, .12*s, p9StoneDark, 0, true);
    addBox(x + .62*s, z - .20*s, 2.20*s, .16*s, .05*s, .16*s, p9Wine, 0, false);
    [-.80, .80].forEach((dx) => addCylinder(x + dx*s, z + 1.25*s, .34*s, .065*s, .34*s, .065*s, p9Gold, false));
    if (detailLevel >= 2) addBox(x, z + 1.38*s, .08, .72*s, .018, .34*s, p9Mix(palette.paperDeep, palette.gold, .09), 0, false);
  }

  function leatherCanopy(zone) {
    const { x, z, scale: s } = zone;
    addBox(x, z + 1.18*s, .98*s, .90*s, .045*s, .42*s, leather, 0, false);
    [-.82, .82].forEach((dx) => addBox(x + dx*s, z + 1.18*s, .49*s, .035*s, .49*s, .035*s, p9StoneDark, 0, false));
    addBox(x + 1.18*s, z + .18*s, .62*s, .05*s, .62*s, .46*s, timber, 0, true);
    if (detailLevel >= 2) [-.24, .10, .44].forEach((dz) => addBox(x + 1.18*s, z + dz*s, .63*s, .26*s, .012*s, .025*s, leather, 0, false));
  }

  function fanPavilion(zone) {
    const { x, z, scale: s } = zone;
    p9Add(p9Meshes.fan, x, z + 1.34*s, 1.28*s, 1.16*s, .08*s, .82*s, p9Mix(palette.wine, palette.paperLight, .15), Math.PI, true);
    addBox(x, z + 1.18*s, .18*s, .72*s, .08*s, .26*s, p9Stone, 0, false);
    if (detailLevel >= 2) [-.66, .66].forEach((dx) => addCylinder(x + dx*s, z + 1.34*s, .52*s, .045*s, .48*s, .045*s, p9Gold, false));
  }

  function glassStudio(zone) {
    const { x, z, scale: s } = zone;
    addBox(x + 1.10*s, z - .10*s, .56*s, .58*s, .56*s, .50*s, glass, 0, true);
    p9Roof(x + 1.10*s, z - .10*s, 1.32*s, .68*s, .30*s, .60*s, p9Mix(palette.paperLight, palette.green, .10, .78), 0);
    p9Window(x - .48*s, z + .88*s, .72*s, .15*s, 0, p9Gold);
    p9Window(x + .02*s, z + .88*s, .72*s, .15*s, 0, p9Gold);
    if (detailLevel >= 2) addCylinder(x - 1.16*s, z + 1.15*s, .24*s, .12*s, .18*s, .12*s, p9Water, false);
  }

  function neutralAtelier(zone) {
    const { x, z, scale: s } = zone;
    addBox(x, z + 1.34*s, .075, .74*s, .018, .36*s, p9Mix(palette.paperDeep, palette.gold, .07), 0, false);
    if (detailLevel >= 2) {
      addBox(x - .66*s, z + 1.34*s, .42*s, .032*s, .42*s, .032*s, p9StoneDark, 0, false);
      addBox(x + .66*s, z + 1.34*s, .42*s, .032*s, .42*s, .032*s, p9StoneDark, 0, false);
    }
  }

  const renderers = Object.freeze({
    CERAMICS: ceramics,
    TEXTILE: textileStudio,
    JEWELRY: jewelryAtelier,
    WOOD: woodYard,
    FLORAL: floralStudio,
    PAPER: paperArcade,
    CANDLE: candleWorkshop,
    LEATHER: leatherCanopy,
    FAN: fanPavilion,
    GLASS: glassStudio,
    NEUTRAL: neutralAtelier
  });

  function placeForZone(zone) {
    if (zone.existingPlace) return webglInteractionPlaces?.[zone.existingPlace] || null;
    const suffix = String(zone.zoneKey || '').slice(-2);
    return webglDynamicProviderPlaces?.[`zone-${suffix}`] || null;
  }

  function typeForZone(zone) {
    const configured = zoneModel.configuration(zone.zoneKey);
    if (configured?.workshopType) return configured.workshopType;
    const place = placeForZone(zone);
    if (place?.workshopType) return place.workshopType;
    const provider = place?.provider || (zone.existingPlace ? webglProviderByPlace?.get(zone.existingPlace) : null);
    return provider?.specialty || '';
  }

  function decorateZone(zone) {
    if (!zone || decorated.has(zone.zoneKey)) return;
    const configured = zoneModel.configuration(zone.zoneKey);
    if (configured?.status === 'HIDDEN') return;
    const type = typeForZone(zone);
    if (!type && !configured?.displayLabel && !placeForZone(zone)) return;

    const resolved = taxonomy.resolve(type);
    const renderer = renderers[resolved.key] || renderers.NEUTRAL;
    renderer(zone);
    decorated.add(zone.zoneKey);
    familyCount(resolved.key);

    const place = placeForZone(zone);
    if (place) {
      place.architectureFamily = resolved.key;
      place.architectureLabel = resolved.label;
    }
  }

  function applyArchitecture() {
    for (const zone of zoneModel.registry) decorateZone(zone);
    root.dataset.craftArchitecture = 'true';
    root.dataset.craftArchitectureZones = String(decorated.size);
    root.dataset.craftArchitectureDetail = String(detailLevel);
    root.dataset.webglPhase = 'u3.4';
    const summary = [...familyCounts.entries()].map(([key, count]) => `${key}:${count}`).join(',');
    root.dataset.craftArchitectureFamilies = summary;

    const label = document.querySelector('.webgl-village-heading > span');
    if (label) label.textContent = 'U3.4 · arquitectura viva por oficio';
    if (status && !root.dataset.webglError) {
      status.textContent = `${decorated.size} zonas con lenguaje arquitectónico · ${detailLevel === 3 ? 'detalle alto' : detailLevel === 2 ? 'detalle medio' : 'detalle ligero'}`;
    }
  }

  async function start() {
    await zoneModel.ready;
    if (root.dataset.webglProviders === undefined) {
      await new Promise((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          observer.disconnect();
          resolve();
        };
        const observer = new MutationObserver((records) => {
          if (records.some((record) => record.attributeName === 'data-webgl-providers')) finish();
        });
        observer.observe(root, { attributes: true, attributeFilter: ['data-webgl-providers'] });
        window.setTimeout(finish, 1400);
      });
    }
    applyArchitecture();
  }

  void start();
})();

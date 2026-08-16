/* Atelier Lumière · U3.5B · microdetalle artesanal por oficio */
(() => {
  if (!root || !window.AtelierVillageZones || !window.AtelierCraftTaxonomy) return;

  const zones = window.AtelierVillageZones;
  const taxonomy = window.AtelierCraftTaxonomy;
  const MATERIAL = window.AtelierMaterialTextures?.MATERIAL || {};
  const quality = typeof webglQualityMode === 'string' ? webglQualityMode : 'balanced';
  const budget = quality === 'high' ? 3 : quality === 'balanced' ? 2 : 1;
  const detailed = new Set();

  const warmGlass = [1.0, .62, .28, .84];
  const paleGlass = [0.78, .86, .82, .66];
  const clay = p9Mix(palette.gold, palette.roof, .52);
  const clayLight = p9Mix(palette.gold, palette.paperLight, .34);
  const wood = p9Mix(palette.roof, palette.ink, .12);
  const paleWood = p9Mix(palette.roof, palette.paperLight, .20);
  const botanical = p9Mix(palette.green, palette.paperLight, .08);
  const darkBotanical = p9Mix(palette.greenDark, palette.ink, .08);
  const leather = p9Mix(palette.roof, palette.gold, .22);
  const brass = p9Gold;
  const linen = p9Linen;

  function mark(object, kind) {
    if (object && Number.isInteger(kind)) object.materialKind = kind;
    return object;
  }

  function box(x, z, y, sx, sy, sz, color, rotation = 0, kind = MATERIAL.STUCCO, edges = true) {
    return mark(p9Box(x, z, y, sx, sy, sz, color, rotation, edges), kind);
  }

  function cylinder(x, z, y, sx, sy, sz, color, kind = MATERIAL.STONE, edges = true) {
    return mark(p9Add(p9Meshes.cylinder, x, z, y, sx, sy, sz, color, 0, edges), kind);
  }

  function cone(x, z, y, sx, sy, sz, color, kind = MATERIAL.VEGETATION, edges = false) {
    return mark(p9Add(meshes.cone, x, z, y, sx, sy, sz, color, 0, edges), kind);
  }

  function table(x, z, s, rotation = 0) {
    box(x, z, .48*s, .58*s, .055*s, .30*s, paleWood, rotation, MATERIAL.WOOD, true);
    if (budget >= 2) {
      [-.48, .48].forEach((dx) => box(x + dx*s, z, .25*s, .035*s, .25*s, .035*s, wood, rotation, MATERIAL.WOOD, false));
    }
  }

  function ceramics(zone) {
    const { x, z, scale:s } = zone;
    table(x - .82*s, z + 1.34*s, s, -.04);
    const count = budget === 3 ? 5 : budget === 2 ? 3 : 2;
    for (let i=0;i<count;i++) {
      const dx = (i - (count - 1)/2) * .25*s;
      cylinder(x - .82*s + dx, z + 1.30*s, .62*s + (i%2)*.035*s, .075*s, .10*s, .075*s, i%2 ? clayLight : clay, MATERIAL.STONE, false);
    }
    if (budget >= 2) {
      for (let i=0;i<3;i++) cylinder(x + .60*s, z + (1.22 + i*.16)*s, .16*s, .16*s, .025*s, .16*s, clayLight, MATERIAL.STONE, false);
    }
  }

  function textile(zone) {
    const { x, z, scale:s } = zone;
    const cloths = [p9Wine, linen, p9Mix(palette.wineSoft, palette.paperLight, .38)];
    const count = budget === 3 ? 4 : budget === 2 ? 3 : 2;
    for (let i=0;i<count;i++) {
      const dx = (i - (count-1)/2) * .30*s;
      box(x + dx, z + 1.31*s, .73*s, .115*s, .34*s, .018*s, cloths[i%cloths.length], 0, MATERIAL.STUCCO, false);
    }
    if (budget >= 2) {
      cylinder(x + .92*s, z + 1.18*s, .18*s, .16*s, .16*s, .16*s, p9Mix(palette.roof,palette.gold,.18), MATERIAL.WOOD, true);
      box(x - .96*s, z + 1.12*s, .34*s, .30*s, .035*s, .18*s, paleWood, 0, MATERIAL.WOOD, true);
    }
  }

  function jewelry(zone) {
    const { x, z, scale:s } = zone;
    const cases = budget === 3 ? [-.62, 0, .62] : budget === 2 ? [-.42, .42] : [0];
    cases.forEach((dx,i) => {
      box(x + dx*s, z + 1.30*s, .26*s, .22*s, .18*s, .18*s, p9Mix(palette.paperLight,palette.green,.04,.52), 0, MATERIAL.GLASS, true);
      cylinder(x + dx*s, z + 1.30*s, .49*s, .035*s, .08*s, .035*s, brass, MATERIAL.METAL, false);
    });
    if (budget >= 2) {
      box(x - .98*s, z + .86*s, .52*s, .035*s, .52*s, .035*s, p9StoneDark, 0, MATERIAL.METAL, false);
      box(x - .98*s, z + .86*s, 1.05*s, .08*s, .06*s, .08*s, warmGlass, 0, MATERIAL.GLASS, false);
    }
  }

  function woodwork(zone) {
    const { x, z, scale:s } = zone;
    table(x + .76*s, z + 1.22*s, s, .05);
    const count = budget === 3 ? 6 : budget === 2 ? 4 : 2;
    for (let i=0;i<count;i++) {
      box(x - .85*s + (i%3)*.22*s, z + (1.12 + Math.floor(i/3)*.18)*s, (.11 + i*.015)*s, .10*s, .045*s, .36*s, i%2?paleWood:wood, .05*(i%3), MATERIAL.WOOD, false);
    }
    if (budget >= 3) box(x + 1.18*s, z + .48*s, .48*s, .035*s, .48*s, .035*s, p9StoneDark, 0, MATERIAL.METAL, false);
  }

  function floral(zone) {
    const { x, z, scale:s } = zone;
    const pots = budget === 3 ? [-.75,-.25,.25,.75] : budget === 2 ? [-.55,0,.55] : [-.30,.30];
    pots.forEach((dx,i) => {
      cylinder(x + dx*s, z + 1.30*s, .13*s, .11*s, .12*s, .11*s, clay, MATERIAL.STONE, false);
      cone(x + dx*s, z + 1.30*s, .42*s + (i%2)*.05*s, .17*s, .26*s, .17*s, i%2?botanical:darkBotanical, MATERIAL.VEGETATION, false);
    });
    if (budget >= 2) box(x + 1.06*s, z + .72*s, .48*s, .38*s, .025*s, .28*s, paleGlass, 0, MATERIAL.GLASS, true);
  }

  function paper(zone) {
    const { x, z, scale:s } = zone;
    const sheets = budget === 3 ? 5 : budget === 2 ? 3 : 2;
    for (let i=0;i<sheets;i++) {
      const dx = (i - (sheets-1)/2) * .26*s;
      box(x + dx, z + 1.24*s, .62*s + (i%2)*.10*s, .10*s, .24*s, .012*s, i%3===0?p9Paper:linen, 0, MATERIAL.STUCCO, false);
    }
    if (budget >= 2) table(x - .94*s, z + .82*s, .74*s, 0);
  }

  function candles(zone) {
    const { x, z, scale:s } = zone;
    const count = budget === 3 ? 7 : budget === 2 ? 5 : 3;
    for (let i=0;i<count;i++) {
      const col = i%4;
      const row = Math.floor(i/4);
      const px = x + (col - 1.5)*.20*s;
      const pz = z + (1.22 + row*.25)*s;
      const h = (.12 + (i%3)*.055)*s;
      cylinder(px,pz,h,.055*s,h,.055*s,p9Mix(palette.paperLight,palette.gold,.16),MATERIAL.STUCCO,false);
      box(px,pz,h*2.0+.035*s,.035*s,.025*s,.035*s,warmGlass,0,MATERIAL.GLASS,false);
    }
    if (budget >= 2) table(x + .86*s,z + 1.08*s,.72*s,0);
  }

  function leatherwork(zone) {
    const { x, z, scale:s } = zone;
    table(x - .76*s,z + 1.20*s,.78*s,-.04);
    const strips = budget === 3 ? 5 : budget === 2 ? 3 : 2;
    for (let i=0;i<strips;i++) {
      box(x + .65*s + i*.16*s,z + 1.22*s,.49*s + (i%2)*.08*s,.06*s,.38*s,.014*s,leather,0,MATERIAL.WOOD,false);
    }
    if (budget >= 3) cylinder(x + 1.04*s,z + .72*s,.17*s,.15*s,.15*s,.15*s,p9Mix(palette.roof,palette.wine,.14),MATERIAL.WOOD,true);
  }

  function fans(zone) {
    const { x, z, scale:s } = zone;
    const count = budget === 3 ? 3 : budget === 2 ? 2 : 1;
    for (let i=0;i<count;i++) {
      const dx = (i - (count-1)/2)*.46*s;
      mark(p9Add(p9Meshes.fan,x+dx,z+1.31*s,.46*s+i*.06*s,.34*s,.035*s,.24*s,i%2?p9Wine:p9Mix(palette.wine,palette.gold,.18),Math.PI,true),MATERIAL.WOOD);
    }
    if (budget >= 2) table(x + .88*s,z + .96*s,.68*s,.04);
  }

  function glasswork(zone) {
    const { x, z, scale:s } = zone;
    const count = budget === 3 ? 5 : budget === 2 ? 3 : 2;
    for (let i=0;i<count;i++) {
      const dx = (i - (count-1)/2)*.25*s;
      const color = i%2 ? paleGlass : [0.88,.74,.54,.62];
      cylinder(x + dx,z+1.25*s,.18*s + (i%3)*.04*s,.09*s,.15*s + (i%2)*.04*s,.09*s,color,MATERIAL.GLASS,false);
    }
    if (budget >= 2) {
      box(x + .92*s,z + .90*s,.48*s,.035*s,.48*s,.035*s,p9StoneDark,0,MATERIAL.METAL,false);
      box(x + .92*s,z + .90*s,.99*s,.07*s,.07*s,.07*s,warmGlass,0,MATERIAL.GLASS,false);
    }
  }

  function neutral(zone) {
    const {x,z,scale:s}=zone;
    table(x,z+1.30*s,.70*s,0);
    if (budget>=2) {
      cylinder(x-.62*s,z+1.26*s,.14*s,.10*s,.13*s,.10*s,clay,MATERIAL.STONE,false);
      cone(x-.62*s,z+1.26*s,.36*s,.13*s,.20*s,.13*s,botanical,MATERIAL.VEGETATION,false);
    }
  }

  const renderers = Object.freeze({
    CERAMICS: ceramics,
    TEXTILE: textile,
    JEWELRY: jewelry,
    WOOD: woodwork,
    FLORAL: floral,
    PAPER: paper,
    CANDLE: candles,
    LEATHER: leatherwork,
    FAN: fans,
    GLASS: glasswork,
    NEUTRAL: neutral
  });

  function typeFor(zone) {
    const config = zones.configuration(zone.zoneKey);
    if (config?.workshopType) return config.workshopType;
    if (zone.existingPlace) {
      const place = webglInteractionPlaces?.[zone.existingPlace];
      if (place?.workshopType) return place.workshopType;
      const provider = webglProviderByPlace?.get(zone.existingPlace);
      return provider?.specialty || '';
    }
    const suffix = String(zone.zoneKey).slice(-2);
    const place = webglDynamicProviderPlaces?.[`zone-${suffix}`];
    return place?.workshopType || place?.provider?.specialty || '';
  }

  function shouldDetail(zone) {
    const config = zones.configuration(zone.zoneKey);
    if (config?.status === 'HIDDEN') return false;
    if (config?.workshopType || config?.displayLabel || config?.providerSlug) return true;
    if (zone.existingPlace) return true;
    const suffix = String(zone.zoneKey).slice(-2);
    return Boolean(webglDynamicProviderPlaces?.[`zone-${suffix}`]);
  }

  for (const zone of zones.registry) {
    if (!shouldDetail(zone)) continue;
    const resolved = taxonomy.resolve(typeFor(zone));
    (renderers[resolved.key] || renderers.NEUTRAL)(zone);
    detailed.add(zone.zoneKey);
  }

  root.dataset.craftMicrodetails = 'true';
  root.dataset.craftMicrodetailZones = String(detailed.size);
  root.dataset.craftMicrodetailBudget = String(budget);
  root.dataset.webglPhase = 'u3.5b';
  if (status && !root.dataset.webglError) status.textContent = `U3.5B · microdetalle artesanal ${quality}`;
})();

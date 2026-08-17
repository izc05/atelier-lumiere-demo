/* Atelier Lumière · U3.35 · limpieza formal guiada por la referencia */
(() => {
  if (!root || root.dataset.referenceShapeCleanup === 'u3.35') return;
  if (!Array.isArray(objects) || typeof p9Box !== 'function' || typeof p9Roof !== 'function') return;

  const quality = typeof webglQualityMode === 'string' ? webglQualityMode : 'balanced';
  const zones = window.AtelierVillageZones?.registry || [];
  const taxonomy = window.AtelierCraftTaxonomy;
  const MATERIAL = window.AtelierMaterialTextures?.MATERIAL || Object.freeze({ STUCCO:1, ROOF:2, STONE:3, WOOD:4, GLASS:5, METAL:6, EARTH:7, VEGETATION:8 });
  const created = [];
  let removed = 0;

  const paper = p9Mix(palette.paperLight, palette.paperDeep, .10);
  const paperWarm = p9Mix(palette.paperLight, palette.gold, .055);
  const wine = p9Mix(palette.wine, palette.paperLight, .08);
  const wineRoof = p9Mix(palette.roof, palette.wine, .18);
  const wood = p9Mix(palette.trunk, palette.ink, .12);
  const stone = typeof p9Stone !== 'undefined' ? p9Stone : p9Mix(palette.paperDeep, palette.roof, .18);
  const warm = p9Mix(palette.gold, palette.paperLight, .04);
  const textile = p9Mix(palette.wine, palette.paperLight, .42);

  const close = (a, b, tolerance) => Number.isFinite(a) && Math.abs(a - b) <= tolerance;

  function mark(object, role, material, always = false) {
    if (!object) return null;
    object.u335Role = role;
    object.materialKind = material;
    object.u329MaterialExplicit = true;
    object.lodAlways = always;
    object.edges = quality === 'high' && ['frame-post','frame-bar','porch-beam','roof-trim'].includes(role);
    created.push(object);
    return object;
  }

  function removeMatching(predicate) {
    for (let index = objects.length - 1; index >= 0; index -= 1) {
      const object = objects[index];
      if (!predicate(object)) continue;
      objects.splice(index, 1);
      removed += 1;
    }
  }

  function matchBox(object, x, z, y, sx, sy, sz, tolerance = .13) {
    if (!object?.position || !object?.scale) return false;
    return close(object.position[0], x, tolerance)
      && close(object.position[2], z, tolerance)
      && close(object.position[1], y, tolerance)
      && close(object.scale[0], sx, Math.max(.05, sx * .32))
      && close(object.scale[1], sy, Math.max(.05, sy * .26))
      && close(object.scale[2], sz, Math.max(.05, sz * .30));
  }

  function configuredType(zone) {
    const configured = window.AtelierVillageZones?.configuration?.(zone.zoneKey);
    if (configured?.workshopType) return configured.workshopType;
    if (zone.existingPlace) return webglInteractionPlaces?.[zone.existingPlace]?.workshopType || '';
    const suffix = String(zone.zoneKey || '').slice(-2);
    return webglDynamicProviderPlaces?.[`zone-${suffix}`]?.workshopType || '';
  }

  function frameAt(zone, sideSign, family) {
    const s = zone.scale || .72;
    const x = zone.x + sideSign * 1.12 * s;
    const z = zone.z + .36 * s;
    const frameColor = family === 'WOOD' || family === 'LEATHER' ? wood : p9Mix(wood, palette.gold, .14);
    const halfW = .32 * s;
    const postH = .50 * s;
    const y0 = .12 * s;

    mark(p9Box(x - halfW, z, y0 + postH, .025*s, postH, .026*s, frameColor, 0, false), 'frame-post', MATERIAL.WOOD);
    mark(p9Box(x + halfW, z, y0 + postH, .025*s, postH, .026*s, frameColor, 0, false), 'frame-post', MATERIAL.WOOD);
    mark(p9Box(x, z, y0 + postH*1.96, halfW + .035*s, .025*s, .030*s, frameColor, 0, false), 'frame-bar', MATERIAL.WOOD);
    mark(p9Box(x, z, y0 + .10*s, halfW + .035*s, .020*s, .028*s, stone, 0, false), 'frame-base', MATERIAL.STONE);

    if (family === 'TEXTILE') {
      [-.18, 0, .18].forEach((dx, index) => {
        mark(p9Box(x + dx*s, z + .012*s, y0 + .51*s, .045*s, .31*s, .012*s, index === 1 ? textile : paperWarm, 0, false), 'textile-strip', MATERIAL.WOOD);
      });
    } else if (family === 'PAPER') {
      [-.16, .16].forEach((dx, index) => {
        mark(p9Box(x + dx*s, z + .012*s, y0 + .52*s, .13*s, .22*s, .010*s, index ? paperWarm : paper, 0, false), 'paper-sheet', MATERIAL.STUCCO);
      });
    } else if (family === 'LEATHER') {
      [-.15, .15].forEach((dx) => {
        mark(p9Box(x + dx*s, z + .012*s, y0 + .48*s, .12*s, .25*s, .012*s, p9Mix(palette.roof, palette.gold, .20), 0, false), 'leather-piece', MATERIAL.WOOD);
      });
    } else if (family === 'WOOD') {
      for (let i = 0; i < 4; i += 1) {
        mark(p9Box(x, z + (i-1.5)*.065*s, .08*s + i*.025*s, .30*s, .025*s, .045*s, p9Mix(wood, palette.gold, .08*i), .03*(i-1.5), false), 'board-stack', MATERIAL.WOOD);
      }
    }
  }

  /* Sustituye los paneles macizos que desde cámara parecían paredes sueltas. */
  if (taxonomy) {
    zones.forEach((zone) => {
      if (zone.existingPlace === 'stitch') return;
      const type = configuredType(zone);
      if (!type) return;
      const family = taxonomy.resolve(type)?.key || 'NEUTRAL';
      const s = zone.scale || .72;
      let target = null;
      if (family === 'TEXTILE') target = { side:-1.18, forward:.20, y:.68, sx:.055, sy:.64, sz:.52, sign:-1 };
      if (family === 'PAPER') target = { side:-1.18, forward:.18, y:.64, sx:.05, sy:.62, sz:.46, sign:-1 };
      if (family === 'LEATHER') target = { side:1.18, forward:.18, y:.62, sx:.05, sy:.62, sz:.46, sign:1 };
      if (family === 'WOOD') target = { side:1.24, forward:.86, y:.55, sx:.055, sy:.55, sz:.42, sign:1 };
      if (!target) return;
      removeMatching((object) => matchBox(object,
        zone.x + target.side*s,
        zone.z + target.forward*s,
        target.y*s,
        target.sx*s,
        target.sy*s,
        target.sz*s,
        .18*s + .05
      ));
      frameAt(zone, target.sign, family);
    });
  }

  /* The Gentle Stitch: se retira la nave/pérgola experimental y se recompone como casa-taller mediterránea. */
  const gx = 12;
  const gz = -7;
  const stitchMatchers = [
    [gx, gz-.55, .62, 2.28, .62, .78],
    [gx-.82, gz+.24, .70, .60, .50, .035],
    [gx+.66, gz+.24, .70, .60, .50, .035],
    [gx+1.72, gz+.24, .60, .27, .60, .045]
  ];
  removeMatching((object) => stitchMatchers.some(([x,z,y,sx,sy,sz]) => matchBox(object,x,z,y,sx,sy,sz,.10)));
  removeMatching((object) => object?.position && (
    (close(object.position[2], gz+2.15, .10) && object.position[1] > .60 && object.position[1] < 1.65)
    || (close(object.position[2], gz+3.72, .10) && object.position[1] > .25 && object.position[1] < 1.35)
  ));
  /* Retira las tres cubiertas antiguas por posición/escala, sin tocar casas vecinas. */
  removeMatching((object) => object?.position && object?.scale
    && close(object.position[2], gz-.55, .10)
    && object.position[1] > 1.30 && object.position[1] < 1.90
    && object.scale[0] > .78 && object.scale[0] < 1.05
    && object.scale[2] > .80 && object.scale[2] < 1.02);

  const stitchBody = mark(p9Box(gx, gz-.44, .68, 1.48, .68, .86, paper, -.018, true), 'stitch-house', MATERIAL.STUCCO, true);
  const stitchUpper = mark(p9Box(gx+.05, gz-.50, 1.52, .82, .42, .68, paperWarm, -.018, true), 'stitch-upper', MATERIAL.STUCCO, true);
  const stitchRoof = mark(p9Roof(gx, gz-.44, 1.72, 1.67, .34, 1.02, wineRoof, -.018), 'stitch-roof', MATERIAL.ROOF, true);
  const stitchUpperRoof = mark(p9Roof(gx+.05, gz-.50, 2.20, .98, .26, .80, p9Mix(wineRoof, palette.linen, .10), -.018), 'stitch-upper-roof', MATERIAL.ROOF, true);
  void stitchBody; void stitchUpper; void stitchRoof; void stitchUpperRoof;

  const frontZ = gz + .44;
  mark(p9Box(gx+.52, frontZ, .48, .25, .48, .035, wine, 0, false), 'stitch-door', MATERIAL.WOOD, true);
  [-.72, -.12, .96].forEach((dx, index) => {
    const opening = p9Window(gx+dx, frontZ+.018, .76, .15, 0, index === 1 ? paperWarm : warm);
    mark(opening, 'stitch-window', MATERIAL.GLASS, index < 2);
  });
  [-.46,.46].forEach((dx) => mark(p9Window(gx+.05+dx, gz+.20, 1.58, .13, 0, warm), 'stitch-upper-window', MATERIAL.GLASS));

  /* Porche pequeño: lectura doméstica, no gran estructura técnica. */
  const porchZ = gz + .78;
  [-.72,.20,.92].forEach((dx) => mark(p9Box(gx+dx, porchZ, .48, .032, .48, .032, wood, 0, false), 'porch-post', MATERIAL.WOOD));
  mark(p9Box(gx+.10, porchZ, .98, .88, .035, .16, wood, 0, false), 'porch-beam', MATERIAL.WOOD);
  mark(p9Roof(gx+.10, porchZ, 1.10, .98, .11, .30, p9Mix(wineRoof,palette.linen,.16), 0), 'porch-roof', MATERIAL.ROOF);
  mark(p9Box(gx+.10, gz+1.12, .055, .96, .018, .32, stone, 0, false), 'stitch-threshold', MATERIAL.STONE, true);

  /* Pequeño bastidor lateral de bordado, lejos del eje de fachada. */
  const miniZone = { x: gx+2.10, z: gz+.62, scale:.78 };
  frameAt(miniZone, 1, 'TEXTILE');

  root.dataset.referenceShapeCleanup = 'u3.35';
  root.dataset.referenceShapeCleanupQuality = quality;
  root.dataset.referenceShapeCleanupRemoved = String(removed);
  root.dataset.referenceShapeCleanupCreated = String(created.length);
  root.dataset.webglPhase = 'u3.35';

  window.AtelierVillageReferenceShapeCleanup = Object.freeze({
    quality,
    removed: () => removed,
    created: () => created.length
  });

  if (status && !root.dataset.webglError) {
    status.textContent = `U3.35 · limpieza por referencia · ${removed} piezas ambiguas retiradas · ${created.length} formas claras`;
  }
})();

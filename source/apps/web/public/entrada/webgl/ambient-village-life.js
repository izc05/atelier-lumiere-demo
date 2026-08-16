/* Atelier Lumière · U3.24 · vida ambiental, luz doméstica y microanimación adaptativa */
(() => {
  if (!root || root.dataset.ambientVillageLife === 'u3.24') return;
  if (typeof p9Box !== 'function' || typeof objects === 'undefined') return;
  if (!window.AtelierCraftTaxonomy || !window.AtelierVillageWorkshopFrontages) return;

  const taxonomy = window.AtelierCraftTaxonomy;
  const quality = typeof webglQualityMode === 'string' ? webglQualityMode : 'balanced';
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const saveData = Boolean(connection?.saveData);
  const lifeBudget = quality === 'high' ? 10 : quality === 'balanced' ? 6 : 3;
  const animationBudget = quality === 'high' ? 5 : quality === 'balanced' ? 3 : 0;
  const detailBudget = quality === 'high' ? 8 : quality === 'balanced' ? 5 : 2;

  const wood = p9Mix(palette.trunk, palette.ink, .16);
  const woodLight = p9Mix(palette.trunk, palette.paperLight, .18);
  const stone = p9Mix(palette.paperDeep, palette.roof, .20);
  const wine = p9Mix(palette.wine, palette.paperLight, .025);
  const wineSoft = p9Mix(palette.wine, palette.paperLight, .16);
  const gold = p9Mix(palette.gold, palette.paperLight, .10);
  const linen = p9Mix(palette.linen, palette.paperLight, .25);
  const green = p9Mix(palette.green, palette.ink, .08);
  const greenLight = p9Mix(palette.green, palette.paperLight, .18);
  const clay = p9Mix(palette.gold, palette.roof, .46);
  const glass = [.72, .83, .82, .68];
  const warm = [1.0, .61, .22, .90];
  const warmSoft = [.91, .47, .16, .68];

  const created = [];
  const animated = [];
  const lifeStations = [];
  const windowStates = [];

  function hash(value, salt = 0) {
    let n = 2166136261 ^ Math.imul(salt + 1, 16777619);
    for (const char of String(value || 'atelier')) {
      n ^= char.charCodeAt(0);
      n = Math.imul(n, 16777619);
    }
    return (n >>> 0) / 4294967295;
  }

  function track(object, role, placeName = '') {
    if (!object) return object;
    object.ambientLifeRole = role;
    object.ambientLifePlace = placeName;
    created.push(object);
    return object;
  }

  function localPoint(config, side = 0, forward = 0) {
    const rotation = Number(config.rotation) || 0;
    const cr = Math.cos(rotation);
    const sr = Math.sin(rotation);
    return [
      config.x + cr * side + sr * forward,
      config.z - sr * side + cr * forward
    ];
  }

  function boxAt(config, side, forward, y, sx, sy, sz, color, role, rotationOffset = 0, edges = false) {
    const [x, z] = localPoint(config, side, forward);
    return track(
      p9Box(x, z, config.ground + y, sx, sy, sz, color, (config.rotation || 0) + rotationOffset, edges),
      role,
      config.placeName
    );
  }

  function cylinderAt(config, side, forward, y, sx, sy, sz, color, role, edges = false) {
    if (typeof p9Add !== 'function' || !p9Meshes?.cylinder) return null;
    const [x, z] = localPoint(config, side, forward);
    return track(
      p9Add(p9Meshes.cylinder, x, z, config.ground + y, sx, sy, sz, color, 0, edges),
      role,
      config.placeName
    );
  }

  function coneAt(config, side, forward, y, sx, sy, sz, color, role, edges = false) {
    if (typeof p9Add !== 'function' || !p9Meshes?.cone) return null;
    const [x, z] = localPoint(config, side, forward);
    return track(
      p9Add(p9Meshes.cone, x, z, config.ground + y, sx, sy, sz, color, 0, edges),
      role,
      config.placeName
    );
  }

  function familyFor(placeName, place) {
    if (placeName === 'izc') return 'FAN';
    if (placeName === 'stitch') return 'TEXTILE';
    if (placeName === 'atelier') return 'NEUTRAL';
    return taxonomy.resolve(place?.workshopType || place?.provider?.specialty || '').key;
  }

  function configFor(placeName, place = null) {
    if (placeName === 'atelier') return { placeName, x: 0, z: 0, ground: groundAt(0, 0), s: 1.18, front: 1.34, rotation: 0, family: 'NEUTRAL', landmark: true };
    if (placeName === 'izc') return { placeName, x: -11, z: 7, ground: groundAt(-11, 7), s: 1.16, front: .43, rotation: 0, family: 'FAN', landmark: true };
    if (placeName === 'stitch') return { placeName, x: 12, z: -7, ground: groundAt(12, -7), s: 1.12, front: .26, rotation: 0, family: 'TEXTILE', landmark: true };
    const x = Number(place?.point?.[0]);
    const z = Number(place?.point?.[2]);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    const s = Array.isArray(place.scale) && Number(place.scale[0]) > 0 ? Number(place.scale[0]) / 2 : .72;
    return { placeName, x, z, ground: groundAt(x, z), s, front: .93, rotation: 0, family: familyFor(placeName, place), landmark: false };
  }

  function groundAt(x, z) {
    return typeof atelierTerrainHeight === 'function' ? atelierTerrainHeight(x, z) : 0;
  }

  function collectWorkshops() {
    const result = [configFor('atelier'), configFor('izc'), configFor('stitch')].filter(Boolean);
    if (typeof webglDynamicProviderPlaces !== 'undefined') {
      Object.entries(webglDynamicProviderPlaces)
        .filter(([, place]) => Boolean(place?.provider) && Array.isArray(place?.point))
        .forEach(([placeName, place]) => {
          const config = configFor(placeName, place);
          if (config) result.push(config);
        });
    }
    return result;
  }

  function varyWindowLight() {
    const candidates = objects.filter((object) => object?.urbanRole === 'window' || object?.workshopFrontageRole === 'shop-window');
    candidates.forEach((object, index) => {
      if (!Array.isArray(object.color) || object.color.length < 3) return;
      const position = Array.isArray(object.position) ? object.position : [0, 0, 0];
      const seed = hash(`${position[0]?.toFixed?.(2)}:${position[2]?.toFixed?.(2)}:${index}`, 24);
      const active = seed > .17;
      const factor = active ? .70 + seed * .34 : .33 + seed * .20;
      const source = [...object.color];
      object.color = [
        Math.min(1, source[0] * factor),
        Math.min(1, source[1] * factor),
        Math.min(1, source[2] * factor),
        active ? Math.max(.48, source[3] ?? 1) : Math.min(.54, source[3] ?? 1)
      ];
      object.ambientWindowActive = active;
      windowStates.push({ object, active, seed });
    });
  }

  function outdoorTable(config, side = 1) {
    const s = config.s;
    const forward = config.front * s + .78 * s;
    const sideOffset = side * .58 * s;
    const table = boxAt(config, sideOffset, forward, .24*s, .30*s, .035*s, .20*s, woodLight, 'work-table', side * .025, false);
    if (table) table.lodAlways = false;
    [-.20, .20].forEach((dx) => {
      boxAt(config, sideOffset + dx*s, forward, .11*s, .026*s, .11*s, .026*s, wood, 'work-table-leg');
    });
    return { sideOffset, forward };
  }

  function stool(config, sideOffset, forward, direction = 1) {
    if (quality === 'lite') return;
    const s = config.s;
    const stoolSide = sideOffset + direction * .40*s;
    boxAt(config, stoolSide, forward + .03*s, .14*s, .12*s, .025*s, .12*s, wood, 'stool');
    boxAt(config, stoolSide, forward + .03*s, .065*s, .020*s, .065*s, .020*s, wood, 'stool-leg');
  }

  function planter(config, side, forward, size = 1, leafColor = green) {
    const s = config.s;
    boxAt(config, side*s, forward*s, .11*s, .16*s*size, .10*s, .14*s*size, stone, 'life-planter');
    if (p9Meshes?.cone) {
      coneAt(config, side*s, forward*s, .31*s, .15*s*size, .18*s, .15*s*size, leafColor, 'life-plant');
      if (quality === 'high') coneAt(config, side*s + .08*s, forward*s - .03*s, .42*s, .10*s*size, .13*s, .10*s*size, greenLight, 'life-plant');
    } else {
      boxAt(config, side*s, forward*s, .29*s, .14*s*size, .10*s, .12*s*size, leafColor, 'life-plant');
    }
  }

  function tablePieces(config, table, family, detailed) {
    const s = config.s;
    const side = table.sideOffset;
    const forward = table.forward;
    const familyKey = family || 'NEUTRAL';

    if (familyKey === 'CERAMICS') {
      [-.10, .10].forEach((offset, index) => cylinderAt(config, side + offset*s, forward, .36*s, .055*s, (.07 + index*.025)*s, .055*s, index ? clay : p9Mix(clay, linen, .15), 'table-piece'));
      return;
    }
    if (familyKey === 'TEXTILE') {
      [-.12, 0, .12].forEach((offset, index) => boxAt(config, side + offset*s, forward, (.39 + index*.018)*s, .055*s, .12*s, .014*s, index%2 ? linen : wineSoft, 'table-piece', (index-1)*.05));
      return;
    }
    if (familyKey === 'JEWELRY') {
      boxAt(config, side, forward, .34*s, .13*s, .025*s, .10*s, stone, 'table-plinth');
      cylinderAt(config, side, forward, .41*s, .035*s, .045*s, .035*s, gold, 'table-piece');
      return;
    }
    if (familyKey === 'WOOD') {
      [-.08, 0, .08].forEach((offset, index) => boxAt(config, side, forward + offset*s, (.34 + index*.025)*s, .15*s, .018*s, .035*s, index%2 ? wood : woodLight, 'table-piece', .03*(index-1)));
      return;
    }
    if (familyKey === 'FLORAL') {
      cylinderAt(config, side, forward, .34*s, .065*s, .075*s, .065*s, clay, 'table-pot');
      coneAt(config, side, forward, .51*s, .10*s, .14*s, .10*s, greenLight, 'table-piece');
      return;
    }
    if (familyKey === 'PAPER') {
      [-.02, .025, .07].forEach((height, index) => boxAt(config, side, forward, (.34 + height)*s, .15*s, .012*s, .11*s, index === 1 ? gold : linen, 'table-piece', (index-1)*.03));
      return;
    }
    if (familyKey === 'CANDLE') {
      [-.08, .02, .10].forEach((offset, index) => {
        cylinderAt(config, side + offset*s, forward, (.34 + index*.015)*s, .025*s, (.06 + index*.018)*s, .025*s, linen, 'table-piece');
        const glow = boxAt(config, side + offset*s, forward, (.48 + index*.04)*s, .018*s, .014*s, .018*s, warm, 'life-glow');
        if (glow) animated.push({ object: glow, type: 'glow', phase: hash(config.placeName, index)*Math.PI*2, baseColor: [...warm] });
      });
      return;
    }
    if (familyKey === 'LEATHER') {
      [-.08, .08].forEach((offset) => boxAt(config, side + offset*s, forward, .41*s, .08*s, .11*s, .016*s, p9Mix(palette.roof, palette.wine, .18), 'table-piece', offset > 0 ? .08 : -.08));
      return;
    }
    if (familyKey === 'FAN' && typeof p9Add === 'function' && p9Meshes?.fan) {
      const [x,z] = localPoint(config, side, forward);
      track(p9Add(p9Meshes.fan, x, z, config.ground + .42*s, .16*s, .020*s, .12*s, wineSoft, Math.PI, false), 'table-piece', config.placeName);
      return;
    }
    if (familyKey === 'GLASS') {
      [-.07, .07].forEach((offset, index) => cylinderAt(config, side + offset*s, forward, .40*s, .045*s, (.08 + index*.025)*s, .045*s, index ? glass : [.88,.66,.38,.66], 'table-piece'));
      return;
    }

    if (detailed) boxAt(config, side, forward, .37*s, .12*s, .07*s, .08*s, wineSoft, 'table-piece', .04);
  }

  function familyVegetation(config, family, side = 1) {
    const baseForward = config.front + 1.12;
    if (family === 'FLORAL') {
      planter(config, side*.98, baseForward, 1.15, greenLight);
      planter(config, side*.64, baseForward + .18, .78, p9Mix(greenLight, palette.gold, .08));
      return;
    }
    if (family === 'TEXTILE') {
      planter(config, side*.93, baseForward, .82, p9Mix(green, wineSoft, .12));
      return;
    }
    if (family === 'CERAMICS' || family === 'WOOD') {
      planter(config, side*.95, baseForward, .92, green);
      return;
    }
    if (family === 'CANDLE' || family === 'PAPER') {
      planter(config, side*.92, baseForward, .72, greenLight);
      return;
    }
    if (family === 'FAN' || family === 'GLASS' || family === 'JEWELRY') {
      planter(config, side*.96, baseForward, .68, p9Mix(green, palette.paperLight, .12));
    }
  }

  function hangingLife(config, side = 1) {
    if (quality === 'lite') return;
    const s = config.s;
    const forward = config.front*s + .32*s;
    const banner = boxAt(config, side*.92*s, forward, 1.03*s, .07*s, .22*s, .014*s, config.family === 'TEXTILE' ? linen : wineSoft, 'life-banner', side*.02, false);
    if (!banner) return;
    banner.lodAlways = false;
    if (animated.length < animationBudget) {
      animated.push({ object: banner, type: 'sway', phase: hash(config.placeName, 74)*Math.PI*2, baseRotation: banner.rotation || 0 });
    }
  }

  function smallLantern(config, side = -1) {
    if (quality === 'lite') return;
    const s = config.s;
    const forward = config.front*s + .46*s;
    boxAt(config, side*.94*s, forward, .73*s, .025*s, .20*s, .025*s, gold, 'life-lantern-arm');
    const glow = boxAt(config, side*.94*s, forward + .025*s, .93*s, .055*s, .075*s, .040*s, warmSoft, 'life-glow');
    if (glow && animated.length < animationBudget) {
      animated.push({ object: glow, type: 'glow', phase: hash(config.placeName, 81)*Math.PI*2, baseColor: [...warmSoft] });
    }
  }

  function decorateWorkshop(config, index) {
    const seed = hash(config.placeName, 240 + index);
    const side = seed > .5 ? 1 : -1;
    const detailed = index < detailBudget;
    const table = outdoorTable(config, side);
    stool(config, table.sideOffset, table.forward, side > 0 ? -1 : 1);
    tablePieces(config, table, config.family, detailed);
    familyVegetation(config, config.family, -side);
    if (index % 2 === 0 || config.landmark) hangingLife(config, side);
    if (index % 3 !== 1 || config.landmark) smallLantern(config, -side);
    lifeStations.push({ placeName: config.placeName, family: config.family, landmark: config.landmark });
  }

  function resetAnimated() {
    for (const item of animated) {
      if (item.type === 'sway' && item.object) item.object.rotation = item.baseRotation;
      if (item.type === 'glow' && item.object && Array.isArray(item.baseColor)) item.object.color = [...item.baseColor];
    }
  }

  function animationAllowed() {
    if (quality === 'lite' || reducedMotion.matches || saveData || document.hidden) return false;
    const mode = root.dataset.performanceMode || '';
    if (mode === 'protect' || mode === 'reduce') return false;
    const dynamicScale = Number(window.AtelierVillageDynamicDetailScale ?? 1);
    return !Number.isFinite(dynamicScale) || dynamicScale >= .78;
  }

  let raf = 0;
  let lastAnimationFrame = 0;

  function animate(now) {
    raf = 0;
    if (document.hidden) return;
    if (!animationAllowed()) {
      resetAnimated();
      raf = requestAnimationFrame(animate);
      return;
    }

    /* 30 Hz máximo: el renderer sigue a su frecuencia normal; aquí solo variamos propiedades. */
    if (now - lastAnimationFrame >= 32) {
      lastAnimationFrame = now;
      const selected = typeof webglSelectedPlace === 'string' ? webglSelectedPlace : 'overview';
      animated.slice(0, animationBudget).forEach((item, index) => {
        const wave = Math.sin(now * .00105 + item.phase + index * .67);
        if (item.type === 'sway' && item.object) {
          item.object.rotation = item.baseRotation + wave * .030;
        } else if (item.type === 'glow' && item.object && Array.isArray(item.baseColor)) {
          const selectedBoost = item.object.ambientLifePlace && item.object.ambientLifePlace === selected ? .08 : 0;
          const pulse = .90 + wave * .055 + selectedBoost;
          item.object.color = [
            Math.min(1, item.baseColor[0] * pulse),
            Math.min(1, item.baseColor[1] * pulse),
            Math.min(1, item.baseColor[2] * pulse),
            item.baseColor[3]
          ];
        }
      });
    }
    raf = requestAnimationFrame(animate);
  }

  function resumeAnimation() {
    if (raf || document.hidden || animationBudget <= 0 || reducedMotion.matches || saveData) return;
    raf = requestAnimationFrame(animate);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      resetAnimated();
    } else {
      resumeAnimation();
    }
  });

  const workshops = collectWorkshops();
  varyWindowLight();
  workshops.slice(0, lifeBudget).forEach(decorateWorkshop);
  resumeAnimation();

  root.dataset.ambientVillageLife = 'u3.24';
  root.dataset.ambientLifeQuality = quality;
  root.dataset.ambientLifeStations = String(lifeStations.length);
  root.dataset.ambientLifeObjects = String(created.length);
  root.dataset.ambientLifeWindows = String(windowStates.length);
  root.dataset.ambientLifeAnimations = String(Math.min(animated.length, animationBudget));
  root.dataset.ambientLifeReducedMotion = reducedMotion.matches ? 'true' : 'false';
  root.dataset.ambientLifeSaveData = saveData ? 'true' : 'false';
  root.dataset.webglPhase = 'u3.24';

  window.AtelierVillageAmbientLife = Object.freeze({
    stations: () => lifeStations.length,
    objects: () => created.length,
    windows: () => windowStates.length,
    animations: () => Math.min(animated.length, animationBudget),
    quality,
    lifeBudget,
    animationBudget
  });

  if (status && !root.dataset.webglError) {
    status.textContent = `U3.24 · pueblo vivo · ${lifeStations.length} talleres activos · ${Math.min(animated.length, animationBudget)} microanimaciones · ${quality}`;
  }
})();

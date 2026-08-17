/* Atelier Lumière · U3.37 · casas hero con fidelidad cercana tipo videojuego */
(() => {
  if (!root || root.dataset.heroHouseFidelity === 'u3.37') return;
  if (!Array.isArray(objects) || !window.AtelierVillageUrbanDensity || !window.AtelierMaterialTextures) return;
  if (typeof p9Box !== 'function') return;

  const quality = typeof webglQualityMode === 'string' ? webglQualityMode : 'balanced';
  const MATERIAL = window.AtelierMaterialTextures.MATERIAL;
  const generatedBudget = quality === 'high' ? 20 : quality === 'balanced' ? 14 : 7;
  const houseBudget = quality === 'high' ? 14 : quality === 'balanced' ? 9 : 4;
  const detailBudget = quality === 'high' ? 290 : quality === 'balanced' ? 158 : 62;
  const roofRows = quality === 'high' ? 5 : quality === 'balanced' ? 3 : 1;
  const created = [];
  let upgraded = 0;
  let framedWindows = 0;
  let framedDoors = 0;

  const stone = typeof p9Stone !== 'undefined' ? p9Stone : p9Mix(palette.paperDeep, palette.roof, .18);
  const stoneDark = typeof p9StoneDark !== 'undefined' ? p9StoneDark : p9Mix(palette.paperDeep, palette.ink, .20);
  const wood = p9Mix(palette.trunk, palette.ink, .22);
  const woodWarm = p9Mix(palette.trunk, palette.gold, .12);
  const roofA = p9Mix(palette.roof, palette.wine, .11);
  const roofB = p9Mix(palette.roof, palette.gold, .055);
  const glassWarm = [1.0, .58, .26, .76];
  const foliage = p9Mix(palette.green, palette.paperLight, .10);
  const metal = p9Mix(palette.gold, palette.paperLight, .04);

  function hash(value) {
    let h = 2166136261;
    for (const char of String(value)) {
      h ^= char.charCodeAt(0);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0) / 4294967295;
  }

  function mark(object, role, material, always = false) {
    if (!object || created.length >= detailBudget) return null;
    object.u337Role = role;
    object.materialKind = material;
    object.u329MaterialExplicit = true;
    object.u337HeroDetail = true;
    object.lodAlways = always;
    object.edges = quality === 'high' && ['door-lintel', 'window-lintel', 'balcony-slab', 'roof-fascia'].includes(role);
    created.push(object);
    return object;
  }

  function localPoint(origin, rotation, side, forward) {
    const cr = Math.cos(rotation || 0);
    const sr = Math.sin(rotation || 0);
    return [
      origin[0] + cr * side + sr * forward,
      origin[2] - sr * side + cr * forward
    ];
  }

  function boxAt(origin, rotation, side, forward, y, sx, sy, sz, color, role, material, always = false) {
    if (created.length >= detailBudget) return null;
    const [x, z] = localPoint(origin, rotation, side, forward);
    return mark(p9Box(x, z, y, sx, sy, sz, color, rotation || 0, false), role, material, always);
  }

  function objectDistance2(object, x, z) {
    if (!object?.position) return Infinity;
    const dx = object.position[0] - x;
    const dz = object.position[2] - z;
    return dx * dx + dz * dz;
  }

  function nearest(objectList, house, maxDistance) {
    let best = null;
    let distance = maxDistance * maxDistance;
    const x = house.position[0];
    const z = house.position[2];
    for (const object of objectList) {
      const d = objectDistance2(object, x, z);
      if (d < distance) {
        best = object;
        distance = d;
      }
    }
    return best;
  }

  function nearby(objectList, house, maxDistance) {
    const limit = maxDistance * maxDistance;
    const x = house.position[0];
    const z = house.position[2];
    return objectList
      .filter((object) => objectDistance2(object, x, z) <= limit)
      .sort((a, b) => (a.position?.[1] || 0) - (b.position?.[1] || 0));
  }

  function frameDoor(house, door, index) {
    if (!door?.position || created.length >= detailBudget) return;
    const rotation = house.rotation || 0;
    const hs = house.scale || [.55, .55, .45];
    const side = (() => {
      const dx = door.position[0] - house.position[0];
      const dz = door.position[2] - house.position[2];
      return dx * Math.cos(rotation) - dz * Math.sin(rotation);
    })();
    const forward = (hs[2] || .45) + .040;
    const doorHalfW = Math.max(.10, door.scale?.[0] || hs[0] * .20);
    const doorHalfH = Math.max(.25, door.scale?.[1] || hs[1] * .50);
    const baseY = Math.max(.06, door.position[1] - doorHalfH);
    const topY = door.position[1] + doorHalfH;
    const jamb = Math.max(.028, doorHalfW * .18);

    /* Oscuridad de hueco + carpintería: la puerta deja de parecer una pegatina. */
    boxAt(house.position, rotation, side, forward - .010, door.position[1], doorHalfW * .92, doorHalfH * .94, .026, p9Mix(wood, palette.ink, .30), 'door-recess', MATERIAL.WOOD, index < 3);
    boxAt(house.position, rotation, side - doorHalfW - jamb*.62, forward + .010, door.position[1], jamb, doorHalfH * 1.06, .038, stone, 'door-jamb', MATERIAL.STONE, index < 3);
    boxAt(house.position, rotation, side + doorHalfW + jamb*.62, forward + .010, door.position[1], jamb, doorHalfH * 1.06, .038, stone, 'door-jamb', MATERIAL.STONE, index < 3);
    boxAt(house.position, rotation, side, forward + .012, topY + jamb*.54, doorHalfW + jamb*1.22, jamb*.55, .042, stoneDark, 'door-lintel', MATERIAL.STONE, index < 3);
    boxAt(house.position, rotation, side, forward + .13, Math.max(.028, baseY + .018), doorHalfW * 1.22, .025, .12, stoneDark, 'door-threshold', MATERIAL.STONE, index < 5);

    if (quality !== 'lite') {
      boxAt(house.position, rotation, side + doorHalfW*.48, forward + .052, door.position[1], .015, .018, .012, metal, 'door-handle', MATERIAL.METAL);
      boxAt(house.position, rotation, side, forward + .045, topY + jamb*2.55, doorHalfW*.18, .028, .026, glassWarm, 'door-lamp', MATERIAL.GLASS);
    }
    framedDoors += 1;
  }

  function frameWindow(house, windowObject, index, windowIndex) {
    if (!windowObject?.position || created.length >= detailBudget) return;
    const rotation = house.rotation || 0;
    const hs = house.scale || [.55, .55, .45];
    const dx = windowObject.position[0] - house.position[0];
    const dz = windowObject.position[2] - house.position[2];
    const side = dx * Math.cos(rotation) - dz * Math.sin(rotation);
    const forward = (hs[2] || .45) + .046;
    const halfW = Math.max(.075, windowObject.scale?.[0] || hs[0] * .15);
    const halfH = Math.max(.10, windowObject.scale?.[1] || hs[1] * .18);
    const y = windowObject.position[1];
    const frameW = Math.max(.020, halfW * .13);
    const frameH = Math.max(.018, halfH * .12);

    /* Vidrio hundido + marco de piedra + carpintería fina. */
    boxAt(house.position, rotation, side, forward - .012, y, halfW*.94, halfH*.94, .018, glassWarm, 'window-recess', MATERIAL.GLASS, index < 2);
    boxAt(house.position, rotation, side, forward + .014, y + halfH + frameH*.50, halfW + frameW*1.25, frameH, .032, stone, 'window-lintel', MATERIAL.STONE, index < 2);
    boxAt(house.position, rotation, side, forward + .014, y - halfH - frameH*.50, halfW + frameW*1.30, frameH, .035, stoneDark, 'window-sill', MATERIAL.STONE, index < 2);
    boxAt(house.position, rotation, side - halfW - frameW*.52, forward + .012, y, frameW, halfH + frameH*.60, .032, stone, 'window-jamb', MATERIAL.STONE);
    boxAt(house.position, rotation, side + halfW + frameW*.52, forward + .012, y, frameW, halfH + frameH*.60, .032, stone, 'window-jamb', MATERIAL.STONE);

    if (quality !== 'lite') {
      boxAt(house.position, rotation, side, forward + .038, y, .012, halfH*.90, .011, woodWarm, 'window-mullion-v', MATERIAL.WOOD);
      boxAt(house.position, rotation, side, forward + .038, y, halfW*.88, .012, .011, woodWarm, 'window-mullion-h', MATERIAL.WOOD);
    }

    if (quality === 'high' && (index + windowIndex) % 3 === 0) {
      const planterY = y - halfH - frameH*2.10;
      boxAt(house.position, rotation, side, forward + .105, planterY, halfW*.68, .050, .095, stoneDark, 'window-planter', MATERIAL.STONE);
      boxAt(house.position, rotation, side, forward + .105, planterY + .095, halfW*.58, .050, .080, foliage, 'window-plant', MATERIAL.VEGETATION);
    }
    framedWindows += 1;
  }

  function roofFidelity(house, roof, index) {
    if (!roof?.position || created.length >= detailBudget) return;
    const rotation = roof.rotation || house.rotation || 0;
    const rs = roof.scale || [.65, .25, .55];
    const front = rs[2] * .83;
    const eaveY = roof.position[1] - rs[1] * .39;
    const ridgeY = roof.position[1] + rs[1] * .89;

    boxAt(roof.position, rotation, 0, front, eaveY, rs[0]*.98, .018, .030, wood, 'roof-fascia', MATERIAL.WOOD, index < 3);
    if (quality === 'high') {
      boxAt(roof.position, rotation, 0, -front, eaveY, rs[0]*.98, .016, .028, wood, 'roof-rear-fascia', MATERIAL.WOOD);
    }

    /* Hiladas físicas muy finas: el shader aporta teja y la geometría aporta escala/paralaje. */
    for (let row = 0; row < roofRows; row += 1) {
      if (created.length >= detailBudget) break;
      const t = roofRows === 1 ? .52 : (row + .55) / roofRows;
      const zOffset = (t - .5) * rs[2] * 1.42;
      const rise = rs[1] * (1 - Math.min(1, Math.abs(zOffset) / Math.max(.01, rs[2]))) * .78;
      const tone = (row + index) % 2 ? roofA : roofB;
      boxAt(roof.position, rotation, 0, zOffset, roof.position[1] + rise + .012, rs[0]*.91, .010, .014, tone, 'roof-tile-course', MATERIAL.ROOF);
    }

    if (quality !== 'lite') {
      const caps = quality === 'high' ? 7 : 4;
      for (let cap = 0; cap < caps && created.length < detailBudget; cap += 1) {
        const side = ((cap + .5) / caps - .5) * rs[0] * 1.55;
        boxAt(roof.position, rotation, side, 0, ridgeY + .016, rs[0] * .052, .022, .052, cap % 2 ? roofA : roofB, 'roof-ridge-tile', MATERIAL.ROOF);
      }
    }
  }

  function balconyOrAwning(house, site, index) {
    if (quality === 'lite' || created.length >= detailBudget) return;
    const rotation = house.rotation || 0;
    const hs = house.scale || [.55, .55, .45];
    const twoStorey = Number(site?.t) === 2 || hs[1] > .72;
    const seed = hash(`${site?.x}:${site?.z}:${index}`);

    if (twoStorey && (index % 2 === 0 || quality === 'high')) {
      const forward = hs[2] + .18;
      const width = Math.min(hs[0]*.55, .42);
      boxAt(house.position, rotation, 0, forward, house.position[1] + hs[1]*.45, width, .025, .14, wood, 'balcony-slab', MATERIAL.WOOD, index < 2);
      const railY = house.position[1] + hs[1]*.67;
      boxAt(house.position, rotation, 0, forward + .09, railY, width, .018, .018, woodWarm, 'balcony-rail', MATERIAL.WOOD);
      const posts = quality === 'high' ? 5 : 3;
      for (let p = 0; p < posts && created.length < detailBudget; p += 1) {
        const side = ((p + .5) / posts - .5) * width * 1.75;
        boxAt(house.position, rotation, side, forward + .09, railY - .10, .012, .10, .012, wood, 'balcony-post', MATERIAL.WOOD);
      }
      if (quality === 'high') {
        boxAt(house.position, rotation, (seed-.5)*width*.8, forward + .11, railY + .055, width*.25, .035, .050, foliage, 'balcony-plant', MATERIAL.VEGETATION);
      }
      return;
    }

    if (index % 3 === 1) {
      const forward = hs[2] + .15;
      boxAt(house.position, rotation, 0, forward, house.position[1] + hs[1]*.76, hs[0]*.42, .022, .16, p9Mix(roofA, palette.linen, .12), 'small-awning', MATERIAL.ROOF);
      [-.32, .32].forEach((side) => {
        boxAt(house.position, rotation, side*hs[0], forward + .10, house.position[1] + hs[1]*.38, .012, hs[1]*.34, .012, wood, 'awning-post', MATERIAL.WOOD);
      });
    }
  }

  function groundBlend(house, door, index) {
    if (!door?.position || created.length >= detailBudget) return;
    const rotation = house.rotation || 0;
    const hs = house.scale || [.55, .55, .45];
    const dx = door.position[0] - house.position[0];
    const dz = door.position[2] - house.position[2];
    const side = dx * Math.cos(rotation) - dz * Math.sin(rotation);
    const forward = hs[2] + .25;
    const pieces = quality === 'high' ? 3 : 2;
    for (let i = 0; i < pieces && created.length < detailBudget; i += 1) {
      const seed = hash(`${house.position[0]}:${house.position[2]}:${i}`);
      boxAt(
        house.position,
        rotation + (seed-.5)*.04,
        side + (seed-.5)*.12,
        forward + i*.14,
        .030 + i*.006,
        .16 + seed*.035,
        .018,
        .095 + seed*.025,
        i % 2 ? stone : stoneDark,
        'entry-paver',
        MATERIAL.STONE,
        index < 4
      );
    }
  }

  const houses = objects.filter((object) => object?.urbanRole === 'house');
  const roofs = objects.filter((object) => object?.urbanRole === 'roof');
  const doors = objects.filter((object) => object?.urbanRole === 'door');
  const windows = objects.filter((object) => object?.urbanRole === 'window');
  const sites = (window.AtelierVillageUrbanDensity.oldQuarter || []).slice(0, generatedBudget);

  /* Se prioriza el casco que realmente domina las tomas del usuario. */
  const selectedSites = sites
    .map((site, index) => ({ site, index, score: Math.hypot(site.x * .88, site.z * .76) }))
    .sort((a, b) => a.score - b.score)
    .slice(0, houseBudget);

  selectedSites.forEach(({ site }, index) => {
    if (created.length >= detailBudget) return;
    const house = nearest(houses, { position: [site.x, 0, site.z] }, Math.max(.85, site.s * .70));
    if (!house) return;
    const roof = nearest(roofs, house, Math.max(.9, site.s * .85));
    const door = nearest(doors, house, Math.max(.95, site.s * 1.05));
    const houseWindows = nearby(windows, house, Math.max(1.0, site.s * 1.15)).slice(0, site.t === 2 ? 4 : 2);

    frameDoor(house, door, index);
    houseWindows.forEach((windowObject, windowIndex) => frameWindow(house, windowObject, index, windowIndex));
    roofFidelity(house, roof, index);
    balconyOrAwning(house, site, index);
    groundBlend(house, door, index);
    upgraded += 1;
  });

  root.dataset.heroHouseFidelity = 'u3.37';
  root.dataset.heroHouseFidelityQuality = quality;
  root.dataset.heroHouseFidelityHouses = String(upgraded);
  root.dataset.heroHouseFidelityDetails = String(created.length);
  root.dataset.heroHouseFidelityWindows = String(framedWindows);
  root.dataset.heroHouseFidelityDoors = String(framedDoors);
  root.dataset.webglPhase = 'u3.37';

  window.AtelierVillageHeroHouseFidelity = Object.freeze({
    quality,
    houses: () => upgraded,
    details: () => created.length,
    windows: () => framedWindows,
    doors: () => framedDoors
  });

  if (status && !root.dataset.webglError) {
    status.textContent = `U3.37 · casas hero · ${upgraded} viviendas · ${created.length} detalles físicos · ${quality}`;
  }
})();

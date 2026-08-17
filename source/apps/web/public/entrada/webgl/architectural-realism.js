/* Atelier Lumière · U3.34 · realismo arquitectónico y lectura del casco */
(() => {
  if (!root || root.dataset.architecturalRealism === 'u3.34') return;
  if (!Array.isArray(objects) || typeof p9Box !== 'function') return;

  const quality = typeof webglQualityMode === 'string' ? webglQualityMode : 'balanced';
  const MATERIAL = window.AtelierMaterialTextures?.MATERIAL || Object.freeze({
    STUCCO: 1,
    ROOF: 2,
    STONE: 3,
    WOOD: 4,
    GLASS: 5,
    METAL: 6,
    EARTH: 7,
    VEGETATION: 8
  });
  const houseBudget = quality === 'high' ? 16 : quality === 'balanced' ? 10 : 5;
  const detailBudget = quality === 'high' ? 150 : quality === 'balanced' ? 82 : 34;
  const created = [];
  let aged = 0;

  const clamp01 = (value) => Math.min(1, Math.max(0, value));
  const hash = (value) => {
    let h = 2166136261;
    const text = String(value);
    for (let i = 0; i < text.length; i += 1) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0) / 4294967295;
  };

  const stone = typeof p9Stone !== 'undefined'
    ? p9Stone
    : [0.39, 0.34, 0.28, 1];
  const stoneWarm = typeof p9StoneDark !== 'undefined'
    ? p9StoneDark
    : [0.31, 0.25, 0.20, 1];
  const wood = palette?.trunk || [0.22, 0.12, 0.08, 1];
  const roofAccent = palette?.roof || [0.34, 0.12, 0.10, 1];

  function mark(object, role, material, lodAlways = false) {
    if (!object || created.length >= detailBudget) return null;
    object.u334ArchitecturalRole = role;
    object.materialKind = material;
    object.u329MaterialExplicit = true;
    object.u334ArchitecturalDetail = true;
    object.lodAlways = lodAlways;
    object.edges = quality === 'high' && ['ridge-cap', 'eave', 'quoin', 'door-step'].includes(role);
    created.push(object);
    return object;
  }

  function localPoint(object, side, forward) {
    const rotation = object.rotation || 0;
    const cr = Math.cos(rotation);
    const sr = Math.sin(rotation);
    return [
      (object.position?.[0] || 0) + cr * side + sr * forward,
      (object.position?.[2] || 0) - sr * side + cr * forward
    ];
  }

  function boxLocal(object, side, forward, y, sx, sy, sz, color, role, material, rotationOffset = 0, lodAlways = false) {
    if (created.length >= detailBudget) return null;
    const [x, z] = localPoint(object, side, forward);
    return mark(
      p9Box(x, z, y, sx, sy, sz, color, (object.rotation || 0) + rotationOffset, false),
      role,
      material,
      lodAlways
    );
  }

  function ageSurface(object, seed, type) {
    if (!Array.isArray(object?.color) || object.u334Aged) return;
    const c = object.color;
    const r = hash(`${seed}:${type}`);
    const a = c[3] ?? 1;
    if (type === 'facade') {
      const warmShift = (r - .5) * .035;
      object.color = [
        clamp01(c[0] * (.965 + r * .018) + .010 + warmShift),
        clamp01(c[1] * (.948 + r * .020) + .008),
        clamp01(c[2] * (.925 + r * .017) + .006 - warmShift * .35),
        a
      ];
    } else if (type === 'roof') {
      object.color = [
        clamp01(c[0] * (.90 + r * .045) + .012),
        clamp01(c[1] * (.84 + r * .036) + .006),
        clamp01(c[2] * (.80 + r * .030) + .004),
        a
      ];
    }
    object.u334Aged = true;
    aged += 1;
  }

  function nearestRoof(house, roofs) {
    let best = null;
    let bestDistance = Infinity;
    const hx = house.position?.[0] || 0;
    const hz = house.position?.[2] || 0;
    for (const roof of roofs) {
      const dx = (roof.position?.[0] || 0) - hx;
      const dz = (roof.position?.[2] || 0) - hz;
      const d = dx * dx + dz * dz;
      if (d < bestDistance) {
        bestDistance = d;
        best = roof;
      }
    }
    return bestDistance < 1.4 ? best : null;
  }

  function addPlinth(house, index) {
    const sx = house.scale?.[0] || .55;
    const sy = house.scale?.[1] || .50;
    const sz = house.scale?.[2] || .45;
    const front = sz + .020;
    const height = Math.max(.075, sy * .18);
    boxLocal(house, 0, front, height, sx * .94, height, .030, stone, 'stone-plinth', MATERIAL.STONE, 0, index < 5);

    if (quality !== 'lite' && index % 3 !== 2) {
      const split = sx * .47;
      boxLocal(house, -split, front + .006, height * 1.08, sx * .035, height * .92, .038, stoneWarm, 'plinth-joint', MATERIAL.STONE);
      boxLocal(house, split, front + .006, height * .92, sx * .035, height * .78, .038, stoneWarm, 'plinth-joint', MATERIAL.STONE);
    }
  }

  function addEaves(house, roof, index) {
    if (!roof) return;
    const rsx = roof.scale?.[0] || .65;
    const rsy = roof.scale?.[1] || .22;
    const rsz = roof.scale?.[2] || .55;
    const ridgeY = (roof.position?.[1] || 1) + rsy * .64;
    const eaveY = (roof.position?.[1] || 1) - rsy * .36;

    boxLocal(roof, 0, 0, ridgeY, rsx * .72, Math.max(.018, rsy * .055), .026, roofAccent, 'ridge-cap', MATERIAL.ROOF, 0, index < 4);
    boxLocal(roof, 0, rsz * .82, eaveY, rsx * .96, .020, .034, wood, 'eave', MATERIAL.WOOD, 0, index < 4);
    if (quality === 'high' && index % 2 === 0) {
      boxLocal(roof, 0, -rsz * .82, eaveY, rsx * .96, .018, .030, wood, 'rear-eave', MATERIAL.WOOD);
    }
  }

  function addQuoins(house, index) {
    if (quality === 'lite') return;
    const sx = house.scale?.[0] || .55;
    const sy = house.scale?.[1] || .50;
    const sz = house.scale?.[2] || .45;
    const front = sz + .028;
    const rows = quality === 'high' ? 4 : 3;
    const pieceY = Math.max(.055, sy * .105);
    const pieceX = Math.max(.045, sx * .065);

    for (const sideSign of [-1, 1]) {
      for (let row = 0; row < rows; row += 1) {
        if (created.length >= detailBudget) return;
        const y = pieceY * (1.15 + row * 2.05);
        const stagger = row % 2 === 0 ? 1 : .78;
        boxLocal(
          house,
          sideSign * sx * .91,
          front,
          y,
          pieceX * stagger,
          pieceY * .75,
          .034,
          row % 2 ? stoneWarm : stone,
          'quoin',
          MATERIAL.STONE
        );
      }
    }

    if (quality === 'high' && index % 3 === 0) {
      const side = index % 2 ? -1 : 1;
      boxLocal(house, side * sx * .93, 0, sy * .62, .026, sy * .42, sz * .48, stoneWarm, 'side-quoin', MATERIAL.STONE);
    }
  }

  function addFacadeWear(house, index) {
    if (quality === 'lite' || created.length >= detailBudget) return;
    const sx = house.scale?.[0] || .55;
    const sy = house.scale?.[1] || .50;
    const sz = house.scale?.[2] || .45;
    const seed = hash(`${house.position?.[0]}:${house.position?.[2]}:${index}`);
    const side = (seed - .5) * sx * .72;
    const width = sx * (.12 + seed * .10);
    const patchColor = index % 2 === 0
      ? [0.46, 0.39, 0.31, .92]
      : [0.54, 0.47, 0.38, .90];
    boxLocal(
      house,
      side,
      sz + .034,
      Math.max(.14, sy * (.30 + seed * .22)),
      width,
      Math.max(.020, sy * .035),
      .012,
      patchColor,
      'stucco-wear',
      MATERIAL.STUCCO
    );
  }

  function addDoorStep(house, index) {
    if (quality === 'lite' && index > 2) return;
    if (index % 3 === 2) return;
    const sx = house.scale?.[0] || .55;
    const sz = house.scale?.[2] || .45;
    const side = index % 3 === 0 ? -sx * .22 : index % 3 === 1 ? sx * .20 : 0;
    boxLocal(house, side, sz + .17, .045, Math.max(.15, sx * .22), .022, .11, stoneWarm, 'door-step', MATERIAL.STONE, 0, index < 5);
    if (quality === 'high' && index % 4 === 0) {
      boxLocal(house, side, sz + .29, .025, Math.max(.18, sx * .26), .014, .10, stone, 'door-landing', MATERIAL.STONE);
    }
  }

  const houses = objects.filter((object) => object?.urbanRole === 'house').slice(0, houseBudget);
  const roofs = objects.filter((object) => object?.urbanRole === 'roof');

  houses.forEach((house, index) => {
    const roof = nearestRoof(house, roofs);
    ageSurface(house, index, 'facade');
    if (roof) ageSurface(roof, index, 'roof');
    addPlinth(house, index);
    addEaves(house, roof, index);
    addQuoins(house, index);
    addFacadeWear(house, index);
    addDoorStep(house, index);
  });

  root.dataset.architecturalRealism = 'u3.34';
  root.dataset.architecturalRealismQuality = quality;
  root.dataset.architecturalRealismHouses = String(houses.length);
  root.dataset.architecturalRealismDetails = String(created.length);
  root.dataset.architecturalRealismAged = String(aged);
  root.dataset.webglPhase = 'u3.34';

  window.AtelierVillageArchitecturalRealism = Object.freeze({
    quality,
    houses: () => houses.length,
    details: () => created.length,
    aged: () => aged
  });

  if (status && !root.dataset.webglError) {
    status.textContent = `U3.34 · realismo arquitectónico · ${houses.length} fachadas · ${created.length} detalles · ${quality}`;
  }
})();

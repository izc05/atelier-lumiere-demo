/* Atelier Lumière · U3.33 · pavimento asentado, juntas y bordes integrados */
(() => {
  if (!root || root.dataset.pathSurfaceFidelity === 'u3.33') return;
  if (!window.AtelierVillagePathways || typeof p9Box !== 'function') return;

  const quality = typeof webglQualityMode === 'string' ? webglQualityMode : 'balanced';
  const mobile = window.matchMedia('(max-width:760px)').matches;
  const MATERIAL = window.AtelierMaterialTextures?.MATERIAL || Object.freeze({ STONE: 3, EARTH: 7 });
  const pathApi = window.AtelierVillagePathways;
  const routes = Array.isArray(pathApi.routes) ? [...pathApi.routes] : [];

  const surfaceBudget = quality === 'high' ? 78 : quality === 'balanced' ? 48 : 24;
  const edgeBudget = quality === 'high' ? 36 : quality === 'balanced' ? 22 : 10;
  const jointBudget = quality === 'high' ? 30 : quality === 'balanced' ? 16 : 6;

  const stoneBase = p9Mix(palette.paperDeep, palette.roof, .26);
  const stoneLight = p9Mix(palette.paperDeep, palette.paperLight, .18);
  const stoneWarm = p9Mix(palette.paperDeep, palette.gold, .13);
  const stoneDark = p9Mix(palette.paperDeep, palette.ink, .20);
  const earth = p9Mix(palette.road, palette.green, .08);
  const earthWarm = p9Mix(palette.road, palette.gold, .07);

  let surfaces = 0;
  let edges = 0;
  let joints = 0;
  const created = [];

  function hash(text, salt = 0) {
    let value = 2166136261 ^ Math.imul(salt + 1, 16777619);
    for (const char of String(text)) {
      value ^= char.charCodeAt(0);
      value = Math.imul(value, 16777619);
    }
    return ((value >>> 0) % 10000) / 10000;
  }

  function routePriority(name) {
    if (name === 'promenade-atelier') return 0;
    if (name === 'promenade-izc' || name === 'promenade-stitch') return 1;
    if (name === 'plaza-ring') return 2;
    return 3;
  }

  function routeWidth(name) {
    if (name === 'promenade-atelier') return mobile ? .18 : .22;
    if (name === 'promenade-izc' || name === 'promenade-stitch') return mobile ? .16 : .19;
    if (name === 'plaza-ring') return .105;
    return quality === 'high' ? .13 : .11;
  }

  function spacingFor(name) {
    const priority = routePriority(name);
    if (quality === 'high') return priority === 0 ? .48 : priority <= 2 ? .58 : .82;
    if (quality === 'balanced') return priority === 0 ? .66 : priority <= 2 ? .78 : 1.02;
    return priority === 0 ? .92 : priority <= 2 ? 1.10 : 1.38;
  }

  function addBox(x, z, y, sx, sy, sz, color, rotation, role, material, drawEdges = false) {
    const object = p9Box(x, z, y, sx, sy, sz, color, rotation, drawEdges);
    if (!object) return null;
    object.u333PathRole = role;
    object.materialKind = material;
    object.lodAlways = role === 'settled-stone' && routePriority(object.u333Route || '') === 0;
    created.push(object);
    return object;
  }

  function decorateSample(route, segmentIndex, sampleIndex, x, z, rotation, nx, nz, width) {
    const key = `${route.name}:${segmentIndex}:${sampleIndex}`;
    const side = hash(key, 1) > .5 ? 1 : -1;
    const lateral = (hash(key, 2) - .5) * width * .52 + side * width * .18;
    const length = .115 + hash(key, 3) * .095;
    const halfWidth = width * (.30 + hash(key, 4) * .12);
    const y = .126 + (hash(key, 5) - .5) * .008;
    const tonePick = Math.floor(hash(key, 6) * 4);
    const color = tonePick === 0 ? stoneWarm : tonePick === 1 ? stoneLight : tonePick === 2 ? stoneDark : stoneBase;

    if (surfaces < surfaceBudget) {
      const stone = addBox(
        x + nx * lateral,
        z + nz * lateral,
        y,
        length,
        .008 + hash(key, 7) * .004,
        halfWidth,
        color,
        rotation + (hash(key, 8) - .5) * .075,
        'settled-stone',
        MATERIAL.STONE,
        quality === 'high' && sampleIndex % 5 === 0
      );
      if (stone) {
        stone.u333Route = route.name;
        stone.lodAlways = routePriority(route.name) === 0 && sampleIndex % 2 === 0;
        surfaces += 1;
      }

      /* El paseo principal recibe ocasionalmente una segunda pieza para romper la franja central. */
      if (
        quality === 'high' &&
        routePriority(route.name) <= 1 &&
        sampleIndex % 3 === 1 &&
        surfaces < surfaceBudget
      ) {
        const second = addBox(
          x - nx * lateral * .78,
          z - nz * lateral * .78,
          y - .002,
          length * (.82 + hash(key, 9) * .18),
          .007,
          halfWidth * .82,
          tonePick % 2 ? stoneBase : stoneLight,
          rotation + (hash(key, 10) - .5) * .09,
          'settled-stone',
          MATERIAL.STONE,
          false
        );
        if (second) {
          second.u333Route = route.name;
          surfaces += 1;
        }
      }
    }

    if (joints < jointBudget && sampleIndex % 2 === 0 && routePriority(route.name) <= 2) {
      const seam = addBox(
        x,
        z,
        .124,
        width * (.72 + hash(key, 11) * .16),
        .0035,
        .008 + hash(key, 12) * .004,
        stoneDark,
        rotation + Math.PI / 2 + (hash(key, 13) - .5) * .06,
        'joint',
        MATERIAL.STONE,
        false
      );
      if (seam) {
        seam.u333Route = route.name;
        joints += 1;
      }
    }

    if (edges < edgeBudget && sampleIndex % 2 === 1) {
      const vergeSide = hash(key, 14) > .5 ? 1 : -1;
      const offset = width * (1.02 + hash(key, 15) * .28) * vergeSide;
      const isChip = hash(key, 16) > .58;
      const verge = addBox(
        x + nx * offset,
        z + nz * offset,
        isChip ? .119 : .112,
        isChip ? .065 + hash(key, 17) * .05 : .11 + hash(key, 17) * .08,
        isChip ? .008 : .004,
        isChip ? .045 + hash(key, 18) * .035 : .035 + hash(key, 18) * .025,
        isChip ? (hash(key, 19) > .5 ? stoneBase : stoneDark) : (hash(key, 19) > .5 ? earth : earthWarm),
        rotation + (hash(key, 20) - .5) * .18,
        isChip ? 'edge-chip' : 'earth-verge',
        isChip ? MATERIAL.STONE : MATERIAL.EARTH,
        false
      );
      if (verge) {
        verge.u333Route = route.name;
        edges += 1;
      }
    }
  }

  function decorateRoute(route) {
    if (!route || !Array.isArray(route.points) || route.points.length < 2) return;
    const width = routeWidth(route.name);
    const spacing = spacingFor(route.name);

    for (let segmentIndex = 0; segmentIndex < route.points.length - 1; segmentIndex += 1) {
      if (surfaces >= surfaceBudget && edges >= edgeBudget && joints >= jointBudget) break;
      const a = route.points[segmentIndex];
      const b = route.points[segmentIndex + 1];
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const distance = Math.hypot(dx, dz);
      if (distance < .18) continue;
      const ux = dx / distance;
      const uz = dz / distance;
      const nx = -uz;
      const nz = ux;
      const rotation = Math.atan2(-dz, dx);
      const count = Math.max(1, Math.floor(distance / spacing));

      for (let sampleIndex = 0; sampleIndex < count; sampleIndex += 1) {
        if (surfaces >= surfaceBudget && edges >= edgeBudget && joints >= jointBudget) break;
        const t = (sampleIndex + .5) / count;
        const longitudinal = (hash(`${route.name}:${segmentIndex}`, sampleIndex) - .5) * spacing * .16;
        const x = a[0] + dx * t + ux * longitudinal;
        const z = a[1] + dz * t + uz * longitudinal;
        decorateSample(route, segmentIndex, sampleIndex, x, z, rotation, nx, nz, width);
      }
    }
  }

  routes
    .sort((a, b) => routePriority(a.name) - routePriority(b.name) || String(a.name).localeCompare(String(b.name)))
    .forEach(decorateRoute);

  root.dataset.pathSurfaceFidelity = 'u3.33';
  root.dataset.pathSurfaceQuality = quality;
  root.dataset.pathSurfaceStones = String(surfaces);
  root.dataset.pathSurfaceEdges = String(edges);
  root.dataset.pathSurfaceJoints = String(joints);
  root.dataset.webglPhase = 'u3.33';

  window.AtelierVillagePathSurfaceFidelity = Object.freeze({
    quality,
    surfaces: () => surfaces,
    edges: () => edges,
    joints: () => joints,
    objects: () => created.length
  });

  if (status && !root.dataset.webglError) {
    status.textContent = `U3.33 · caminos asentados · ${surfaces} piedras · ${edges} bordes · ${quality}`;
  }
})();

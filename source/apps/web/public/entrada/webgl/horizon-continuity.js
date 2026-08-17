/* Atelier Lumière · U3.30 · continuidad de terreno, horizonte y vegetación variada */
(() => {
  if (!root || root.dataset.horizonContinuity === 'u3.30') return;
  if (typeof makeMesh !== 'function' || typeof add !== 'function' || !meshes?.box || !meshes?.cone) return;

  const quality = typeof webglQualityMode === 'string' ? webglQualityMode : 'balanced';
  const MATERIAL = window.AtelierMaterialTextures?.MATERIAL || null;
  const outerBudget = quality === 'high' ? 14 : quality === 'balanced' ? 9 : 4;
  const created = [];

  const earth = typeof p9Mix === 'function'
    ? p9Mix(palette.paperDeep, palette.greenDark, .18)
    : [...palette.paperDeep];
  const earthDeep = typeof p9Mix === 'function'
    ? p9Mix(palette.paperDeep, palette.ink, .20)
    : [...palette.paperDeep];
  const green = typeof p9Mix === 'function'
    ? p9Mix(palette.green, palette.paperLight, .06)
    : [...palette.green];
  const greenDeep = typeof p9Mix === 'function'
    ? p9Mix(palette.greenDark, palette.ink, .08)
    : [...palette.greenDark];
  const greenWarm = typeof p9Mix === 'function'
    ? p9Mix(palette.green, palette.gold, .12)
    : [...palette.green];
  const trunk = typeof p9Mix === 'function'
    ? p9Mix(palette.trunk, palette.ink, .12)
    : [...palette.trunk];

  function mark(object, kind, role) {
    if (!object) return object;
    if (MATERIAL && Number.isInteger(kind)) object.materialKind = kind;
    object.horizonRole = role;
    created.push(object);
    return object;
  }

  function addObject(mesh, position, scale, color, rotation, edges, kind, role) {
    add(mesh, position, scale, color, rotation || 0, Boolean(edges));
    return mark(objects[objects.length - 1], kind, role);
  }

  function apronMesh(columns = 14, rows = 10) {
    const positions = [];
    const normals = [];
    const indices = [];
    const lines = [];

    for (let row = 0; row <= rows; row += 1) {
      const z = -1 + (row / rows) * 2;
      for (let col = 0; col <= columns; col += 1) {
        const x = -1 + (col / columns) * 2;
        const edge = Math.max(Math.pow(Math.abs(x), 2.8), Math.pow(Math.abs(z), 2.55));
        const falloff = Math.max(0, (edge - .54) / .46);
        const irregular = Math.sin((col + 1) * 1.73 + row * .61) * .022
          + Math.cos((row + 2) * 1.29 - col * .47) * .016;
        const y = -.045 - falloff * falloff * 1.18 + irregular * (1 - Math.min(1, falloff));
        positions.push(x, y, z);
        normals.push(0, 1, 0);
      }
    }

    const stride = columns + 1;
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < columns; col += 1) {
        const a = row * stride + col;
        const b = a + 1;
        const c = a + stride;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
    return makeMesh(positions, normals, indices, lines);
  }

  const apron = addObject(
    apronMesh(quality === 'high' ? 16 : 12, quality === 'high' ? 12 : 8),
    [0, -.16, 0],
    [31, 1, 23],
    earth,
    0,
    false,
    MATERIAL?.EARTH,
    'terrain-apron'
  );
  if (apron) apron.lodAlways = true;

  /* Segunda lámina muy baja y oscura: evita que el borde descendente termine en un vacío puro. */
  const underlay = addObject(
    meshes.box,
    [0, -1.48, 0],
    [36, .12, 28],
    earthDeep,
    0,
    false,
    MATERIAL?.EARTH,
    'terrain-underlay'
  );
  if (underlay) underlay.lodAlways = true;

  function pseudo(x, z, salt = 0) {
    const n = Math.sin(x * 12.9898 + z * 78.233 + salt * 19.19) * 43758.5453;
    return n - Math.floor(n);
  }

  function apronGround(x, z) {
    const edge = Math.max(Math.abs(x) / 31, Math.abs(z) / 23);
    const falloff = Math.max(0, (edge - .60) / .40);
    return -.18 - falloff * falloff * .78;
  }

  function treePart(mesh, x, y, z, sx, sy, sz, color, kind, rotation = 0, role = 'outer-tree') {
    const object = addObject(mesh, [x, y, z], [sx, sy, sz], color, rotation, false, kind, role);
    if (object) object.lodAlways = false;
    return object;
  }

  function peripheralTree(x, z, s, variant) {
    const ground = apronGround(x, z);
    const woodKind = MATERIAL?.WOOD;
    const greenKind = MATERIAL?.VEGETATION;
    const lean = (pseudo(x, z, 4) - .5) * .12;
    treePart(meshes.box, x, ground + .30 * s, z, .065 * s, .30 * s, .065 * s, trunk, woodKind, lean, 'outer-trunk');

    if (variant === 0) {
      /* Ciprés estrecho. */
      treePart(meshes.cone, x, ground + .86 * s, z, .31 * s, .54 * s, .31 * s, greenDeep, greenKind, lean);
      treePart(meshes.cone, x, ground + 1.31 * s, z, .23 * s, .43 * s, .23 * s, green, greenKind, -lean);
      if (quality === 'high') treePart(meshes.cone, x, ground + 1.66 * s, z, .15 * s, .31 * s, .15 * s, greenWarm, greenKind, lean * .5);
      return;
    }

    if (variant === 1) {
      /* Pino mediterráneo más ancho y bajo. */
      treePart(meshes.cone, x, ground + .82 * s, z, .52 * s, .40 * s, .48 * s, greenDeep, greenKind, lean);
      treePart(meshes.cone, x + .05 * s, ground + 1.15 * s, z - .04 * s, .39 * s, .34 * s, .42 * s, green, greenKind, -lean);
      return;
    }

    /* Copa de olivo abstracta, compuesta por masas desplazadas. */
    treePart(meshes.cone, x - .12 * s, ground + .92 * s, z, .37 * s, .30 * s, .34 * s, greenWarm, greenKind, lean);
    treePart(meshes.cone, x + .14 * s, ground + .95 * s, z + .05 * s, .34 * s, .29 * s, .37 * s, green, greenKind, -lean);
    if (quality !== 'lite') treePart(meshes.cone, x, ground + 1.15 * s, z - .08 * s, .30 * s, .26 * s, .30 * s, greenDeep, greenKind, lean * .35);
  }

  const outerPoints = [
    [-25.0,-8.0,.92],[-24.2,4.0,.82],[-21.0,14.8,.88],[-14.2,18.0,.78],[-5.2,19.0,.72],
    [6.6,18.4,.80],[17.4,16.2,.90],[24.2,9.0,.82],[25.0,-1.8,.76],[22.2,-12.0,.90],
    [14.0,-16.8,.78],[2.0,-18.4,.72],[-10.2,-18.0,.84],[-20.4,-14.0,.88]
  ];

  outerPoints.slice(0, outerBudget).forEach(([x, z, s], index) => {
    peripheralTree(x, z, s * (.88 + pseudo(x, z, 7) * .26), index % 3);
  });

  /* Rompe la repetición de los árboles ya existentes sin mover sus puntos de plantación. */
  const groups = new Map();
  for (const object of objects) {
    if (object?.mesh !== meshes.cone || !Array.isArray(object.scale) || !Array.isArray(object.position)) continue;
    if ((object.scale[1] || 0) < .30 || (object.position[1] || 0) < .28) continue;
    const key = `${object.position[0].toFixed(2)}:${object.position[2].toFixed(2)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(object);
  }

  let varied = 0;
  const variantLimit = quality === 'high' ? 52 : quality === 'balanced' ? 34 : 20;
  for (const [key, group] of groups) {
    if (varied >= variantLimit) break;
    const first = group[0];
    const x = first.position[0];
    const z = first.position[2];
    const h = pseudo(x, z, 11);
    const shape = h < .34 ? 0 : h < .68 ? 1 : 2;
    const width = shape === 0 ? .78 : shape === 1 ? 1.08 : .93;
    const height = shape === 0 ? 1.14 : shape === 1 ? .91 : 1.02;
    const depth = shape === 2 ? 1.08 : width;
    const turn = (pseudo(x, z, 13) - .5) * .26;

    for (const object of group) {
      object.scale[0] *= width;
      object.scale[1] *= height;
      object.scale[2] *= depth;
      object.rotation = (object.rotation || 0) + turn;
      if (MATERIAL?.VEGETATION) object.materialKind = MATERIAL.VEGETATION;
      object.vegetationVariant = shape === 0 ? 'cypress' : shape === 1 ? 'pine' : 'olive';
    }
    varied += 1;
  }

  const href = '/entrada/webgl/horizon-continuity.css';
  if (!document.querySelector(`link[href="${href}"]`)) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.u330Horizon = '';
    document.head.append(link);
  }

  if (!root.querySelector('.u330-horizon-veil')) {
    const veil = document.createElement('div');
    veil.className = 'u330-horizon-veil';
    veil.setAttribute('aria-hidden', 'true');
    root.append(veil);
  }

  root.dataset.horizonContinuity = 'u3.30';
  root.dataset.vegetationVariety = 'u3.30';
  root.dataset.horizonOuterTrees = String(Math.min(outerBudget, outerPoints.length));
  root.dataset.vegetationVariants = String(varied);
  root.dataset.horizonObjects = String(created.length);
  root.dataset.webglPhase = 'u3.30';

  window.AtelierVillageHorizon = Object.freeze({
    quality,
    outerTrees: Math.min(outerBudget, outerPoints.length),
    variedTrees: varied,
    objects: created.length
  });

  if (status && !root.dataset.webglError) {
    status.textContent = `U3.30 · horizonte continuo · ${Math.min(outerBudget, outerPoints.length)} árboles periféricos · ${quality}`;
  }
})();

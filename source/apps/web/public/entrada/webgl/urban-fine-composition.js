/* Atelier Lumière · U3.22 · composición urbana fina, patios y vegetación ornamental */
(() => {
  if (!root || root.dataset.urbanFineComposition === 'u3.22') return;
  if (!window.AtelierVillageUrbanDensity) return;
  if (typeof p9Box !== 'function' || typeof p9Add !== 'function') return;
  if (!p9Meshes?.cylinder || !p9Meshes?.cone) return;

  const quality = typeof webglQualityMode === 'string' ? webglQualityMode : 'balanced';
  const urban = window.AtelierVillageUrbanDensity;
  const sites = Array.isArray(urban.oldQuarter) ? urban.oldQuarter : [];
  const siteBudget = quality === 'high' ? 12 : quality === 'balanced' ? 8 : 4;
  const ornamentalBudget = quality === 'high' ? 10 : quality === 'balanced' ? 6 : 3;
  const pergolaBudget = quality === 'high' ? 4 : quality === 'balanced' ? 2 : 0;

  const stone = p9Mix(palette.paperDeep, palette.roof, .24);
  const stoneSoft = p9Mix(palette.paperDeep, palette.paperLight, .18);
  const stoneWarm = p9Mix(palette.paperDeep, palette.gold, .16);
  const wood = p9Mix(palette.trunk, palette.ink, .15);
  const woodWarm = p9Mix(palette.trunk, palette.gold, .14);
  const green = p9Mix(palette.green, palette.ink, .10);
  const greenSoft = p9Mix(palette.green, palette.paperLight, .10);
  const wine = p9Mix(palette.wine, palette.paperLight, .06);
  const terracotta = p9Mix(palette.roof, palette.gold, .20);
  const warm = [1.0, .63, .24, .88];

  const created = [];

  function add(object, role, always = false) {
    if (!object) return null;
    object.urbanFineRole = role;
    object.lodAlways = always;
    created.push(object);
    return object;
  }

  function box(x, z, y, sx, sy, sz, color, rotation = 0, role = 'detail', always = false, edges = false) {
    return add(p9Box(x, z, y, sx, sy, sz, color, rotation, edges), role, always);
  }

  function cylinder(x, z, y, sx, sy, sz, color, role = 'detail', always = false, edges = false) {
    return add(p9Add(p9Meshes.cylinder, x, z, y, sx, sy, sz, color, 0, edges), role, always);
  }

  function cone(x, z, y, sx, sy, sz, color, role = 'plant', always = false) {
    return add(p9Add(p9Meshes.cone, x, z, y, sx, sy, sz, color, 0, false), role, always);
  }

  function nearestStreet(site) {
    /*
     * U3.20 crea un eje horizontal z=2.25 y otro longitudinal x=.05.
     * El frente urbano nuevo se orienta al más cercano sin mover el edificio.
     */
    const horizontalDistance = Math.abs(site.z - 2.25);
    const verticalDistance = Math.abs(site.x - .05);
    if (horizontalDistance <= verticalDistance) {
      return {
        dx: 0,
        dz: site.z > 2.25 ? -1 : 1,
        rotation: Math.PI / 2,
        distance: horizontalDistance
      };
    }
    return {
      dx: site.x > .05 ? -1 : 1,
      dz: 0,
      rotation: 0,
      distance: verticalDistance
    };
  }

  function patio(site, index) {
    const street = nearestStreet(site);
    const s = Number(site.s) || .55;
    const forward = .98 * s;
    const px = site.x + street.dx * forward;
    const pz = site.z + street.dz * forward;
    const wide = .54 * s;
    const deep = .31 * s;

    box(px, pz, .060, wide, .018, deep, index % 2 ? stoneSoft : stoneWarm, street.rotation, 'patio', true);

    if (quality !== 'lite') {
      const sideDx = street.dz * .48 * s;
      const sideDz = -street.dx * .48 * s;
      [-1, 1].forEach((sign) => {
        box(
          px + sideDx * sign,
          pz + sideDz * sign,
          .135,
          street.rotation === 0 ? .045 : .28 * s,
          .11,
          street.rotation === 0 ? .28 * s : .045,
          stone,
          0,
          'patio-wall',
          false,
          true
        );
      });
    }

    /* Macetas enmarcan la llegada y convierten el hueco en un frente de calle. */
    const tangentX = street.dz;
    const tangentZ = -street.dx;
    [-.34, .34].forEach((offset, potIndex) => {
      const ox = px + tangentX * offset * s;
      const oz = pz + tangentZ * offset * s;
      cylinder(ox, oz, .095, .085 * s, .075, .085 * s, terracotta, 'planter');
      cone(ox, oz, .27, .11 * s, .14, .11 * s, potIndex ? greenSoft : green, 'plant');
    });

    if (index < pergolaBudget) pergola(px, pz, street, s, index);
    else if (quality !== 'lite' && index % 3 === 1) bench(px, pz, street, s);

    if (quality === 'high' && index % 4 === 0) wallLantern(px, pz, street, s);
  }

  function pergola(px, pz, street, s, index) {
    const tangentX = street.dz;
    const tangentZ = -street.dx;
    const forwardX = street.dx;
    const forwardZ = street.dz;
    const width = .58 * s;
    const depth = .34 * s;

    [-1, 1].forEach((side) => {
      [-1, 1].forEach((front) => {
        const x = px + tangentX * width * side + forwardX * depth * front;
        const z = pz + tangentZ * width * side + forwardZ * depth * front;
        box(x, z, .43, .028, .43, .028, wood, 0, 'pergola-post');
      });
    });

    const beamRotation = street.rotation;
    box(px, pz, .86, .66 * s, .025, .045, woodWarm, beamRotation, 'pergola-beam');
    const slatCount = index % 2 === 0 ? 4 : 3;
    for (let i = 0; i < slatCount; i += 1) {
      const t = slatCount === 1 ? 0 : (i / (slatCount - 1) - .5) * .60 * s;
      const x = px + street.dx * t;
      const z = pz + street.dz * t;
      box(x, z, .90, .045, .018, .56 * s, wine, beamRotation, 'pergola-slat');
    }
  }

  function bench(px, pz, street, s) {
    const tangentX = street.dz;
    const tangentZ = -street.dx;
    const x = px + tangentX * .16 * s;
    const z = pz + tangentZ * .16 * s;
    box(x, z, .16, .25 * s, .035, .09 * s, woodWarm, street.rotation, 'bench');
    box(x, z, .32, .25 * s, .025, .025, wood, street.rotation, 'bench-back');
  }

  function wallLantern(px, pz, street, s) {
    const x = px - street.dx * .37 * s;
    const z = pz - street.dz * .37 * s;
    box(x, z, .47, .025, .20, .025, wood, 0, 'lantern-arm');
    box(x, z, .67, .065, .095, .065, warm, 0, 'lantern-glow');
  }

  function ornamentalTree(x, z, scale = .48, kind = 'cypress') {
    box(x, z, .24 * scale, .055 * scale, .24 * scale, .055 * scale, wood, 0, 'ornamental-trunk');
    if (kind === 'cypress') {
      cone(x, z, .78 * scale, .25 * scale, .68 * scale, .25 * scale, green, 'ornamental-cypress');
      cone(x, z, 1.21 * scale, .17 * scale, .42 * scale, .17 * scale, greenSoft, 'ornamental-cypress');
    } else {
      cone(x, z, .68 * scale, .34 * scale, .43 * scale, .34 * scale, greenSoft, 'ornamental-tree');
      cone(x + .07 * scale, z - .03 * scale, .93 * scale, .25 * scale, .30 * scale, .25 * scale, green, 'ornamental-tree');
    }
  }

  function plazaFurniture() {
    const benches = quality === 'lite'
      ? [[-1.18, 2.48, 0]]
      : [[-1.22, 2.48, 0], [1.52, 2.48, 0], [.18, 1.26, Math.PI / 2], [.18, 3.66, Math.PI / 2]];

    benches.forEach(([x, z, rotation], index) => {
      box(x, z, .16, .34, .035, .105, index % 2 ? woodWarm : wood, rotation, 'plaza-bench');
      if (quality !== 'lite') box(x, z, .32, .34, .025, .025, wood, rotation, 'plaza-bench-back');
    });

    if (quality === 'high') {
      [[-1.38,1.55],[1.64,1.55],[-1.38,3.28],[1.64,3.28]].forEach(([x,z], index) => {
        cylinder(x, z, .10, .11, .08, .11, terracotta, 'plaza-planter');
        cone(x, z, .28, .14, .16, .14, index % 2 ? greenSoft : green, 'plaza-plant');
      });
    }
  }

  function transitionCorners() {
    const points = [
      [-3.4, .20, .44, 'cypress'], [3.55, .15, .44, 'cypress'],
      [-4.25, 3.65, .50, 'round'], [4.35, 3.60, .48, 'round'],
      [-7.45, -2.25, .50, 'cypress'], [7.55, -2.20, .50, 'cypress'],
      [-8.05, 4.75, .46, 'round'], [8.15, 4.65, .46, 'round'],
      [-2.55, -5.15, .42, 'cypress'], [2.70, -5.10, .42, 'cypress']
    ];
    points.slice(0, ornamentalBudget).forEach(([x,z,s,kind]) => ornamentalTree(x,z,s,kind));
  }

  function gapWalls() {
    if (quality === 'lite') return;
    const segments = [
      [-3.9,5.15,.62,.06], [4.0,5.05,.62,-.06],
      [-7.65,1.65,.55,-.10], [7.80,1.60,.55,.10],
      [-4.55,-4.55,.52,-.18], [4.70,-4.50,.52,.18]
    ];
    const limit = quality === 'high' ? segments.length : 4;
    segments.slice(0, limit).forEach(([x,z,length,rotation], index) => {
      box(x,z,.15,length,.13,.06,index%2?stoneSoft:stone,rotation,'transition-wall',false,true);
      if (quality === 'high' && index < 4) {
        const side = index % 2 ? 1 : -1;
        cylinder(x + side * .28, z + .10, .12, .09, .08, .09, terracotta, 'wall-planter');
        cone(x + side * .28, z + .10, .31, .12, .17, .12, greenSoft, 'wall-plant');
      }
    });
  }

  sites.slice(0, siteBudget).forEach(patio);
  plazaFurniture();
  transitionCorners();
  gapWalls();

  root.dataset.urbanFineComposition = 'u3.22';
  root.dataset.urbanFineQuality = quality;
  root.dataset.urbanFineSites = String(Math.min(siteBudget, sites.length));
  root.dataset.urbanFineObjects = String(created.length);
  root.dataset.urbanFinePergolas = String(pergolaBudget);
  root.dataset.webglPhase = 'u3.22';

  window.AtelierVillageUrbanFineComposition = Object.freeze({
    sites: () => Math.min(siteBudget, sites.length),
    objects: () => created.length,
    pergolas: () => pergolaBudget,
    quality
  });

  if (status && !root.dataset.webglError) {
    status.textContent = `U3.22 · patios, terrazas y rincones urbanos · ${created.length} detalles · ${quality}`;
  }
})();
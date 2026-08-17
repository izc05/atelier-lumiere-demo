/* Atelier Lumière · U3.29A · caminos peatonales de piedra conectados */
(() => {
  if (!root || root.dataset.villagePathways === 'u3.29') return;
  if (typeof p9Path !== 'function' || typeof p9Box !== 'function' || !window.AtelierVillageZones) return;

  const quality = typeof webglQualityMode === 'string' ? webglQualityMode : 'balanced';
  const mobile = window.matchMedia('(max-width:760px)').matches;
  const zoneBudget = quality === 'high' ? 14 : quality === 'balanced' ? 9 : 4;
  const slabFactor = quality === 'high' ? 1 : quality === 'balanced' ? .66 : .36;
  const created = [];
  const routes = [];

  const pathBase = p9Mix(palette.road, palette.paperDeep, .30);
  const pathLight = p9Mix(palette.paperDeep, palette.paperLight, .24);
  const pathWarm = p9Mix(palette.paperDeep, palette.gold, .17);
  const edgeStone = p9Mix(palette.paperDeep, palette.roof, .30);
  const edgeLight = p9Mix(palette.paperDeep, palette.paperLight, .12);

  function track(object, role, routeName) {
    if (!object) return object;
    object.u329PathRole = role;
    object.u329PathRoute = routeName;
    object.materialKind = 3; // U3.5A MATERIAL.STONE
    created.push(object);
    return object;
  }

  function segment(a, b, options = {}) {
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const distance = Math.hypot(dx, dz);
    if (distance < .18) return;

    const ux = dx / distance;
    const uz = dz / distance;
    const nx = -uz;
    const nz = ux;
    const cx = (a[0] + b[0]) * .5;
    const cz = (a[1] + b[1]) * .5;
    const rotation = Math.atan2(-dz, dx);
    const width = options.width || .19;
    const routeName = options.name || 'path';
    const body = track(p9Path(cx, cz, distance * .50, width, rotation, options.color || pathBase), 'body', routeName);
    if (body) body.lodAlways = true;

    const slabCount = Math.max(2, Math.round(distance * 2.05 * slabFactor));
    for (let index = 0; index < slabCount; index += 1) {
      const t = (index + .5) / slabCount;
      const wobble = Math.sin((index + 1) * 1.73 + routeName.length) * width * .22;
      const px = a[0] + dx * t + nx * wobble;
      const pz = a[1] + dz * t + nz * wobble;
      const slab = track(
        p9Box(
          px,
          pz,
          .123 + (index % 3) * .003,
          Math.min(.24, distance / Math.max(3, slabCount) * .32),
          .010,
          width * (.46 + (index % 2) * .08),
          index % 3 === 0 ? pathWarm : index % 2 ? pathLight : edgeLight,
          rotation + (index % 2 ? .035 : -.028),
          false
        ),
        'slab',
        routeName
      );
      if (slab) slab.lodAlways = false;
    }

    if (quality !== 'lite' && options.edges !== false) {
      const edgeCount = Math.max(2, Math.round(distance * (quality === 'high' ? 1.0 : .58)));
      for (let index = 0; index < edgeCount; index += 1) {
        const t = (index + .5) / edgeCount;
        const side = index % 2 ? 1 : -1;
        const offset = width * 1.18 * side;
        const px = a[0] + dx * t + nx * offset;
        const pz = a[1] + dz * t + nz * offset;
        const edge = track(
          p9Box(px, pz, .116, .12, .012, .075, index % 3 ? edgeStone : edgeLight, rotation + (index % 2 ? .08 : -.06), false),
          'edge',
          routeName
        );
        if (edge) edge.lodAlways = false;
      }
    }
  }

  function route(name, points, options = {}) {
    routes.push({ name, points: points.map((point) => [...point]) });
    for (let index = 0; index < points.length - 1; index += 1) {
      segment(points[index], points[index + 1], { ...options, name });
    }
  }

  /* Camino principal: el puente sur conduce de forma legible hasta Atelier. */
  route('promenade-atelier', [
    [3.10,-10.25], [2.75,-8.75], [1.85,-7.10], [1.05,-5.20], [.48,-3.10], [.20,-.65], [.16,1.05], [.08,2.20]
  ], { width: mobile ? .18 : .22, color: pathWarm });

  /* Dos ramales de oficio conectan la plaza con los talleres firma. */
  route('promenade-izc', [
    [.05,2.35], [-2.55,3.20], [-5.15,4.55], [-7.65,6.35], [-9.55,8.35], [-10.70,10.45]
  ], { width: mobile ? .16 : .19, color: pathBase });

  route('promenade-stitch', [
    [.10,1.85], [2.65,.80], [5.20,-.55], [7.85,-1.85], [10.15,-3.05], [12.00,-3.85]
  ], { width: mobile ? .16 : .19, color: pathBase });

  /* Ramales de barrio: llevan visualmente desde las parcelas a una calle cercana. */
  const zones = window.AtelierVillageZones.registry
    .filter((zone) => !zone.existingPlace)
    .sort((a, b) => {
      const da = Math.hypot(a.x, a.z - 1.5);
      const db = Math.hypot(b.x, b.z - 1.5);
      return da - db || a.zoneKey.localeCompare(b.zoneKey);
    })
    .slice(0, zoneBudget);

  function branchTarget(zone) {
    if (zone.z <= -5.5) return [zone.x * .92, -4.35];
    if (zone.z >= 6.2) return [zone.x * .92, 5.25];
    if (zone.x <= -11.5) return [-10.0, zone.z * .90];
    if (zone.x >= 11.5) return [10.0, zone.z * .90];
    return [zone.x * .82, 2.25];
  }

  zones.forEach((zone, index) => {
    const target = branchTarget(zone);
    const towardX = target[0] - zone.x;
    const towardZ = target[1] - zone.z;
    const length = Math.hypot(towardX, towardZ) || 1;
    const start = [
      zone.x + towardX / length * (.72 + zone.scale * .20),
      zone.z + towardZ / length * (.72 + zone.scale * .20)
    ];
    route(`zone-${zone.zoneKey.toLowerCase()}`, [start, target], {
      width: quality === 'high' ? .13 : .11,
      color: index % 3 === 0 ? pathWarm : pathBase,
      edges: quality === 'high' && index < 8
    });
  });

  /* Pequeño anillo de plaza para que los tres caminos tengan una llegada común clara. */
  if (quality !== 'lite') {
    const ring = [
      [-1.25,1.22], [-.42,.86], [.52,.88], [1.34,1.36], [1.50,2.28], [1.12,3.10], [.20,3.48], [-.78,3.20], [-1.42,2.42], [-1.25,1.22]
    ];
    route('plaza-ring', ring, { width: .105, color: pathLight, edges: false });
  }

  root.dataset.villagePathways = 'u3.29';
  root.dataset.villagePathwaysQuality = quality;
  root.dataset.villagePathwaysRoutes = String(routes.length);
  root.dataset.villagePathwaysObjects = String(created.length);
  root.dataset.webglPhase = 'u3.29a';

  window.AtelierVillagePathways = Object.freeze({
    quality,
    routes: Object.freeze(routes.map((item) => Object.freeze({ name: item.name, points: Object.freeze(item.points) }))),
    objects: () => created.length
  });

  if (status && !root.dataset.webglError) {
    status.textContent = `U3.29 · caminos de piedra conectados · ${routes.length} recorridos · ${quality}`;
  }
})();

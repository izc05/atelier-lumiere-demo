/* Atelier Lumière · U3.32 · plaza, agua y reflejos cálidos */
(() => {
  if (!root || root.dataset.plazaWaterReflections === 'u3.32') return;
  if (!Array.isArray(objects) || !window.AtelierMaterialTextures) return;
  if (typeof p9Add !== 'function' || typeof p9Box !== 'function' || !p9Meshes?.cylinder) return;

  const MATERIAL = window.AtelierMaterialTextures.MATERIAL;
  const quality = typeof webglQualityMode === 'string' ? webglQualityMode : 'balanced';
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const center = Object.freeze({ x: .20, z: 2.45 });
  const ringBudget = quality === 'high' ? 12 : quality === 'balanced' ? 8 : 6;
  const reflectionBudget = quality === 'high' ? 5 : quality === 'balanced' ? 3 : 1;
  const created = [];
  let waterTagged = 0;

  const stone = [.20, .165, .145, 1];
  const stoneWarm = [.31, .225, .17, 1];
  const waterDeep = [.14, .265, .255, .84];
  const waterUpper = [.20, .36, .34, .80];
  const waterJet = [.58, .76, .71, .70];
  const bronze = [.48, .325, .145, 1];
  const shadow = [.035, .022, .025, .16];

  function register(object, role, kind = null, always = false) {
    if (!object) return null;
    object.u332PlazaRole = role;
    if (Number.isInteger(kind)) object.materialKind = kind;
    object.lodAlways = always;
    created.push(object);
    return object;
  }

  function box(x, z, y, sx, sy, sz, color, rotation = 0, role = 'detail', kind = MATERIAL.STONE, always = false, edges = false) {
    return register(p9Box(x, z, y, sx, sy, sz, color, rotation, edges), role, kind, always);
  }

  function cylinder(x, z, y, sx, sy, sz, color, role = 'detail', kind = MATERIAL.STONE, always = false, edges = false) {
    return register(p9Add(p9Meshes.cylinder, x, z, y, sx, sy, sz, color, 0, edges), role, kind, always);
  }

  /* U3.20 ya creó el agua. U3.32 la convierte por fin en agua real para U3.10. */
  for (const object of objects) {
    if (!object) continue;
    if (object.urbanRole === 'water') {
      object.materialKind = MATERIAL.GLASS;
      object.u332Water = true;
      object.color = [...waterDeep];
      object.edges = false;
      object.lodAlways = true;
      waterTagged += 1;
    }
    if (object.urbanRole === 'fountain-bowl') {
      object.materialKind = MATERIAL.STONE;
      object.color = [...stone];
      object.edges = quality !== 'lite';
    }
    if (['fountain', 'fountain-column'].includes(object.urbanRole)) {
      object.materialKind = MATERIAL.STONE;
    }
  }

  /* Sombra compacta: ancla la fuente sin crear una mancha negra exagerada. */
  box(center.x + .055, center.z + .045, .066, .55, .006, .43, shadow, -.08, 'fountain-contact-shadow', MATERIAL.STONE, true, false);

  /* Anillo de adoquines radiales alrededor de la fuente. */
  for (let index = 0; index < ringBudget; index += 1) {
    const angle = (index / ringBudget) * Math.PI * 2;
    const radius = .64 + (index % 2 ? .025 : -.018);
    const x = center.x + Math.cos(angle) * radius;
    const z = center.z + Math.sin(angle) * radius;
    const tone = index % 3 === 0 ? stoneWarm : stone;
    box(x, z, .096, .135, .020, .065, tone, -angle, 'fountain-paving-ring', MATERIAL.STONE, true, quality === 'high');
  }

  /* Agua del cuenco superior y surtidor: solo si U3.20 construyó ese nivel. */
  if (quality !== 'lite') {
    const upper = cylinder(center.x, center.z, .812, .138, .009, .138, waterUpper, 'upper-water', MATERIAL.GLASS, true, false);
    if (upper) upper.u332Water = true;
    waterTagged += upper ? 1 : 0;

    const jet = cylinder(center.x, center.z, 1.005, .014, .165, .014, waterJet, 'fountain-jet', MATERIAL.GLASS, false, false);
    if (jet) jet.u332WaterJet = true;
    cylinder(center.x, center.z, .836, .034, .028, .034, bronze, 'fountain-spout', MATERIAL.METAL, false, false);
  }

  /* En high, cuatro piezas discretas convierten el perímetro en una plaza cuidada. */
  if (quality === 'high') {
    [[-1.02, 1.72], [1.38, 1.72], [-1.02, 3.18], [1.38, 3.18]].forEach(([x, z], index) => {
      const rotation = index < 2 ? 0 : Math.PI;
      box(x, z, .115, .18, .028, .055, index % 2 ? stoneWarm : stone, rotation, 'plaza-seat-plinth', MATERIAL.STONE, false, true);
      box(x, z, .205, .15, .055, .045, [.28, .17, .105, 1], rotation, 'plaza-seat', MATERIAL.WOOD, false, false);
    });
  }

  const styleHref = '/entrada/webgl/plaza-water-reflections.css';
  if (!document.querySelector(`link[href="${styleHref}"]`)) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = styleHref;
    link.dataset.u332PlazaWater = '';
    document.head.append(link);
  }

  const reflectionPoints = [
    { name: 'fountain', point: [center.x, .12, center.z], primary: true },
    { name: 'lamp-west-south', point: [-1.75, .08, 1.28] },
    { name: 'lamp-east-south', point: [1.95, .08, 1.28] },
    { name: 'lamp-west-north', point: [-1.75, .08, 3.50] },
    { name: 'lamp-east-north', point: [1.95, .08, 3.50] }
  ].slice(0, reflectionBudget);

  let layer = null;
  const glows = [];
  if (typeof webglProjectPoint === 'function') {
    layer = document.createElement('div');
    layer.className = 'u332-plaza-reflections';
    layer.setAttribute('aria-hidden', 'true');
    (canvas?.parentElement || root).append(layer);

    reflectionPoints.forEach((entry, index) => {
      const node = document.createElement('i');
      node.className = 'u332-plaza-reflection';
      node.dataset.reflection = entry.name;
      if (entry.primary) node.dataset.primary = 'true';
      node.style.setProperty('--u332-angle', `${(-10 + index * 11).toFixed(1)}deg`);
      layer.append(node);
      glows.push({ ...entry, node });
    });
  }

  let raf = 0;
  let frame = 0;
  let active = !document.hidden;

  function performanceMode() {
    return String(root.dataset.performanceMode || 'stable');
  }

  function updateReflections() {
    raf = 0;
    if (!active || !layer) return;
    frame += 1;
    const divisor = quality === 'high' ? 1 : quality === 'balanced' ? 2 : 3;
    if (frame % divisor !== 0) {
      raf = requestAnimationFrame(updateReflections);
      return;
    }

    const rect = root.getBoundingClientRect();
    const mode = performanceMode();
    const protect = mode === 'reduce' || mode === 'protect';

    for (const glow of glows) {
      if (protect && !glow.primary) {
        glow.node.style.opacity = '0';
        continue;
      }
      const screen = webglProjectPoint(glow.point);
      if (!screen?.visible) {
        glow.node.style.opacity = '0';
        continue;
      }
      glow.node.style.setProperty('--u332-x', `${(screen.x - rect.left).toFixed(1)}px`);
      glow.node.style.setProperty('--u332-y', `${(screen.y - rect.top).toFixed(1)}px`);
      glow.node.style.opacity = '';
    }
    raf = requestAnimationFrame(updateReflections);
  }

  document.addEventListener('visibilitychange', () => {
    active = !document.hidden;
    if (!active && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    } else if (active && layer && !raf) {
      raf = requestAnimationFrame(updateReflections);
    }
  });

  if (layer) raf = requestAnimationFrame(updateReflections);

  root.dataset.plazaWaterReflections = 'u3.32';
  root.dataset.plazaWaterQuality = quality;
  root.dataset.plazaWaterTagged = String(waterTagged);
  root.dataset.plazaRingPieces = String(ringBudget);
  root.dataset.plazaReflectionBudget = String(reflectionBudget);
  root.dataset.webglPhase = 'u3.32';

  window.AtelierVillagePlazaWater = Object.freeze({
    quality,
    waterTagged: () => waterTagged,
    ringPieces: ringBudget,
    reflections: reflectionBudget,
    created: () => created.length
  });

  if (status && !root.dataset.webglError) {
    status.textContent = `U3.32 · plaza y agua reflectante · ${waterTagged} superficies de agua · ${quality}`;
  }
})();

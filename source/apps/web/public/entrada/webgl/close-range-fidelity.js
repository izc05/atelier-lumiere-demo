/* Atelier Lumière · U3.31 · fidelidad de primer plano, sombras y luz local */
(() => {
  if (!root || root.dataset.closeRangeFidelity === 'u3.31') return;
  if (!Array.isArray(objects) || !window.AtelierMaterialTextures) return;

  const quality = typeof webglQualityMode === 'string' ? webglQualityMode : 'balanced';
  const reduced = reducedMotion?.matches === true;
  const MATERIAL = window.AtelierMaterialTextures.MATERIAL;
  const materialBudget = quality === 'high' ? 84 : quality === 'balanced' ? 52 : 28;
  const thresholdShadowBudget = quality === 'high' ? 14 : quality === 'balanced' ? 8 : 4;
  const glowBudget = quality === 'high' ? 12 : quality === 'balanced' ? 7 : 3;
  let retuned = 0;
  let strengthenedShadows = 0;
  let thresholdShadows = 0;

  const clamp01 = (value) => Math.min(1, Math.max(0, value));

  function tune(object) {
    if (!object?.u329MaterialExplicit || object.u331Retoned || !Array.isArray(object.color)) return false;
    const c = object.color;
    const a = c[3] ?? 1;
    let next = null;

    if (object.materialKind === MATERIAL.ROOF) {
      next = [c[0] * .82 + .018, c[1] * .76 + .009, c[2] * .72 + .007, a];
      if (quality !== 'lite') object.edges = true;
    } else if (object.materialKind === MATERIAL.STONE) {
      next = [c[0] * .91 + .016, c[1] * .89 + .014, c[2] * .86 + .011, a];
    } else if (object.materialKind === MATERIAL.WOOD) {
      next = [c[0] * .84 + .016, c[1] * .79 + .009, c[2] * .74 + .006, a];
    } else if (object.materialKind === MATERIAL.GLASS) {
      next = [clamp01(c[0] * 1.06 + .028), clamp01(c[1] * 1.04 + .018), clamp01(c[2] * .96 + .006), Math.max(a, .70)];
    } else if (object.materialKind === MATERIAL.METAL) {
      next = [clamp01(c[0] * 1.08 + .018), clamp01(c[1] * 1.04 + .010), c[2] * .90 + .005, a];
    } else if (object.materialKind === MATERIAL.STUCCO) {
      next = [c[0] * .94 + .016, c[1] * .92 + .014, c[2] * .88 + .011, a];
    }

    if (!next) return false;
    object.color = next;
    object.u331Retoned = true;
    retuned += 1;
    return true;
  }

  for (const object of objects) {
    if (retuned >= materialBudget) break;
    tune(object);
  }

  /* Las sombras U3.5E ya existen. U3.31 solo les da más peso cerca del suelo. */
  const shadowLimit = quality === 'high' ? 34 : quality === 'balanced' ? 24 : 12;
  for (const object of objects) {
    if (strengthenedShadows >= shadowLimit) break;
    if (!object?.u35ContactShadow || !Array.isArray(object.color)) continue;
    const alpha = object.color[3] ?? 0;
    object.color = [...object.color.slice(0, 3), Math.min(quality === 'high' ? .078 : .064, alpha * (quality === 'high' ? 1.55 : 1.35) + .006)];
    object.u331ShadowStrengthened = true;
    strengthenedShadows += 1;
  }

  /* Pequeña sombra adicional justo bajo los accesos comerciales. */
  if (typeof p9AddContactShadow === 'function') {
    const thresholds = objects.filter((object) => object?.workshopFrontageRole === 'shop-threshold');
    thresholds.slice(0, thresholdShadowBudget).forEach((threshold, index) => {
      const x = threshold.position?.[0];
      const z = threshold.position?.[2];
      if (!Number.isFinite(x) || !Number.isFinite(z)) return;
      const sx = Math.max(.26, (threshold.scale?.[0] || .42) * .72);
      const sz = Math.max(.14, (threshold.scale?.[2] || .28) * .74);
      const before = objects.length;
      p9AddContactShadow(x + .04, z + .045, sx, sz, threshold.rotation || 0, quality === 'high' ? .034 : .027);
      const shadow = objects[objects.length - 1];
      if (shadow && objects.length > before) {
        shadow.u331ThresholdShadow = true;
        shadow.edges = false;
        shadow.lodAlways = index < 3;
        thresholdShadows += 1;
      }
    });
  }

  if (!document.querySelector('link[data-u331-fidelity]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/entrada/webgl/close-range-fidelity.css';
    link.dataset.u331Fidelity = '';
    document.head.append(link);
  }

  const layer = document.createElement('div');
  layer.className = 'u331-local-lighting';
  layer.setAttribute('aria-hidden', 'true');
  (canvas?.parentElement || root).append(layer);

  const pools = new Map();
  const landmarkPoints = [
    ['atelier', webglInteractionPlaces?.atelier?.point],
    ['izc', webglInteractionPlaces?.izc?.point],
    ['stitch', webglInteractionPlaces?.stitch?.point]
  ].filter(([, point]) => Array.isArray(point));

  function ensurePool(name, point, kind = 'threshold') {
    if (!Array.isArray(point) || pools.size >= glowBudget) return null;
    let node = pools.get(name);
    if (!node) {
      node = document.createElement('i');
      node.className = 'u331-light-pool';
      node.dataset.kind = kind;
      node.dataset.place = name;
      layer.append(node);
      pools.set(name, node);
    }
    node._u331Point = point;
    return node;
  }

  landmarkPoints.forEach(([name, point]) => ensurePool(name, point, 'landmark'));

  if (quality !== 'lite') {
    const thresholdPoints = objects
      .filter((object) => object?.workshopFrontageRole === 'shop-threshold' && Array.isArray(object.position))
      .slice(0, Math.max(0, glowBudget - pools.size));
    thresholdPoints.forEach((object, index) => ensurePool(`threshold-${index}`, [...object.position], 'threshold'));
  }

  function syncSelectedDynamic() {
    if (quality === 'lite' || typeof webglSelectedPlace !== 'string' || webglSelectedPlace === 'overview') return;
    if (webglInteractionPlaces?.[webglSelectedPlace]) return;
    const point = webglDynamicProviderPlaces?.[webglSelectedPlace]?.point;
    if (!Array.isArray(point)) return;
    const old = pools.get('selected-dynamic');
    if (old) old._u331Point = point;
    else if (pools.size < glowBudget) ensurePool('selected-dynamic', point, 'selected');
  }

  let raf = 0;
  let frame = 0;
  let active = !document.hidden;

  function update() {
    raf = 0;
    if (!active || typeof webglProjectPoint !== 'function') return;
    frame += 1;
    if (quality !== 'high' && frame % 2 === 1) {
      raf = requestAnimationFrame(update);
      return;
    }

    syncSelectedDynamic();
    const rect = root.getBoundingClientRect();
    const performanceMode = root.dataset.performanceMode || 'stable';
    const protect = performanceMode === 'protect' || performanceMode === 'reduce';

    for (const [name, node] of pools) {
      if (protect && node.dataset.kind === 'threshold') {
        node.style.opacity = '0';
        continue;
      }
      const screen = webglProjectPoint(node._u331Point);
      if (!screen?.visible) {
        node.style.opacity = '0';
        continue;
      }
      node.style.setProperty('--u331-x', `${(screen.x - rect.left).toFixed(1)}px`);
      node.style.setProperty('--u331-y', `${(screen.y - rect.top).toFixed(1)}px`);
      node.style.opacity = '';
      node.classList.toggle('is-selected', name === webglSelectedPlace || node.dataset.kind === 'selected');
    }

    raf = requestAnimationFrame(update);
  }

  document.addEventListener('visibilitychange', () => {
    active = !document.hidden;
    if (!active && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    } else if (active && !raf) {
      raf = requestAnimationFrame(update);
    }
  });

  if (!reduced) raf = requestAnimationFrame(update);
  else {
    for (const node of pools.values()) node.classList.add('is-static');
    raf = requestAnimationFrame(update);
  }

  root.dataset.closeRangeFidelity = 'u3.31';
  root.dataset.closeRangeMaterialCount = String(retuned);
  root.dataset.closeRangeShadowCount = String(strengthenedShadows + thresholdShadows);
  root.dataset.closeRangeGlowCount = String(pools.size);
  root.dataset.closeRangeQuality = quality;
  root.dataset.webglPhase = 'u3.31';

  window.AtelierVillageCloseRangeFidelity = Object.freeze({
    quality,
    materials: () => retuned,
    shadows: () => strengthenedShadows + thresholdShadows,
    glows: () => pools.size
  });

  if (status && !root.dataset.webglError) {
    status.textContent = `U3.31 · fidelidad cercana · ${retuned} materiales · ${strengthenedShadows + thresholdShadows} sombras · ${pools.size} luces`;
  }
})();

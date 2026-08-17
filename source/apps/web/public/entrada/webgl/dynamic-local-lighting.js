/* Atelier Lumière · U3.38 · iluminación local dinámica y profundidad selectiva */
(() => {
  if (!root || root.dataset.dynamicLocalLighting === 'u3.38') return;
  if (!Array.isArray(objects) || !window.AtelierMaterialTextures) return;
  if (typeof p9Add !== 'function' || !p9Meshes?.cylinder || typeof webglProjectPoint !== 'function') return;

  const quality = typeof webglQualityMode === 'string' ? webglQualityMode : 'balanced';
  const MATERIAL = window.AtelierMaterialTextures.MATERIAL;
  const reduced = reducedMotion?.matches === true;
  const emitterBudget = quality === 'high' ? 28 : quality === 'balanced' ? 16 : 7;
  const spillBudget = quality === 'high' ? 18 : quality === 'balanced' ? 10 : 4;
  const structureBudget = quality === 'high' ? 110 : quality === 'balanced' ? 70 : 34;
  const pulseAmount = quality === 'high' ? .030 : quality === 'balanced' ? .018 : 0;

  const emitters = [];
  const spills = [];
  const structures = [];
  let selectedName = typeof webglSelectedPlace === 'string' ? webglSelectedPlace : 'overview';
  let raf = 0;
  let lastFrame = 0;
  let active = !document.hidden;

  if (!document.querySelector('link[data-u338-dynamic-lighting]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/entrada/webgl/dynamic-local-lighting.css';
    link.dataset.u338DynamicLighting = '';
    document.head.append(link);
  }

  const overlay = document.createElement('div');
  overlay.className = 'u338-dynamic-lighting';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.innerHTML = '<i class="u338-selected-bloom"></i>';
  (canvas?.parentElement || root).append(overlay);
  const bloom = overlay.querySelector('.u338-selected-bloom');

  const clamp01 = (value) => Math.min(1, Math.max(0, value));
  const copyColor = (color) => Array.isArray(color) ? [...color] : null;
  const distance2 = (a, b) => {
    const dx = (a?.[0] || 0) - (b?.[0] || 0);
    const dz = (a?.[2] || 0) - (b?.[2] || 0);
    return dx * dx + dz * dz;
  };

  function performanceProtected() {
    const mode = root.dataset.performanceMode || 'stable';
    return mode === 'protect' || mode === 'reduce';
  }

  function targetFor(name) {
    if (!name || name === 'overview') return null;
    const direct = webglInteractionPlaces?.[name]?.point;
    if (Array.isArray(direct)) return direct;
    const dynamic = webglDynamicProviderPlaces?.[name]?.point;
    if (Array.isArray(dynamic)) return dynamic;
    const target = places?.[name]?.target;
    if (Array.isArray(target)) return [target[0], (target[1] || 0) + 1.0, target[2]];
    return null;
  }

  function isEmitter(object) {
    if (!object?.position || !Array.isArray(object.color)) return false;
    if (object.u332Water || object.urbanRole === 'water') return false;
    if (['window-recess', 'door-lamp'].includes(object.u337Role)) return true;
    if (['window', 'lamp-glow'].includes(object.urbanRole)) return true;
    if (object.materialKind === MATERIAL.GLASS) {
      const y = object.position[1] || 0;
      const sx = object.scale?.[0] || 1;
      const sy = object.scale?.[1] || 1;
      return y > .24 && y < 2.65 && sx < .55 && sy < .70;
    }
    return false;
  }

  function emitterPriority(object) {
    let score = Math.hypot(object.position?.[0] || 0, object.position?.[2] || 0);
    if (object.u337Role === 'door-lamp') score -= 8;
    else if (object.u337Role === 'window-recess') score -= 5;
    else if (object.urbanRole === 'window') score -= 2;
    return score;
  }

  objects
    .filter(isEmitter)
    .sort((a, b) => emitterPriority(a) - emitterPriority(b))
    .slice(0, emitterBudget)
    .forEach((object, index) => {
      object.u338BaseColor = copyColor(object.color);
      emitters.push({ object, point: [...object.position], index });
    });

  const structuralRoles = new Set([
    'house', 'roof', 'annex', 'annex-roof', 'door', 'chimney', 'chimney-cap',
    'roof-ridge', 'roof-eave', 'infill', 'house-detail'
  ]);

  objects
    .filter((object) => {
      if (!object?.position || !Array.isArray(object.color)) return false;
      if (structuralRoles.has(object.urbanRole)) return true;
      if (object.u337HeroDetail && object.materialKind !== MATERIAL.GLASS && object.materialKind !== MATERIAL.METAL) return true;
      if (object.u334ArchitecturalDetail && object.materialKind !== MATERIAL.GLASS) return true;
      return false;
    })
    .sort((a, b) => Math.hypot(a.position[0], a.position[2]) - Math.hypot(b.position[0], b.position[2]))
    .slice(0, structureBudget)
    .forEach((object) => {
      object.u338BaseColor = copyColor(object.color);
      structures.push(object);
    });

  const warmSpill = [1.0, .49, .18, quality === 'high' ? .052 : quality === 'balanced' ? .042 : .030];

  function groundHeight(x, z) {
    return typeof atelierTerrainHeight === 'function' ? atelierTerrainHeight(x, z) : 0;
  }

  function createSpill(emitter, index) {
    if (spills.length >= spillBudget) return;
    const object = emitter.object;
    const rotation = object.rotation || 0;
    const forward = object.u337Role === 'door-lamp' ? .34 : .26;
    const x = object.position[0] + Math.sin(rotation) * forward;
    const z = object.position[2] + Math.cos(rotation) * forward;
    const ground = groundHeight(x, z);
    const width = object.u337Role === 'door-lamp' ? .44 : .31;
    const depth = object.u337Role === 'door-lamp' ? .28 : .20;
    const spill = p9Add(
      p9Meshes.cylinder,
      x,
      z,
      ground + .016,
      width,
      .008,
      depth,
      [...warmSpill],
      0,
      false
    );
    if (!spill) return;
    spill.u338LightSpill = true;
    spill.u338EmitterIndex = index;
    spill.materialKind = MATERIAL.EARTH;
    spill.u329MaterialExplicit = true;
    spill.edges = false;
    spill.lodAlways = index < 4;
    spill.u338BaseAlpha = warmSpill[3];
    spills.push(spill);
  }

  emitters.slice(0, spillBudget).forEach(createSpill);

  const selectedPool = p9Add(
    p9Meshes.cylinder,
    0,
    0,
    -10,
    1.35,
    .009,
    .86,
    [1.0, .45, .15, 0],
    0,
    false
  );
  if (selectedPool) {
    selectedPool.u338SelectedPool = true;
    selectedPool.materialKind = MATERIAL.EARTH;
    selectedPool.u329MaterialExplicit = true;
    selectedPool.edges = false;
    selectedPool.lodAlways = true;
  }

  function restoreColor(object) {
    if (Array.isArray(object?.u338BaseColor)) object.color = [...object.u338BaseColor];
  }

  function focusedColor(base, factor, warmth = 0) {
    if (!Array.isArray(base)) return base;
    return [
      clamp01(base[0] * factor + warmth),
      clamp01(base[1] * factor + warmth * .50),
      clamp01(base[2] * factor + warmth * .20),
      base[3] ?? 1
    ];
  }

  function applyFocus(name) {
    selectedName = name || 'overview';
    const target = targetFor(selectedName);
    const overview = !target;

    for (const object of structures) {
      const base = object.u338BaseColor;
      if (!Array.isArray(base)) continue;
      if (overview) {
        restoreColor(object);
        continue;
      }
      const d = Math.sqrt(distance2(object.position, target));
      if (d <= 4.2) object.color = focusedColor(base, 1.045, .010);
      else if (d <= 8.5) object.color = focusedColor(base, .955, .003);
      else object.color = focusedColor(base, quality === 'lite' ? .90 : .84, 0);
    }

    for (const emitter of emitters) {
      const base = emitter.object.u338BaseColor;
      if (!Array.isArray(base)) continue;
      if (overview) {
        emitter.object.color = [...base];
        continue;
      }
      const d = Math.sqrt(distance2(emitter.point, target));
      const near = d <= 5.2;
      const alpha = base[3] ?? 1;
      emitter.object.color = near
        ? [clamp01(base[0] * 1.10 + .035), clamp01(base[1] * 1.06 + .018), clamp01(base[2] * .96 + .006), Math.max(alpha, .82)]
        : [base[0] * .90, base[1] * .86, base[2] * .82, alpha * .68];
    }

    for (const spill of spills) {
      const emitter = emitters[spill.u338EmitterIndex];
      if (!emitter) continue;
      if (overview) {
        spill.color[3] = spill.u338BaseAlpha;
        continue;
      }
      const d = Math.sqrt(distance2(emitter.point, target));
      spill.color[3] = spill.u338BaseAlpha * (d <= 5.2 ? 1.55 : d <= 9 ? .74 : .30);
    }

    if (selectedPool) {
      if (overview) {
        selectedPool.color[3] = 0;
      } else {
        const x = target[0];
        const z = target[2];
        selectedPool.position[0] = x;
        selectedPool.position[1] = groundHeight(x, z) + .018;
        selectedPool.position[2] = z;
        selectedPool.scale[0] = selectedName === 'atelier' ? 1.58 : 1.28;
        selectedPool.scale[2] = selectedName === 'atelier' ? 1.04 : .82;
        selectedPool.color[3] = quality === 'lite' ? .030 : .050;
      }
    }

    root.dataset.dynamicLocalLightingFocus = selectedName;
  }

  function updateBloom(now) {
    const selected = typeof webglSelectedPlace === 'string' ? webglSelectedPlace : 'overview';
    if (selected !== selectedName) applyFocus(selected);
    const point = targetFor(selected);
    const protectedMode = performanceProtected();

    if (!point || protectedMode || quality === 'lite') {
      bloom.classList.remove('is-visible');
      return;
    }

    const screen = webglProjectPoint(point);
    if (!screen?.visible) {
      bloom.classList.remove('is-visible');
      return;
    }

    const rect = root.getBoundingClientRect();
    bloom.style.setProperty('--u338-x', `${(screen.x - rect.left).toFixed(1)}px`);
    bloom.style.setProperty('--u338-y', `${(screen.y - rect.top).toFixed(1)}px`);
    const pulse = reduced ? 0 : Math.sin(now * .0025) * pulseAmount;
    bloom.style.setProperty('--u338-pulse', String(pulse));
    bloom.classList.add('is-visible');

    if (selectedPool && selectedPool.color[3] > 0) {
      const base = quality === 'high' ? .050 : .042;
      selectedPool.color[3] = base + pulse * .28;
    }
  }

  function frame(now) {
    raf = 0;
    if (!active) return;
    const cadence = quality === 'high' ? 0 : quality === 'balanced' ? 24 : 48;
    if (now - lastFrame >= cadence) {
      lastFrame = now;
      updateBloom(now);
    }
    raf = requestAnimationFrame(frame);
  }

  document.addEventListener('visibilitychange', () => {
    active = !document.hidden;
    if (!active && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    } else if (active && !raf) {
      raf = requestAnimationFrame(frame);
    }
  });

  root.addEventListener('atelier:village-focus', (event) => applyFocus(event.detail?.place || 'overview'));
  root.addEventListener('atelier:village-back', () => applyFocus(typeof webglSelectedPlace === 'string' ? webglSelectedPlace : 'overview'));

  applyFocus(selectedName);
  raf = requestAnimationFrame(frame);

  root.dataset.dynamicLocalLighting = 'u3.38';
  root.dataset.dynamicLocalLightingQuality = quality;
  root.dataset.dynamicLocalLightingEmitters = String(emitters.length);
  root.dataset.dynamicLocalLightingSpills = String(spills.length);
  root.dataset.dynamicLocalLightingStructures = String(structures.length);
  root.dataset.webglPhase = 'u3.38';

  window.AtelierVillageDynamicLocalLighting = Object.freeze({
    quality,
    emitters: () => emitters.length,
    spills: () => spills.length,
    structures: () => structures.length,
    focus: applyFocus
  });

  if (status && !root.dataset.webglError) {
    status.textContent = `U3.38 · luz local dinámica · ${emitters.length} emisores · ${spills.length} derrames · ${quality}`;
  }
})();

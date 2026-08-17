/* Atelier Lumière · U3.39 · limpieza por toma y oclusión de primer plano */
(() => {
  if (!root || root.dataset.takeDirectedCleanup === 'u3.39') return;
  if (!Array.isArray(objects) || typeof cameraPosition !== 'function') return;

  const quality = typeof webglQualityMode === 'string' ? webglQualityMode : 'balanced';
  const reduced = reducedMotion?.matches === true;
  const MATERIAL = window.AtelierMaterialTextures?.MATERIAL || {};
  const cleanupBudget = quality === 'high' ? 24 : quality === 'balanced' ? 16 : 9;
  const occlusionBudget = quality === 'high' ? 150 : quality === 'balanced' ? 96 : 48;
  const occluders = [];
  let removed = 0;
  let faded = 0;
  let raf = 0;
  let lastFrame = 0;
  let active = !document.hidden;

  function hash(value) {
    let h = 2166136261;
    for (const char of String(value)) {
      h ^= char.charCodeAt(0);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0) / 4294967295;
  }

  function removeObjectAt(index) {
    objects.splice(index, 1);
    removed += 1;
  }

  /*
   * U3.22 aportó vida urbana, pero algunas piezas se leen como restos de montaje
   * desde las cámaras reales. U3.39 conserva la intención y reduce solo repetición.
   */
  for (let index = objects.length - 1; index >= 0 && removed < cleanupBudget; index -= 1) {
    const object = objects[index];
    const role = object?.urbanFineRole;
    if (!role || !object?.position) continue;
    const x = object.position[0] || 0;
    const z = object.position[2] || 0;
    const central = Math.hypot(x * .86, z * .78) < 9.6;
    const seed = hash(`${role}:${x.toFixed(2)}:${z.toFixed(2)}`);

    if (role === 'pergola-slat' && central && seed > .38) {
      removeObjectAt(index);
      continue;
    }
    if (role === 'patio-wall' && central && seed > .58) {
      removeObjectAt(index);
      continue;
    }
    if (role === 'bench-back' && central && seed > .32) {
      removeObjectAt(index);
      continue;
    }
    if (role === 'transition-wall' && Math.hypot(x, z) < 5.3 && seed > .62) {
      removeObjectAt(index);
    }
  }

  const structuralUrbanRoles = new Set([
    'house','roof','annex','annex-roof','door','chimney','chimney-cap','balcony','baluster',
    'roof-ridge','roof-eave','infill'
  ]);
  const structuralFineRoles = new Set([
    'pergola-post','pergola-beam','ornamental-trunk','ornamental-cypress','ornamental-tree'
  ]);
  const structuralStitchRoles = new Set([
    'stitch-house','stitch-upper','stitch-roof','stitch-upper-roof','porch-post','porch-beam','porch-roof'
  ]);

  function opaqueCandidate(object) {
    if (!object?.position || !object?.scale || !Array.isArray(object.color)) return false;
    const alpha = object.color[3] ?? 1;
    if (alpha < .44) return false;
    if (object.u35ContactShadow || object.u338LightSpill || object.u338SelectedPool || object.u332Water) return false;
    if (object.materialKind === MATERIAL.GLASS || object.materialKind === MATERIAL.METAL) return false;
    if (structuralUrbanRoles.has(object.urbanRole)) return true;
    if (structuralFineRoles.has(object.urbanFineRole)) return true;
    if (structuralStitchRoles.has(object.u335Role)) return true;
    if (object.u334ArchitecturalDetail || object.u337HeroDetail) return true;

    const y = object.position[1] || 0;
    const sx = object.scale[0] || 0;
    const sy = object.scale[1] || 0;
    const sz = object.scale[2] || 0;
    if (y < .24 || sx > 2.7 || sz > 2.7) return false;
    if (object.mesh === meshes?.roof && sy > .06) return true;
    if (object.mesh === meshes?.cone && sx < 1.65 && sz < 1.65) return true;
    if (object.mesh === meshes?.box && sy > .16 && sx < 2.3 && sz < 2.3) return true;
    return false;
  }

  objects.filter(opaqueCandidate).slice(0, occlusionBudget).forEach((object) => {
    object.u339BaseAlpha = object.color[3] ?? 1;
    object.u339BaseEdges = Boolean(object.edges);
    object.u339CurrentAlpha = object.u339BaseAlpha;
    occluders.push(object);
  });

  function targetFor(name) {
    if (!name || name === 'overview') return null;
    const direct = webglInteractionPlaces?.[name]?.point;
    if (Array.isArray(direct)) return direct;
    const dynamic = webglDynamicProviderPlaces?.[name]?.point;
    if (Array.isArray(dynamic)) return dynamic;
    const target = places?.[name]?.target;
    if (Array.isArray(target)) return [target[0], (target[1] || 0) + .95, target[2]];
    return null;
  }

  function distance3(a, b) {
    return Math.hypot(
      (a?.[0] || 0) - (b?.[0] || 0),
      (a?.[1] || 0) - (b?.[1] || 0),
      (a?.[2] || 0) - (b?.[2] || 0)
    );
  }

  function occlusionFor(object, eye, target) {
    const p = object.position;
    const vx = target[0] - eye[0];
    const vy = target[1] - eye[1];
    const vz = target[2] - eye[2];
    const len2 = vx*vx + vy*vy + vz*vz;
    if (len2 < .001) return false;

    const wx = p[0] - eye[0];
    const wy = p[1] - eye[1];
    const wz = p[2] - eye[2];
    const t = (wx*vx + wy*vy + wz*vz) / len2;
    if (t < .10 || t > .82) return false;

    const radius = Math.max(.34,
      Math.hypot(object.scale?.[0] || .2, object.scale?.[2] || .2) * .62
      + (object.scale?.[1] || .2) * .16
    );
    if (distance3(p, target) < 2.5 + radius*.45) return false;

    const closest = [eye[0] + vx*t, eye[1] + vy*t, eye[2] + vz*t];
    const corridor = .46 + radius * .72;
    return distance3(p, closest) < corridor;
  }

  function desiredAlpha(object, shouldFade) {
    const base = object.u339BaseAlpha ?? 1;
    if (!shouldFade) return base;
    if (object.mesh === meshes?.cone || object.urbanFineRole?.startsWith('ornamental-')) return base * .12;
    if (object.mesh === meshes?.roof || object.urbanRole?.includes('roof') || object.u335Role?.includes('roof')) return base * .16;
    return base * .24;
  }

  function restoreAll(immediate = false) {
    faded = 0;
    for (const object of occluders) {
      const base = object.u339BaseAlpha ?? 1;
      const current = object.color[3] ?? base;
      const next = immediate || reduced ? base : current + (base-current)*.28;
      object.color[3] = Math.abs(next-base) < .008 ? base : next;
      object.u339CurrentAlpha = object.color[3];
      object.edges = object.color[3] > base*.72 ? object.u339BaseEdges : false;
    }
  }

  function updateOcclusion() {
    const selected = typeof webglSelectedPlace === 'string' ? webglSelectedPlace : 'overview';
    const target = targetFor(selected);
    if (!target) {
      restoreAll(false);
      root.dataset.takeDirectedOccluders = '0';
      return;
    }

    const eye = cameraPosition();
    const protect = root.dataset.performanceMode === 'protect';
    let count = 0;
    for (const object of occluders) {
      const shouldFade = occlusionFor(object, eye, target);
      if (shouldFade) count += 1;
      const targetAlpha = desiredAlpha(object, shouldFade);
      const current = object.color[3] ?? object.u339BaseAlpha ?? 1;
      const speed = reduced || protect ? 1 : shouldFade ? .34 : .24;
      const next = current + (targetAlpha-current)*speed;
      object.color[3] = Math.abs(next-targetAlpha) < .007 ? targetAlpha : next;
      object.u339CurrentAlpha = object.color[3];
      object.edges = object.color[3] > (object.u339BaseAlpha ?? 1)*.72 ? object.u339BaseEdges : false;
    }
    faded = count;
    root.dataset.takeDirectedOccluders = String(count);
  }

  function frame(now) {
    raf = 0;
    if (!active) return;
    const mode = root.dataset.performanceMode || 'stable';
    const cadence = mode === 'protect' ? 120 : mode === 'reduce' ? 80 : quality === 'high' ? 32 : quality === 'balanced' ? 48 : 84;
    if (now - lastFrame >= cadence) {
      lastFrame = now;
      updateOcclusion();
    }
    raf = requestAnimationFrame(frame);
  }

  root.addEventListener('atelier:village-focus', () => updateOcclusion());
  root.addEventListener('atelier:village-back', () => restoreAll(reduced));
  document.addEventListener('visibilitychange', () => {
    active = !document.hidden;
    if (!active && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    } else if (active && !raf) {
      raf = requestAnimationFrame(frame);
    }
  });

  raf = requestAnimationFrame(frame);

  root.dataset.takeDirectedCleanup = 'u3.39';
  root.dataset.takeDirectedCleanupQuality = quality;
  root.dataset.takeDirectedCleanupRemoved = String(removed);
  root.dataset.takeDirectedCleanupCandidates = String(occluders.length);
  root.dataset.takeDirectedOccluders = '0';
  root.dataset.webglPhase = 'u3.39';

  window.AtelierVillageTakeDirectedCleanup = Object.freeze({
    quality,
    removed: () => removed,
    candidates: () => occluders.length,
    faded: () => faded,
    refresh: updateOcclusion,
    restore: () => restoreAll(true)
  });

  if (status && !root.dataset.webglError) {
    status.textContent = `U3.39 · limpieza por toma · ${removed} piezas retiradas · ${occluders.length} oclusores controlados`;
  }
})();

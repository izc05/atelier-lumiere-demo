/* Atelier Lumière · U3.29B · clasificación material explícita y contraste de primer plano */
(() => {
  if (!root || root.dataset.materialDepth === 'u3.29') return;
  if (!Array.isArray(objects)) return;

  const quality = typeof webglQualityMode === 'string' ? webglQualityMode : 'balanced';
  const MATERIAL = Object.freeze({ STUCCO:1, ROOF:2, STONE:3, WOOD:4, GLASS:5, METAL:6, EARTH:7, VEGETATION:8 });
  let tagged = 0;
  let retuned = 0;

  function setMaterial(object, material) {
    if (!object || !Number.isInteger(material)) return;
    object.materialKind = material;
    object.u329MaterialExplicit = true;
    tagged += 1;
  }

  function retone(object, mode) {
    if (!object || !Array.isArray(object.color) || object.u329MaterialRetoned) return;
    const c = object.color;
    const a = c[3] ?? 1;
    let next = c;
    if (mode === 'roof') next = [c[0]*.88+.018, c[1]*.82+.010, c[2]*.79+.008, a];
    if (mode === 'stone') next = [c[0]*.92+.018, c[1]*.91+.016, c[2]*.88+.012, a];
    if (mode === 'stucco') next = [c[0]*.95+.018, c[1]*.94+.016, c[2]*.91+.012, a];
    if (mode === 'wood') next = [c[0]*.88+.018, c[1]*.84+.010, c[2]*.80+.007, a];
    if (mode === 'glass') next = [Math.min(1,c[0]*1.04+.025), Math.min(1,c[1]*1.03+.018), Math.min(1,c[2]*.98+.008), a];
    if (mode === 'metal') next = [Math.min(1,c[0]*1.06+.020), Math.min(1,c[1]*1.03+.012), c[2]*.92+.006, a];
    if (next !== c) {
      object.color = next;
      object.u329MaterialRetoned = true;
      retuned += 1;
    }
  }

  function classifyUrban(object, role) {
    if (['house','annex'].includes(role)) { setMaterial(object,MATERIAL.STUCCO); retone(object,'stucco'); return; }
    if (['roof','annex-roof'].includes(role)) { setMaterial(object,MATERIAL.ROOF); retone(object,'roof'); return; }
    if (['street','plaza','step','chimney','chimney-cap','fountain','fountain-column'].includes(role)) { setMaterial(object,MATERIAL.STONE); retone(object,'stone'); return; }
    if (['balcony','baluster','lamp-post','door'].includes(role)) { setMaterial(object,MATERIAL.WOOD); retone(object,'wood'); return; }
    if (['window','lamp-glow'].includes(role)) { setMaterial(object,MATERIAL.GLASS); retone(object,'glass'); }
  }

  function classifyFrontage(object, role) {
    if (role === 'shop-window' || role === 'wall-sconce-glow') { setMaterial(object,MATERIAL.GLASS); retone(object,'glass'); return; }
    if (['door-frame','door-handle','sign-trim','physical-brand-pixel','window-header','window-sill','wall-sconce'].includes(role)) {
      setMaterial(object,MATERIAL.METAL); retone(object,'metal'); return;
    }
    if (['shop-door','awning','physical-sign'].includes(role)) { setMaterial(object,MATERIAL.WOOD); retone(object,'wood'); return; }
    if (['shop-threshold','craft-plinth','craft-planter'].includes(role)) { setMaterial(object,MATERIAL.STONE); retone(object,'stone'); }
  }

  objects.forEach((object) => {
    if (!object) return;
    if (object.u329PathRole) { setMaterial(object,MATERIAL.STONE); if (object.u329PathRole !== 'body') retone(object,'stone'); }
    if (object.urbanRole) classifyUrban(object, object.urbanRole);
    if (object.workshopFrontageRole) classifyFrontage(object, object.workshopFrontageRole);
  });

  /* En high/balanced preservamos la lectura de aristas de los tejados próximos. */
  if (quality !== 'lite') {
    let roofEdges = 0;
    const budget = quality === 'high' ? 16 : 9;
    for (const object of objects) {
      if (roofEdges >= budget) break;
      if (object?.urbanRole !== 'roof') continue;
      object.edges = true;
      object.u329RoofEdge = true;
      roofEdges += 1;
    }
    root.dataset.materialDepthRoofEdges = String(roofEdges);
  }

  root.dataset.materialDepth = 'u3.29';
  root.dataset.materialDepthTagged = String(tagged);
  root.dataset.materialDepthRetoned = String(retuned);
  root.dataset.materialDepthQuality = quality;
  root.dataset.webglPhase = 'u3.29b';

  window.AtelierVillageMaterialDepth = Object.freeze({
    quality,
    tagged: () => tagged,
    retuned: () => retuned,
    materials: MATERIAL
  });

  if (status && !root.dataset.webglError) {
    status.textContent = `U3.29 · materiales definidos · ${tagged} superficies clasificadas · ${quality}`;
  }
})();

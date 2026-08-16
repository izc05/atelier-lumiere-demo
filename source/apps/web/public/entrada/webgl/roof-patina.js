/* Atelier Lumière · U3.8 · tejados artesanales y envejecido controlado */
(() => {
  if (!root || !window.AtelierVillageZones || !window.AtelierMaterialTextures) return;
  if (typeof p9Box !== 'function' || typeof p9Roof !== 'function' || typeof p9Add !== 'function') return;

  const zones = window.AtelierVillageZones;
  const MATERIAL = window.AtelierMaterialTextures.MATERIAL;
  const quality = typeof webglQualityMode === 'string' ? webglQualityMode : 'balanced';
  const budget = quality === 'high' ? 22 : quality === 'balanced' ? 14 : 7;
  const tileDetail = quality === 'high' ? 5 : quality === 'balanced' ? 2 : 0;
  let decorated = 0;

  const roofBase = p9Mix(palette.roof, palette.wine, .035);
  const roofWarm = p9Mix(palette.roof, palette.gold, .075);
  const roofDeep = p9Mix(palette.roof, palette.ink, .075);
  const stoneLight = typeof p9Stone !== 'undefined' ? p9Stone : p9Mix(palette.paperDeep, palette.ink, .11);
  const stoneDark = typeof p9StoneDark !== 'undefined' ? p9StoneDark : p9Mix(palette.paperDeep, palette.ink, .20);
  const patinaA = p9Mix(palette.paperDeep, palette.green, .035);
  const patinaB = p9Mix(palette.paperDeep, palette.gold, .045);

  function mark(object, kind) {
    if (object && Number.isInteger(kind)) object.materialKind = kind;
    return object;
  }

  function box(x,z,y,sx,sy,sz,color,rotation=0,kind=MATERIAL.STONE,edges=false) {
    return mark(p9Box(x,z,y,sx,sy,sz,color,rotation,edges), kind);
  }

  function cylinder(x,z,y,sx,sy,sz,color,kind=MATERIAL.ROOF,edges=false) {
    return mark(p9Add(p9Meshes.cylinder,x,z,y,sx,sy,sz,color,0,edges), kind);
  }

  function hash(zoneKey, salt=0) {
    let value = 2166136261 ^ (salt * 2654435761);
    for (const char of String(zoneKey)) {
      value ^= char.charCodeAt(0);
      value = Math.imul(value, 16777619);
    }
    return ((value >>> 0) % 10000) / 10000;
  }

  function visible(zone) {
    const cfg = zones.configuration(zone.zoneKey);
    if (cfg?.status === 'HIDDEN') return false;
    if (zone.existingPlace) return false; // Atelier/IZC/TGS ya tienen cubiertas firma.
    if (cfg?.workshopType || cfg?.displayLabel || cfg?.providerSlug || cfg?.status === 'ACTIVE') return true;
    const suffix = zone.zoneKey.slice(-2);
    return Boolean(webglDynamicProviderPlaces?.[`zone-${suffix}`]);
  }

  function ridge(zone, variant) {
    const {x,z,scale:s} = zone;
    const y = 2.01*s;
    const length = (variant % 2 ? 1.08 : .94) * s;
    const tone = variant % 3 === 0 ? roofWarm : variant % 3 === 1 ? roofBase : roofDeep;

    /* Cumbrera continua con piezas cortas solapadas. */
    box(x,z,y,length,.035*s,.045*s,tone,0,MATERIAL.ROOF,false);
    if (quality !== 'lite') {
      const caps = quality === 'high' ? 8 : 5;
      for (let i=0;i<caps;i++) {
        const t = caps === 1 ? .5 : i/(caps-1);
        const px = x - length*.82 + t*length*1.64;
        cylinder(px,z,y+.025*s,.055*s,.034*s,.055*s,i%3===0?roofWarm:tone,MATERIAL.ROOF,false);
      }
    }
  }

  function irregularTiles(zone, variant) {
    if (!tileDetail) return;
    const {x,z,scale:s} = zone;
    const count = tileDetail;
    for (let i=0;i<count;i++) {
      const px = x + (-.62 + hash(zone.zoneKey,10+i)*1.24)*s;
      const pz = z + (-.42 + hash(zone.zoneKey,20+i)*.84)*s;
      const py = (1.72 + hash(zone.zoneKey,30+i)*.16)*s;
      const tone = i%2 ? roofWarm : roofDeep;
      box(px,pz,py,.12*s,.018*s,.055*s,tone,(hash(zone.zoneKey,40+i)-.5)*.10,MATERIAL.ROOF,false);
    }
  }

  function chimney(zone, variant) {
    if (quality === 'lite' && variant % 3 !== 0) return;
    const {x,z,scale:s} = zone;
    if (variant % 4 === 0) return;
    const side = hash(zone.zoneKey,5) > .5 ? 1 : -1;
    const cx = x + side*.42*s;
    const cz = z - .12*s;
    const h = (.34 + hash(zone.zoneKey,6)*.12)*s;
    box(cx,cz,1.82*s+h*.5,.105*s,h*.5,.105*s,variant%2?stoneLight:stoneDark,0,MATERIAL.STONE,true);
    box(cx,cz,1.82*s+h+.035*s,.14*s,.035*s,.14*s,roofDeep,0,MATERIAL.ROOF,false);
    if (quality === 'high') {
      cylinder(cx,cz,1.82*s+h+.095*s,.055*s,.030*s,.055*s,roofWarm,MATERIAL.METAL,false);
    }
  }

  function stonePlinth(zone, variant) {
    if (quality === 'lite') return;
    const {x,z,scale:s} = zone;
    const front = z + .84*s;
    const blocks = quality === 'high' ? 5 : 3;
    for (let i=0;i<blocks;i++) {
      const px = x + (-.64 + (i+.5)/blocks*1.28)*s;
      const w = (.10 + hash(zone.zoneKey,60+i)*.055)*s;
      const h = (.08 + hash(zone.zoneKey,70+i)*.055)*s;
      box(px,front+.020*s,h,.12*s,h,.035*s,(i+variant)%2?stoneLight:stoneDark,(hash(zone.zoneKey,80+i)-.5)*.025,MATERIAL.STONE,false);
    }
  }

  function mineralPatina(zone, variant) {
    if (quality !== 'high') return;
    const {x,z,scale:s} = zone;
    const front = z + .866*s;
    const patches = variant % 2 ? 2 : 1;
    for (let i=0;i<patches;i++) {
      const px = x + (-.34 + hash(zone.zoneKey,90+i)*.68)*s;
      const py = (.24 + hash(zone.zoneKey,100+i)*.58)*s;
      const sx = (.07 + hash(zone.zoneKey,110+i)*.09)*s;
      const sy = (.025 + hash(zone.zoneKey,120+i)*.055)*s;
      const tone = i%2 ? patinaA : patinaB;
      const patch = box(px,front,py,sx,sy,.006*s,tone,(hash(zone.zoneKey,130+i)-.5)*.10,MATERIAL.STUCCO,false);
      if (patch?.color) patch.color[3] = .34;
    }
  }

  function decorate(zone) {
    const variant = Math.floor(hash(zone.zoneKey,1)*7);
    ridge(zone,variant);
    irregularTiles(zone,variant);
    chimney(zone,variant);
    stonePlinth(zone,variant);
    mineralPatina(zone,variant);
    decorated += 1;
  }

  const run = () => {
    zones.registry.filter(visible).slice(0,budget).forEach(decorate);
    root.dataset.roofPatina='u3.8';
    root.dataset.roofPatinaCount=String(decorated);
    root.dataset.roofPatinaQuality=quality;
    root.dataset.webglPhase='u3.8';
    if (status && !root.dataset.webglError) status.textContent=`U3.8 · ${decorated} cubiertas artesanales · ${quality}`;
  };

  Promise.resolve(zones.ready).finally(run);
})();

/* Atelier Lumière · U3.9 · vegetación premium y jardines por oficio */
(() => {
  if (!root || !window.AtelierVillageZones || !window.AtelierMaterialTextures || !window.AtelierCraftTaxonomy) return;
  if (typeof p9Box !== 'function' || typeof p9Add !== 'function') return;

  const zones = window.AtelierVillageZones;
  const MATERIAL = window.AtelierMaterialTextures.MATERIAL;
  const taxonomy = window.AtelierCraftTaxonomy;
  const quality = typeof webglQualityMode === 'string' ? webglQualityMode : 'balanced';
  const zoneBudget = quality === 'high' ? 22 : quality === 'balanced' ? 14 : 7;
  const density = quality === 'high' ? 3 : quality === 'balanced' ? 2 : 1;
  let decorated = 0;

  const green = p9Mix(palette.green, palette.paperLight, .04);
  const greenDeep = p9Mix(palette.greenDark, palette.ink, .04);
  const greenSoft = p9Mix(palette.green, palette.paperLight, .18);
  const lavender = p9Mix(palette.wineSoft, palette.paperLight, .42);
  const blossom = p9Mix(palette.wineSoft, palette.paperLight, .62);
  const cream = p9Mix(palette.gold, palette.paperLight, .63);
  const warmLeaf = p9Mix(palette.green, palette.gold, .16);
  const trunk = p9Mix(palette.trunk, palette.ink, .05);

  function mark(object, kind) {
    if (object && Number.isInteger(kind)) object.materialKind = kind;
    return object;
  }

  function box(x,z,y,sx,sy,sz,color,rotation=0,kind=MATERIAL.VEGETATION,edges=false) {
    return mark(p9Box(x,z,y,sx,sy,sz,color,rotation,edges), kind);
  }

  function cone(x,z,y,sx,sy,sz,color,rotation=0,kind=MATERIAL.VEGETATION,edges=false) {
    return mark(p9Add(p9Meshes.cone,x,z,y,sx,sy,sz,color,rotation,edges), kind);
  }

  function hash(zoneKey, salt=0) {
    let n = 17 + salt * 101;
    for (const char of String(zoneKey)) n = Math.imul(n ^ char.charCodeAt(0), 16777619);
    return ((n >>> 0) % 10000) / 10000;
  }

  function visible(zone) {
    const cfg = zones.configuration(zone.zoneKey);
    if (cfg?.status === 'HIDDEN') return false;
    if (zone.existingPlace) return true;
    if (cfg?.workshopType || cfg?.displayLabel || cfg?.providerSlug || cfg?.status === 'ACTIVE') return true;
    const suffix = zone.zoneKey.slice(-2);
    return Boolean(webglDynamicProviderPlaces?.[`zone-${suffix}`]);
  }

  function family(zone) {
    const cfg = zones.configuration(zone.zoneKey);
    if (cfg?.workshopType) return taxonomy.resolve(cfg.workshopType).key;
    if (zone.existingPlace === 'izc') return 'FAN';
    if (zone.existingPlace === 'stitch') return 'TEXTILE';
    return 'NEUTRAL';
  }

  function shrub(x,z,s=.18,color=greenDeep) {
    cone(x,z,.18*s,s,.18*s,s,color,0,MATERIAL.VEGETATION,false);
    cone(x+.08*s,z-.04*s,.21*s,s*.72,.16*s,s*.72,green,0,MATERIAL.VEGETATION,false);
  }

  function smallTree(x,z,s=.55,airy=false) {
    box(x,z,.32*s,.055*s,.32*s,.055*s,trunk,0,MATERIAL.WOOD,false);
    cone(x,z,.82*s,.34*s,.48*s,.34*s,airy?greenSoft:greenDeep,0,MATERIAL.VEGETATION,false);
    cone(x+.08*s,z-.04*s,1.13*s,.27*s,.34*s,.27*s,green,0,MATERIAL.VEGETATION,false);
    if (quality === 'high') cone(x-.09*s,z+.07*s,.94*s,.20*s,.25*s,.20*s,warmLeaf,0,MATERIAL.VEGETATION,false);
  }

  function flower(x,z,s=.12,color=blossom) {
    box(x,z,.08*s,.025*s,.08*s,.025*s,greenDeep,0,MATERIAL.VEGETATION,false);
    cone(x,z,.19*s,.10*s,.08*s,.10*s,color,0,MATERIAL.VEGETATION,false);
  }

  function flowerRow(zone,color=lavender,count=5,offsetZ=1.18) {
    const {x,z,scale:s} = zone;
    const actual = quality === 'lite' ? Math.min(3,count) : count;
    for (let i=0;i<actual;i++) {
      const t = actual===1 ? .5 : i/(actual-1);
      flower(x+(-.58+t*1.16)*s,z+offsetZ*s,.82*s,color);
    }
  }

  function hedge(zone,side=1,length=.78) {
    const {x,z,scale:s} = zone;
    box(x+side*.88*s,z+.12*s,.18*s,.14*s,.18*s,length*s,greenDeep,0,MATERIAL.VEGETATION,false);
    if (quality === 'high') box(x+side*.87*s,z-.18*s,.32*s,.11*s,.13*s,length*.72*s,green,0,MATERIAL.VEGETATION,false);
  }

  function grasses(zone,count=6,color=greenSoft) {
    const {x,z,scale:s} = zone;
    const actual = quality === 'high' ? count : quality === 'balanced' ? Math.ceil(count*.65) : 2;
    for (let i=0;i<actual;i++) {
      const px=x+(-.75+hash(zone.zoneKey,10+i)*1.5)*s;
      const pz=z+(.92+hash(zone.zoneKey,30+i)*.42)*s;
      cone(px,pz,.16*s,.055*s,(.14+hash(zone.zoneKey,50+i)*.08)*s,.055*s,color,(hash(zone.zoneKey,70+i)-.5)*.25,MATERIAL.VEGETATION,false);
    }
  }

  function clippedGarden(zone) {
    const {x,z,scale:s}=zone;
    [-1,1].forEach(side=>{
      shrub(x+side*.78*s,z+.92*s,.42*s,greenDeep);
      if (quality==='high') flower(x+side*.58*s,z+1.02*s,.68*s,cream);
    });
  }

  function floralGarden(zone) {
    flowerRow(zone,blossom,quality==='high'?7:5,1.10);
    flowerRow({...zone,z:zone.z+.22*zone.scale},cream,quality==='high'?6:4,1.10);
    if (quality!=='lite') {
      shrub(zone.x-.82*zone.scale,zone.z+.76*zone.scale,.46*zone.scale,greenDeep);
      shrub(zone.x+.82*zone.scale,zone.z+.76*zone.scale,.42*zone.scale,green);
    }
  }

  function textileGarden(zone) {
    flowerRow(zone,lavender,quality==='high'?8:5,1.12);
    if (quality!=='lite') grasses(zone,5,p9Mix(lavender,green,.42));
  }

  function ceramicGarden(zone) {
    grasses(zone,5,warmLeaf);
    if (quality==='high') smallTree(zone.x-.92*zone.scale,zone.z+.55*zone.scale,.55*zone.scale,true);
    else shrub(zone.x-.84*zone.scale,zone.z+.60*zone.scale,.38*zone.scale,warmLeaf);
  }

  function woodGarden(zone) {
    const side=hash(zone.zoneKey,5)>.5?1:-1;
    smallTree(zone.x+side*.95*zone.scale,zone.z+.45*zone.scale,.64*zone.scale,false);
    if (quality!=='lite') shrub(zone.x-side*.76*zone.scale,zone.z+.86*zone.scale,.40*zone.scale,greenDeep);
  }

  function paperGarden(zone) {
    grasses(zone,7,p9Mix(greenSoft,cream,.22));
    if (quality==='high') flowerRow(zone,cream,4,1.18);
  }

  function candleGarden(zone) {
    grasses(zone,5,p9Mix(green,cream,.14));
    if (quality!=='lite') {
      flower(zone.x-.72*zone.scale,zone.z+.94*zone.scale,.72*zone.scale,cream);
      flower(zone.x+.72*zone.scale,zone.z+.94*zone.scale,.72*zone.scale,cream);
    }
  }

  function fanGarden(zone) {
    hedge(zone,-1,.58);
    hedge(zone,1,.58);
    if (quality==='high') flowerRow(zone,cream,5,1.20);
  }

  function glassGarden(zone) {
    clippedGarden(zone);
    if (quality==='high') flower(zone.x,zone.z+1.12*zone.scale,.86*zone.scale,p9Mix(cream,palette.paperLight,.35));
  }

  function neutralGarden(zone) {
    const side=hash(zone.zoneKey,8)>.5?1:-1;
    shrub(zone.x+side*.80*zone.scale,zone.z+.90*zone.scale,.40*zone.scale,greenDeep);
    if (density>1) flower(zone.x-side*.62*zone.scale,zone.z+1.00*zone.scale,.70*zone.scale,blossom);
  }

  function decorate(zone) {
    switch (family(zone)) {
      case 'FLORAL': floralGarden(zone); break;
      case 'TEXTILE': textileGarden(zone); break;
      case 'CERAMICS': ceramicGarden(zone); break;
      case 'WOOD': woodGarden(zone); break;
      case 'PAPER': paperGarden(zone); break;
      case 'CANDLE': candleGarden(zone); break;
      case 'FAN': fanGarden(zone); break;
      case 'JEWELRY': clippedGarden(zone); break;
      case 'GLASS': glassGarden(zone); break;
      case 'LEATHER': grasses(zone,4,greenSoft); break;
      default: neutralGarden(zone); break;
    }
    decorated += 1;
  }

  const run=()=>{
    zones.registry.filter(visible).slice(0,zoneBudget).forEach(decorate);
    root.dataset.premiumVegetation='u3.9';
    root.dataset.premiumVegetationCount=String(decorated);
    root.dataset.premiumVegetationQuality=quality;
    root.dataset.webglPhase='u3.9';
    if(status && !root.dataset.webglError) status.textContent=`U3.9 · jardines por oficio · ${decorated} parcelas · ${quality}`;
  };

  Promise.resolve(zones.ready).finally(run);
})();

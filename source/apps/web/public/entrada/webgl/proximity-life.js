/* Atelier Lumière · U3.13 · vida de taller y microdetalle de proximidad */
(() => {
  if (!root || !window.AtelierVillageZones || !window.AtelierMaterialTextures || !window.AtelierCraftTaxonomy) return;
  if (typeof p9Box !== 'function' || typeof p9Add !== 'function') return;

  const zones = window.AtelierVillageZones;
  const taxonomy = window.AtelierCraftTaxonomy;
  const MATERIAL = window.AtelierMaterialTextures.MATERIAL;
  const quality = typeof webglQualityMode === 'string' ? webglQualityMode : 'balanced';
  const zoneBudget = quality === 'high' ? 18 : quality === 'balanced' ? 10 : 4;
  const rich = quality === 'high';
  let decorated = 0;

  const wood = p9Mix(palette.trunk, palette.ink, .10);
  const woodLight = p9Mix(palette.trunk, palette.paperLight, .22);
  const stone = p9Mix(palette.paperDeep, palette.roof, .18);
  const brass = p9Mix(palette.gold, palette.paperLight, .04);
  const wine = p9Mix(palette.wine, palette.paperLight, .03);
  const clay = p9Mix(palette.gold, palette.roof, .48);
  const linen = p9Mix(palette.linen, palette.paperLight, .10);
  const glass = [.82,.88,.84,.64];
  const glow = [1.0,.66,.30,.84];
  const green = p9Mix(palette.green, palette.paperLight, .06);

  function mark(object, kind, always=false) {
    if (object && Number.isInteger(kind)) object.materialKind = kind;
    if (object && always) object.lodAlways = true;
    return object;
  }
  function box(x,z,y,sx,sy,sz,color,rotation=0,kind=MATERIAL.WOOD,edges=false,always=false) {
    return mark(p9Box(x,z,y,sx,sy,sz,color,rotation,edges),kind,always);
  }
  function cylinder(x,z,y,sx,sy,sz,color,kind=MATERIAL.STONE,edges=false) {
    return mark(p9Add(p9Meshes.cylinder,x,z,y,sx,sy,sz,color,0,edges),kind,false);
  }
  function cone(x,z,y,sx,sy,sz,color,kind=MATERIAL.VEGETATION,edges=false) {
    return mark(p9Add(p9Meshes.cone,x,z,y,sx,sy,sz,color,0,edges),kind,false);
  }

  function hash(zoneKey,salt=0){
    let n=29+salt*149;
    for(const char of String(zoneKey)) n=Math.imul(n^char.charCodeAt(0),16777619);
    return((n>>>0)%10000)/10000;
  }

  function visible(zone){
    const cfg=zones.configuration(zone.zoneKey);
    if(cfg?.status==='HIDDEN') return false;
    if(zone.existingPlace) return true;
    if(cfg?.workshopType||cfg?.displayLabel||cfg?.providerSlug||cfg?.status==='ACTIVE') return true;
    const suffix=zone.zoneKey.slice(-2);
    return Boolean(webglDynamicProviderPlaces?.[`zone-${suffix}`]);
  }

  function family(zone){
    const cfg=zones.configuration(zone.zoneKey);
    if(cfg?.workshopType) return taxonomy.resolve(cfg.workshopType).key;
    if(zone.existingPlace==='izc') return 'FAN';
    if(zone.existingPlace==='stitch') return 'TEXTILE';
    const suffix=zone.zoneKey.slice(-2);
    const place=webglDynamicProviderPlaces?.[`zone-${suffix}`];
    return taxonomy.resolve(place?.workshopType||place?.provider?.specialty||'').key;
  }

  function bench(zone,side=1){
    const {x,z,scale:s}=zone;
    const bx=x+side*.72*s,bz=z+1.15*s;
    box(bx,bz,.20*s,.28*s,.035*s,.11*s,woodLight,.02*side,MATERIAL.WOOD,false);
    if(quality!=='lite'){
      [-.22,.22].forEach(dx=>box(bx+dx*s,bz,.095*s,.022*s,.095*s,.022*s,wood,0,MATERIAL.WOOD,false));
      box(bx,bz-.09*s,.38*s,.28*s,.025*s,.025*s,wood,.02*side,MATERIAL.WOOD,false);
    }
  }

  function hangingSign(zone,side=1){
    if(quality==='lite') return;
    const {x,z,scale:s}=zone;
    const px=x+side*.72*s,pz=z+.88*s;
    box(px,pz,.82*s,.022*s,.42*s,.022*s,wood,0,MATERIAL.WOOD,false);
    box(px-side*.13*s,pz,.99*s,.15*s,.018*s,.085*s,wine,.035*side,MATERIAL.WOOD,false);
    if(rich) box(px-side*.13*s,pz+.012*s,.99*s,.055*s,.010*s,.010*s,brass,0,MATERIAL.METAL,false);
  }

  function lantern(zone,side=-1){
    if(quality==='lite') return;
    const {x,z,scale:s}=zone;
    const lx=x+side*.58*s,lz=z+1.05*s;
    box(lx,lz,.28*s,.025*s,.28*s,.025*s,brass,0,MATERIAL.METAL,false);
    box(lx,lz,.57*s,.075*s,.12*s,.075*s,glow,0,MATERIAL.GLASS,false);
    if(rich) box(lx,lz,.72*s,.09*s,.018*s,.09*s,brass,0,MATERIAL.METAL,false);
  }

  function crate(zone,side=1){
    const {x,z,scale:s}=zone;
    const cx=x+side*.88*s,cz=z+.82*s;
    box(cx,cz,.13*s,.15*s,.13*s,.13*s,woodLight,(hash(zone.zoneKey,3)-.5)*.10,MATERIAL.WOOD,true);
    if(rich){
      box(cx,cz+.14*s,.13*s,.15*s,.022*s,.022*s,wood,0,MATERIAL.WOOD,false);
      box(cx,cz-.14*s,.13*s,.15*s,.022*s,.022*s,wood,0,MATERIAL.WOOD,false);
    }
  }

  function ceramicDisplay(zone){
    const {x,z,scale:s}=zone;
    const count=rich?4:2;
    for(let i=0;i<count;i++){
      const px=x+(-.30+i*.20)*s;
      cylinder(px,z+1.34*s,.12*s,.065*s,(.08+(i%2)*.035)*s,.065*s,i%2?clay:p9Mix(clay,palette.paperLight,.18),MATERIAL.STONE,false);
    }
  }

  function textileDisplay(zone){
    const {x,z,scale:s}=zone;
    box(x,z+1.31*s,.48*s,.24*s,.025*s,.025*s,wood,0,MATERIAL.WOOD,false);
    const count=rich?4:2;
    for(let i=0;i<count;i++){
      cylinder(x+(-.18+i*.12)*s,z+1.31*s,.58*s,.035*s,.055*s,.035*s,i%2?wine:linen,MATERIAL.STUCCO,false);
    }
  }

  function jewelryDisplay(zone){
    const {x,z,scale:s}=zone;
    box(x,z+1.32*s,.22*s,.16*s,.18*s,.16*s,stone,0,MATERIAL.STONE,true);
    box(x,z+1.32*s,.46*s,.11*s,.05*s,.11*s,glass,0,MATERIAL.GLASS,false);
    if(rich) cylinder(x,z+1.32*s,.56*s,.025*s,.045*s,.025*s,brass,MATERIAL.METAL,false);
  }

  function woodDisplay(zone){
    const {x,z,scale:s}=zone;
    [-.18,.18].forEach(dx=>box(x+dx*s,z+1.30*s,.24*s,.025*s,.24*s,.025*s,wood,dx<0?-.16:.16,MATERIAL.WOOD,false));
    box(x,z+1.30*s,.47*s,.30*s,.025*s,.04*s,woodLight,0,MATERIAL.WOOD,false);
  }

  function floralDisplay(zone){
    const {x,z,scale:s}=zone;
    const count=rich?5:3;
    for(let i=0;i<count;i++){
      const px=x+(-.30+i*.15)*s;
      cylinder(px,z+1.34*s,.10*s,.055*s,.08*s,.055*s,clay,MATERIAL.STONE,false);
      cone(px,z+1.34*s,.26*s,.075*s,.12*s,.075*s,i%2?green:p9Mix(green,palette.gold,.12),MATERIAL.VEGETATION,false);
    }
  }

  function paperDisplay(zone){
    const {x,z,scale:s}=zone;
    const count=rich?5:3;
    for(let i=0;i<count;i++) box(x,z+(1.24+i*.045)*s,(.08+i*.025)*s,.22*s,.012*s,.15*s,i%2?linen:p9Paper,.02*(i-2),MATERIAL.STUCCO,false);
  }

  function candleDisplay(zone){
    const {x,z,scale:s}=zone;
    const count=rich?5:3;
    for(let i=0;i<count;i++){
      const px=x+(-.24+i*.12)*s;
      const h=(.07+(i%3)*.035)*s;
      cylinder(px,z+1.32*s,h,.035*s,h,.035*s,linen,MATERIAL.STUCCO,false);
      box(px,z+1.32*s,h*2+.025*s,.022*s,.018*s,.022*s,glow,0,MATERIAL.GLASS,false);
    }
  }

  function leatherDisplay(zone){
    const {x,z,scale:s}=zone;
    const count=rich?4:2;
    for(let i=0;i<count;i++) box(x+(-.20+i*.14)*s,z+1.31*s,.34*s,.045*s,.20*s,.012*s,p9Mix(palette.roof,palette.gold,.20),.04*(i-1),MATERIAL.WOOD,false);
  }

  function fanDisplay(zone){
    const {x,z,scale:s}=zone;
    const count=rich?3:2;
    for(let i=0;i<count;i++) mark(p9Add(p9Meshes.fan,x+(-.22+i*.22)*s,z+1.34*s,.40*s,.20*s,.025*s,.14*s,i%2?wine:p9Mix(wine,palette.gold,.16),Math.PI,true),MATERIAL.WOOD,false);
  }

  function glassDisplay(zone){
    const {x,z,scale:s}=zone;
    const count=rich?4:2;
    for(let i=0;i<count;i++) cylinder(x+(-.18+i*.12)*s,z+1.32*s,.15*s,.055*s,(.10+(i%2)*.035)*s,.055*s,i%2?glass:[.90,.72,.48,.62],MATERIAL.GLASS,false);
  }

  const signature={
    CERAMICS:ceramicDisplay,TEXTILE:textileDisplay,JEWELRY:jewelryDisplay,WOOD:woodDisplay,
    FLORAL:floralDisplay,PAPER:paperDisplay,CANDLE:candleDisplay,LEATHER:leatherDisplay,FAN:fanDisplay,GLASS:glassDisplay
  };

  function decorate(zone,index){
    const side=hash(zone.zoneKey,1)>.5?1:-1;
    bench(zone,side);
    hangingSign(zone,-side);
    lantern(zone,side);
    if(index%2===0) crate(zone,-side);
    (signature[family(zone)]||crate)(zone);
    decorated+=1;
  }

  const run=()=>{
    zones.registry.filter(visible).slice(0,zoneBudget).forEach(decorate);
    root.dataset.proximityLife='u3.13';
    root.dataset.proximityLifeCount=String(decorated);
    root.dataset.proximityLifeQuality=quality;
    root.dataset.webglPhase='u3.13';
    if(status&&!root.dataset.webglError) status.textContent=`U3.13 · vida de taller de proximidad · ${decorated} zonas · ${quality}`;
  };

  Promise.resolve(zones.ready).finally(run);
})();

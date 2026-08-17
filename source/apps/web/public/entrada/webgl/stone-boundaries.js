/* Atelier Lumière · U3.11 · piedra seca, accesos y bordes de parcela */
(() => {
  if (!root || !window.AtelierVillageZones || !window.AtelierMaterialTextures) return;
  if (typeof p9Box !== 'function' || typeof p9Add !== 'function') return;

  const zones=window.AtelierVillageZones;
  const MATERIAL=window.AtelierMaterialTextures.MATERIAL;
  const quality=typeof webglQualityMode==='string'?webglQualityMode:'balanced';
  const budget=quality==='high'?22:quality==='balanced'?14:7;
  const segments=quality==='high'?7:quality==='balanced'?4:2;
  let decorated=0;

  const stone=p9Mix(palette.paperDeep,palette.roof,.19);
  const stoneLight=p9Mix(palette.paperDeep,palette.paperLight,.20);
  const stoneDark=p9Mix(palette.paperDeep,palette.ink,.10);
  const wood=p9Mix(palette.trunk,palette.ink,.08);
  const brass=p9Mix(palette.gold,palette.paperLight,.04);

  function mark(object,kind){if(object&&Number.isInteger(kind))object.materialKind=kind;return object;}
  function box(x,z,y,sx,sy,sz,color,rotation=0,kind=MATERIAL.STONE,edges=false){return mark(p9Box(x,z,y,sx,sy,sz,color,rotation,edges),kind);}
  function cylinder(x,z,y,sx,sy,sz,color,kind=MATERIAL.STONE,edges=false){return mark(p9Add(p9Meshes.cylinder,x,z,y,sx,sy,sz,color,0,edges),kind);}

  function hash(zoneKey,salt=0){let n=23+salt*131;for(const char of String(zoneKey))n=Math.imul(n^char.charCodeAt(0),16777619);return((n>>>0)%10000)/10000;}

  function visible(zone){
    const cfg=zones.configuration(zone.zoneKey);
    if(cfg?.status==='HIDDEN')return false;
    if(zone.existingPlace)return true;
    if(cfg?.workshopType||cfg?.displayLabel||cfg?.providerSlug||cfg?.status==='ACTIVE')return true;
    const suffix=zone.zoneKey.slice(-2);
    return Boolean(webglDynamicProviderPlaces?.[`zone-${suffix}`]);
  }

  function dryWall(zone,side=1,back=false){
    const {x,z,scale:s}=zone;
    const length=(back?1.35:1.05)*s;
    const count=segments;
    for(let i=0;i<count;i++){
      const t=count===1?.5:i/(count-1);
      const jitter=(hash(zone.zoneKey,10+i)-.5)*.055*s;
      const width=(.10+hash(zone.zoneKey,30+i)*.045)*s;
      const height=(.07+hash(zone.zoneKey,50+i)*.045)*s;
      let px,pz;
      if(back){
        px=x+(-.62+t*1.24)*s;
        pz=z-.96*s+jitter;
      }else{
        px=x+side*.98*s+jitter;
        pz=z+(-.48+t*.96)*s;
      }
      box(px,pz,height,width,height,.10*s,(i%3===0?stoneLight:i%2?stone:stoneDark),(hash(zone.zoneKey,70+i)-.5)*.035,MATERIAL.STONE,false);
      if(quality==='high'&&i%2===0){
        box(px+.018*s,pz-.012*s,height*2.05,width*.78,height*.55,.09*s,i%3?stone:stoneLight,(hash(zone.zoneKey,90+i)-.5)*.05,MATERIAL.STONE,false);
      }
    }
    return length;
  }

  function gate(zone,side=1){
    if(quality==='lite')return;
    const {x,z,scale:s}=zone;
    const gx=x+side*.72*s;
    const gz=z+1.02*s;
    [-1,1].forEach(dir=>{
      box(gx+dir*.19*s,gz,.29*s,.055*s,.29*s,.055*s,stoneDark,0,MATERIAL.STONE,true);
      if(quality==='high')cylinder(gx+dir*.19*s,gz,.61*s,.065*s,.045*s,.065*s,stoneLight,MATERIAL.STONE,false);
    });
    box(gx,gz+.012*s,.33*s,.16*s,.025*s,.035*s,wood,0,MATERIAL.WOOD,false);
    box(gx,gz+.018*s,.48*s,.16*s,.020*s,.028*s,wood,0,MATERIAL.WOOD,false);
    if(quality==='high')box(gx,gz+.026*s,.41*s,.015*s,.12*s,.018*s,brass,0,MATERIAL.METAL,false);
  }

  function steps(zone){
    if(quality==='lite')return;
    const {x,z,scale:s}=zone;
    const side=hash(zone.zoneKey,4)>.5?1:-1;
    const count=quality==='high'?3:2;
    for(let i=0;i<count;i++){
      box(x+side*.18*s,z+(1.02+i*.12)*s,.035+i*.022*s,.25*s,.025*s,.10*s,i%2?stoneLight:stone,0,MATERIAL.STONE,false);
    }
  }

  function boundaryMarkers(zone){
    if(quality!=='high')return;
    const {x,z,scale:s}=zone;
    const a=hash(zone.zoneKey,6)>.5?1:-1;
    [[a*.96,.75],[a*.96,-.68],[-a*.92,-.76]].forEach(([dx,dz],i)=>{
      cylinder(x+dx*s,z+dz*s,.15*s,.055*s,.15*s,.055*s,i%2?stoneLight:stoneDark,MATERIAL.STONE,false);
      box(x+dx*s,z+dz*s,.34*s,.065*s,.04*s,.065*s,stone,0,MATERIAL.STONE,false);
    });
  }

  function decorate(zone){
    const variant=Math.floor(hash(zone.zoneKey,1)*5);
    dryWall(zone,variant%2?1:-1,false);
    if(quality==='high'&&variant>=2)dryWall(zone,-(variant%2?1:-1),false);
    if(variant===4||zone.existingPlace)dryWall(zone,1,true);
    gate(zone,variant%2?1:-1);
    steps(zone);
    boundaryMarkers(zone);
    decorated+=1;
  }

  const run=()=>{
    zones.registry.filter(visible).slice(0,budget).forEach(decorate);
    root.dataset.stoneBoundaries='u3.11';
    root.dataset.stoneBoundaryCount=String(decorated);
    root.dataset.stoneBoundaryQuality=quality;
    root.dataset.webglPhase='u3.11';
    if(status&&!root.dataset.webglError)status.textContent=`U3.11 · piedra seca y accesos · ${decorated} parcelas · ${quality}`;
  };

  Promise.resolve(zones.ready).finally(run);
})();

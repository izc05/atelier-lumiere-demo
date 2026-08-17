/* Atelier Lumière · U3.7 · detalle de fachada cercano y LOD */
(() => {
  if (!root || !window.AtelierVillageZones || !window.AtelierMaterialTextures) return;

  const zones = window.AtelierVillageZones;
  const MATERIAL = window.AtelierMaterialTextures.MATERIAL;
  const quality = typeof webglQualityMode === 'string' ? webglQualityMode : 'balanced';
  const budget = quality === 'high' ? 22 : quality === 'balanced' ? 14 : 7;
  const micro = quality === 'high';

  const woodDark = p9Mix(palette.roof, palette.ink, .20);
  const woodWarm = p9Mix(palette.roof, palette.gold, .13);
  const frame = p9Mix(palette.paperDeep, palette.paperLight, .26);
  const brass = p9Gold;
  const glassWarm = [1.0,.64,.30,.72];
  const linen = p9Mix(palette.linen, palette.paperLight, .14);
  let detailed = 0;

  function mark(object, kind) {
    if (object && Number.isInteger(kind)) object.materialKind = kind;
    return object;
  }
  function box(x,z,y,sx,sy,sz,color,rotation=0,kind=MATERIAL.STUCCO,edges=true) {
    return mark(p9Box(x,z,y,sx,sy,sz,color,rotation,edges),kind);
  }
  function cylinder(x,z,y,sx,sy,sz,color,kind=MATERIAL.METAL,edges=false) {
    return mark(p9Add(p9Meshes.cylinder,x,z,y,sx,sy,sz,color,0,edges),kind);
  }

  function hashZone(zoneKey, salt=0) {
    let n = salt * 97 + 17;
    for (const char of String(zoneKey)) n = (n * 31 + char.charCodeAt(0)) >>> 0;
    return (n % 1000) / 1000;
  }

  function occupied(zone) {
    const cfg = zones.configuration(zone.zoneKey);
    if (cfg?.status === 'HIDDEN') return false;
    if (zone.existingPlace) return false;
    if (cfg?.workshopType || cfg?.displayLabel || cfg?.providerSlug || cfg?.status === 'ACTIVE') return true;
    const suffix = String(zone.zoneKey).slice(-2);
    return Boolean(webglDynamicProviderPlaces?.[`zone-${suffix}`]);
  }

  function facade(zone, order) {
    const {x,z,scale:s} = zone;
    const front = z + .82*s;
    const variant = Math.floor(hashZone(zone.zoneKey,1) * 5);
    const doorX = x + (hashZone(zone.zoneKey,2) > .5 ? .34 : -.34) * s;
    const windowX = x - Math.sign(doorX-x || 1) * .38*s;
    const shutter = variant % 2 === 0 ? woodWarm : woodDark;

    box(doorX,front+.012*s,.48*s,.22*s,.48*s,.025*s,woodDark,0,MATERIAL.WOOD,true);
    box(doorX,front+.040*s,1.02*s,.27*s,.055*s,.035*s,frame,0,MATERIAL.STONE,false);
    if (quality !== 'lite') {
      box(doorX-.14*s,front+.048*s,.48*s,.025*s,.50*s,.035*s,frame,0,MATERIAL.STONE,false);
      box(doorX+.14*s,front+.048*s,.48*s,.025*s,.50*s,.035*s,frame,0,MATERIAL.STONE,false);
      cylinder(doorX+.07*s,front+.070*s,.50*s,.018*s,.022*s,.018*s,brass,MATERIAL.METAL,false);
    }

    box(windowX,front+.026*s,.68*s,.23*s,.25*s,.022*s,glassWarm,0,MATERIAL.GLASS,false);
    box(windowX,front+.047*s,.68*s,.28*s,.030*s,.032*s,frame,0,MATERIAL.STONE,false);
    box(windowX,front+.047*s,.43*s,.28*s,.030*s,.032*s,frame,0,MATERIAL.STONE,false);
    if (quality !== 'lite') {
      box(windowX-.30*s,front+.035*s,.68*s,.055*s,.27*s,.022*s,shutter,-.035,MATERIAL.WOOD,false);
      box(windowX+.30*s,front+.035*s,.68*s,.055*s,.27*s,.022*s,shutter,.035,MATERIAL.WOOD,false);
    }

    if (micro && variant === 0) {
      box(x,front+.14*s,1.16*s,.44*s,.035*s,.16*s,woodDark,0,MATERIAL.WOOD,true);
      [-.35,0,.35].forEach((dx)=>box(x+dx*s,front+.24*s,1.38*s,.018*s,.20*s,.018*s,brass,0,MATERIAL.METAL,false));
    } else if (quality !== 'lite' && variant === 1) {
      box(windowX,front+.13*s,1.00*s,.34*s,.025*s,.19*s,linen,.02,MATERIAL.STUCCO,false);
    } else if (quality !== 'lite' && variant === 2) {
      box(windowX,front+.10*s,.34*s,.28*s,.055*s,.12*s,p9Mix(palette.green,palette.paperLight,.12),0,MATERIAL.VEGETATION,false);
    }

    if (quality === 'high') {
      if (variant === 3) {
        box(x-.30*s,z-.06*s,1.78*s,.22*s,.23*s,.18*s,frame,0,MATERIAL.STUCCO,true);
        mark(p9Roof(x-.30*s,z-.06*s,2.08*s,.27*s,.15*s,.23*s,p9Mix(palette.roof,palette.wine,.08),0),MATERIAL.ROOF);
      } else if (variant === 4) {
        box(x+.38*s,z-.08*s,1.92*s,.12*s,.34*s,.12*s,p9Mix(palette.paperDeep,palette.roof,.10),0,MATERIAL.STONE,true);
        box(x+.38*s,z-.08*s,2.30*s,.15*s,.045*s,.15*s,p9Mix(palette.roof,palette.ink,.08),0,MATERIAL.ROOF,false);
      }
    }

    if (quality === 'high' && order < 12) {
      box(doorX + (doorX>x ? -.30 : .30)*s,front+.074*s,.82*s,.12*s,.075*s,.018*s,p9Mix(palette.wine,palette.paperLight,.06),0,MATERIAL.WOOD,false);
      box(doorX + (doorX>x ? -.30 : .30)*s,front+.083*s,.82*s,.025*s,.018*s,.021*s,brass,0,MATERIAL.METAL,false);
    }
    detailed += 1;
  }

  zones.registry.filter(occupied).slice(0,budget).forEach(facade);

  root.dataset.facadeDetails='u3.7';
  root.dataset.facadeDetailCount=String(detailed);
  root.dataset.facadeDetailQuality=quality;
  root.dataset.webglPhase='u3.7';
  if(status && !root.dataset.webglError) status.textContent=`U3.7 · ${detailed} fachadas detalladas · ${quality}`;
})();

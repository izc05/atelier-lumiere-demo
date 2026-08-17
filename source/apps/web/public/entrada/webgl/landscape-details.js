/* Atelier Lumière · U3.5C · suelo, caminos y paisaje de detalle */
(() => {
  if (!root || !window.AtelierMaterialTextures) return;

  const MATERIAL = window.AtelierMaterialTextures.MATERIAL;
  const quality = typeof webglQualityMode === 'string' ? webglQualityMode : 'balanced';
  const density = quality === 'high' ? 1 : quality === 'balanced' ? .62 : .32;
  const low = quality === 'lite';

  const stone = p9Mix(palette.paperDeep, palette.roof, .19);
  const stoneLight = p9Mix(palette.paperDeep, palette.paperLight, .24);
  const earth = p9Mix(palette.paperDeep, palette.gold, .09);
  const earthDark = p9Mix(palette.paperDeep, palette.roof, .12);
  const grass = p9Mix(palette.green, palette.paperLight, .12);
  const grassDark = p9Mix(palette.greenDark, palette.paperLight, .08);
  const timber = p9Mix(palette.trunk, palette.paperDeep, .08);
  const water = p9Mix(palette.green, palette.paperLight, .72, .72);
  const waterBright = [0.82, .90, .87, .48];

  function mark(object, kind) {
    if (object) object.materialKind = kind;
    return object;
  }
  function box(x,z,y,sx,sy,sz,color,rotation=0,kind=MATERIAL.EARTH,edges=false) {
    return mark(p9Box(x,z,y,sx,sy,sz,color,rotation,edges),kind);
  }
  function cylinder(x,z,y,sx,sy,sz,color,kind=MATERIAL.STONE,edges=false) {
    return mark(p9Add(p9Meshes.cylinder,x,z,y,sx,sy,sz,color,0,edges),kind);
  }
  function cone(x,z,y,sx,sy,sz,color,kind=MATERIAL.VEGETATION) {
    return mark(p9Add(meshes.cone,x,z,y,sx,sy,sz,color,0,false),kind);
  }

  /* Empedrado discontinuo sobre las rutas principales: irregular, nunca una retícula perfecta. */
  const pathRuns = [
    {x:0,z:0,length:16,rotation:0,step:.78},
    {x:0,z:0,length:12,rotation:Math.PI/2,step:.80},
    {x:-7.4,z:-3.8,length:6.8,rotation:.58,step:.86},
    {x:8.1,z:-4.5,length:7.4,rotation:-.52,step:.88},
    {x:-8.0,z:5.3,length:6.5,rotation:-.55,step:.90},
    {x:8.0,z:5.2,length:6.4,rotation:.55,step:.90}
  ];

  pathRuns.forEach((run, runIndex) => {
    const count = Math.max(4, Math.floor((run.length / run.step) * density));
    for (let i=0;i<count;i++) {
      const t = count <= 1 ? .5 : i/(count-1);
      const along = mix(-run.length/2, run.length/2, t);
      const jitter = Math.sin((i+1)*(runIndex+2)*1.37) * .09;
      const side = Math.cos((i+2)*(runIndex+1)*1.11) * .055;
      const px = run.x + Math.sin(run.rotation)*along + Math.cos(run.rotation)*side;
      const pz = run.z + Math.cos(run.rotation)*along - Math.sin(run.rotation)*side;
      const sx = .18 + ((i+runIndex)%3)*.035;
      const sz = .11 + ((i*2+runIndex)%3)*.025;
      box(px,pz,.087,sx,.014,sz,i%3?stoneLight:stone,run.rotation+jitter,MATERIAL.STONE,false);
    }
  });

  /* Bordes y piedrecillas en los cruces: dan escala sin llenar todo de geometría. */
  const pebbleCenters = [[-5.3,-3.1],[5.7,3.9],[-1.2,6.4],[1.0,-6.1],[-9.0,2.5],[9.4,-2.7]];
  pebbleCenters.slice(0, low ? 2 : quality === 'balanced' ? 4 : pebbleCenters.length).forEach(([cx,cz],group) => {
    const count = low ? 3 : quality === 'balanced' ? 5 : 8;
    for(let i=0;i<count;i++) {
      const a = (i/count)*Math.PI*2 + group*.43;
      const r = .40 + (i%3)*.13;
      cylinder(cx+Math.cos(a)*r,cz+Math.sin(a)*r,.075,.055+(i%2)*.018,.028,.055+(i%3)*.012,i%2?stone:stoneLight,MATERIAL.STONE,false);
    }
  });

  /* Vegetación baja en pequeños grupos: gramíneas, no árboles extra. */
  const grassClusters = [
    [-14.0,-4.4],[-12.7,-5.0],[-7.0,-10.0],[-5.8,-9.7],[6.4,10.0],[7.8,10.2],
    [14.3,5.0],[13.8,6.0],[-4.3,8.6],[4.7,-8.7],[11.5,7.5],[-11.2,8.2]
  ];
  const grassLimit = low ? 4 : quality === 'balanced' ? 8 : grassClusters.length;
  grassClusters.slice(0,grassLimit).forEach(([cx,cz],group) => {
    const blades = low ? 2 : quality === 'balanced' ? 3 : 5;
    for(let i=0;i<blades;i++) {
      const angle = (i+1)*2.17 + group*.61;
      const r = .08 + (i%2)*.07;
      cone(cx+Math.cos(angle)*r,cz+Math.sin(angle)*r,.17+(i%3)*.035,.055,.15+(i%2)*.04,.055,i%2?grass:grassDark,MATERIAL.VEGETATION);
    }
  });

  /* Cauces: una segunda lámina translúcida crea brillo de agua a vista oblicua. */
  [
    [-11.2,-11.4,5.25,.12,-.08],
    [0,-10.8,5.95,.13,.04],
    [11.6,-10.25,5.45,.12,.10]
  ].forEach(([x,z,sx,sz,rot],index) => {
    box(x,z,.056,sx,.010,sz,water,rot,MATERIAL.GLASS,false);
    if (!low) box(x + (index-1)*.22,z-.02,.061,sx*.62,.004,.018,waterBright,rot,MATERIAL.GLASS,false);
  });

  /* Pasarela: se distinguen tablones, pero solo en equilibrado/alto. */
  if (!low) {
    const bx=3.1,bz=-10.6;
    const slats = quality === 'high' ? 9 : 6;
    for(let i=0;i<slats;i++) {
      const t = slats<=1?.5:i/(slats-1);
      const dx = mix(-.52,.52,t);
      box(bx+dx,bz,.225,.045,.018,.42,i%2?timber:p9Mix(timber,palette.paperLight,.06),-.03,MATERIAL.WOOD,false);
    }
  }

  /* Pequeñas manchas minerales rompen la uniformidad de los campos. */
  const earthPatches = [
    [-15.0,-7.7,1.35,.62,.08],[-9.1,-8.7,1.05,.48,-.06],[10.3,-8.2,1.20,.52,.06],
    [14.7,-3.6,.92,.45,-.08],[-14.4,5.8,1.10,.50,.05],[-7.7,9.1,1.20,.48,.09],
    [8.7,8.6,1.30,.50,-.07],[15.0,6.8,.90,.45,.06]
  ];
  earthPatches.slice(0,low?3:quality==='balanced'?6:earthPatches.length).forEach(([x,z,sx,sz,rot],i) => {
    box(x,z,.056,sx,.010,sz,i%2?earth:earthDark,rot,MATERIAL.EARTH,false);
  });

  /* Delantal de suelo por oficio: la zona mantiene posición, pero el entorno inmediato cambia. */
  const zoneModel = window.AtelierVillageZones;
  const taxonomy = window.AtelierCraftTaxonomy;
  if (zoneModel && taxonomy) {
    const apron = {
      CERAMICS: [p9Mix(palette.gold,palette.roof,.42), MATERIAL.EARTH],
      TEXTILE: [p9Mix(palette.linen,palette.paperLight,.12), MATERIAL.STUCCO],
      JEWELRY: [p9Mix(palette.paperDeep,palette.gold,.18), MATERIAL.STONE],
      WOOD: [p9Mix(palette.trunk,palette.paperDeep,.14), MATERIAL.WOOD],
      FLORAL: [p9Mix(palette.green,palette.paperLight,.20), MATERIAL.VEGETATION],
      PAPER: [p9Mix(palette.paperDeep,palette.linen,.12), MATERIAL.STUCCO],
      CANDLE: [p9Mix(palette.paperDeep,palette.gold,.16), MATERIAL.STONE],
      LEATHER: [p9Mix(palette.roof,palette.gold,.18), MATERIAL.WOOD],
      FAN: [p9Mix(palette.wine,palette.paperLight,.20), MATERIAL.STUCCO],
      GLASS: [[.76,.84,.81,.42], MATERIAL.GLASS],
      NEUTRAL: [p9Mix(palette.paperDeep,palette.paperLight,.22), MATERIAL.STONE]
    };

    function typeFor(zone) {
      const config = zoneModel.configuration(zone.zoneKey);
      if (config?.workshopType) return config.workshopType;
      if (zone.existingPlace) {
        const place = webglInteractionPlaces?.[zone.existingPlace];
        return place?.workshopType || webglProviderByPlace?.get(zone.existingPlace)?.specialty || '';
      }
      const suffix = String(zone.zoneKey).slice(-2);
      const place = webglDynamicProviderPlaces?.[`zone-${suffix}`];
      return place?.workshopType || place?.provider?.specialty || '';
    }

    let count=0;
    for(const zone of zoneModel.registry) {
      const cfg=zoneModel.configuration(zone.zoneKey);
      if(cfg?.status==='HIDDEN') continue;
      const type=typeFor(zone);
      if(!type && !cfg?.displayLabel && !zone.existingPlace) continue;
      const resolved=taxonomy.resolve(type);
      const [color,kind]=apron[resolved.key]||apron.NEUTRAL;
      box(zone.x,zone.z+1.28*zone.scale,.064,.72*zone.scale,.010,.34*zone.scale,color,0,kind,false);
      count++;
      if(count >= (low?8:quality==='balanced'?16:26)) break;
    }
    root.dataset.landscapeCraftAprons=String(count);
  }

  root.dataset.landscapeDetails='true';
  root.dataset.landscapeDetailQuality=quality;
  root.dataset.webglPhase='u3.5c';
  if(status && !root.dataset.webglError) status.textContent=`U3.5C · paisaje detallado ${quality}`;
})();

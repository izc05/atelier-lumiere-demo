/* Atelier Lumière · U3.20 · casco antiguo compacto, calles y plazas */
(() => {
  if (!root || root.dataset.urbanDensity === 'u3.20') return;
  if (!window.AtelierVillageZones) return;
  if (typeof p9Box !== 'function' || typeof p9Roof !== 'function' || typeof p9Path !== 'function' || typeof p9Window !== 'function') return;
  if (typeof p9Add !== 'function' || !p9Meshes?.cylinder) return;

  const quality = typeof webglQualityMode === 'string' ? webglQualityMode : 'balanced';
  const mobile = window.matchMedia('(max-width:760px)').matches;
  const tablet = !mobile && window.matchMedia('(max-width:1050px)').matches;
  const houseBudget = quality === 'high' ? 20 : quality === 'balanced' ? 14 : 7;

  const stucco = [
    p9Mix(palette.paperLight, palette.paperDeep, .10),
    p9Mix(palette.paperLight, palette.gold, .055),
    p9Mix(palette.paperDeep, palette.paperLight, .72),
    p9Mix(palette.paperLight, palette.linen, .12)
  ];
  const roofs = [
    p9Mix(palette.roof, palette.wine, .08),
    p9Mix(palette.roof, palette.gold, .08),
    p9Mix(palette.roof, palette.ink, .05),
    p9Mix(palette.roof, palette.wineSoft, .10)
  ];
  const stone = p9Mix(palette.paperDeep, palette.roof, .20);
  const stoneWarm = p9Mix(palette.paperDeep, palette.gold, .12);
  const wood = p9Mix(palette.trunk, palette.ink, .12);
  const wine = p9Mix(palette.wine, palette.paperLight, .035);
  const warm = p9Mix(palette.gold, palette.paperLight, .02);
  const water = p9Mix(palette.green, palette.paperLight, .60, .86);

  const oldQuarter = [
    /* núcleo alrededor de Atelier */
    {x:-5.8,z:-5.7,s:.63,r:.08,v:0,t:1},{x:-2.2,z:-5.9,s:.58,r:-.06,v:2,t:1},
    {x:1.8,z:-5.5,s:.62,r:.05,v:1,t:2},{x:6.2,z:-5.6,s:.60,r:-.08,v:3,t:1},
    {x:-6.1,z:1.0,s:.62,r:-.05,v:1,t:2},{x:-5.3,z:4.0,s:.58,r:.07,v:3,t:1},
    {x:-1.7,z:4.1,s:.57,r:-.04,v:0,t:2},{x:2.5,z:4.0,s:.62,r:.06,v:2,t:1},
    {x:5.9,z:3.1,s:.64,r:-.08,v:1,t:2},{x:7.3,z:.7,s:.55,r:.04,v:0,t:1},
    /* calles intermedias oeste/este */
    {x:-10.4,z:3.4,s:.55,r:.08,v:2,t:1},{x:-10.5,z:-4.6,s:.56,r:-.05,v:1,t:1},
    {x:10.9,z:-4.4,s:.56,r:.07,v:3,t:2},{x:11.2,z:3.8,s:.58,r:-.06,v:0,t:1},
    {x:-9.2,z:.9,s:.50,r:-.08,v:1,t:1},{x:9.7,z:1.1,s:.50,r:.06,v:2,t:1},
    /* remate sur y norte */
    {x:-1.0,z:-7.7,s:.52,r:.03,v:3,t:1},{x:2.4,z:-7.5,s:.50,r:-.04,v:0,t:1},
    {x:7.0,z:-7.3,s:.52,r:.08,v:2,t:1},{x:-10.0,z:5.6,s:.50,r:.10,v:1,t:1}
  ];

  const created = [];

  function push(object, role = 'infill') {
    if (object) {
      object.urbanRole = role;
      created.push(object);
    }
    return object;
  }

  function localPoint(site, side, forward) {
    const cr = Math.cos(site.r || 0);
    const sr = Math.sin(site.r || 0);
    return [
      site.x + cr * side + sr * forward,
      site.z - sr * side + cr * forward
    ];
  }

  function facadeOpening(site, side, y, width, lit = true) {
    const s = site.s;
    const [, , depth] = [0, 0, .76 * s];
    const [x,z] = localPoint(site, side * s, depth + .026);
    const opening = push(p9Window(x,z,y*s,width*s,site.r,lit ? warm : p9Mix(palette.paperLight,palette.roof,.34)), 'window');
    if (opening) opening.lodAlways = false;
  }

  function door(site, side = 0) {
    const s = site.s;
    const [x,z] = localPoint(site, side*s, .79*s);
    return push(p9Box(x,z,.34*s,.18*s,.34*s,.036*s,wine,site.r,false), 'door');
  }

  function chimney(site, side = .40) {
    if (quality === 'lite') return;
    const s = site.s;
    const [x,z] = localPoint(site,side*s,-.12*s);
    push(p9Box(x,z,(site.t===2?2.13:1.72)*s,.09*s,.32*s,.09*s,stone,site.r,true),'chimney');
    push(p9Box(x,z,(site.t===2?2.48:2.07)*s,.12*s,.035*s,.12*s,stoneWarm,site.r,false),'chimney-cap');
  }

  function balcony(site) {
    if (quality !== 'high' || site.t !== 2) return;
    const s=site.s;
    const [x,z]=localPoint(site,0,.84*s);
    push(p9Box(x,z,1.34*s,.42*s,.035*s,.12*s,wood,site.r,false),'balcony');
    [-.34,0,.34].forEach((side)=>{
      const [px,pz]=localPoint(site,side*s,.94*s);
      push(p9Box(px,pz,1.49*s,.018*s,.15*s,.018*s,wood,site.r,false),'baluster');
    });
  }

  function annex(site,index) {
    if (quality === 'lite' || index % 3 === 2) return;
    const s=site.s;
    const side=index%2?-.90:.90;
    const [x,z]=localPoint(site,side*s,-.08*s);
    push(p9Box(x,z,.39*s,.38*s,.39*s,.52*s,stucco[(site.v+2)%stucco.length],site.r,true),'annex');
    push(p9Roof(x,z,.92*s,.44*s,.21*s,.60*s,roofs[(site.v+1)%roofs.length],site.r),'annex-roof');
  }

  function maison(site,index) {
    const s=site.s;
    const two=site.t===2 && quality!=='lite';
    const bodyY=two?.89:.64;
    const bodyH=two?.89:.64;
    const roofY=two?2.00:1.48;
    const roofH=two?.38:.32;
    const facade=stucco[site.v%stucco.length];
    const roof=roofs[site.v%roofs.length];

    push(p9Box(site.x,site.z,bodyY*s,.90*s,bodyH*s,.73*s,facade,site.r,true),'house');
    push(p9Roof(site.x,site.z,roofY*s,1.02*s,roofH*s,.86*s,roof,site.r),'roof');
    door(site,index%3===0?-.22:index%3===1?.20:0);
    facadeOpening(site,-.40,.82,.14,true);
    facadeOpening(site,.40,.82,.14,index%4!==0);
    if(two){
      facadeOpening(site,-.36,1.46,.13,index%3!==0);
      facadeOpening(site,.36,1.46,.13,true);
    }
    chimney(site,index%2?.42:-.42);
    balcony(site);
    annex(site,index);
  }

  function path(x,z,length,width,rotation,color=stoneWarm) {
    const object=push(p9Path(x,z,length,width,rotation,color),'street');
    if(object) object.lodAlways=true;
    return object;
  }

  function streetLamp(x,z,height=.84) {
    const pole=push(p9Box(x,z,height*.50,.025,height*.50,.025,wood,0,false),'lamp-post');
    const glow=push(p9Box(x,z,height+.08,.070,.085,.070,warm,0,false),'lamp-glow');
    if(pole) pole.lodAlways=false;
    if(glow) glow.lodAlways=false;
  }

  function centralPlaza() {
    const plaza=push(p9Box(.15,2.25,.082,2.25,.020,1.46,p9Mix(palette.paperDeep,palette.gold,.14),-.015,false),'plaza');
    if(plaza) plaza.lodAlways=true;

    /* Fuente central compacta, visible desde la vista general sin competir con Atelier. */
    push(p9Add(p9Meshes.cylinder,.20,2.45,.13,.43,.08,.43,stone,0,true),'fountain');
    push(p9Add(p9Meshes.cylinder,.20,2.45,.22,.31,.025,.31,water,0,false),'water');
    if(quality!=='lite'){
      push(p9Add(p9Meshes.cylinder,.20,2.45,.46,.09,.28,.09,stoneWarm,0,true),'fountain-column');
      push(p9Add(p9Meshes.cylinder,.20,2.45,.77,.17,.035,.17,stone,0,false),'fountain-bowl');
    }

    [[-1.75,1.28],[1.95,1.28],[-1.75,3.50],[1.95,3.50]].forEach(([x,z])=>streetLamp(x,z,tablet?.74:.84));
  }

  function streetNetwork() {
    /* Ejes anchos + callejones cortos: el pueblo se lee como tejido continuo, no como parcelas aisladas. */
    path(.10,2.25,7.15,.145,0,p9Mix(palette.road,palette.paperDeep,.16));
    path(.05,-2.15,4.45,.135,Math.PI/2,p9Mix(palette.road,palette.paperDeep,.13));
    path(-4.75,-1.65,3.35,.105,-.72,p9Mix(palette.road,palette.paperDeep,.10));
    path(4.75,-1.70,3.40,.105,.72,p9Mix(palette.road,palette.paperDeep,.10));
    path(-5.15,4.55,3.10,.095,.80,p9Mix(palette.road,palette.paperDeep,.12));
    path(5.15,4.45,3.15,.095,-.80,p9Mix(palette.road,palette.paperDeep,.12));

    if(quality==='high'){
      path(-8.4,-4.7,2.55,.075,-.08,stoneWarm);
      path(8.5,-4.65,2.55,.075,.08,stoneWarm);
      path(-8.1,3.1,2.35,.075,.04,stoneWarm);
      path(8.2,3.0,2.35,.075,-.04,stoneWarm);
    }
  }

  function thresholdSteps() {
    if(quality==='lite') return;
    const sets=[[-2.7,1.12,.04],[3.0,1.05,-.04],[-2.9,-3.5,.03],[3.1,-3.55,-.03]];
    sets.forEach(([x,z,r])=>{
      for(let i=0;i<3;i++){
        const px=x+Math.sin(r)*(i-.9)*.20;
        const pz=z+Math.cos(r)*(i-.9)*.20;
        push(p9Box(px,pz,.055+i*.018,.38,.020+i*.006,.12,stone,i*.01+r,false),'step');
      }
    });
  }

  streetNetwork();
  centralPlaza();
  thresholdSteps();
  oldQuarter.slice(0,houseBudget).forEach(maison);

  root.dataset.urbanDensity='u3.20';
  root.dataset.urbanDensityQuality=quality;
  root.dataset.urbanDensityHouses=String(Math.min(houseBudget,oldQuarter.length));
  root.dataset.urbanDensityObjects=String(created.length);
  root.dataset.urbanDensityMobile=mobile?'true':'false';
  root.dataset.webglPhase='u3.20';

  window.AtelierVillageUrbanDensity=Object.freeze({
    houses:()=>Math.min(houseBudget,oldQuarter.length),
    objects:()=>created.length,
    quality,
    oldQuarter:Object.freeze(oldQuarter.map((site)=>Object.freeze({...site})))
  });

  if(status&&!root.dataset.webglError){
    status.textContent=`U3.20 · casco antiguo compacto · ${Math.min(houseBudget,oldQuarter.length)} edificios de relleno · ${quality}`;
  }
})();
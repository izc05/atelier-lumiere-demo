/* Atelier Lumière · U3.40 · reconstrucción de siluetas y proporciones */
(() => {
  if (!root || root.dataset.silhouetteReconstruction === 'u3.40') return;
  if (!Array.isArray(objects) || !window.AtelierVillageUrbanDensity) return;
  if (typeof p9Box !== 'function' || typeof p9Roof !== 'function' || typeof p9Window !== 'function') return;

  const quality = typeof webglQualityMode === 'string' ? webglQualityMode : 'balanced';
  const sites = Array.isArray(window.AtelierVillageUrbanDensity.oldQuarter)
    ? window.AtelierVillageUrbanDensity.oldQuarter
    : [];
  const MATERIAL = window.AtelierMaterialTextures?.MATERIAL || Object.freeze({
    STUCCO:1, ROOF:2, STONE:3, WOOD:4, GLASS:5, METAL:6, EARTH:7, VEGETATION:8
  });
  const siteBudget = quality === 'high' ? 12 : quality === 'balanced' ? 8 : 4;
  const detailBudget = quality === 'high' ? 190 : quality === 'balanced' ? 116 : 56;
  const created = [];
  let removed = 0;
  let rebuilt = 0;

  const facadeTones = [
    p9Mix(palette.paperLight, palette.paperDeep, .10),
    p9Mix(palette.paperLight, palette.gold, .060),
    p9Mix(palette.paperDeep, palette.paperLight, .70),
    p9Mix(palette.paperLight, palette.linen, .14)
  ];
  const roofTones = [
    p9Mix(palette.roof, palette.wine, .11),
    p9Mix(palette.roof, palette.gold, .07),
    p9Mix(palette.roof, palette.ink, .065),
    p9Mix(palette.roof, palette.wineSoft, .12)
  ];
  const stone = typeof p9Stone !== 'undefined' ? p9Stone : p9Mix(palette.paperDeep, palette.roof, .22);
  const stoneDark = typeof p9StoneDark !== 'undefined' ? p9StoneDark : p9Mix(palette.paperDeep, palette.ink, .18);
  const wood = p9Mix(palette.trunk, palette.ink, .15);
  const warm = p9Mix(palette.gold, palette.paperLight, .03);
  const wine = p9Mix(palette.wine, palette.paperLight, .04);

  function hash(value) {
    let h = 2166136261;
    for (const char of String(value)) {
      h ^= char.charCodeAt(0);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0) / 4294967295;
  }

  function mark(object, role, material, always = false) {
    if (!object || created.length >= detailBudget) return null;
    object.urbanRole = role;
    object.u340Role = role;
    object.u340Silhouette = true;
    object.materialKind = material;
    object.u329MaterialExplicit = true;
    object.lodAlways = always;
    object.edges = quality === 'high' && ['house','roof','annex','annex-roof','chimney'].includes(role);
    created.push(object);
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

  function boxLocal(site, side, forward, y, sx, sy, sz, color, role, material, rotationOffset = 0, always = false) {
    if (created.length >= detailBudget) return null;
    const [x, z] = localPoint(site, side, forward);
    return mark(p9Box(x, z, y, sx, sy, sz, color, (site.r || 0) + rotationOffset, false), role, material, always);
  }

  function roofLocal(site, side, forward, y, sx, sy, sz, color, role = 'roof', rotationOffset = 0, always = false) {
    if (created.length >= detailBudget) return null;
    const [x, z] = localPoint(site, side, forward);
    return mark(p9Roof(x, z, y, sx, sy, sz, color, (site.r || 0) + rotationOffset), role, MATERIAL.ROOF, always);
  }

  function windowLocal(site, side, forward, y, width, lit = true, role = 'window') {
    if (created.length >= detailBudget) return null;
    const [x, z] = localPoint(site, side, forward);
    const object = p9Window(x, z, y, width, site.r || 0, lit ? warm : p9Mix(palette.paperLight, palette.roof, .34));
    return mark(object, role, MATERIAL.GLASS, false);
  }

  function doorLocal(site, side, forward, y, width, height) {
    return boxLocal(site, side, forward, y, width, height, .032 * site.s, wine, 'door', MATERIAL.WOOD, 0, true);
  }

  function chimneyLocal(site, side, forward, y, height, index) {
    if (quality === 'lite' && index > 1) return;
    boxLocal(site, side, forward, y, .080*site.s, height, .080*site.s, stone, 'chimney', MATERIAL.STONE);
    boxLocal(site, side, forward, y + height + .045*site.s, .105*site.s, .030*site.s, .105*site.s, stoneDark, 'chimney-cap', MATERIAL.STONE);
  }

  const removableRoles = new Set([
    'house','roof','door','window','chimney','chimney-cap','balcony','baluster','annex','annex-roof'
  ]);

  function removeOriginal(site) {
    const radius = Math.max(1.0, site.s * 1.85);
    for (let index = objects.length - 1; index >= 0; index -= 1) {
      const object = objects[index];
      if (!removableRoles.has(object?.urbanRole) || !object?.position || object.u340Silhouette) continue;
      const dx = object.position[0] - site.x;
      const dz = object.position[2] - site.z;
      if (Math.hypot(dx, dz) > radius) continue;
      objects.splice(index, 1);
      removed += 1;
    }
  }

  function cottageWithWing(site, index) {
    const s = site.s;
    const facade = facadeTones[site.v % facadeTones.length];
    const roof = roofTones[site.v % roofTones.length];
    const wingSide = index % 2 ? -.67 : .67;

    boxLocal(site, 0, 0, .60*s, .84*s, .60*s, .66*s, facade, 'house', MATERIAL.STUCCO, 0, true);
    roofLocal(site, 0, 0, 1.42*s, .97*s, .31*s, .78*s, roof, 'roof', 0, true);
    boxLocal(site, wingSide*s, -.07*s, .38*s, .31*s, .38*s, .48*s, facadeTones[(site.v+2)%facadeTones.length], 'annex', MATERIAL.STUCCO);
    roofLocal(site, wingSide*s, -.07*s, .88*s, .36*s, .19*s, .55*s, roofTones[(site.v+1)%roofTones.length], 'annex-roof');

    doorLocal(site, -.16*s, .69*s, .31*s, .15*s, .31*s);
    windowLocal(site, .34*s, .69*s, .69*s, .13*s, true);
    if (quality !== 'lite') windowLocal(site, -.46*s, .69*s, .72*s, .12*s, index%3!==0);
    chimneyLocal(site, index%2 ? .38*s : -.38*s, -.10*s, 1.58*s, .25*s, index);
  }

  function steppedTownhouse(site, index) {
    const s = site.s;
    const facade = facadeTones[site.v % facadeTones.length];
    const upper = facadeTones[(site.v+1)%facadeTones.length];
    const roof = roofTones[site.v % roofTones.length];
    const upperSide = index % 2 ? -.13 : .13;

    boxLocal(site, 0, 0, .68*s, .86*s, .68*s, .70*s, facade, 'house', MATERIAL.STUCCO, 0, true);
    boxLocal(site, upperSide*s, -.08*s, 1.42*s, .61*s, .36*s, .55*s, upper, 'annex', MATERIAL.STUCCO, 0, true);
    roofLocal(site, upperSide*s, -.08*s, 1.94*s, .72*s, .27*s, .66*s, roof, 'roof', 0, true);
    roofLocal(site, -upperSide*.65*s, .08*s, 1.26*s, .32*s, .11*s, .30*s, roofTones[(site.v+2)%roofTones.length], 'annex-roof');

    doorLocal(site, -.25*s, .73*s, .34*s, .15*s, .34*s);
    windowLocal(site, .30*s, .73*s, .79*s, .13*s, true);
    windowLocal(site, upperSide*s-.20*s, .50*s, 1.43*s, .12*s, index%3!==0);
    windowLocal(site, upperSide*s+.20*s, .50*s, 1.43*s, .12*s, true);
    chimneyLocal(site, upperSide*s+.34*s, -.14*s, 2.02*s, .25*s, index);
  }

  function twinGable(site, index) {
    const s = site.s;
    const facade = facadeTones[site.v % facadeTones.length];
    const facadeB = facadeTones[(site.v+3)%facadeTones.length];
    const roofA = roofTones[site.v % roofTones.length];
    const roofB = roofTones[(site.v+1)%roofTones.length];

    boxLocal(site, -.34*s, 0, .62*s, .50*s, .62*s, .68*s, facade, 'house', MATERIAL.STUCCO, -.012, true);
    boxLocal(site, .47*s, -.04*s, .52*s, .37*s, .52*s, .59*s, facadeB, 'annex', MATERIAL.STUCCO, .018, true);
    roofLocal(site, -.34*s, 0, 1.46*s, .58*s, .32*s, .80*s, roofA, 'roof', -.012, true);
    roofLocal(site, .47*s, -.04*s, 1.23*s, .44*s, .26*s, .69*s, roofB, 'annex-roof', .018);

    doorLocal(site, -.38*s, .72*s, .32*s, .14*s, .32*s);
    windowLocal(site, .05*s, .70*s, .72*s, .12*s, true);
    windowLocal(site, .50*s, .58*s, .62*s, .11*s, index%4!==0);
    chimneyLocal(site, -.58*s, -.08*s, 1.60*s, .24*s, index);
  }

  function cornerWorkshop(site, index) {
    const s = site.s;
    const facade = facadeTones[site.v % facadeTones.length];
    const roof = roofTones[site.v % roofTones.length];
    const porchSide = index%2 ? -.47 : .47;

    boxLocal(site, 0, 0, .66*s, .88*s, .66*s, .73*s, facade, 'house', MATERIAL.STUCCO, 0, true);
    roofLocal(site, 0, 0, 1.55*s, 1.00*s, .34*s, .86*s, roof, 'roof', 0, true);
    boxLocal(site, porchSide*s, .61*s, .31*s, .31*s, .31*s, .17*s, p9Mix(facade,palette.paperDeep,.08), 'annex', MATERIAL.STUCCO);
    roofLocal(site, porchSide*s, .66*s, .71*s, .38*s, .14*s, .27*s, p9Mix(roof,palette.linen,.10), 'annex-roof');
    boxLocal(site, porchSide*s-.24*s, .80*s, .28*s, .020*s, .28*s, .020*s, wood, 'infill', MATERIAL.WOOD);
    boxLocal(site, porchSide*s+.24*s, .80*s, .28*s, .020*s, .28*s, .020*s, wood, 'infill', MATERIAL.WOOD);

    doorLocal(site, -.19*s, .76*s, .34*s, .15*s, .34*s);
    windowLocal(site, .29*s, .75*s, .76*s, .13*s, true);
    if (quality === 'high') windowLocal(site, -.48*s, .75*s, .78*s, .11*s, index%3!==0);
    chimneyLocal(site, index%2 ? .40*s : -.40*s, -.10*s, 1.72*s, .26*s, index);
  }

  const selectedSites = sites
    .map((site, index) => ({ site, index, score: Math.hypot(site.x*.88, site.z*.76) }))
    .sort((a,b) => a.score - b.score)
    .slice(0, siteBudget);

  selectedSites.forEach(({site,index}, order) => {
    if (created.length >= detailBudget) return;
    removeOriginal(site);
    const type = (index + Math.floor(hash(`${site.x}:${site.z}`)*4)) % 4;
    if (type === 0) cottageWithWing(site, order);
    else if (type === 1) steppedTownhouse(site, order);
    else if (type === 2) twinGable(site, order);
    else cornerWorkshop(site, order);
    rebuilt += 1;
  });

  root.dataset.silhouetteReconstruction = 'u3.40';
  root.dataset.silhouetteReconstructionQuality = quality;
  root.dataset.silhouetteReconstructionSites = String(rebuilt);
  root.dataset.silhouetteReconstructionRemoved = String(removed);
  root.dataset.silhouetteReconstructionCreated = String(created.length);
  root.dataset.webglPhase = 'u3.40';

  window.AtelierVillageSilhouetteReconstruction = Object.freeze({
    quality,
    sites: () => rebuilt,
    removed: () => removed,
    created: () => created.length
  });

  if (status && !root.dataset.webglError) {
    status.textContent = `U3.40 · silueta urbana · ${rebuilt} casas reconstruidas · ${created.length} piezas`;
  }
})();
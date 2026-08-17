/* Atelier Lumière · U3.23 · escaparates, accesos y rótulos físicos por taller */
(() => {
  if (!root || root.dataset.workshopFrontages === 'u3.23') return;
  if (typeof p9Box !== 'function' || typeof p9Window !== 'function') return;
  if (!window.AtelierCraftTaxonomy) return;

  const taxonomy = window.AtelierCraftTaxonomy;
  const quality = typeof webglQualityMode === 'string' ? webglQualityMode : 'balanced';
  const mobile = window.matchMedia('(max-width:760px)').matches;
  const providerBudget = quality === 'high' ? 14 : quality === 'balanced' ? 10 : 6;
  const detailedBudget = quality === 'high' ? 10 : quality === 'balanced' ? 6 : 3;
  const pixelsEnabled = quality !== 'lite';

  const wine = p9Mix(palette.wine, palette.paperLight, .025);
  const wineSoft = p9Mix(palette.wine, palette.paperLight, .12);
  const gold = p9Mix(palette.gold, palette.paperLight, .12);
  const brass = p9Mix(palette.gold, palette.roof, .12);
  const stone = p9Mix(palette.paperDeep, palette.roof, .15);
  const timber = p9Mix(palette.trunk, palette.ink, .14);
  const linen = p9Mix(palette.linen, palette.paperLight, .20);
  const green = p9Mix(palette.green, palette.paperLight, .10);
  const glass = p9Mix(palette.green, palette.paperLight, .72, .84);
  const warm = [1.0, .64, .25, .94];

  const created = [];
  const storefronts = [];

  function track(object, role, placeName) {
    if (!object) return object;
    object.workshopFrontageRole = role;
    object.workshopFrontagePlace = placeName;
    created.push(object);
    return object;
  }

  function groundAt(x, z) {
    return typeof atelierTerrainHeight === 'function' ? atelierTerrainHeight(x, z) : 0;
  }

  function localPoint(config, side = 0, forward = 0) {
    const rotation = Number(config.rotation) || 0;
    const cr = Math.cos(rotation);
    const sr = Math.sin(rotation);
    return [
      config.x + cr * side + sr * forward,
      config.z - sr * side + cr * forward
    ];
  }

  function boxAt(config, side, forward, y, sx, sy, sz, color, role, edges = false) {
    const [x,z] = localPoint(config, side, forward);
    return track(
      p9Box(x, z, config.ground + y, sx, sy, sz, color, config.rotation || 0, edges),
      role,
      config.placeName
    );
  }

  function windowAt(config, side, forward, y, width, color = glass) {
    const [x,z] = localPoint(config, side, forward);
    const object = track(
      p9Window(x, z, config.ground + y, width, config.rotation || 0, color),
      'shop-window',
      config.placeName
    );
    if (object) object.lodAlways = false;
    return object;
  }

  const pixelFont = Object.freeze({
    A:['010','101','111','101','101'],
    C:['111','100','100','100','111'],
    F:['111','100','110','100','100'],
    G:['111','100','101','101','111'],
    I:['111','010','010','010','111'],
    J:['011','001','001','101','111'],
    L:['100','100','100','100','111'],
    N:['101','111','111','111','101'],
    P:['110','101','110','100','100'],
    S:['111','100','111','001','111'],
    T:['111','010','010','010','010'],
    V:['101','101','101','101','010'],
    W:['101','101','111','111','101'],
    Z:['111','001','010','100','111']
  });

  function brandPixels(config, text, options = {}) {
    if (!pixelsEnabled || !text) return 0;
    const chars = String(text).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, options.maxChars || 3).split('');
    if (!chars.length) return 0;
    const unit = (options.unit || .055) * config.s;
    const gap = unit * .72;
    const charWidth = unit * 3;
    const totalWidth = chars.length * charWidth + Math.max(0, chars.length - 1) * gap;
    const start = -totalWidth / 2 + unit / 2;
    let count = 0;

    chars.forEach((char, charIndex) => {
      const pattern = pixelFont[char];
      if (!pattern) return;
      pattern.forEach((row, rowIndex) => {
        [...row].forEach((cell, colIndex) => {
          if (cell !== '1') return;
          const side = start + charIndex * (charWidth + gap) + colIndex * unit;
          const y = options.y + (4 - rowIndex) * unit;
          const object = boxAt(
            config,
            side,
            options.forward,
            y,
            unit * .38,
            unit * .38,
            unit * .16,
            options.color || gold,
            'physical-brand-pixel',
            false
          );
          if (object) object.lodAlways = false;
          count += 1;
        });
      });
    });
    return count;
  }

  function signPanel(config, mark, options = {}) {
    const width = (options.width || .86) * config.s;
    const y = (options.y || 1.40) * config.s;
    const forward = (options.forward ?? config.front) * config.s;
    const panel = boxAt(
      config,
      0,
      forward,
      y,
      width,
      .17 * config.s,
      .035 * config.s,
      options.panelColor || wine,
      'physical-sign',
      true
    );
    if (panel) panel.lodAlways = true;

    boxAt(config, 0, forward + .012 * config.s, y + .205 * config.s, width * .88, .018 * config.s, .012 * config.s, gold, 'sign-trim');
    boxAt(config, 0, forward + .012 * config.s, y - .205 * config.s, width * .88, .018 * config.s, .012 * config.s, gold, 'sign-trim');
    brandPixels(config, mark, {
      y: y / config.s - .11,
      forward: forward / config.s + .045,
      unit: options.pixelUnit || .052,
      maxChars: options.maxChars || 3,
      color: options.brandColor || gold
    });
  }

  function doorway(config, options = {}) {
    const s = config.s;
    const forward = (options.forward ?? config.front) * s;
    const width = (options.width || .28) * s;
    const height = (options.height || .54) * s;
    const y = (options.y || .58) * s;
    boxAt(config, 0, forward, y, width, height, .038*s, options.doorColor || wine, 'shop-door');
    boxAt(config, -(width + .055*s), forward + .010*s, y, .024*s, height + .08*s, .020*s, gold, 'door-frame');
    boxAt(config, width + .055*s, forward + .010*s, y, .024*s, height + .08*s, .020*s, gold, 'door-frame');
    boxAt(config, 0, forward + .010*s, y + height + .075*s, width + .08*s, .024*s, .020*s, gold, 'door-frame');
    boxAt(config, width*.42, forward + .045*s, y, .018*s, .018*s, .016*s, gold, 'door-handle');
  }

  function displayWindows(config, options = {}) {
    const s = config.s;
    const forward = (options.forward ?? config.front) * s;
    const y = (options.y || .66) * s;
    const side = (options.side || .52) * s;
    const width = (options.width || .18) * s;
    windowAt(config, -side, forward, y, width, options.color || glass);
    windowAt(config, side, forward, y, width, options.color || glass);

    [-side, side].forEach((offset) => {
      boxAt(config, offset, forward + .012*s, y + .44*s, width*1.35, .018*s, .018*s, gold, 'window-header');
      boxAt(config, offset, forward + .012*s, y - .44*s, width*1.35, .018*s, .018*s, brass, 'window-sill');
    });
  }

  function awning(config, options = {}) {
    if (options.disabled) return;
    const s = config.s;
    const forward = (options.forward ?? config.front) * s + .16*s;
    const y = (options.y || 1.12) * s;
    const width = (options.width || .88) * s;
    const color = options.color || wineSoft;
    const canopy = boxAt(config, 0, forward, y, width, .035*s, .20*s, color, 'awning', false);
    if (canopy) canopy.lodAlways = true;

    if (quality !== 'lite') {
      const stripes = 5;
      for (let i=0;i<stripes;i++) {
        const t = stripes === 1 ? .5 : i/(stripes-1);
        const side = (-width*.78) + (width*1.56)*t;
        boxAt(config, side, forward + .17*s, y - .045*s, width*.07, .045*s, .018*s, i%2 ? gold : linen, 'awning-stripe');
      }
    }
  }

  function sconces(config, options = {}) {
    const s = config.s;
    const forward = (options.forward ?? config.front) * s + .035*s;
    const side = (options.side || .76) * s;
    const y = (options.y || 1.06) * s;
    [-side, side].forEach((offset) => {
      boxAt(config, offset, forward, y, .030*s, .18*s, .030*s, timber, 'wall-sconce');
      const glow = boxAt(config, offset, forward + .025*s, y + .16*s, .065*s, .075*s, .028*s, warm, 'wall-sconce-glow');
      if (glow) glow.lodAlways = false;
    });
  }

  function approach(config) {
    const s = config.s;
    const forward = config.front * s + .62*s;
    const [x,z] = localPoint(config, 0, forward);
    const path = track(
      p9Box(x, z, config.ground + .055, .48*s, .016, .56*s, p9Mix(palette.road, palette.paperLight, .10), config.rotation || 0, false),
      'shop-threshold',
      config.placeName
    );
    if (path) path.lodAlways = true;
  }

  function familyMark(key) {
    return ({
      CERAMICS:'C', TEXTILE:'T', JEWELRY:'J', WOOD:'W', FLORAL:'F', PAPER:'P',
      CANDLE:'V', LEATHER:'L', FAN:'A', GLASS:'G', NEUTRAL:'N'
    })[key] || 'N';
  }

  function familyAccent(config, key, detailed = true) {
    if (!detailed) return;
    const s = config.s;
    const f = config.front*s + .52*s;
    const y = .22*s;

    if (key === 'CERAMICS' && typeof p9Meshes !== 'undefined' && p9Meshes.cylinder) {
      [-.72, .72].forEach((side, index) => {
        const [x,z] = localPoint(config, side*s, f);
        track(p9Add(p9Meshes.cylinder, x, z, config.ground + y, .11*s, .16*s, .11*s, index ? brass : stone, 0, true), 'craft-display', config.placeName);
      });
      return;
    }

    if (key === 'TEXTILE') {
      [-.22,0,.22].forEach((side,index)=>boxAt(config, side*s, f, .54*s, .055*s, .36*s, .018*s, index%2 ? linen : wineSoft, 'craft-display'));
      return;
    }

    if (key === 'JEWELRY') {
      [-.62,.62].forEach((side)=>{
        boxAt(config, side*s, f, .30*s, .18*s, .035*s, .14*s, stone, 'craft-plinth');
        boxAt(config, side*s, f, .39*s, .075*s, .055*s, .075*s, gold, 'craft-display');
      });
      return;
    }

    if (key === 'WOOD') {
      [-.70,.70].forEach((side)=>[-.12,0,.12].forEach((dy)=>boxAt(config, side*s, f, (.34+dy)*s, .18*s, .028*s, .045*s, timber, 'craft-display')));
      return;
    }

    if (key === 'FLORAL') {
      [-.68,.68].forEach((side)=>{
        boxAt(config, side*s, f, .14*s, .24*s, .10*s, .16*s, stone, 'craft-planter');
        boxAt(config, side*s, f, .31*s, .18*s, .13*s, .12*s, green, 'craft-display');
      });
      return;
    }

    if (key === 'PAPER') {
      [-.68,.68].forEach((side,index)=>{
        [-.06,.05,.16].forEach((dy,j)=>boxAt(config, side*s, f, (.34+dy)*s, .18*s, .018*s, .025*s, j===1 ? gold : linen, 'craft-display'));
      });
      return;
    }

    if (key === 'CANDLE') {
      [-.66,0,.66].forEach((side,index)=>boxAt(config, side*s, f, (.29+index*.05)*s, .055*s, .17*s, .055*s, warm, 'craft-display'));
      return;
    }

    if (key === 'LEATHER') {
      [-.68,.68].forEach((side)=>boxAt(config, side*s, f, .37*s, .19*s, .24*s, .020*s, p9Mix(palette.roof,palette.wine,.20), 'craft-display'));
      return;
    }

    if (key === 'FAN') {
      [-.24,-.12,0,.12,.24].forEach((side,index)=>boxAt(config, side*s, f, (.38+Math.abs(index-2)*.045)*s, .020*s, .25*s, .018*s, index%2 ? gold : wineSoft, 'craft-display'));
      return;
    }

    if (key === 'GLASS') {
      [-.66,.66].forEach((side)=>boxAt(config, side*s, f, .48*s, .24*s, .32*s, .018*s, glass, 'craft-display'));
    }
  }

  function storefront(config, options = {}) {
    const family = options.family || 'NEUTRAL';
    const mark = options.mark || familyMark(family);
    const detailed = options.detailed !== false;

    signPanel(config, mark, {
      width: options.signWidth || .86,
      y: options.signY || 1.40,
      forward: options.signForward ?? config.front,
      panelColor: options.panelColor || wine,
      pixelUnit: options.pixelUnit || .052,
      maxChars: options.maxChars || 3
    });
    doorway(config, {
      forward: options.doorForward ?? config.front,
      y: options.doorY || .58,
      height: options.doorHeight || .54,
      width: options.doorWidth || .28,
      doorColor: options.doorColor || wine
    });
    displayWindows(config, {
      forward: options.windowForward ?? config.front,
      y: options.windowY || .66,
      side: options.windowSide || .52,
      width: options.windowWidth || .18,
      color: options.windowColor || glass
    });
    awning(config, {
      disabled: options.awning === false,
      forward: options.awningForward ?? config.front,
      y: options.awningY || 1.12,
      width: options.awningWidth || .88,
      color: options.awningColor || wineSoft
    });
    sconces(config, {
      forward: options.sconceForward ?? config.front,
      y: options.sconceY || 1.04,
      side: options.sconceSide || .76
    });
    approach(config);
    familyAccent(config, family, detailed);
    storefronts.push({ placeName: config.placeName, family, mark, landmark: Boolean(options.landmark) });
  }

  /* Hitos fundacionales: marca propia y proporciones específicas. */
  const landmarks = [
    {
      placeName:'atelier', x:0, z:0, s:1.18, ground:groundAt(0,0), front:1.34, rotation:0,
      options:{ family:'NEUTRAL', mark:'AL', landmark:true, signWidth:.76, signY:1.49, signForward:1.36, pixelUnit:.050, maxChars:2, awning:false, doorForward:1.38, windowForward:1.38, windowSide:.43, windowWidth:.14, sconceSide:.61, sconceForward:1.38 }
    },
    {
      placeName:'izc', x:-11, z:7, s:1.16, ground:groundAt(-11,7), front:.43, rotation:0,
      options:{ family:'FAN', mark:'IZC', landmark:true, signWidth:1.36, signY:1.54, signForward:.46, pixelUnit:.046, maxChars:3, awningY:1.20, awningWidth:1.34, awningForward:.48, doorForward:.49, windowForward:.47, windowSide:.78, windowWidth:.24, sconceSide:1.26, sconceForward:.48 }
    },
    {
      placeName:'stitch', x:12, z:-7, s:1.12, ground:groundAt(12,-7), front:.26, rotation:0,
      options:{ family:'TEXTILE', mark:'TGS', landmark:true, signWidth:1.30, signY:1.38, signForward:.29, pixelUnit:.044, maxChars:3, panelColor:p9Mix(palette.wine,palette.linen,.10), awningColor:linen, awningY:1.09, awningWidth:1.26, awningForward:.32, doorForward:.31, windowForward:.29, windowSide:.70, windowWidth:.22, sconceSide:1.15, sconceForward:.30 }
    }
  ];
  landmarks.forEach(({ options, ...config }) => storefront(config, options));

  /* Talleres reales de las parcelas: misma gramática, identidad derivada del oficio. */
  const dynamicEntries = typeof webglDynamicProviderPlaces !== 'undefined'
    ? Object.entries(webglDynamicProviderPlaces)
        .filter(([, config]) => Boolean(config?.provider) && Array.isArray(config?.point))
        .slice(0, providerBudget)
    : [];

  dynamicEntries.forEach(([placeName, place], index) => {
    const x = Number(place.point?.[0]);
    const z = Number(place.point?.[2]);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    const inferredScale = Array.isArray(place.scale) && Number(place.scale[0]) > 0 ? Number(place.scale[0]) / 2 : .72;
    const family = taxonomy.resolve(place.workshopType || place.provider?.specialty || '').key;
    const config = {
      placeName,
      x,
      z,
      s: inferredScale,
      ground: groundAt(x,z),
      front: .93,
      rotation: 0
    };
    storefront(config, {
      family,
      mark: familyMark(family),
      maxChars: 1,
      pixelUnit: .058,
      signWidth: .78,
      signY: 1.34,
      awningY: 1.04,
      awningWidth: .78,
      windowSide: .48,
      windowWidth: .16,
      sconceSide: .70,
      detailed: index < detailedBudget
    });
  });

  root.dataset.workshopFrontages = 'u3.23';
  root.dataset.workshopFrontageQuality = quality;
  root.dataset.workshopFrontageCount = String(storefronts.length);
  root.dataset.workshopFrontageObjects = String(created.length);
  root.dataset.workshopFrontageProviders = String(dynamicEntries.length);
  root.dataset.workshopFrontagePixels = pixelsEnabled ? 'true' : 'false';
  root.dataset.webglPhase = 'u3.23';

  window.AtelierVillageWorkshopFrontages = Object.freeze({
    count: () => storefronts.length,
    objects: () => created.length,
    providers: () => dynamicEntries.length,
    quality,
    storefronts: Object.freeze(storefronts.map((entry)=>Object.freeze({...entry})))
  });

  if (status && !root.dataset.webglError) {
    status.textContent = `U3.23 · fachadas de taller con identidad física · ${storefronts.length} escaparates · ${quality}`;
  }
})();

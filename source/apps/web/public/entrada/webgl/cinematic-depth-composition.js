/* Atelier Lumière · U3.25 · profundidad cinematográfica y planos hero por taller */
(() => {
  if (!root || root.dataset.cinematicDepthComposition === 'u3.25') return;
  if (typeof camera === 'undefined' || typeof places === 'undefined' || typeof p9CameraProfile !== 'function') return;

  const styleHref = '/entrada/webgl/cinematic-depth-composition.css';
  if (!document.querySelector(`link[href="${styleHref}"]`)) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = styleHref;
    link.dataset.u325CinematicDepth = '';
    document.head.append(link);
  }

  const quality = typeof webglQualityMode === 'string' ? webglQualityMode : 'balanced';
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const mobileMq = window.matchMedia('(max-width:760px)');
  const tabletMq = window.matchMedia('(min-width:761px) and (max-width:1050px)');
  const taxonomy = window.AtelierCraftTaxonomy;

  const originalTargets = new Map();
  const heroStates = new Map();
  let overlayRaf = 0;

  function viewportMode() {
    if (mobileMq.matches) return 'mobile';
    if (tabletMq.matches) return 'tablet';
    return 'desktop';
  }

  function selectedPlace() {
    return typeof webglSelectedPlace === 'string' ? webglSelectedPlace : 'overview';
  }

  function dynamicPlace(name) {
    return typeof webglDynamicProviderPlaces !== 'undefined' ? webglDynamicProviderPlaces?.[name] : null;
  }

  function familyFor(name) {
    if (name === 'izc') return 'FAN';
    if (name === 'stitch') return 'TEXTILE';
    if (name === 'atelier') return 'NEUTRAL';
    const dynamic = dynamicPlace(name);
    return taxonomy?.resolve?.(dynamic?.workshopType || dynamic?.provider?.specialty || '')?.key || 'NEUTRAL';
  }

  function placeScale(name) {
    const dynamic = dynamicPlace(name);
    if (Array.isArray(dynamic?.scale) && Number(dynamic.scale[0]) > 0) return Math.max(.58, Math.min(1.08, Number(dynamic.scale[0]) / 2));
    if (name === 'atelier') return 1.18;
    if (name === 'izc') return 1.16;
    if (name === 'stitch') return 1.12;
    return .76;
  }

  function familyBias(family) {
    return ({
      CERAMICS:{yaw:-.030,pitch:-.005,side:-.08},
      TEXTILE:{yaw:.022,pitch:.010,side:.10},
      JEWELRY:{yaw:-.018,pitch:-.018,side:.05},
      WOOD:{yaw:.032,pitch:.000,side:-.10},
      FLORAL:{yaw:-.025,pitch:.016,side:.12},
      PAPER:{yaw:.018,pitch:.006,side:-.06},
      CANDLE:{yaw:-.010,pitch:-.015,side:.04},
      LEATHER:{yaw:.028,pitch:.004,side:-.08},
      FAN:{yaw:-.020,pitch:-.008,side:.10},
      GLASS:{yaw:.016,pitch:-.020,side:-.04},
      NEUTRAL:{yaw:0,pitch:0,side:0}
    })[family] || {yaw:0,pitch:0,side:0};
  }

  function landmarkState(name, mode) {
    const states = {
      desktop:{
        atelier:{target:[-.30,.46,.62],distance:13.55,yaw:.626,pitch:.585},
        izc:{target:[-10.72,.40,7.38],distance:11.55,yaw:.892,pitch:.610},
        stitch:{target:[11.72,.38,-6.58],distance:11.65,yaw:.565,pitch:.620}
      },
      tablet:{
        atelier:{target:[-.22,.42,.52],distance:14.10,yaw:.650,pitch:.620},
        izc:{target:[-10.78,.36,7.30],distance:12.05,yaw:.878,pitch:.638},
        stitch:{target:[11.76,.34,-6.64],distance:12.15,yaw:.580,pitch:.646}
      },
      mobile:{
        atelier:{target:[-.12,.34,.42],distance:15.15,yaw:.685,pitch:.660},
        izc:{target:[-10.84,.30,7.24],distance:12.75,yaw:.858,pitch:.678},
        stitch:{target:[11.82,.30,-6.70],distance:12.85,yaw:.602,pitch:.688}
      }
    };
    return states[mode]?.[name] || null;
  }

  function dynamicState(name, mode) {
    const place = places?.[name];
    const source = originalTargets.get(name) || (Array.isArray(place?.target) ? [...place.target] : null);
    if (!source) return null;
    const scale = placeScale(name);
    const family = familyFor(name);
    const bias = familyBias(family);
    const x = Number(source[0]) || 0;
    const z = Number(source[2]) || 0;
    const sideSign = x === 0 ? (z >= 0 ? 1 : -1) : Math.sign(x);
    const frontLift = mode === 'mobile' ? .26 : mode === 'tablet' ? .32 : .38;
    const sideShift = (mode === 'mobile' ? .06 : .12) * sideSign + bias.side * scale;
    const target = [x - sideShift, (Number(source[1]) || 0) + frontLift * scale, z + .28 * scale];

    const horizontal = Math.max(-.135, Math.min(.135, x * .0078));
    const depth = Math.max(-.040, Math.min(.040, z * .0028));
    const modePitch = mode === 'mobile' ? .675 : mode === 'tablet' ? .642 : .612;
    const modeDistance = mode === 'mobile' ? 13.20 : mode === 'tablet' ? 12.45 : 11.85;
    return {
      target,
      distance: modeDistance + (1 - scale) * .75,
      yaw: .742 + horizontal + bias.yaw,
      pitch: modePitch - depth + bias.pitch,
      family
    };
  }

  function overviewState(mode) {
    if (mode === 'mobile') return {target:[.18,.10,.30],distance:22.75,yaw:.760,pitch:.660};
    if (mode === 'tablet') return {target:[-.02,.10,.42],distance:26.85,yaw:.800,pitch:.668};
    return {target:[-.10,.12,.52],distance:27.90,yaw:.810,pitch:.655};
  }

  function rememberTargets() {
    Object.entries(places).forEach(([name, place]) => {
      if (!originalTargets.has(name) && Array.isArray(place?.target)) originalTargets.set(name, [...place.target]);
    });
  }

  function rebuildHeroStates() {
    rememberTargets();
    heroStates.clear();
    const mode = viewportMode();
    heroStates.set('overview', overviewState(mode));

    ['atelier','izc','stitch'].forEach((name) => {
      const state = landmarkState(name, mode);
      if (state) heroStates.set(name, state);
    });

    Object.keys(places).forEach((name) => {
      if (heroStates.has(name) || name === 'overview') return;
      const state = dynamicState(name, mode);
      if (state) heroStates.set(name, state);
    });

    for (const [name, state] of heroStates) {
      const place = places?.[name];
      if (!place) continue;
      place.target = [...state.target];
      place.distance = state.distance;
    }
  }

  const previousProfile = p9CameraProfile;
  p9CameraProfile = function u325CameraProfile(name, target) {
    const state = heroStates.get(name);
    if (state) return { yaw: state.yaw, pitch: state.pitch };
    return previousProfile(name, target);
  };

  function applyOverview({ immediate = false } = {}) {
    const state = heroStates.get('overview');
    if (!state || selectedPlace() !== 'overview') return;
    if (root.dataset.spatialOrbit === 'true' || root.dataset.cinematicCamera === 'true') return;
    camera.desired = [...state.target];
    camera.desiredDistance = state.distance;
    if (immediate || reduced.matches) {
      camera.target = [...state.target];
      camera.distance = state.distance;
      camera.yaw = state.yaw;
      camera.pitch = state.pitch;
    }
  }

  /* Skyline secundario: volumen oscuro, nunca interactivo y sin textura remota. */
  const skyline = [];
  function addSkyline() {
    if (quality === 'lite' || typeof p9Box !== 'function') return;
    const count = quality === 'high' ? 9 : 6;
    const darkWall = p9Mix(palette.wine, palette.ink, .68);
    const darkRoof = p9Mix(palette.roof, palette.ink, .72);
    const glow = [1.0,.58,.20,.48];
    const positions = [
      [-18.2,-17.6,.76],[-13.8,-18.5,.62],[-8.7,-18.0,.70],[-3.8,-19.0,.60],
      [2.0,-18.7,.72],[7.4,-18.1,.64],[12.5,-18.9,.70],[17.2,-17.4,.60],[21.0,-15.8,.54]
    ].slice(0,count);
    positions.forEach(([x,z,s], index) => {
      const h = (.46 + (index % 3) * .11) * s;
      const body = p9Box(x,z,h,.58*s,h,.48*s,darkWall,(index%2?-.035:.035),false);
      if (body) { body.u325Skyline = true; body.lodAlways = false; skyline.push(body); }
      if (typeof p9Roof === 'function') {
        const roof = p9Roof(x,z,h*2+.14*s,.66*s,.20*s,.56*s,darkRoof,(index%2?-.035:.035));
        if (roof) { roof.u325Skyline = true; roof.lodAlways = false; skyline.push(roof); }
      }
      if (quality === 'high' && index % 3 === 1) {
        const window = p9Box(x + .12*s,z + .49*s,h*.92,.08*s,.11*s,.012*s,glow,0,false);
        if (window) { window.u325SkylineWindow = true; window.lodAlways = false; skyline.push(window); }
      }
    });
  }

  const layer = document.createElement('div');
  layer.className = 'u325-cinematic-depth';
  layer.setAttribute('aria-hidden','true');
  (canvas?.parentElement || root).append(layer);

  function placePoint(name) {
    if (!name || name === 'overview') return null;
    const base = typeof webglInteractionPlaces !== 'undefined' ? webglInteractionPlaces?.[name] : null;
    if (Array.isArray(base?.point)) return base.point;
    const dynamic = dynamicPlace(name);
    if (Array.isArray(dynamic?.point)) return dynamic.point;
    const state = heroStates.get(name);
    return state ? [state.target[0], state.target[1] + .55, state.target[2]] : null;
  }

  function syncOverlay() {
    overlayRaf = 0;
    if (document.hidden) return;
    const selected = selectedPlace();
    if (selected === 'overview') {
      layer.classList.remove('is-focused');
      return;
    }
    const point = placePoint(selected);
    const projected = point && typeof webglProjectPoint === 'function' ? webglProjectPoint(point) : null;
    if (projected?.visible) {
      const rect = root.getBoundingClientRect();
      const x = Math.max(0,Math.min(rect.width,projected.x-rect.left));
      const y = Math.max(0,Math.min(rect.height,projected.y-rect.top));
      layer.style.setProperty('--u325-x',`${x.toFixed(1)}px`);
      layer.style.setProperty('--u325-y',`${y.toFixed(1)}px`);
      layer.classList.add('is-focused');
    } else {
      layer.classList.remove('is-focused');
    }
    if (selectedPlace() !== 'overview') overlayRaf = requestAnimationFrame(syncOverlay);
  }

  function startOverlay() {
    if (overlayRaf) cancelAnimationFrame(overlayRaf);
    overlayRaf = requestAnimationFrame(syncOverlay);
  }

  root.addEventListener('atelier:village-focus', startOverlay);
  root.addEventListener('atelier:village-back', () => {
    if (overlayRaf) cancelAnimationFrame(overlayRaf);
    overlayRaf = 0;
    layer.classList.remove('is-focused');
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && overlayRaf) {
      cancelAnimationFrame(overlayRaf);
      overlayRaf = 0;
    } else if (!document.hidden && selectedPlace() !== 'overview') {
      startOverlay();
    }
  });

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      rebuildHeroStates();
      applyOverview({ immediate: false });
      if (selectedPlace() !== 'overview') startOverlay();
    }, 140);
  }, { passive:true });

  rebuildHeroStates();
  addSkyline();
  applyOverview({ immediate:true });
  if (selectedPlace() !== 'overview') startOverlay();

  root.dataset.cinematicDepthComposition = 'u3.25';
  root.dataset.cinematicDepthQuality = quality;
  root.dataset.cinematicDepthHeroCount = String(heroStates.size - 1);
  root.dataset.cinematicDepthSkyline = String(skyline.length);
  root.dataset.webglPhase = 'u3.25';

  window.AtelierVillageCinematicDepth = Object.freeze({
    state: (name) => heroStates.get(name) ? { ...heroStates.get(name), target:[...heroStates.get(name).target] } : null,
    count: () => heroStates.size,
    skyline: () => skyline.length,
    refresh: () => { rebuildHeroStates(); applyOverview({ immediate:false }); },
    quality
  });

  if (status && !root.dataset.webglError) {
    status.textContent = `U3.25 · profundidad cinematográfica · ${Math.max(0,heroStates.size-1)} planos hero · ${quality}`;
  }
})();

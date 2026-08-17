/* Atelier Lumière · U3.21 · luz de calle, fachadas y jerarquía nocturna */
(() => {
  if (!root || root.dataset.nightLifeLighting === 'u3.21') return;
  if (typeof objects === 'undefined' || typeof webglProjectPoint !== 'function') return;
  if (typeof p9Box !== 'function') return;

  const quality = typeof webglQualityMode === 'string' ? webglQualityMode : 'balanced';
  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const urban = window.AtelierVillageUrbanDensity;
  const sites = Array.isArray(urban?.oldQuarter) ? urban.oldQuarter : [];
  const siteBudget = quality === 'high' ? 20 : quality === 'balanced' ? 14 : 7;
  const facadeBudget = quality === 'high' ? 8 : quality === 'balanced' ? 5 : 2;
  const dynamicWorkshopBudget = quality === 'high' ? 4 : quality === 'balanced' ? 2 : 1;

  const styleHref = '/entrada/webgl/night-life-lighting.css';
  if (!document.querySelector(`link[href="${styleHref}"]`)) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = styleHref;
    link.dataset.u321NightLife = '';
    document.head.append(link);
  }

  const clamp01 = (value) => Math.min(1, Math.max(0, value));
  const nightRoof = [.105, .055, .050, 1];
  const nightRoofWarm = [.145, .070, .058, 1];
  const warmWindow = [1.0, .66, .28, .94];
  const warmWindowSoft = [.92, .54, .20, .82];

  function tuneColor(source, multiply, lift = 0) {
    if (!Array.isArray(source) || source.length < 3) return source;
    return [
      clamp01(source[0] * multiply + lift),
      clamp01(source[1] * multiply + lift * .78),
      clamp01(source[2] * multiply + lift * .62),
      source[3] ?? 1
    ];
  }

  /*
   * El casco U3.20 ya etiqueta sus piezas por función. Aquí se separan mejor
   * tejados, fachadas y luces antes del tone-mapping nocturno U3.18.
   */
  for (const object of objects) {
    switch (object?.urbanRole) {
      case 'roof':
      case 'annex-roof':
        object.color = tuneColor(object.color, .72, .008);
        break;
      case 'house':
      case 'annex':
        object.color = tuneColor(object.color, .88, .012);
        break;
      case 'window':
      case 'lamp-glow':
        object.color = object.urbanRole === 'window' ? [...warmWindow] : [...warmWindowSoft];
        break;
      case 'door':
        object.color = tuneColor(object.color, .76, .012);
        break;
      case 'street':
      case 'plaza':
        object.color = tuneColor(object.color, .76, .006);
        break;
      default:
        break;
    }
  }

  const ridgeObjects = [];
  function addRidge(site, index) {
    if (!site || !Number.isFinite(site.x) || !Number.isFinite(site.z)) return;
    const s = Number(site.s) || .55;
    const twoStorey = site.t === 2 && quality !== 'lite';
    const y = (twoStorey ? 2.27 : 1.72) * s;
    const color = index % 3 === 0 ? nightRoofWarm : nightRoof;
    const ridge = p9Box(site.x, site.z, y, .70 * s, .024 * s, .026 * s, color, Number(site.r) || 0, false);
    if (ridge) {
      ridge.urbanRole = 'roof-ridge';
      ridge.lodAlways = true;
      ridgeObjects.push(ridge);
    }

    if (quality === 'high' && index % 4 === 0) {
      const eave = p9Box(site.x, site.z + .69 * s, (twoStorey ? 1.76 : 1.18) * s, .78 * s, .018 * s, .025 * s, nightRoofWarm, Number(site.r) || 0, false);
      if (eave) {
        eave.urbanRole = 'roof-eave';
        ridgeObjects.push(eave);
      }
    }
  }
  sites.slice(0, siteBudget).forEach(addRidge);

  const canvasParent = canvas?.parentElement || root;
  const layer = document.createElement('div');
  layer.className = 'u321-night-life';
  layer.setAttribute('aria-hidden', 'true');
  canvasParent.append(layer);

  const worldLights = [];
  const glowNodes = new Map();

  function terrainPoint(x, z, height = .24) {
    const ground = typeof atelierTerrainHeight === 'function' ? atelierTerrainHeight(x, z) : 0;
    return [x, ground + height, z];
  }

  function addWorldLight(id, point, kind = 'street', strength = 1) {
    if (!Array.isArray(point) || point.length < 3) return;
    worldLights.push({ id, point, kind, strength });
  }

  /* Plaza y ejes: luz ambiental suave, no focos gigantes. */
  addWorldLight('plaza-centro', terrainPoint(.20, 2.45, .34), 'plaza', 1.18);
  addWorldLight('calle-oeste', terrainPoint(-4.7, 2.25, .28), 'street', .92);
  addWorldLight('calle-este', terrainPoint(4.8, 2.25, .28), 'street', .92);
  addWorldLight('calle-sur', terrainPoint(.05, -3.8, .28), 'street', .84);
  if (quality !== 'lite') {
    addWorldLight('calle-noroeste', terrainPoint(-6.2, 4.55, .25), 'street', .76);
    addWorldLight('calle-noreste', terrainPoint(6.2, 4.45, .25), 'street', .76);
    addWorldLight('calle-suroeste', terrainPoint(-6.0, -4.6, .25), 'street', .74);
    addWorldLight('calle-sureste', terrainPoint(6.1, -4.5, .25), 'street', .74);
  }

  /* Los tres hitos fundacionales siempre ganan jerarquía visual. */
  const landmarks = [
    ['atelier', webglInteractionPlaces?.atelier?.point, 1.55],
    ['izc', webglInteractionPlaces?.izc?.point, 1.25],
    ['stitch', webglInteractionPlaces?.stitch?.point, 1.25]
  ];
  landmarks.forEach(([id, point, strength]) => addWorldLight(`workshop-${id}`, point, 'workshop', strength));

  /* Talleres reales adicionales: pocos halos y solo según presupuesto. */
  Object.entries(webglDynamicProviderPlaces || {})
    .filter(([, config]) => Array.isArray(config?.point))
    .slice(0, dynamicWorkshopBudget)
    .forEach(([name, config], index) => addWorldLight(`provider-${name}`, config.point, 'workshop', 1.05 - index * .06));

  /* Algunas fachadas del casco antiguo reciben una respiración cálida independiente. */
  sites.slice(0, facadeBudget).forEach((site, index) => {
    const s = Number(site.s) || .55;
    const r = Number(site.r) || 0;
    const forward = .86 * s;
    const x = site.x + Math.sin(r) * forward;
    const z = site.z + Math.cos(r) * forward;
    addWorldLight(`fachada-${index}`, terrainPoint(x, z, (site.t === 2 ? .90 : .68) * s), 'facade', .68 + (index % 3) * .05);
  });

  function ensureGlow(light) {
    let node = glowNodes.get(light.id);
    if (node) return node;
    node = document.createElement('i');
    node.className = 'u321-world-light';
    node.dataset.lightId = light.id;
    node.dataset.lightKind = light.kind;
    node.style.setProperty('--u321-strength', String(light.strength));
    layer.append(node);
    glowNodes.set(light.id, node);
    return node;
  }
  worldLights.forEach(ensureGlow);

  let raf = 0;
  let active = !document.hidden;
  let frame = 0;

  function update() {
    raf = 0;
    if (!active) return;
    frame += 1;
    if (quality === 'lite' && frame % 2 === 1) {
      raf = requestAnimationFrame(update);
      return;
    }

    const rect = root.getBoundingClientRect();
    const selected = typeof webglSelectedPlace === 'string' ? webglSelectedPlace : 'overview';

    for (const light of worldLights) {
      const node = ensureGlow(light);
      const screen = webglProjectPoint(light.point);
      if (!screen?.visible) {
        node.style.opacity = '0';
        continue;
      }
      const x = screen.x - rect.left;
      const y = screen.y - rect.top;
      const inside = x > -180 && x < rect.width + 180 && y > -160 && y < rect.height + 160;
      if (!inside) {
        node.style.opacity = '0';
        continue;
      }
      node.style.setProperty('--u321-x', `${x.toFixed(1)}px`);
      node.style.setProperty('--u321-y', `${y.toFixed(1)}px`);
      node.style.opacity = '';

      const placeName = light.id.startsWith('workshop-') ? light.id.slice('workshop-'.length) : '';
      const providerName = light.id.startsWith('provider-') ? light.id.slice('provider-'.length) : '';
      node.classList.toggle('is-selected', selected !== 'overview' && (selected === placeName || selected === providerName));
      node.classList.toggle('is-overview', selected === 'overview');
    }
    raf = requestAnimationFrame(update);
  }

  document.addEventListener('visibilitychange', () => {
    active = !document.hidden;
    if (!active && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    } else if (active && !raf) {
      raf = requestAnimationFrame(update);
    }
  });

  if (reducedMotionQuery.matches) layer.dataset.reducedMotion = 'true';
  raf = requestAnimationFrame(update);

  root.dataset.nightLifeLighting = 'u3.21';
  root.dataset.nightLifeQuality = quality;
  root.dataset.nightLifeWorldLights = String(worldLights.length);
  root.dataset.nightLifeRoofRidges = String(ridgeObjects.length);
  root.dataset.webglPhase = 'u3.21';

  window.AtelierVillageNightLife = Object.freeze({
    lights: () => worldLights.length,
    roofRidges: () => ridgeObjects.length,
    quality
  });

  if (status && !root.dataset.webglError) {
    status.textContent = `U3.21 · calles y fachadas encendidas · ${worldLights.length} puntos de luz · ${quality}`;
  }
})();

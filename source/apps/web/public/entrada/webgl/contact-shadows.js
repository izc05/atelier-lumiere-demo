/* Atelier Lumière · U3.5E · sombras de contacto ligeras */
(() => {
  if (!root || typeof p9AddContactShadow !== 'function') return;

  const quality = typeof webglQualityMode === 'string' ? webglQualityMode : 'balanced';
  const zoneModel = window.AtelierVillageZones;
  const light = typeof p9LightDirection !== 'undefined' ? p9LightDirection : [-.42,.88,.31];
  const horizontal = Math.hypot(light[0], light[2]) || 1;
  const shadowX = -(light[0] / horizontal);
  const shadowZ = -(light[2] / horizontal);
  const budget = quality === 'high' ? 26 : quality === 'balanced' ? 18 : 9;
  let count = 0;

  function visibleZone(zone) {
    const config = zoneModel?.configuration?.(zone.zoneKey);
    if (config?.status === 'HIDDEN') return false;
    if (zone.existingPlace) return true;
    if (config?.workshopType || config?.displayLabel || config?.providerSlug || config?.status === 'ACTIVE') return true;
    const suffix = String(zone.zoneKey || '').slice(-2);
    return Boolean(webglDynamicProviderPlaces?.[`zone-${suffix}`]);
  }

  function addZoneShadow(zone, index) {
    const s = zone.scale || 1;
    const signature = zone.family === 'SIGNATURE';
    const offset = (signature ? .30 : .20) * s;
    const x = zone.x + shadowX * offset;
    const z = zone.z + shadowZ * offset;
    const sx = (signature ? 1.70 : 1.16) * s;
    const sz = (signature ? 1.38 : .94) * s;
    const rotation = signature ? (zone.zoneKey === 'ZONE_01' ? -.06 : .05) : ((index % 3) - 1) * .025;
    const alpha = signature ? .050 : quality === 'high' ? .034 : quality === 'balanced' ? .029 : .024;
    const before = objects.length;
    p9AddContactShadow(x, z, sx, sz, rotation, alpha);
    const shadow = objects[objects.length - 1];
    if (shadow && objects.length > before) {
      shadow.u35ContactShadow = true;
      shadow.edges = false;
    }
    count += 1;
  }

  if (zoneModel?.registry) {
    const candidates = zoneModel.registry.filter(visibleZone);
    candidates.slice(0,budget).forEach(addZoneShadow);
  }

  /* Atelier central recibe una segunda sombra direccional muy suave para separar los pabellones del patio. */
  if (quality !== 'lite') {
    const before = objects.length;
    p9AddContactShadow(shadowX*.34, .15 + shadowZ*.34, 4.25, 2.92, -.018, quality === 'high' ? .027 : .022);
    const shadow = objects[objects.length - 1];
    if (shadow && objects.length > before) {
      shadow.u35ContactShadow = true;
      shadow.edges = false;
    }
    count += 1;
  }

  /* Árboles de primer plano: unas pocas manchas estrechas anclan la vegetación al suelo. */
  const treeShadowPoints = [
    [-15.4,-9.2],[-14.3,-8.2],[14.8,9.1],[13.8,8.4],[-5.4,-2.65],[6.9,3.7],[-3.1,8.6],[4.3,-8.5]
  ];
  const treeBudget = quality === 'high' ? treeShadowPoints.length : quality === 'balanced' ? 4 : 0;
  treeShadowPoints.slice(0,treeBudget).forEach(([x,z],index) => {
    const before = objects.length;
    p9AddContactShadow(x+shadowX*.18,z+shadowZ*.18,.36+(index%2)*.06,.18,.12,quality==='high'?.020:.016);
    const shadow = objects[objects.length - 1];
    if (shadow && objects.length > before) {
      shadow.u35ContactShadow = true;
      shadow.edges = false;
    }
    count += 1;
  });

  root.dataset.contactShadows='u3.5e';
  root.dataset.contactShadowCount=String(count);
  root.dataset.contactShadowQuality=quality;
  root.dataset.webglPhase='u3.5e';
  if(status && !root.dataset.webglError) status.textContent=`U3.5E · ${count} sombras de contacto · ${quality}`;
})();

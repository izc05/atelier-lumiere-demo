/* Atelier Lumière · U3.1 · ventanas, faroles y densidad cálida */
(() => {
  const styleHref = '/entrada/webgl/warm-village.css';
  if (!document.querySelector(`link[href="${styleHref}"]`)) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = styleHref;
    document.head.append(link);
  }

  const quality = typeof webglQualityMode === 'string' ? webglQualityMode : 'balanced';
  const warm = hex('#f2b45e');
  const warmSoft = [1.0, .61, .25, .58];
  const warmDim = [1.0, .51, .19, .26];
  const darkMetal = hex('#4a3429');
  const annexPaper = mix3(palette.paperDeep, palette.roof, .10);
  const annexRoof = mix3(palette.roof, palette.wine, .18);

  const terrainY = (x, z, offset = 0) => atelierTerrainHeight(x, z) + offset;

  function addWindow(x, z, y, sx, sy, rotation = 0, glow = true) {
    add(meshes.box, [x, terrainY(x, z, y), z], [sx, sy, .028], warm, rotation, false);
    if (glow && quality === 'high') {
      add(meshes.box, [x, terrainY(x, z, y), z], [sx * 1.45, sy * 1.40, .018], warmDim, rotation, false);
    }
  }

  function lightHouse(x, z, s, index) {
    const frontZ = z + .875 * s;
    const y = .70 * s;
    const spread = .40 * s;
    addWindow(x - spread, frontZ, y, .13 * s, .18 * s, 0, index % 3 === 0);
    addWindow(x + spread, frontZ, y, .13 * s, .18 * s, 0, index % 4 === 0);
    if (quality === 'high' && index % 2 === 0) {
      const sideX = x + 1.07 * s;
      addWindow(sideX, z - .24 * s, y, .12 * s, .16 * s, Math.PI / 2, false);
    }
  }

  const houseLimit = quality === 'high' ? houses.length : quality === 'balanced' ? 16 : 8;
  houses.slice(0, houseLimit).forEach(([x, z, s], index) => lightHouse(x, z, s, index));

  /* Los tres destinos principales reciben un ritmo luminoso propio. */
  [-1.18, -.62, .62, 1.18].forEach((x, index) => addWindow(x, 1.37, .77, .16, .24, 0, index % 2 === 0));
  [-12.12, -11.55, -10.45, -9.88].forEach((x, index) => addWindow(x, 8.12, .69, .15, .22, 0, index === 1));
  [10.85, 11.48, 12.52, 13.15].forEach((x, index) => addWindow(x, -5.92, .69, .15, .22, 0, index === 2));

  function lamp(x, z, h = .72) {
    p9Box(x, z, h * .5, .035, h * .5, .035, darkMetal, 0, false);
    p9Box(x, z, h + .08, .095, .09, .095, warmSoft, Math.PI / 4, false);
    if (quality === 'high') p9Box(x, z, h + .07, .17, .035, .17, warmDim, Math.PI / 4, false);
  }

  const lamps = [
    [-2.7, 2.4], [2.7, 2.4], [-2.25, -2.1], [2.25, -2.1],
    [-8.7, 5.1], [-12.8, 5.0], [9.5, -5.0], [14.5, -5.0],
    [-5.4, -.35], [5.8, .4], [-.45, 6.3], [.4, -6.0]
  ];
  const lampLimit = quality === 'high' ? lamps.length : quality === 'balanced' ? 8 : 4;
  lamps.slice(0, lampLimit).forEach(([x, z]) => lamp(x, z));

  /* Pequeños anexos ocupan huecos reales sin convertir la escena en una masa uniforme. */
  const annexes = [
    [-14.4, -6.7, .54, -.05], [-6.4, -8.2, .48, .08], [7.0, -8.3, .52, -.05],
    [15.4, 1.2, .48, .07], [-14.2, 7.2, .50, -.08], [7.2, 7.4, .50, .06],
    [-6.3, 5.7, .45, -.04], [13.5, 5.4, .46, .05]
  ];
  const annexLimit = quality === 'high' ? 8 : quality === 'balanced' ? 5 : 2;
  annexes.slice(0, annexLimit).forEach(([x, z, s, rotation], index) => {
    p9Box(x, z, .34 * s / .5, .62 * s, .34 * s / .5, .48 * s, [...annexPaper, 1], rotation, true);
    p9Roof(x, z, .91 * s / .5, .70 * s, .20 * s / .5, .58 * s, [...annexRoof, 1], rotation);
    addWindow(x + .18 * s, z + .50 * s, .42 * s / .5, .085, .11, rotation, index % 2 === 0);
  });

  /* La paleta base conserva el dibujo, pero recupera teja y piedra más cálidas. */
  const warmRoof = mix3(palette.roof, hex('#9f5638'), .30);
  palette.roof[0] = warmRoof[0];
  palette.roof[1] = warmRoof[1];
  palette.roof[2] = warmRoof[2];
  const warmRoad = mix3(palette.road, hex('#9d7a61'), .12);
  palette.road[0] = warmRoad[0];
  palette.road[1] = warmRoad[1];
  palette.road[2] = warmRoad[2];

  const brand = document.querySelector('.webgl-village-brand img');
  if (brand) brand.src = '/assets/brand/atelier-logo-official-light.svg';

  if (root) {
    root.dataset.webglWarmLife = 'true';
    root.dataset.webglPhase = 'u3.1';
  }
  if (status) status.textContent = 'Pueblo Atelier · luz cálida activa';
})();

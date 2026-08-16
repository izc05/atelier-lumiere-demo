/* Pueblo Atelier · P10.1 · Maison Atelier Lumière protagonista */

(() => {
  if (typeof p9Box !== 'function' || typeof p9Roof !== 'function' || typeof p9Add !== 'function') return;

  const mobile = window.matchMedia('(max-width: 760px)').matches;
  const tablet = !mobile && window.matchMedia('(max-width: 1050px)').matches;
  const lowDetail = mobile || Number(navigator.deviceMemory || 8) <= 4;

  const paper = p9Mix(palette.paperLight, palette.paperDeep, .10);
  const stone = p9Mix(palette.paperDeep, palette.gold, .08);
  const stoneWarm = p9Mix(palette.paperDeep, palette.wine, .055);
  const wine = p9V4(palette.wine);
  const wineRoof = p9Mix(palette.wine, palette.roof, .12);
  const gold = p9V4(palette.gold);
  const garden = p9Mix(palette.green, palette.paperLight, .22);
  const water = p9Mix(palette.green, palette.paperLight, .70);

  function pavilion(x, z, rotation = 0, scale = 1) {
    p9Box(x, z, .58 * scale, .78 * scale, .58 * scale, .66 * scale, paper, rotation, true);
    p9Roof(x, z, 1.40 * scale, .90 * scale, .34 * scale, .78 * scale, wineRoof, rotation);

    const frontX = x + Math.sin(rotation) * .69 * scale;
    const frontZ = z + Math.cos(rotation) * .69 * scale;
    p9Box(frontX, frontZ, .52 * scale, .18 * scale, .48 * scale, .035 * scale, wine, rotation, false);

    [-.36, .36].forEach((side) => {
      const wx = x + Math.cos(rotation) * side * scale + Math.sin(rotation) * .675 * scale;
      const wz = z - Math.sin(rotation) * side * scale + Math.cos(rotation) * .675 * scale;
      p9Window(wx, wz, .70 * scale, .13 * scale, rotation, gold);
    });
  }

  function column(x, z, height = .84, radius = .055) {
    p9Add(p9Meshes.cylinder, x, z, height * .5 + .13, radius, height * .5, radius, stoneWarm, 0, true);
    p9Add(p9Meshes.cylinder, x, z, .145, radius * 1.45, .035, radius * 1.45, stone, 0, false);
    p9Add(p9Meshes.cylinder, x, z, height + .15, radius * 1.35, .03, radius * 1.35, gold, 0, false);
  }

  function colonnade(x1, x2, z, count = 7) {
    const usable = Math.max(2, count);
    for (let i = 0; i < usable; i++) {
      const t = usable === 1 ? .5 : i / (usable - 1);
      column(mix(x1, x2, t), z, .76, .045);
    }
    p9Box((x1 + x2) / 2, z, .98, Math.abs(x2 - x1) / 2 + .12, .07, .11, stone, 0, true);
    p9Box((x1 + x2) / 2, z, 1.10, Math.abs(x2 - x1) / 2 + .20, .06, .18, wineRoof, 0, true);
  }

  function hedgeSquare(x, z, sx, sz) {
    p9Hedge(x, z - sz, sx, 0, .12);
    p9Hedge(x, z + sz, sx, 0, .12);
    p9Hedge(x - sx, z, sz, Math.PI / 2, .12);
    p9Hedge(x + sx, z, sz, Math.PI / 2, .12);
  }

  /* 1 · Silueta exterior: dos pabellones hacen que Atelier lea como finca y no como casa. */
  pavilion(-4.15, .35, -.035, .92);
  pavilion(4.15, .35, .035, .92);

  /* 2 · Galerías porticadas que cosen los pabellones con la maison central. */
  colonnade(-3.42, -1.28, 1.02, lowDetail ? 4 : 6);
  colonnade(1.28, 3.42, 1.02, lowDetail ? 4 : 6);

  /* 3 · Linterna principal octogonal: la firma visual de Atelier desde vista aérea. */
  p9Box(0, -.10, 2.58, .70, .42, .63, paper, 0, true);
  p9Add(p9Meshes.cylinder, 0, -.10, 3.23, .56, .34, .56, p9Mix(palette.paperLight, palette.gold, .08), 0, true);
  p9Add(meshes.cone, 0, -.10, 3.88, .67, .34, .67, wine, 0, true);
  p9Add(p9Meshes.cylinder, 0, -.10, 4.30, .075, .20, .075, gold, 0, true);
  p9Add(meshes.cone, 0, -.10, 4.58, .16, .18, .16, gold, 0, false);

  /* Ventanas de la linterna: oro tenue en lugar de paneles UI flotantes. */
  if (!lowDetail) {
    [[0,.47],[.42,.20],[.42,-.36],[0,-.58],[-.42,-.36],[-.42,.20]].forEach(([dx,dz], i) => {
      p9Box(dx, -.10 + dz, 3.24, .085, .16, .025, i % 2 ? p9Gold : gold, i * Math.PI / 3, false);
    });
  }

  /* 4 · Gran eje de llegada desde el camino principal. */
  p9Path(0, 5.15, 2.25, .24, Math.PI / 2, p9Mix(palette.road, palette.paperLight, .22));
  p9Path(0, 7.65, 1.35, .16, Math.PI / 2, p9Mix(palette.road, palette.gold, .06));
  p9Stair(0, 1.72, 1.38, .30, lowDetail ? 4 : 6, 0);

  /* 5 · Plaza de llegada: dos estanques bajos y una fuente axial. */
  p9Box(-1.55, 4.48, .085, 1.00, .022, .53, p9Mix(palette.paperDeep, palette.gold, .15), 0, false);
  p9Box(1.55, 4.48, .085, 1.00, .022, .53, p9Mix(palette.paperDeep, palette.gold, .15), 0, false);
  p9Box(-1.55, 4.48, .112, .78, .012, .35, water, 0, false);
  p9Box(1.55, 4.48, .112, .78, .012, .35, water, 0, false);
  p9Add(p9Meshes.cylinder, 0, 4.46, .17, .32, .055, .32, stone, 0, true);
  p9Add(p9Meshes.cylinder, 0, 4.46, .28, .19, .035, .19, water, 0, false);
  p9Add(p9Meshes.cylinder, 0, 4.46, .52, .045, .25, .045, gold, 0, false);

  /* 6 · Jardines simétricos. En móvil quedan en dos cuadros; PC suma cuatro. */
  hedgeSquare(-3.25, 4.55, .82, .72);
  hedgeSquare(3.25, 4.55, .82, .72);
  if (!lowDetail) {
    hedgeSquare(-3.25, 6.42, .72, .62);
    hedgeSquare(3.25, 6.42, .72, .62);
  }

  /* Árboles de acceso: pocos, altos y simétricos para reforzar perspectiva. */
  if (typeof tree === 'function') {
    const rows = tablet || mobile ? [[-4.7,5.7],[4.7,5.7],[-4.4,7.8],[4.4,7.8]] : [
      [-5.0,4.1],[5.0,4.1],[-4.85,5.75],[4.85,5.75],[-4.55,7.45],[4.55,7.45]
    ];
    rows.forEach(([x,z], index) => tree(x, z, index % 2 ? .72 : .82));
  }

  /* 7 · Pequeño pórtico de entrada, visible al terminar el travelling. */
  column(-.62, 1.43, .92, .05);
  column(.62, 1.43, .92, .05);
  p9Box(0, 1.43, 1.16, .78, .07, .10, stone, 0, true);
  p9Roof(0, 1.43, 1.36, .88, .14, .22, wine, 0);

  /* Perfil de cámara específico P10.1: más bajo y heroico al llegar a Atelier. */
  if (typeof p9CameraProfile === 'function') {
    const baseProfile = p9CameraProfile;
    p9CameraProfile = function p10CameraProfile(name, target) {
      if (name === 'atelier') {
        const compact = window.matchMedia('(max-width: 760px)').matches;
        return { yaw: compact ? .70 : .655, pitch: compact ? .745 : .675 };
      }
      return baseProfile(name, target);
    };
  }

  if (root) {
    root.dataset.atelierMaison = 'p10.1';
    root.dataset.webglPhase = 'p10.1';
  }

  window.setTimeout(() => {
    const label = document.querySelector('.webgl-village-heading > span');
    if (label) label.textContent = 'P10.1 · Maison Atelier Lumière';
    if (status && !root?.dataset.webglError) {
      status.textContent = 'P10.1 · Atelier Lumière ya domina la plaza central';
    }
  }, 160);
})();

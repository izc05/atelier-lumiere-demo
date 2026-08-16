/* Pueblo Atelier · P10.4 · Paisaje de autor */

(() => {
  if (typeof p9Box !== 'function' || typeof p9Path !== 'function' || typeof p9Wall !== 'function') return;

  const mobile = window.matchMedia('(max-width: 760px)').matches;
  const tablet = !mobile && window.matchMedia('(max-width: 1050px)').matches;
  const lowDetail = mobile || Number(navigator.deviceMemory || 8) <= 4;

  const stone = p9Mix(palette.paperDeep, palette.roof, .14);
  const stoneLight = p9Mix(palette.paperDeep, palette.paperLight, .26);
  const garden = p9Mix(palette.green, palette.paperLight, .25);
  const gardenDark = p9Mix(palette.greenDark, palette.paperLight, .18);
  const earth = p9Mix(palette.paperDeep, palette.gold, .08);
  const water = p9Mix(palette.green, palette.paperLight, .67);
  const roadLight = p9Mix(palette.road, palette.paperLight, .22);

  function orchard(cx, cz, cols, rows, spacingX, spacingZ, scale = .55) {
    if (typeof tree !== 'function') return;
    const max = lowDetail ? Math.min(cols * rows, 4) : tablet ? Math.min(cols * rows, 7) : cols * rows;
    let count = 0;
    for (let r = 0; r < rows && count < max; r++) {
      for (let c = 0; c < cols && count < max; c++) {
        const x = cx + (c - (cols - 1) / 2) * spacingX + Math.sin((c + 1) * (r + 2)) * .10;
        const z = cz + (r - (rows - 1) / 2) * spacingZ + Math.cos((r + 1) * (c + 2)) * .08;
        tree(x, z, scale + ((c + r) % 3) * .06);
        count += 1;
      }
    }
  }

  function terrace(x, z, length, rotation, rows = 3, spacing = .58) {
    const usableRows = lowDetail ? Math.min(rows, 2) : rows;
    for (let i = 0; i < usableRows; i++) {
      const offset = (i - (usableRows - 1) / 2) * spacing;
      const dx = -Math.sin(rotation) * offset;
      const dz = Math.cos(rotation) * offset;
      p9Wall(x + dx, z + dz, length, rotation, i % 2 ? stoneLight : stone);
      p9Box(x + dx - Math.sin(rotation) * .17, z + dz + Math.cos(rotation) * .17, .115, length * .90, .018, .21, i % 2 ? garden : earth, rotation, false);
    }
  }

  function steppingPath(x, z, length, rotation, count = 7) {
    const usable = lowDetail ? Math.max(4, Math.ceil(count * .58)) : count;
    for (let i = 0; i < usable; i++) {
      const t = usable === 1 ? .5 : i / (usable - 1);
      const along = mix(-length, length, t);
      const px = x + Math.sin(rotation) * along + Math.sin(i * 1.9) * .08;
      const pz = z + Math.cos(rotation) * along + Math.cos(i * 1.7) * .06;
      p9Box(px, pz, .09, .28, .018, .18, i % 2 ? stoneLight : p9Mix(stone, palette.paperLight, .28), rotation + (i % 2 ? .035 : -.035), false);
    }
  }

  /* 1 · Bancales periféricos: rompen el borde rectangular del terreno. */
  terrace(-13.8, -5.2, 2.65, -.10, 4, .62);
  terrace(13.6, 5.7, 2.55, .08, 4, .62);
  terrace(-6.4, -10.9, 2.35, .04, 3, .58);
  if (!lowDetail) terrace(7.3, 10.7, 2.45, -.05, 3, .58);

  /* 2 · Huertos/arboledas: pequeñas masas, no un bosque genérico. */
  orchard(-15.4, -9.2, 3, 3, 1.05, 1.02, .48);
  orchard(14.8, 9.1, 3, 2, 1.08, 1.00, .50);
  if (!mobile) orchard(3.8, 10.8, 2, 2, .92, .92, .44);

  /* 3 · Camino secundario entre Atelier e IZC con losas irregulares. */
  steppingPath(-5.3, 3.3, 4.4, -.96, 9);
  p9Path(-6.1, 3.65, 4.4, .08, -.96, roadLight);

  /* 4 · Sendero más blando hacia el estudio textil. */
  steppingPath(6.0, -3.6, 4.9, .94, 10);
  if (!lowDetail) {
    p9Hedge(5.35, -5.05, 1.05, .94, .10);
    p9Hedge(7.05, -3.35, .90, .94, .10);
  }

  /* 5 · Cauces bajos en el sur: tres piezas para sugerir una línea natural. */
  const stream = [
    [-11.2,-11.4,5.4,.16,-.08],
    [0,-10.8,6.1,.18,.04],
    [11.6,-10.25,5.6,.16,.10]
  ];
  stream.forEach(([x,z,sx,sz,rot]) => {
    p9Box(x, z, .045, sx, .018, sz, water, rot, false);
    p9Box(x, z - .24, .065, sx * .98, .014, .045, stoneLight, rot, false);
    p9Box(x, z + .24, .065, sx * .98, .014, .045, stoneLight, rot, false);
  });

  /* 6 · Pasarela estrecha donde el camino cruza el cauce. */
  const bridgeX = 3.1;
  const bridgeZ = -10.6;
  p9Box(bridgeX, bridgeZ, .20, .62, .075, .48, p9Mix(palette.paperDeep, palette.trunk, .18), -.03, true);
  p9Box(bridgeX - .61, bridgeZ, .38, .025, .25, .48, stone, -.03, true);
  p9Box(bridgeX + .61, bridgeZ, .38, .025, .25, .48, stone, -.03, true);
  if (!lowDetail) {
    [-.44,-.15,.15,.44].forEach((dx) => p9Box(bridgeX + dx, bridgeZ, .285, .012, .08, .50, p9Mix(palette.gold, palette.trunk, .25), -.03, false));
  }

  /* 7 · Dos pequeñas plazas de transición en cruces secundarios. */
  [[-5.4,-3.2,.12],[6.1,4.2,-.08]].forEach(([x,z,rot], index) => {
    p9Box(x, z, .078, .86, .018, .70, index ? p9Mix(palette.paperDeep, palette.linen, .16) : p9Mix(palette.paperDeep, palette.gold, .10), rot, false);
    p9Add(p9Meshes.cylinder, x, z, .16, .14, .055, .14, stone, 0, true);
    if (!lowDetail && typeof tree === 'function') {
      tree(x - .92, z + .56, .43);
      tree(x + .88, z - .50, .40);
    }
  });

  /* 8 · Muros bajos que acompañan caminos sin encerrarlos. */
  const walls = lowDetail ? [
    [-7.3,1.55,1.25,-.94],[7.6,-1.55,1.30,.92]
  ] : [
    [-7.3,1.55,1.25,-.94],[-8.9,2.75,.82,-.94],[7.6,-1.55,1.30,.92],[9.0,-2.75,.86,.92],[-2.6,8.85,1.15,.02],[2.7,8.85,1.15,-.02]
  ];
  walls.forEach(([x,z,length,rot], index) => p9Wall(x, z, length, rot, index % 2 ? stoneLight : stone));

  /* 9 · Pequeñas bandas de cultivo para introducir ritmo gráfico a vista aérea. */
  const strips = lowDetail ? 4 : 8;
  for (let i = 0; i < strips; i++) {
    const side = i % 2 ? 1 : -1;
    const row = Math.floor(i / 2);
    const x = side * (15.2 - row * .55);
    const z = 1.5 + row * 1.28;
    p9Box(x, z, .055, .62, .010, .20, i % 3 ? garden : earth, side * .08, false);
  }

  if (root) {
    root.dataset.authoredLandscape = 'p10.4';
    root.dataset.webglPhase = 'p10.4';
  }

  window.setTimeout(() => {
    const label = document.querySelector('.webgl-village-heading > span');
    if (label) label.textContent = 'P10.4 · Paisaje de autor';
    if (status && !root?.dataset.webglError) {
      status.textContent = 'P10.4 · el territorio conecta ya los talleres como un lugar continuo';
    }
  }, 220);
})();

/* Pueblo Atelier · P10.3 · Estudio The Gentle Stitch */

(() => {
  if (typeof p9Box !== 'function' || typeof p9Roof !== 'function' || typeof p9Add !== 'function') return;

  const x = 12;
  const z = -7;
  const mobile = window.matchMedia('(max-width: 760px)').matches;
  const lowDetail = mobile || Number(navigator.deviceMemory || 8) <= 4;

  const paper = p9Mix(palette.paperLight, palette.linen, .08);
  const linen = p9V4(palette.linen);
  const linenLight = p9Mix(palette.linen, palette.paperLight, .52);
  const wine = p9Mix(palette.wine, palette.paperLight, .12);
  const gold = p9Mix(palette.gold, palette.paperLight, .18);
  const garden = p9Mix(palette.green, palette.paperLight, .26);
  const glass = p9Mix(palette.green, palette.paperLight, .78);
  const stone = p9Mix(palette.paperDeep, palette.linen, .18);

  /* 1 · Nave de estudio alargada: lenguaje horizontal, sereno y luminoso. */
  p9Box(x, z - .55, .62, 2.28, .62, .78, paper, -.018, true);
  p9Roof(x - 1.42, z - .55, 1.48, .88, .30, .90, linen, -.018);
  p9Roof(x, z - .55, 1.58, .88, .36, .90, p9Mix(palette.linen, palette.wine, .10), -.018);
  p9Roof(x + 1.42, z - .55, 1.70, .88, .42, .90, wine, -.018);

  /* 2 · Fachada de taller: grandes paños claros y ritmo de montantes finos. */
  p9Box(x - .82, z + .24, .70, .60, .50, .035, glass, 0, false);
  p9Box(x + .66, z + .24, .70, .60, .50, .035, glass, 0, false);
  p9Box(x + 1.72, z + .24, .60, .27, .60, .045, wine, 0, false);

  const mullions = lowDetail ? [-1.25,0,1.25] : [-1.58,-1.05,-.52,0,.52,1.05,1.58];
  mullions.forEach((dx, index) => {
    p9Box(x + dx, z + .265, .72, .025, .55, .025, index % 2 ? linen : gold, 0, false);
  });

  /* 3 · Dos pabellones pequeños: almacén de material y mesa de acabados. */
  p9Box(x - 3.18, z - .15, .42, .62, .42, .60, paper, -.045, true);
  p9Roof(x - 3.18, z - .15, 1.02, .72, .24, .70, linenLight, -.045);
  p9Box(x + 3.10, z + .02, .46, .66, .46, .62, paper, .045, true);
  p9Roof(x + 3.10, z + .02, 1.10, .76, .25, .72, p9Mix(palette.linen, palette.wine, .13), .045);

  /* 4 · Patio de trabajo y pérgola: una retícula inspirada en urdimbre/trama. */
  p9Courtyard(x, z + 2.65, 2.55, 1.15, 0);
  const pergolaZ = z + 2.15;
  const xThreads = lowDetail ? [-1.75,-.58,.58,1.75] : [-2.05,-1.36,-.68,0,.68,1.36,2.05];
  xThreads.forEach((dx, index) => {
    p9Box(x + dx, pergolaZ, .78, .034, .78, .034, index % 2 ? linen : wine, 0, false);
  });
  const zThreads = lowDetail ? [-.76,0,.76] : [-.96,-.48,0,.48,.96];
  zThreads.forEach((dz, index) => {
    p9Box(x, pergolaZ + dz, 1.54, 2.12, .028, .030, index % 2 ? linenLight : gold, 0, false);
  });

  /* 5 · Bastidores de secado / exposición: siluetas muy finas. */
  const frames = lowDetail ? [-1.18,1.18] : [-1.58,-.52,.52,1.58];
  frames.forEach((dx, index) => {
    const frameZ = z + 3.72;
    p9Box(x + dx - .22, frameZ, .62, .025, .62, .025, linen, 0, false);
    p9Box(x + dx + .22, frameZ, .62, .025, .62, .025, linen, 0, false);
    p9Box(x + dx, frameZ, 1.22, .25, .025, .025, index % 2 ? wine : gold, 0, false);
    p9Box(x + dx, frameZ, .48, .23, .18, .018, index % 2 ? linenLight : p9Mix(palette.wine, palette.paperLight, .72), 0, false);
  });

  /* 6 · Bancales tintóreos / jardín textil. */
  const beds = lowDetail ? [[-2.35,4.55],[2.35,4.55]] : [[-2.45,4.45],[-.85,4.72],[.85,4.72],[2.45,4.45]];
  beds.forEach(([dx,dz], index) => {
    p9Box(x + dx, z + dz, .095, .58, .025, .36, stone, index % 2 ? .035 : -.035, false);
    p9Box(x + dx, z + dz, .13, .48, .018, .27, index % 2 ? garden : p9Mix(palette.green, palette.linen, .22), index % 2 ? .035 : -.035, false);
  });

  /* 7 · Camino de losas hacia el estudio. */
  const slabs = lowDetail ? 5 : 8;
  for (let i = 0; i < slabs; i++) {
    const zz = z + 5.72 - i * .52;
    const offset = Math.sin(i * 1.7) * .10;
    p9Box(x + offset, zz, .10, .32, .018, .20, p9Mix(palette.paperDeep, palette.paperLight, .28), i % 2 ? .04 : -.04, false);
  }

  /* 8 · Vegetación: asimétrica y más blanda que Atelier/IZC. */
  if (typeof tree === 'function' && !lowDetail) {
    tree(x - 4.18, z + 3.82, .72);
    tree(x - 3.72, z + 5.35, .62);
    tree(x + 4.10, z + 4.62, .76);
  }
  p9Hedge(x - 3.15, z + 2.80, .82, Math.PI / 2, .13);
  p9Hedge(x + 3.15, z + 2.80, .82, Math.PI / 2, .13);

  /* Cámara: encuadre más bajo, sereno y lateral para leer el patio/telar. */
  if (typeof p9CameraProfile === 'function') {
    const previousProfile = p9CameraProfile;
    p9CameraProfile = function p10StitchCameraProfile(name, target) {
      if (name === 'stitch') {
        return {
          yaw: mobile ? .57 : .505,
          pitch: mobile ? .755 : .695
        };
      }
      return previousProfile(name, target);
    };
  }

  if (root) {
    root.dataset.stitchStudio = 'p10.3';
    root.dataset.webglPhase = 'p10.3';
  }

  window.setTimeout(() => {
    const label = document.querySelector('.webgl-village-heading > span');
    if (label) label.textContent = 'P10.3 · Estudio The Gentle Stitch';
    if (status && !root?.dataset.webglError) {
      status.textContent = 'P10.3 · The Gentle Stitch ya tiene una arquitectura textil propia';
    }
  }, 200);
})();

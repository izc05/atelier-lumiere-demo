/* Pueblo Atelier · P10.2 · Pabellón IZC */

(() => {
  if (typeof p9Box !== 'function' || typeof p9Add !== 'function' || typeof p9FanMesh !== 'function') return;

  const x = -11;
  const z = 7;
  const mobile = window.matchMedia('(max-width: 760px)').matches;
  const lowDetail = mobile || Number(navigator.deviceMemory || 8) <= 4;

  const paper = p9Mix(palette.paperLight, palette.paperDeep, .08);
  const wine = p9V4(palette.wine);
  const wineSoft = p9Mix(palette.wine, palette.paperLight, .16);
  const gold = p9V4(palette.gold);
  const brass = p9Mix(palette.gold, palette.paperLight, .18);
  const stone = p9Mix(palette.paperDeep, palette.wine, .05);
  const displayGlass = p9Mix(palette.green, palette.paperLight, .72);

  /* 1 · Sala de exposición principal: más ancha y horizontal que el resto del pueblo. */
  p9Box(x, z - .55, .82, 2.10, .82, .94, paper, 0, true);
  p9Roof(x, z - .55, 1.93, 2.28, .42, 1.08, wine, 0);

  /* Clerestorio central: volumen más alto pero ligero. */
  p9Box(x, z - .58, 1.92, 1.08, .38, .58, p9Mix(palette.paperLight, palette.gold, .06), 0, true);
  p9Roof(x, z - .58, 2.48, 1.20, .25, .68, wineSoft, 0);

  /* 2 · Galerías laterales bajas. */
  [-3.15, 3.15].forEach((dx, index) => {
    p9Box(x + dx, z - .35, .52, .90, .52, .82, paper, index ? .035 : -.035, true);
    p9Roof(x + dx, z - .35, 1.25, 1.02, .27, .94, index ? p9Mix(palette.wine, palette.roof, .12) : wineSoft, index ? .035 : -.035);
  });

  /* 3 · Fachada expositiva con lamas que recuerdan a las varillas de un abanico. */
  const slats = lowDetail ? 7 : 11;
  for (let i = 0; i < slats; i++) {
    const t = slats === 1 ? .5 : i / (slats - 1);
    const dx = mix(-1.70, 1.70, t);
    p9Box(x + dx, z + .41, .83, .032, .72, .045, i % 2 ? brass : gold, 0, false);
  }
  p9Box(x, z + .43, .20, 1.92, .08, .055, stone, 0, true);
  p9Box(x, z + .43, 1.55, 1.92, .06, .055, wineSoft, 0, true);

  /* Puerta central y dos escaparates de tono vidrio/papel. */
  p9Box(x, z + .47, .61, .30, .61, .055, wine, 0, false);
  p9Box(x - .88, z + .455, .70, .52, .55, .035, displayGlass, 0, false);
  p9Box(x + .88, z + .455, .70, .52, .55, .035, displayGlass, 0, false);

  /* 4 · Patio-abanico: la forma se ve desde la cámara aérea sin convertirse en logo literal. */
  const fanCourt = p9FanMesh(lowDetail ? 7 : 11);
  p9Add(fanCourt, x, z + 3.05, .105, 2.65, .018, 2.25, p9Mix(palette.wine, palette.paperLight, .82), Math.PI, false);

  const ribs = lowDetail ? 7 : 11;
  for (let i = 0; i < ribs; i++) {
    const angle = -.95 + 1.9 * (i / Math.max(1, ribs - 1));
    const length = 1.90;
    const px = x + Math.sin(angle) * .92;
    const pz = z + 2.22 + Math.cos(angle) * .80;
    p9Box(px, pz, .126, .026, .014, length, i % 2 ? brass : gold, -angle, false);
  }

  /* 5 · Marquesina radial elevada sobre el patio. */
  p9Add(p9Meshes.fan, x, z + 1.30, 2.36, 2.22, .09, 1.52, p9Mix(palette.wine, palette.paperLight, .26), Math.PI, true);
  const canopySupports = lowDetail ? [-1.35, 0, 1.35] : [-1.55, -.78, 0, .78, 1.55];
  canopySupports.forEach((dx, index) => {
    p9Add(p9Meshes.cylinder, x + dx, z + 1.26, 1.15, .045, 1.15, .045, index % 2 ? gold : p9Mix(palette.paperDeep, palette.gold, .14), 0, true);
  });

  /* 6 · Mesas/pedestales expositivos en el patio. */
  const displays = lowDetail ? [[-1.1,3.05],[1.1,3.05]] : [[-1.45,3.0],[-.5,3.48],[.5,3.48],[1.45,3.0]];
  displays.forEach(([dx,dz], index) => {
    p9Add(p9Meshes.cylinder, x + dx, z + dz, .22, .13, .20, .13, stone, 0, true);
    p9Add(p9Meshes.cylinder, x + dx, z + dz, .44, .16, .025, .16, index % 2 ? gold : brass, 0, false);
  });

  /* 7 · Caminos laterales y pequeño muro de exposición. */
  p9Path(x - 3.45, z + 2.25, 1.55, .12, Math.PI / 2, p9Mix(palette.road, palette.paperLight, .20));
  p9Path(x + 3.45, z + 2.25, 1.55, .12, Math.PI / 2, p9Mix(palette.road, palette.paperLight, .20));
  p9Wall(x - 3.65, z + 3.40, 1.00, Math.PI / 2, stone);
  p9Wall(x + 3.65, z + 3.40, 1.00, Math.PI / 2, stone);

  /* 8 · Dos árboles marcan la entrada sin tapar la marquesina. */
  if (typeof tree === 'function' && !lowDetail) {
    tree(x - 4.15, z + 4.25, .72);
    tree(x + 4.15, z + 4.25, .72);
  }

  /* Cámara: IZC se presenta ligeramente en diagonal para leer el patio-abanico. */
  if (typeof p9CameraProfile === 'function') {
    const previousProfile = p9CameraProfile;
    p9CameraProfile = function p10IzcCameraProfile(name, target) {
      if (name === 'izc') {
        return {
          yaw: mobile ? .89 : .955,
          pitch: mobile ? .75 : .685
        };
      }
      return previousProfile(name, target);
    };
  }

  if (root) {
    root.dataset.izcPavilion = 'p10.2';
    root.dataset.webglPhase = 'p10.2';
  }

  window.setTimeout(() => {
    const label = document.querySelector('.webgl-village-heading > span');
    if (label) label.textContent = 'P10.2 · Pabellón IZC';
    if (status && !root?.dataset.webglError) {
      status.textContent = 'P10.2 · IZC ya tiene un espacio expositivo propio';
    }
  }, 180);
})();

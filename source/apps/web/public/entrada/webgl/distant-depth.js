/* Pueblo Atelier · P11.2 · profundidad atmosférica por planos */

(() => {
  if (typeof makeMesh !== 'function' || typeof p9Add !== 'function') return;

  const quality = typeof webglQualityMode === 'string' ? webglQualityMode : 'balanced';
  const mobile = window.matchMedia('(max-width: 760px)').matches;

  function hillMesh(columns = 10, rows = 5) {
    const positions = [];
    const normals = [];
    const indices = [];
    const lines = [];

    for (let row = 0; row <= rows; row++) {
      const z = -1 + (row / rows) * 2;
      for (let col = 0; col <= columns; col++) {
        const x = -1 + (col / columns) * 2;
        const radial = Math.max(0, 1 - x * x * .82 - z * z * 1.15);
        const shoulder = Math.max(0, 1 - Math.abs(x) * .58) * .18;
        const y = Math.pow(radial, .72) * .92 + shoulder * (1 - Math.abs(z));
        positions.push(x, y, z);

        const dx = -1.64 * x * Math.max(.12, radial) + (x < 0 ? .10 : -.10);
        const dz = -2.30 * z * Math.max(.12, radial);
        const len = Math.hypot(-dx, 1, -dz) || 1;
        normals.push(-dx / len, 1 / len, -dz / len);
      }
    }

    const stride = columns + 1;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < columns; col++) {
        const a = row * stride + col;
        const b = a + 1;
        const c = a + stride;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }

    /* Solo una línea de cresta muy tenue: no queremos contorno de videojuego. */
    for (let col = 0; col < columns; col++) {
      const a = Math.floor(rows * .45) * stride + col;
      const b = a + 1;
      lines.push(...positions.slice(a * 3, a * 3 + 3), ...positions.slice(b * 3, b * 3 + 3));
    }

    return makeMesh(positions, normals, indices, lines);
  }

  const coarseHill = hillMesh(quality === 'high' ? 12 : 8, quality === 'high' ? 6 : 4);
  const farPaper = p9Mix(palette.paperDeep, palette.paperLight, .66);
  const farGreen = p9Mix(palette.green, palette.paperLight, .68);
  const farWarm = p9Mix(palette.gold, palette.paperLight, .84);
  const midGreen = p9Mix(palette.greenDark, palette.paperLight, .72);

  function hill(x, z, sx, sy, sz, color, rotation = 0, edges = false) {
    return p9Add(coarseHill, x, z, .02, sx, sy, sz, color, rotation, edges && quality === 'high');
  }

  /* Fondo real de la escena: queda detrás del pueblo desde la cámara de apertura. */
  const farHills = quality === 'lite'
    ? [
        [-13.5,-20.2,8.4,2.5,4.7,farPaper,-.07],
        [8.8,-21.3,10.0,2.1,4.2,farGreen,.08]
      ]
    : quality === 'balanced'
      ? [
          [-17.5,-20.4,7.0,2.6,4.5,farPaper,-.08],
          [-4.3,-22.2,9.4,3.0,5.2,farGreen,.04],
          [10.8,-21.0,10.6,2.35,4.5,farWarm,.07],
          [23.0,-17.1,6.5,2.1,4.0,farPaper,-.12]
        ]
      : [
          [-22.0,-18.8,6.8,2.4,4.0,farWarm,-.12],
          [-14.0,-21.5,8.2,3.0,4.7,farPaper,-.06],
          [-2.5,-23.4,10.2,3.45,5.4,farGreen,.035],
          [10.6,-22.0,9.8,2.75,4.8,farWarm,.08],
          [22.0,-18.2,7.6,2.35,4.3,farPaper,-.10],
          [28.0,-9.0,5.2,1.75,3.5,farGreen,-.18]
        ];

  farHills.forEach(([x,z,sx,sy,sz,color,rot], index) => hill(x,z,sx,sy,sz,color,rot,index % 3 === 0));

  /* Plano medio lateral: acompaña los bordes sin cerrar el territorio. */
  if (quality !== 'lite') {
    hill(-24.8, -2.0, 4.5, 1.35, 6.0, midGreen, .14, false);
    hill(24.7, 3.0, 4.2, 1.15, 5.8, p9Mix(palette.paperDeep, palette.linen, .64), -.15, false);
  }

  /* Primer plano mínimo: dos lomos muy bajos que hacen de marco en escritorio. */
  if (!mobile && quality === 'high') {
    hill(-18.5, 15.8, 6.3, .72, 3.4, p9Mix(palette.paperDeep, palette.paperLight, .56), -.06, false);
    hill(19.2, 14.9, 5.8, .62, 3.0, p9Mix(palette.green, palette.paperLight, .76), .08, false);
  }

  /* Siluetas arbóreas lejanas: muy pocas y sin detalle fino. */
  if (typeof tree === 'function' && quality === 'high') {
    [[-15.2,-17.8,.42],[-11.7,-18.6,.37],[-5.8,-19.4,.34],[5.1,-19.3,.36],[12.8,-18.0,.40],[18.4,-16.9,.34]].forEach(([x,z,s]) => tree(x,z,s));
  }

  if (root) {
    root.dataset.distantDepth = 'p11.2';
    root.dataset.webglPhase = 'p11.2';
  }

  window.setTimeout(() => {
    const label = document.querySelector('.webgl-village-heading > span');
    if (label) label.textContent = 'P11.2 · Profundidad atmosférica';
    if (status && !root?.dataset.webglError) status.textContent = 'P11.2 · primer plano, pueblo y horizonte ya se separan por capas';
  }, 390);
})();

/* Pueblo Atelier · P11.1 · señalética integrada en el mundo 3D */

(() => {
  if (typeof makeMesh !== 'function' || typeof p9Add !== 'function') return;

  const glyphs = {
    A: [[[.05,0],[.5,1]],[[.5,1],[.95,0]],[[.25,.45],[.75,.45]]],
    L: [[[.12,1],[.12,0]],[[.12,0],[.92,0]]],
    I: [[[.5,1],[.5,0]],[[.20,1],[.80,1]],[[.20,0],[.80,0]]],
    Z: [[[.08,1],[.92,1]],[[.92,1],[.08,0]],[[.08,0],[.92,0]]],
    C: [[[.88,.90],[.62,1]],[[.62,1],[.22,.84]],[[.22,.84],[.08,.50]],[[.08,.50],[.22,.16]],[[.22,.16],[.62,0]],[[.62,0],[.88,.10]]],
    T: [[[.08,1],[.92,1]],[[.5,1],[.5,0]]],
    G: [[[.88,.88],[.62,1]],[[.62,1],[.22,.84]],[[.22,.84],[.08,.50]],[[.08,.50],[.22,.16]],[[.22,.16],[.62,0]],[[.62,0],[.90,.16]],[[.90,.16],[.90,.48]],[[.90,.48],[.58,.48]]],
    S: [[[.88,.86],[.64,1]],[[.64,1],[.26,.90]],[[.26,.90],[.10,.66]],[[.10,.66],[.28,.50]],[[.28,.50],[.72,.43]],[[.72,.43],[.90,.24]],[[.90,.24],[.72,.04]],[[.72,.04],[.28,0]],[[.28,0],[.10,.12]]]
  };

  function wordMesh(text, thickness = .075, spacing = 1.18) {
    const positions = [];
    const normals = [];
    const indices = [];
    const lines = [];
    const chars = String(text || '').toUpperCase().split('');
    const total = Math.max(0, (chars.length - 1) * spacing + 1);
    const origin = -total / 2;

    function addStroke(ax, ay, bx, by, offsetX) {
      const dx = bx - ax;
      const dy = by - ay;
      const length = Math.hypot(dx, dy) || 1;
      const nx = -dy / length * thickness * .5;
      const ny = dx / length * thickness * .5;
      const base = positions.length / 3;
      const points = [
        [ax + nx + offsetX, ay + ny, 0],
        [bx + nx + offsetX, by + ny, 0],
        [bx - nx + offsetX, by - ny, 0],
        [ax - nx + offsetX, ay - ny, 0]
      ];
      points.forEach((point) => {
        positions.push(...point);
        normals.push(0, 0, 1);
      });
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      lines.push(...points[0], ...points[1], ...points[1], ...points[2], ...points[2], ...points[3], ...points[3], ...points[0]);
    }

    chars.forEach((char, index) => {
      const strokes = glyphs[char];
      if (!strokes) return;
      const offset = origin + index * spacing;
      strokes.forEach((stroke) => addStroke(stroke[0][0], stroke[0][1], stroke[1][0], stroke[1][1], offset));
    });

    return makeMesh(positions, normals, indices, lines);
  }

  const quality = typeof webglQualityMode === 'string' ? webglQualityMode : 'balanced';
  const signColors = {
    atelier: [palette.gold[0], palette.gold[1], palette.gold[2], .88],
    izc: [palette.wine[0], palette.wine[1], palette.wine[2], .84],
    stitch: [palette.wineSoft[0], palette.wineSoft[1], palette.wineSoft[2], .80]
  };
  const signObjects = new Map();

  function sign(place, text, x, z, y, scale, color, plaqueWidth, plaqueHeight, rotation = 0) {
    const plaqueColor = place === 'atelier'
      ? p9Mix(palette.paperLight, palette.gold, .07, .96)
      : p9Mix(palette.paperLight, palette.linen, .08, .94);
    p9Box(x, z - .018, y + scale * .43, plaqueWidth, plaqueHeight, .026, plaqueColor, rotation, true);
    const mesh = wordMesh(text, quality === 'lite' ? .105 : .082, 1.18);
    const object = p9Add(mesh, x, z + .018, y, scale, scale, .04, color, rotation, quality !== 'lite');
    signObjects.set(place, object);
    return object;
  }

  /* Atelier: monograma alto, centrado sobre el pórtico de entrada. */
  sign('atelier', 'AL', 0, 1.57, 1.58, .48, signColors.atelier, .78, .34, 0);

  /* IZC: palabra completa sobre la galería expositiva. */
  sign('izc', 'IZC', -11, 7.47, 1.62, .37, signColors.izc, .94, .29, 0);

  /* Gentle Stitch: monograma TGS sobre el acceso del estudio. */
  sign('stitch', 'TGS', 13.72, -6.72, 1.40, .31, signColors.stitch, .88, .25, 0);

  /* Pequeños mojones de camino, reducidos en modo ligero. */
  if (quality !== 'lite') {
    const markerColor = p9Mix(palette.gold, palette.paperLight, .06);
    const markerMesh = wordMesh('AL', .10, 1.10);
    p9Add(markerMesh, -.72, 6.92, .18, .13, .13, .02, markerColor, 0, false);
  }

  /* La señalética reacciona al hover/selección sin añadir paneles HTML. */
  let raf = 0;
  function animateSigns() {
    raf = 0;
    for (const [place, object] of signObjects) {
      const active = typeof webglSelectedPlace !== 'undefined' && webglSelectedPlace === place;
      const hovered = typeof webglHoverPlace !== 'undefined' && webglHoverPlace === place;
      const base = signColors[place];
      const boost = hovered ? 1.14 : active ? 1.07 : 1;
      object.color[0] = clamp(base[0] * boost, 0, 1);
      object.color[1] = clamp(base[1] * boost, 0, 1);
      object.color[2] = clamp(base[2] * boost, 0, 1);
      object.color[3] = hovered ? 1 : active ? .96 : base[3];
    }
    raf = requestAnimationFrame(animateSigns);
  }

  if (!reducedMotion.matches && !document.hidden) raf = requestAnimationFrame(animateSigns);
  else {
    for (const [place, object] of signObjects) object.color[3] = signColors[place][3];
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    } else if (!document.hidden && !reducedMotion.matches && !raf) {
      raf = requestAnimationFrame(animateSigns);
    }
  });

  if (root) {
    root.dataset.worldSignage = 'p11.1';
    root.dataset.webglPhase = 'p11.1';
  }

  window.setTimeout(() => {
    const label = document.querySelector('.webgl-village-heading > span');
    if (label) label.textContent = 'P11.1 · Señalética integrada en el 3D';
    if (status && !root?.dataset.webglError) status.textContent = 'P11.1 · los talleres ya se identifican dentro de la propia arquitectura';
  }, 360);
})();

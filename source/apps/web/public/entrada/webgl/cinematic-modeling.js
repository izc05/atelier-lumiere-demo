/* Pueblo Atelier · P9.1 · territorio y arquitectura cinematográfica */

const p9V4 = (color, alpha = 1) => [color[0], color[1], color[2], alpha];
const p9Mix = (a, b, t, alpha = 1) => [...mix3(a, b, t), alpha];
const p9Stone = p9Mix(palette.paperDeep, palette.roof, .18);
const p9StoneDark = p9Mix(palette.paperDeep, palette.ink, .16);
const p9Garden = p9Mix(palette.green, palette.paperLight, .28);
const p9Water = p9Mix(palette.green, palette.paperLight, .64);
const p9Wine = p9V4(palette.wine);
const p9Gold = p9V4(palette.gold);
const p9Linen = p9V4(palette.linen);
const p9Paper = p9V4(palette.paperLight);

function p9TerrainY(x, z, offset = 0) {
  return atelierTerrainHeight(x, z) + offset;
}

function p9Add(mesh, x, z, y, sx, sy, sz, color, rotation = 0, edges = true) {
  add(mesh, [x, p9TerrainY(x, z, y), z], [sx, sy, sz], color, rotation, edges);
  return objects[objects.length - 1];
}

function p9Box(x, z, y, sx, sy, sz, color = p9Stone, rotation = 0, edges = true) {
  return p9Add(meshes.box, x, z, y, sx, sy, sz, color, rotation, edges);
}

function p9Roof(x, z, y, sx, sy, sz, color = p9V4(palette.roof), rotation = 0) {
  return p9Add(meshes.roof, x, z, y, sx, sy, sz, color, rotation, true);
}

function p9Wall(x, z, length, rotation = 0, color = p9Stone) {
  return p9Box(x, z, .17, length, .17, .09, color, rotation, true);
}

function p9Path(x, z, length, width, rotation = 0, color = p9V4(palette.road)) {
  return p9Box(x, z, .095, length, .018, width, color, rotation, false);
}

function p9Hedge(x, z, length, rotation = 0, height = .18) {
  return p9Box(x, z, height, length, height, .13, p9Garden, rotation, false);
}

function p9CylinderMesh(sides = 10) {
  const positions = [];
  const normals = [];
  const indices = [];
  const lines = [];

  for (let i = 0; i < sides; i++) {
    const a = i / sides * Math.PI * 2;
    const b = (i + 1) / sides * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    const cb = Math.cos(b), sb = Math.sin(b);
    const base = positions.length / 3;

    positions.push(ca, -1, sa, cb, -1, sb, cb, 1, sb, ca, 1, sa);
    normals.push(ca, 0, sa, cb, 0, sb, cb, 0, sb, ca, 0, sa);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    lines.push(ca, -1, sa, cb, -1, sb, ca, 1, sa, cb, 1, sb, ca, -1, sa, ca, 1, sa);
  }

  const topCenter = positions.length / 3;
  positions.push(0, 1, 0); normals.push(0, 1, 0);
  const bottomCenter = positions.length / 3;
  positions.push(0, -1, 0); normals.push(0, -1, 0);

  for (let i = 0; i < sides; i++) {
    const a = i / sides * Math.PI * 2;
    const b = (i + 1) / sides * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    const cb = Math.cos(b), sb = Math.sin(b);

    let top = positions.length / 3;
    positions.push(ca, 1, sa, cb, 1, sb);
    normals.push(0, 1, 0, 0, 1, 0);
    indices.push(topCenter, top, top + 1);

    let bottom = positions.length / 3;
    positions.push(ca, -1, sa, cb, -1, sb);
    normals.push(0, -1, 0, 0, -1, 0);
    indices.push(bottomCenter, bottom + 1, bottom);
  }

  return makeMesh(positions, normals, indices, lines);
}

function p9FanMesh(segments = 8) {
  const positions = [[0, 0, -.16]];
  const radius = 1;
  const start = -1.08;
  const end = 1.08;
  for (let i = 0; i <= segments; i++) {
    const angle = start + (end - start) * (i / segments);
    positions.push([Math.sin(angle) * radius, 0, Math.cos(angle) * radius]);
  }

  const flat = [];
  const normals = [];
  positions.forEach((point) => { flat.push(...point); normals.push(0, 1, 0); });
  const indices = [];
  const lines = [];
  for (let i = 1; i <= segments; i++) {
    indices.push(0, i, i + 1);
    lines.push(...positions[0], ...positions[i]);
    lines.push(...positions[i], ...positions[i + 1]);
  }
  lines.push(...positions[0], ...positions[segments + 1]);
  return makeMesh(flat, normals, indices, lines);
}

const p9Meshes = {
  cylinder: p9CylinderMesh(10),
  fan: p9FanMesh(9)
};

function p9Window(x, z, y, width, rotation = 0, color = p9Gold) {
  return p9Box(x, z, y, width, .26, .035, color, rotation, false);
}

function p9Stair(x, z, width, depth, steps = 4, rotation = 0) {
  for (let i = 0; i < steps; i++) {
    const t = i / Math.max(1, steps - 1);
    const localZ = (i - (steps - 1) / 2) * depth * .52;
    const dx = Math.sin(rotation) * localZ;
    const dz = Math.cos(rotation) * localZ;
    p9Box(x + dx, z + dz, .055 + i * .035, width, .035 + i * .012, depth * .36, p9Stone, rotation, false);
  }
}

function p9Courtyard(x, z, sx, sz, rotation = 0) {
  p9Box(x, z, .075, sx, .018, sz, p9Mix(palette.paperDeep, palette.gold, .12), rotation, false);
  p9Wall(x - Math.cos(rotation) * sx, z + Math.sin(rotation) * sx, sz, rotation + Math.PI / 2);
  p9Wall(x + Math.cos(rotation) * sx, z - Math.sin(rotation) * sx, sz, rotation + Math.PI / 2);
}

function p9AtelierMaison() {
  /* Alas laterales: convierten la casa central en una verdadera maison con patio de llegada. */
  p9Box(-2.25, .15, .62, 1.2, .62, .72, p9Paper, -.04, true);
  p9Roof(-2.25, .15, 1.48, 1.34, .42, .88, p9Wine, -.04);
  p9Box(2.25, .15, .62, 1.2, .62, .72, p9Paper, .04, true);
  p9Roof(2.25, .15, 1.48, 1.34, .42, .88, p9Wine, .04);

  /* Galería posterior y linterna central visible desde la vista aérea. */
  p9Box(0, -1.7, .56, 1.7, .56, .58, p9Paper, 0, true);
  p9Roof(0, -1.7, 1.35, 1.86, .38, .74, p9V4(palette.roof), 0);
  p9Box(.08, -1.72, 1.72, .48, .82, .48, p9Paper, 0, true);
  p9Roof(.08, -1.72, 2.76, .61, .34, .61, p9Wine, Math.PI / 4);
  p9Add(p9Meshes.cylinder, .08, -1.72, 3.12, .12, .22, .12, p9Gold, 0, true);

  /* Ritmo de ventanas y puerta central. */
  [-2.72, -2.22, -1.78, 1.78, 2.22, 2.72].forEach((x) => p9Window(x, .89, .69, .14));
  p9Box(0, 1.35, .49, .24, .49, .045, p9Wine, 0, false);
  p9Window(-.64, 1.33, .76, .16);
  p9Window(.64, 1.33, .76, .16);

  /* Patio, escalinata y jardín geométrico. */
  p9Courtyard(0, 3.05, 2.55, 1.35, 0);
  p9Stair(0, 1.82, 1.12, .28, 5, 0);
  p9Hedge(-2.15, 3.02, 1.5, 0, .13);
  p9Hedge(2.15, 3.02, 1.5, 0, .13);
  p9Hedge(-3.12, 2.3, .7, Math.PI / 2, .14);
  p9Hedge(3.12, 2.3, .7, Math.PI / 2, .14);

  /* Fuente central muy discreta. */
  p9Add(p9Meshes.cylinder, 0, 3.12, .13, .38, .07, .38, p9StoneDark, 0, true);
  p9Add(p9Meshes.cylinder, 0, 3.12, .22, .25, .035, .25, p9Water, 0, false);
}

function p9IzcWorkshop() {
  const x = -11;
  const z = 7;

  /* Dos alas bajas crean un taller-exposición en lugar de una vivienda aislada. */
  p9Box(x - 1.72, z - .1, .48, .78, .48, .62, p9Paper, -.07, true);
  p9Roof(x - 1.72, z - .1, 1.16, .9, .30, .76, p9Wine, -.07);
  p9Box(x + 1.58, z - .18, .44, .68, .44, .58, p9Paper, .06, true);
  p9Roof(x + 1.58, z - .18, 1.08, .8, .28, .7, p9Wine, .06);

  /* Marquesina radial: gesto abstracto de abanico, visible solo como arquitectura. */
  p9Add(p9Meshes.fan, x, z + 1.72, 1.72, 2.0, .12, 1.45, p9Mix(palette.wine, palette.paperLight, .12), Math.PI, true);
  [-.82, -.42, 0, .42, .82].forEach((angle) => {
    const length = 1.1;
    const px = x + Math.sin(angle) * .88;
    const pz = z + 1.63 + Math.cos(angle) * .63;
    p9Box(px, pz, .83, .035, .83, length, p9Gold, -angle, false);
  });

  /* Patio de exposición y muros bajos. */
  p9Courtyard(x, z + 3.0, 2.35, 1.0, 0);
  p9Wall(x - 2.55, z + 2.85, 1.18, Math.PI / 2, p9Mix(palette.paperDeep, palette.wine, .08));
  p9Wall(x + 2.55, z + 2.85, 1.18, Math.PI / 2, p9Mix(palette.paperDeep, palette.wine, .08));
  p9Path(x, z + 4.55, 1.9, .13, Math.PI / 2);

  /* Pequeños soportes expositivos. */
  [-1.2, -.6, .6, 1.2].forEach((dx) => {
    p9Add(p9Meshes.cylinder, x + dx, z + 3.0, .18, .10, .18, .10, p9Gold, 0, false);
  });
}

function p9StitchWorkshop() {
  const x = 12;
  const z = -7;

  /* Estudio en piezas escalonadas, más horizontal y sereno. */
  p9Box(x - 1.62, z - .1, .44, .72, .44, .72, p9Paper, -.05, true);
  p9Roof(x - 1.62, z - .1, 1.08, .84, .28, .86, p9Linen, -.05);
  p9Box(x + 1.54, z + .05, .58, .7, .58, .68, p9Paper, .04, true);
  p9Roof(x + 1.54, z + .05, 1.36, .82, .30, .82, p9Mix(palette.linen, palette.wine, .18), .04);

  /* Patio textil y pérgola ligera delante del taller. */
  p9Courtyard(x, z + 2.65, 2.25, 1.05, 0);
  const pergolaZ = z + 2.15;
  [-1.7, -.85, 0, .85, 1.7].forEach((dx, index) => {
    p9Box(x + dx, pergolaZ, .68, .035, .68, .035, index % 2 ? p9Wine : p9Linen, 0, false);
  });
  [-1.68, -.84, 0, .84, 1.68].forEach((dx) => {
    p9Box(x + dx, pergolaZ, 1.32, .04, .04, 1.1, p9Linen, 0, false);
  });
  p9Box(x, pergolaZ - .98, 1.32, 1.75, .04, .04, p9Linen, 0, false);
  p9Box(x, pergolaZ + .98, 1.32, 1.75, .04, .04, p9Linen, 0, false);

  /* Jardín blando alrededor del estudio. */
  p9Hedge(x - 2.58, z + 2.7, .92, Math.PI / 2, .15);
  p9Hedge(x + 2.58, z + 2.7, .92, Math.PI / 2, .15);
  p9Hedge(x - 1.55, z + 3.75, .7, 0, .12);
  p9Hedge(x + 1.55, z + 3.75, .7, 0, .12);
  p9Path(x, z + 4.55, 1.65, .12, Math.PI / 2, p9Mix(palette.road, palette.linen, .18));
}

function p9VillageLandscape() {
  /* Senderos secundarios, más estrechos y orgánicos que los ejes P8. */
  [
    [-15.6, -5.6, 3.6, .055, .20],
    [-12.8, -3.4, 3.1, .055, -.34],
    [-6.6, 4.6, 3.4, .05, .52],
    [6.4, 4.1, 3.0, .05, -.48],
    [14.1, 4.4, 2.8, .05, .28],
    [4.5, -7.4, 3.6, .05, .12],
    [-5.4, -7.8, 3.1, .05, -.16]
  ].forEach(([x, z, length, width, rotation]) => p9Path(x, z, length, width, rotation, p9Mix(palette.road, palette.paperLight, .20)));

  /* Muros de bancales y pequeñas plazas que dan escala al terreno. */
  [
    [-18.2, -7.2, 2.2, .02],[-18.0, 4.0, 2.0, -.04],[-12.5, 12.1, 2.7, .03],
    [-5.0, 12.4, 2.1, -.02],[6.4, 12.2, 2.7, .02],[15.5, 11.0, 2.3, -.04],
    [18.6, 5.7, 2.1, .03],[18.3, -5.6, 2.0, -.03]
  ].forEach(([x, z, length, rotation]) => p9Wall(x, z, length, rotation, p9Mix(palette.paperDeep, palette.roof, .12)));

  /* Cauces muy discretos: marcan profundidad sin introducir azul ajeno a la identidad. */
  const stream = [
    [-19.0, -12.1, 2.4, .11, .15],[-18.2, -9.9, 2.2, .10, -.36],[-18.8, -7.4, 2.0, .10, .32],
    [-17.7, -5.1, 2.0, .10, -.28],[-18.1, -2.8, 1.9, .10, .25],[-17.2, -.6, 1.8, .10, -.31]
  ];
  stream.forEach(([x, z, length, width, rotation]) => p9Path(x, z, length, width, rotation, p9Water));

  /* Puente peatonal sobre el cauce. */
  p9Box(-17.9, -6.2, .22, .66, .08, .22, p9StoneDark, Math.PI / 2, true);
  p9Box(-18.55, -6.2, .42, .035, .22, .24, p9StoneDark, Math.PI / 2, false);
  p9Box(-17.25, -6.2, .42, .035, .22, .24, p9StoneDark, Math.PI / 2, false);

  /* Jardines y huertos artesanos alrededor de grupos de casas. */
  [
    [-14.5, -4.1, 1.6, .8],[-9.6, -5.5, 1.3, .7],[-5.0, 7.8, 1.4, .7],
    [4.1, 8.8, 1.5, .7],[11.1, 6.2, 1.4, .8],[14.6, -3.8, 1.5, .8]
  ].forEach(([x, z, sx, sz], index) => {
    p9Box(x, z, .07, sx, .018, sz, index % 2 ? p9Garden : p9Mix(palette.greenDark, palette.paperLight, .42), 0, false);
    p9Hedge(x - sx, z, sz, Math.PI / 2, .10);
    p9Hedge(x + sx, z, sz, Math.PI / 2, .10);
  });

  /* Pequeño pabellón común al este. */
  p9Add(p9Meshes.cylinder, 17.2, 1.0, .56, .62, .56, .62, p9Paper, 0, true);
  p9Add(meshes.cone, 17.2, 1.0, 1.62, .84, .42, .84, p9Mix(palette.roof, palette.wine, .18), 0, true);
  p9Path(15.6, 1.0, 1.2, .07, 0);
}

function p9UpdateInteractionGeometry() {
  if (typeof webglInteractionPlaces === 'undefined') return;

  const atelier = webglInteractionPlaces.atelier;
  if (atelier) {
    atelier.point = [0, p9TerrainY(0, 0, 3.20), -1.1];
    atelier.plot = [0, p9TerrainY(0, 0, .115), .45];
    atelier.scale = [4.0, .025, 3.2];
    const highlight = webglHighlightObjects?.get('atelier');
    if (highlight) {
      highlight.position = [...atelier.plot];
      highlight.scale = [...atelier.scale];
    }
  }

  const izc = webglInteractionPlaces.izc;
  if (izc) {
    izc.point = [-11, p9TerrainY(-11, 7, 2.0), 7.6];
    izc.plot = [-11, p9TerrainY(-11, 7, .115), 7.7];
    izc.scale = [3.15, .025, 2.65];
    const highlight = webglHighlightObjects?.get('izc');
    if (highlight) {
      highlight.position = [...izc.plot];
      highlight.scale = [...izc.scale];
    }
  }

  const stitch = webglInteractionPlaces.stitch;
  if (stitch) {
    stitch.point = [12, p9TerrainY(12, -7, 1.95), -6.5];
    stitch.plot = [12, p9TerrainY(12, -7, .115), -6.4];
    stitch.scale = [3.1, .025, 2.7];
    const highlight = webglHighlightObjects?.get('stitch');
    if (highlight) {
      highlight.position = [...stitch.plot];
      highlight.scale = [...stitch.scale];
    }
  }

  places.atelier.distance = 19;
  places.izc.distance = 16;
  places.stitch.distance = 16;
}

p9AtelierMaison();
p9IzcWorkshop();
p9StitchWorkshop();
p9VillageLandscape();
p9UpdateInteractionGeometry();

/* Quality.js carga después y puede simplificar contornos. Reponemos solo la identidad de fase al final del tick. */
window.setTimeout(() => {
  if (root) {
    root.dataset.webglPhase = 'p9.1';
    root.dataset.cinematicModeling = 'true';
  }
  const label = document.querySelector('.webgl-village-heading > span');
  if (label) label.textContent = 'Laboratorio P9.1 · territorio cinematográfico';
  if (status && !root?.dataset.webglError) status.textContent = 'P9.1 · arquitectura y paisaje enriquecidos';
}, 0);

/* Pueblo Atelier · P8.2A · relieve + tinta/papel sobre el motor WebGL P8.1 */

function atelierTerrainHeight(x, z) {
  const broad = Math.sin(x * .16) * .10 + Math.cos(z * .19) * .08;
  const north = Math.exp(-((x + 10) ** 2 + (z + 7) ** 2) / 95) * .22;
  const east = Math.exp(-((x - 12) ** 2 + (z - 5) ** 2) / 80) * .18;
  const south = Math.exp(-((x + 3) ** 2 + (z - 10) ** 2) / 70) * .15;
  const plaza = Math.exp(-(x ** 2 + z ** 2) / 18) * -.12;
  return broad + north + east + south + plaza;
}

function createAtelierTerrainMesh(columns = 34, rows = 25) {
  const width = 41.6;
  const depth = 29.6;
  const positions = [];
  const normals = [];
  const indices = [];
  const lines = [];

  const point = (col, row) => {
    const x = -width / 2 + width * (col / columns);
    const z = -depth / 2 + depth * (row / rows);
    return [x, atelierTerrainHeight(x, z), z];
  };

  for (let row = 0; row <= rows; row++) {
    for (let col = 0; col <= columns; col++) {
      const p = point(col, row);
      positions.push(...p);
      const left = point(Math.max(0, col - 1), row);
      const right = point(Math.min(columns, col + 1), row);
      const down = point(col, Math.max(0, row - 1));
      const up = point(col, Math.min(rows, row + 1));
      const dx = sub3(right, left);
      const dz = sub3(up, down);
      const normal = normalize3(cross3(dz, dx));
      normals.push(...normal);

      if ((row % 4 === 0 && col < columns) || (col % 5 === 0 && row < rows)) {
        if (col < columns && row % 4 === 0) lines.push(...p, ...point(col + 1, row));
        if (row < rows && col % 5 === 0) lines.push(...p, ...point(col, row + 1));
      }
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
  return makeMesh(positions, normals, indices, lines);
}

function applyAtelierArtDirection() {
  /* La base plana se conserva por debajo como zócalo, pero la superficie visible pasa a ser relieve. */
  if (objects[1]) objects[1].position[1] = -.42;
  const terrain = createAtelierTerrainMesh();
  objects.splice(2, 0, {
    mesh: terrain,
    position: [0, -.02, 0],
    scale: [1, 1, 1],
    color: palette.paper,
    rotation: 0,
    edges: true
  });

  /* Arquitectura y vegetación se apoyan en el terreno sin alterar caminos y parcelas planas. */
  for (const object of objects) {
    if (object === objects[0] || object.mesh === terrain) continue;
    if (object.position[1] > .12) {
      object.position[1] += atelierTerrainHeight(object.position[0], object.position[2]);
    }
  }

  /* Tinta menos dura y paleta ligeramente más envejecida, como papel ilustrado. */
  palette.ink[0] = .23;
  palette.ink[1] = .17;
  palette.ink[2] = .15;
  palette.ink[3] = .20;
  const age = (color, paperMix = .08) => {
    const next = mix3(color, palette.paperDeep, paperMix);
    color[0] = next[0]; color[1] = next[1]; color[2] = next[2];
  };
  age(palette.green, .12);
  age(palette.greenDark, .10);
  age(palette.roof, .08);
  age(palette.road, .07);

  /* Vista más aérea y territorial. */
  camera.pitch = .86;
  camera.yaw = .78;
  camera.distance = Math.max(camera.distance, 36);
  camera.desiredDistance = 36;
  camera.target = [1.2, 0, .5];
  camera.desired = [1.2, 0, .5];
  places.overview.target = [1.2, 0, .5];
  places.overview.distance = 36;
  places.atelier.distance = 18;
  places.izc.distance = 15;
  places.stitch.distance = 15;

  if (root) root.dataset.webglPhase = 'p8.2a';
  if (status) status.textContent = 'P8.2A · relieve 3D + tinta sobre papel';
  const lab = document.querySelector('.webgl-village-heading > span');
  if (lab) lab.textContent = 'Laboratorio P8.2A · relieve + tinta/papel';
}

applyAtelierArtDirection();

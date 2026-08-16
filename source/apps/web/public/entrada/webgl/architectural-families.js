/* Pueblo Atelier · P9.5 · diversidad de siluetas en edificios secundarios */

const p95Memory = Number(navigator.deviceMemory);
const p95Narrow = window.matchMedia('(max-width: 760px)').matches;
const p95Tablet = !p95Narrow && window.matchMedia('(max-width: 1050px)').matches;
const p95LowMemory = Number.isFinite(p95Memory) && p95Memory > 0 && p95Memory <= 4;
const p95DetailLite = p95Narrow || p95LowMemory;
const p95HouseBudget = p95DetailLite ? 6 : p95Tablet ? 9 : 12;

const p95Accents = [
  p9V4(palette.roof),
  p9Mix(palette.roof, palette.wine, .22),
  p9Linen,
  p9Mix(palette.roof, palette.gold, .14)
];

function p95Detail(object, priority = 1) {
  if (!object) return object;
  /* En móvil/memoria baja, un detalle de prioridad 2 se retira antes de entrar al render loop. */
  if (p95DetailLite && priority >= 2 && objects[objects.length - 1] === object) {
    objects.pop();
    return null;
  }
  object.p9Detail = true;
  object.p9DetailPriority = priority;
  return object;
}

function p95StudioAnnex(x, z, s, index) {
  p95Detail(p9Box(x + 1.28 * s, z - .08 * s, .30 * s, .42 * s, .30 * s, .56 * s, p9Paper, .02, true));
  p95Detail(p9Roof(x + 1.28 * s, z - .08 * s, .73 * s, .50 * s, .20 * s, .67 * s, p95Accents[index % p95Accents.length], .02));
  p95Detail(p9Box(x + 1.28 * s, z + .50 * s, .28 * s, .14 * s, .28 * s, .025, p9Wine, 0, false), 2);
}

function p95CourtyardHouse(x, z, s, index) {
  p95Detail(p9Box(x, z + 1.42 * s, .06, .95 * s, .015, .58 * s, p9Mix(palette.paperDeep, palette.gold, .10), 0, false));
  p95Detail(p9Wall(x - 1.03 * s, z + 1.42 * s, .62 * s, Math.PI / 2, p9Stone), 2);
  p95Detail(p9Wall(x + 1.03 * s, z + 1.42 * s, .62 * s, Math.PI / 2, p9Stone), 2);
  p95Detail(p9Hedge(x, z + 2.02 * s, .72 * s, 0, .10), 2);
}

function p95ChimneyHouse(x, z, s, index) {
  p95Detail(p9Box(x + .58 * s, z - .18 * s, 1.72 * s, .11 * s, .38 * s, .11 * s, p9StoneDark, 0, true));
  p95Detail(p9Box(x + .58 * s, z - .18 * s, 2.11 * s, .15 * s, .04 * s, .15 * s, p95Accents[index % p95Accents.length], 0, false), 2);
  p95Detail(p9Box(x, z + .98 * s, 1.08 * s, .72 * s, .045 * s, .18 * s, p9Mix(palette.linen, palette.paperLight, .18), 0, false));
}

function p95LanternHouse(x, z, s, index) {
  p95Detail(p9Add(p9Meshes.cylinder, x, z, 2.12 * s, .20 * s, .22 * s, .20 * s, p9Paper, 0, true));
  p95Detail(p9Add(meshes.cone, x, z, 2.53 * s, .29 * s, .20 * s, .29 * s, p95Accents[index % p95Accents.length], 0, true));
  p95Detail(p9Window(x - .42 * s, z + .87 * s, .72 * s, .12 * s, 0, p9Gold), 2);
  p95Detail(p9Window(x + .42 * s, z + .87 * s, .72 * s, .12 * s, 0, p9Gold), 2);
}

function p95RearWorkshop(x, z, s, index) {
  p95Detail(p9Box(x, z - 1.18 * s, .29 * s, .86 * s, .29 * s, .46 * s, p9Mix(palette.paperDeep, palette.paperLight, .72), 0, true));
  p95Detail(p9Roof(x, z - 1.18 * s, .73 * s, .98 * s, .18 * s, .56 * s, p95Accents[index % p95Accents.length], 0));
  p95Detail(p9Path(x, z - 1.92 * s, .62 * s, .045 * s, Math.PI / 2, p9Mix(palette.road, palette.paperLight, .25)), 2);
}

function p95ArcadeHouse(x, z, s, index) {
  const front = z + .98 * s;
  [-.58, 0, .58].forEach((dx) => {
    p95Detail(p9Box(x + dx * s, front, .52 * s, .035 * s, .52 * s, .035 * s, p9StoneDark, 0, false), 2);
  });
  p95Detail(p9Box(x, front, 1.02 * s, .78 * s, .045 * s, .20 * s, p95Accents[index % p95Accents.length], 0, false));
  p95Detail(p9Box(x, front + .22 * s, .06, .76 * s, .012, .19 * s, p9Mix(palette.paperDeep, palette.gold, .12), 0, false), 2);
}

const p95Families = [
  p95StudioAnnex,
  p95CourtyardHouse,
  p95ChimneyHouse,
  p95LanternHouse,
  p95RearWorkshop,
  p95ArcadeHouse
];

/* Solo edificios con buena lectura desde la cámara general. El fondo conserva geometría simple. */
const p95FeaturedHouseIndices = [1, 4, 7, 9, 11, 12, 14, 16, 18, 20, 21, 23];
const p95ActiveHouseIndices = p95FeaturedHouseIndices.slice(0, p95HouseBudget);
for (let order = 0; order < p95ActiveHouseIndices.length; order++) {
  const houseIndex = p95ActiveHouseIndices[order];
  const house = houses[houseIndex];
  if (!house) continue;
  const [x, z, s] = house;
  p95Families[order % p95Families.length](x, z, s, order);
}

/* Dos microplazas rompen la lectura de retícula sin añadir nuevos edificios. */
p95Detail(p9Box(-6.2, -.4, .065, 1.25, .014, .75, p9Mix(palette.paperDeep, palette.gold, .08), .08, false));
p95Detail(p9Add(p9Meshes.cylinder, -6.2, -.4, .13, .18, .06, .18, p9StoneDark, 0, true), 2);
if (!p95DetailLite) {
  p95Detail(p9Box(7.0, 5.05, .065, 1.15, .014, .70, p9Mix(palette.paperDeep, palette.gold, .08), -.06, false));
  p95Detail(p9Add(p9Meshes.cylinder, 7.0, 5.05, .13, .16, .055, .16, p9StoneDark, 0, true), 2);
}

window.setTimeout(() => {
  if (root) {
    root.dataset.webglPhase = 'p9.5';
    root.dataset.architecturalFamilies = 'true';
    root.dataset.architecturalBudget = String(p95HouseBudget);
  }
  const label = document.querySelector('.webgl-village-heading > span');
  if (label) label.textContent = 'Laboratorio P9.5 · familias arquitectónicas';
  if (status && !root?.dataset.webglError) status.textContent = `P9.5 · ${p95HouseBudget} edificios secundarios enriquecidos`;
}, 220);

/* Pueblo Atelier · P9.8 · parcelas orgánicas integradas en el terreno */

function p98ParcelMesh(points) {
  const positions = [0, 0, 0];
  const normals = [0, 1, 0];
  const indices = [];
  const lines = [];

  for (const [x, z] of points) {
    positions.push(x, 0, z);
    normals.push(0, 1, 0);
  }

  for (let index = 0; index < points.length; index++) {
    const current = index + 1;
    const next = ((index + 1) % points.length) + 1;
    indices.push(0, current, next);
    lines.push(points[index][0], 0, points[index][1], points[(index + 1) % points.length][0], 0, points[(index + 1) % points.length][1]);
  }

  return makeMesh(positions, normals, indices, lines);
}

const p98ParcelMeshes = {
  atelier: p98ParcelMesh([
    [-1.00,-.46],[-.72,-.96],[-.08,-1.00],[.62,-.88],[1.00,-.34],
    [.94,.42],[.58,.94],[-.14,1.00],[-.82,.72],[-.96,.14]
  ]),
  izc: p98ParcelMesh([
    [-.96,-.62],[-.42,-.98],[.24,-.92],[.86,-.64],[1.00,-.08],
    [.78,.68],[.22,.98],[-.48,.88],[-1.00,.44]
  ]),
  stitch: p98ParcelMesh([
    [-.90,-.74],[-.26,-1.00],[.56,-.90],[1.00,-.38],[.90,.36],
    [.48,.94],[-.24,1.00],[-.86,.62],[-1.00,-.06]
  ]),
  generic: p98ParcelMesh([
    [-.86,-.64],[-.34,-.96],[.34,-.90],[.92,-.48],[.96,.22],
    [.52,.88],[-.18,.96],[-.82,.58],[-.98,-.08]
  ])
};

function p98StylizeHighlight(name, object) {
  if (!object || object.p98OrganicParcel) return object;
  object.mesh = p98ParcelMeshes[name] || p98ParcelMeshes.generic;
  object.edges = false;
  object.p98OrganicParcel = true;

  /* El color sigue el sistema de selección existente; solo se suaviza hacia el papel. */
  if (object.color?.length >= 3) {
    const soft = mix3(object.color, palette.paperLight, name === 'atelier' ? .08 : .13);
    object.color[0] = soft[0];
    object.color[1] = soft[1];
    object.color[2] = soft[2];
  }
  return object;
}

/* Los tres hitos iniciales ya existen cuando entra esta capa. */
for (const [name, object] of webglHighlightObjects) p98StylizeHighlight(name, object);

/* Los talleres futuros se crean asíncronamente: estilizamos cualquier highlight que llegue después. */
const p98BaseHighlightSet = webglHighlightObjects.set.bind(webglHighlightObjects);
webglHighlightObjects.set = function p98SetOrganicHighlight(name, object) {
  p98StylizeHighlight(name, object);
  return p98BaseHighlightSet(name, object);
};

/* El resaltado no debe parecer una baldosa: una selección mantenida es casi imperceptible. */
const p98BaseUpdateHighlights = webglUpdateHighlights;
webglUpdateHighlights = function p98UpdateOrganicHighlights() {
  p98BaseUpdateHighlights();
  for (const [name, object] of webglHighlightObjects) {
    if (!object?.color || !object.p98OrganicParcel) continue;
    const hovered = webglHoverPlace === name;
    const selected = webglSelectedPlace === name;
    object.color[3] = hovered ? .145 : selected ? .062 : 0;
  }
};
p98UpdateOrganicHighlights();

window.setTimeout(() => {
  if (root) {
    root.dataset.webglPhase = 'p9.8';
    root.dataset.organicParcels = 'true';
  }
  const label = document.querySelector('.webgl-village-heading > span');
  if (label) label.textContent = 'Laboratorio P9.8 · parcelas orgánicas';
  if (status && !root?.dataset.webglError) status.textContent = 'P9.8 · selección integrada en el terreno';
}, 340);

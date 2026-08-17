/* Pueblo Atelier · P9.6 · parcelas reservadas para talleres futuros */

const p96BaseBuilding = building;
let p96ClaimedExisting = 0;
let p96NewPavilions = 0;

function p96NearestNeutralHouse(x, z) {
  let nearest = null;
  let distance = Infinity;
  for (const house of houses) {
    const current = Math.hypot(house[0] - x, house[1] - z);
    if (current < distance) {
      distance = current;
      nearest = house;
    }
  }
  return nearest ? { house: nearest, distance } : null;
}

function p96Accent4(accent) {
  if (accent?.length >= 4) return accent;
  return [accent?.[0] ?? palette.wine[0], accent?.[1] ?? palette.wine[1], accent?.[2] ?? palette.wine[2], 1];
}

function p96AddClaimMarker(x, z, s, accent) {
  const tone = p96Accent4(accent);
  const stone = [...mix3(palette.paperDeep, palette.roof, .16), 1];
  const gold = [...palette.gold.slice(0, 3), 1];

  /* Marquesina pequeña: identifica una casa existente como taller sin reconstruirla encima. */
  add(meshes.box, [x, .54 * s, z + .92 * s], [.72 * s, .055 * s, .18 * s], tone, 0, false);
  add(meshes.box, [x - .59 * s, .31 * s, z + .92 * s], [.035 * s, .31 * s, .035 * s], stone, 0, false);
  add(meshes.box, [x + .59 * s, .31 * s, z + .92 * s], [.035 * s, .31 * s, .035 * s], stone, 0, false);

  /* Placa vertical abstracta: la identidad textual sigue viviendo en la ficha accesible. */
  add(meshes.box, [x + .72 * s, .68 * s, z + .78 * s], [.10 * s, .30 * s, .035 * s], gold, 0, false);

  /* Umbral claro para leer el acceso desde la vista aérea. */
  add(meshes.box, [x, .075, z + 1.18 * s], [.72 * s, .018, .24 * s], [...mix3(palette.road, palette.paperLight, .24), 1], 0, false);
}

function p96AddCompactPavilion(x, z, s, accent, facade) {
  const pavilionScale = Math.max(.55, s * .72);
  p96BaseBuilding(x, z, pavilionScale, accent, facade);
  /* Un pequeño patio hace que la parcela vacía parezca deliberada y no un edificio añadido al azar. */
  add(meshes.box, [x, .07, z + 1.28 * pavilionScale], [1.0 * pavilionScale, .016, .48 * pavilionScale], [...mix3(palette.paperDeep, palette.gold, .08), 1], 0, false);
}

/*
 * providers.js llama a building() solo cuando llegan talleres dinámicos.
 * A estas alturas todo el pueblo base ya existe, por lo que podemos convertir esa llamada
 * en "reclamar parcela" sin modificar catálogo, navegación ni lógica de negocio.
 */
building = function p96ReservedProviderBuilding(x, z, s = 1, accent = palette.roof, facade = palette.paperLight) {
  const nearest = p96NearestNeutralHouse(x, z);
  const claimRadius = 1.65;

  if (nearest && nearest.distance <= claimRadius) {
    p96AddClaimMarker(x, z, s, accent);
    p96ClaimedExisting += 1;
  } else {
    p96AddCompactPavilion(x, z, s, accent, facade);
    p96NewPavilions += 1;
  }

  if (root) {
    root.dataset.reservedProviders = String(p96ClaimedExisting);
    root.dataset.newProviderPavilions = String(p96NewPavilions);
  }
};

window.setTimeout(() => {
  if (root) {
    root.dataset.webglPhase = 'p9.6';
    root.dataset.providerReservations = 'true';
  }
  const label = document.querySelector('.webgl-village-heading > span');
  if (label) label.textContent = 'Laboratorio P9.6 · parcelas reservadas';
  if (status && !root?.dataset.webglError) status.textContent = 'P9.6 · el pueblo queda preparado para crecer sin solapar edificios';
}, 260);

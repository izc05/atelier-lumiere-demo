/* Atelier Lumière · U3.23 · alineación final de la marca física sobre fachada */
(() => {
  if (!root || root.dataset.workshopFrontageAlignment === 'u3.23') return;
  if (typeof objects === 'undefined' || !Array.isArray(objects)) return;

  const panels = new Map();
  const pixels = new Map();

  for (const object of objects) {
    const place = object?.workshopFrontagePlace;
    const role = object?.workshopFrontageRole;
    if (!place || !role) continue;
    if (role === 'physical-sign') panels.set(place, object);
    if (role === 'physical-brand-pixel') {
      if (!pixels.has(place)) pixels.set(place, []);
      pixels.get(place).push(object);
    }
  }

  let alignedPlaces = 0;
  let alignedPixels = 0;

  for (const [place, group] of pixels) {
    const panel = panels.get(place);
    if (!panel || !group.length || !Array.isArray(panel.position)) continue;

    let minY = Infinity;
    let maxY = -Infinity;
    for (const pixel of group) {
      const y = Number(pixel?.position?.[1]);
      if (!Number.isFinite(y)) continue;
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    if (!Number.isFinite(minY) || !Number.isFinite(maxY)) continue;

    const rotation = Number(panel.rotation) || 0;
    const cr = Math.cos(rotation);
    const sr = Math.sin(rotation);
    const centerY = (minY + maxY) / 2;
    const targetY = Number(panel.position[1]);
    const deltaY = Number.isFinite(targetY) ? targetY - centerY : 0;
    const panelDepth = Math.abs(Number(panel.scale?.[2])) || .035;
    const targetForward = panelDepth * 1.38 + .008;

    for (const pixel of group) {
      if (!Array.isArray(pixel?.position)) continue;
      const dx = Number(pixel.position[0]) - Number(panel.position[0]);
      const dz = Number(pixel.position[2]) - Number(panel.position[2]);
      const side = cr * dx - sr * dz;
      pixel.position[0] = Number(panel.position[0]) + cr * side + sr * targetForward;
      pixel.position[2] = Number(panel.position[2]) - sr * side + cr * targetForward;
      pixel.position[1] = Number(pixel.position[1]) + deltaY;
      alignedPixels += 1;
    }
    alignedPlaces += 1;
  }

  root.dataset.workshopFrontageAlignment = 'u3.23';
  root.dataset.workshopFrontageAlignedPlaces = String(alignedPlaces);
  root.dataset.workshopFrontageAlignedPixels = String(alignedPixels);

  window.AtelierVillageWorkshopFrontageAlignment = Object.freeze({
    places: () => alignedPlaces,
    pixels: () => alignedPixels
  });
})();
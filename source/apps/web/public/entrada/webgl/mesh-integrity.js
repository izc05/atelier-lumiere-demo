/* Atelier Lumière · U3.19 · integridad de mallas antes del microdetalle */
(() => {
  if (!root || typeof meshes === 'undefined' || typeof p9Meshes === 'undefined') return;

  /*
   * U3.9 y U3.13 reutilizan el cono base para vegetación y exposición floral.
   * P9 registraba cylinder/fan pero no cone, por lo que esas capas añadían objetos
   * con mesh indefinido y el watchdog tenía que podarlos después.
   */
  if (!p9Meshes.cone && meshes.cone) p9Meshes.cone = meshes.cone;

  const ready = Boolean(p9Meshes.cone && p9Meshes.cylinder && p9Meshes.fan);
  root.dataset.meshIntegrity = ready ? 'u3.19' : 'degraded';
  root.dataset.meshIntegrityCone = p9Meshes.cone ? 'ready' : 'missing';

  window.AtelierVillageMeshIntegrity = Object.freeze({
    coneReady: () => Boolean(p9Meshes.cone),
    ready: () => Boolean(p9Meshes.cone && p9Meshes.cylinder && p9Meshes.fan)
  });
})();
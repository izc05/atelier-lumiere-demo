/* Atelier Lumière · U3.27A · fidelidad gráfica adaptativa */
(() => {
  if (!root || !canvas || typeof gl === 'undefined') return;
  if (root.dataset.graphicsFidelity === 'u3.27') return;

  const quality = typeof webglQualityMode === 'string' ? webglQualityMode : 'balanced';
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const saveData = Boolean(connection?.saveData);

  const profiles = {
    high: { dpr: 2.0, maxPixels: 7200000 },
    balanced: { dpr: 1.45, maxPixels: 3600000 },
    lite: { dpr: 1.0, maxPixels: 2100000 }
  };

  function performanceFactor() {
    const mode = root.dataset.performanceMode || 'stable';
    if (mode === 'protect') return .70;
    if (mode === 'reduce') return .80;
    if (mode === 'trim') return .90;
    if (mode === 'save-data') return .68;
    return 1;
  }

  function targetDpr() {
    const profile = profiles[quality] || profiles.balanced;
    if (saveData) return 1;
    const cssPixels = Math.max(1, canvas.clientWidth * canvas.clientHeight);
    const pixelBound = Math.sqrt(profile.maxPixels / cssPixels);
    return Math.max(1, Math.min(window.devicePixelRatio || 1, profile.dpr * performanceFactor(), pixelBound));
  }

  resize = function u327HighFidelityResize() {
    const dpr = targetDpr();
    const width = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const height = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
    root.dataset.renderDpr = dpr.toFixed(2);
    root.dataset.renderPixels = String(width * height);
  };

  let refreshTimer = 0;
  function refresh() {
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => {
      resize();
      root.dataset.graphicsFidelityMode = root.dataset.performanceMode || 'stable';
    }, 90);
  }

  const observer = new MutationObserver((records) => {
    if (records.some((record) => record.attributeName === 'data-performance-mode')) refresh();
  });
  observer.observe(root, { attributes: true, attributeFilter: ['data-performance-mode'] });
  window.addEventListener('resize', refresh, { passive: true });

  resize();
  root.dataset.graphicsFidelity = 'u3.27';
  root.dataset.graphicsFidelityQuality = quality;
  root.dataset.graphicsFidelityMaxDpr = String(profiles[quality]?.dpr || 1.45);
  root.dataset.webglPhase = 'u3.27';

  window.AtelierVillageGraphicsFidelity = Object.freeze({
    quality,
    dpr: () => targetDpr(),
    refresh
  });
})();

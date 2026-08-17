/* Atelier Lumière · U3.5F · activación de placas maison */
(() => {
  if (!root) return;
  const href='/entrada/webgl/workshop-plaques-premium.css';
  if(!document.querySelector(`link[href="${href}"]`)){
    const link=document.createElement('link');
    link.rel='stylesheet';
    link.href=href;
    document.head.append(link);
  }
  root.dataset.plaquePolish='u3.5f';
  root.dataset.webglPhase='u3.5f';
  if(status && !root.dataset.webglError) status.textContent='U3.5F · señalética maison premium';
})();

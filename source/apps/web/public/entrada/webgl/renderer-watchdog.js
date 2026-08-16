/* Atelier Lumière · U3.17N.3 · renderer resiliente y cámara única */
(() => {
  if (!root || !canvas || typeof gl === 'undefined' || typeof frame !== 'function') return;

  const localDebug = ['127.0.0.1', 'localhost'].includes(window.location.hostname);
  let renderedFrames = 0;
  let duplicateStamp = -1;
  let fpsWindowStart = performance.now();
  let fpsWindowFrames = 0;
  let fps = 0;
  let lastError = null;
  let fallbackDraws = 0;

  function rememberError(error) {
    const message = String(error?.message || error || 'Error desconocido').slice(0, 180);
    if (message === lastError) return;
    lastError = message;
    root.dataset.rendererLastError = message;
    console.error('[Atelier Renderer]', error);
  }

  function safeBaseDraw(object, vp, cameraPositionValue) {
    const model = modelMatrix(object);
    const color = object?.color?.length >= 4 ? object.color : [1, 1, 1, 1];

    gl.useProgram(fillProgram);
    bindFill(object.mesh);
    gl.uniformMatrix4fv(fillLocations.model, false, model);
    gl.uniformMatrix4fv(fillLocations.vp, false, vp);
    gl.uniform4fv(fillLocations.color, color);
    gl.uniform3fv(fillLocations.camera, cameraPositionValue);
    gl.uniform3fv(fillLocations.light, new Float32Array([-.35, .86, .42]));
    gl.uniform3fv(fillLocations.fog, new Float32Array(palette.paperLight.slice(0, 3)));
    gl.drawElements(gl.TRIANGLES, object.mesh.count, gl.UNSIGNED_SHORT, 0);

    if (!object.edges || object.mesh.lineCount <= 0) return;
    gl.useProgram(lineProgram);
    gl.bindBuffer(gl.ARRAY_BUFFER, object.mesh.lines);
    gl.enableVertexAttribArray(lineLocations.position);
    gl.vertexAttribPointer(lineLocations.position, 3, gl.FLOAT, false, 0, 0);
    gl.uniformMatrix4fv(lineLocations.model, false, model);
    gl.uniformMatrix4fv(lineLocations.vp, false, vp);
    gl.uniform4fv(lineLocations.color, palette.ink);
    gl.drawArrays(gl.LINES, 0, object.mesh.lineCount / 3);
  }

  function updateDiagnostics(now) {
    fpsWindowFrames += 1;
    const elapsed = now - fpsWindowStart;
    if (elapsed >= 500) {
      fps = Math.round((fpsWindowFrames * 1000) / Math.max(1, elapsed));
      fpsWindowFrames = 0;
      fpsWindowStart = now;
      root.dataset.rendererFps = String(fps);
      root.dataset.rendererFrames = String(renderedFrames);
      root.dataset.rendererFallbackDraws = String(fallbackDraws);
    }
  }

  let badge = null;
  if (localDebug) {
    badge = document.createElement('div');
    badge.dataset.localRendererDebug = 'true';
    Object.assign(badge.style, {
      position: 'fixed',
      zIndex: '2147483646',
      left: '20px',
      top: '48px',
      padding: '7px 11px',
      borderRadius: '999px',
      color: '#f5dfaa',
      background: 'rgba(45,17,25,.88)',
      border: '1px solid rgba(219,181,111,.28)',
      font: '700 10px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace',
      letterSpacing: '.04em',
      pointerEvents: 'none'
    });
    document.body.append(badge);
  }

  function refreshBadge() {
    if (!badge) return;
    const errorText = lastError ? ` · ERR ${lastError.slice(0, 52)}` : '';
    badge.textContent = `RENDER LIVE · ${fps || '--'} FPS · FRAME ${renderedFrames}${fallbackDraws ? ` · FALLBACK ${fallbackDraws}` : ''}${errorText}`;
    requestAnimationFrame(refreshBadge);
  }

  frame = function u317n3SafeFrame(now) {
    /* Dos RAF pueden quedar pendientes al sustituir el frame original; dibujamos solo una vez por timestamp. */
    if (now === duplicateStamp) return;
    duplicateStamp = now;

    try {
      resize();
      const dt = Math.min(.05, Math.max(0, (now - lastTime) / 1000));
      lastTime = now;
      const k = reducedMotion.matches ? 1 : 1 - Math.exp(-dt * 5.5);
      camera.target = mix3(camera.target, camera.desired, k);
      camera.distance = mix(camera.distance, camera.desiredDistance, k);

      const eye = cameraPosition();
      const aspect = canvas.width / Math.max(1, canvas.height);
      const proj = mat4Perspective(36 * Math.PI / 180, aspect, .1, 100);
      const view = mat4LookAt(eye, camera.target);
      const vp = mat4Multiply(proj, view);

      gl.enable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.clearColor(...palette.paperLight);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      for (const object of objects) {
        try {
          drawObject(object, vp, eye);
        } catch (error) {
          fallbackDraws += 1;
          rememberError(error);
          try {
            safeBaseDraw(object, vp, eye);
          } catch (fallbackError) {
            rememberError(fallbackError);
          }
        }
      }

      renderedFrames += 1;
      updateDiagnostics(now);
    } catch (error) {
      rememberError(error);
    } finally {
      requestAnimationFrame(frame);
    }
  };

  /* Si el frame antiguo ya murió, este RAF lo resucita. Si seguía vivo, duplicateStamp evita doble dibujo. */
  requestAnimationFrame(frame);
  if (localDebug) requestAnimationFrame(refreshBadge);

  root.dataset.rendererWatchdog = 'u3.17n.3';
  root.dataset.navigationCheckpoint = 'u3.17n.3';
  window.AtelierVillageRendererWatchdog = Object.freeze({
    frames: () => renderedFrames,
    fps: () => fps,
    lastError: () => lastError,
    fallbackDraws: () => fallbackDraws
  });
})();

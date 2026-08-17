/* Pueblo Atelier · P9.3 · viajes de cámara cinematográficos */

const p9CameraProfiles = Object.freeze({
  overview: { yaw: .78, pitch: .86 },
  atelier: { yaw: .69, pitch: .73 },
  izc: { yaw: .88, pitch: .72 },
  stitch: { yaw: .58, pitch: .72 }
});

let p9CameraSequence = 0;
let p9CameraTimers = [];
let p9CameraRaf = 0;

function p9ClearCameraTimers() {
  p9CameraTimers.forEach((timer) => window.clearTimeout(timer));
  p9CameraTimers = [];
  if (p9CameraRaf) cancelAnimationFrame(p9CameraRaf);
  p9CameraRaf = 0;
}

function p9CameraProfile(name, target) {
  if (p9CameraProfiles[name]) return p9CameraProfiles[name];
  const horizontalBias = clamp((target?.[0] || 0) * .0075, -.12, .12);
  const depthBias = clamp((target?.[2] || 0) * .0025, -.045, .045);
  return {
    yaw: .74 + horizontalBias,
    pitch: .73 - depthBias
  };
}

function p9EaseCinematic(t) {
  const clamped = clamp(t, 0, 1);
  return clamped < .5
    ? 4 * clamped * clamped * clamped
    : 1 - Math.pow(-2 * clamped + 2, 3) / 2;
}

function p9ShortestAngle(from, to) {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

function p9AnimateOrientation(toYaw, toPitch, duration, token) {
  if (reducedMotion.matches || duration <= 0) {
    camera.yaw = toYaw;
    camera.pitch = toPitch;
    return;
  }

  if (p9CameraRaf) cancelAnimationFrame(p9CameraRaf);
  const fromYaw = camera.yaw;
  const fromPitch = camera.pitch;
  const yawDelta = p9ShortestAngle(fromYaw, toYaw);
  const pitchDelta = toPitch - fromPitch;
  const started = performance.now();

  const step = (now) => {
    if (token !== p9CameraSequence) return;
    const t = p9EaseCinematic((now - started) / duration);
    camera.yaw = fromYaw + yawDelta * t;
    camera.pitch = fromPitch + pitchDelta * t;
    if (t < 1) p9CameraRaf = requestAnimationFrame(step);
    else p9CameraRaf = 0;
  };
  p9CameraRaf = requestAnimationFrame(step);
}

function p9ScheduleCamera(delay, callback, token) {
  const timer = window.setTimeout(() => {
    if (token === p9CameraSequence) callback();
  }, delay);
  p9CameraTimers.push(timer);
}

function p9FinishCameraJourney(name, token) {
  if (token !== p9CameraSequence) return;
  if (root) {
    delete root.dataset.cinematicCamera;
    delete root.dataset.cinematicDestination;
    root.dataset.webglPhase = 'p9.3';
  }
  if (typeof webglCameraTimer !== 'undefined') {
    window.clearTimeout(webglCameraTimer);
    webglCameraTimer = null;
  }
  root?.removeAttribute('data-camera-moving');
  const provider = typeof webglProviderByPlace !== 'undefined' ? webglProviderByPlace.get(name) : null;
  if (status && !root?.dataset.webglError) {
    status.textContent = name === 'overview'
      ? 'P9.3 · vista territorial recuperada'
      : `${provider?.displayName || webglInteractionPlaces[name]?.title || 'Taller'} · encuadre cinematográfico`;
  }
}

function p9CancelCameraJourney({ keepCurrent = true } = {}) {
  if (!root?.dataset.cinematicCamera) return;
  p9CameraSequence += 1;
  p9ClearCameraTimers();
  if (keepCurrent) {
    camera.desired = [...camera.target];
    camera.desiredDistance = camera.distance;
  }
  delete root.dataset.cinematicCamera;
  delete root.dataset.cinematicDestination;
  root.removeAttribute('data-camera-moving');
}

function p9RunCameraJourney(name, invokeBase) {
  const place = places[name];
  if (!place) return;

  p9CameraSequence += 1;
  const token = p9CameraSequence;
  p9ClearCameraTimers();

  if (reducedMotion.matches) {
    invokeBase();
    const profile = p9CameraProfile(name, place.target);
    camera.yaw = profile.yaw;
    camera.pitch = profile.pitch;
    window.setTimeout(() => {
      if (root) root.dataset.webglPhase = 'p9.3';
    }, 0);
    return;
  }

  const mobile = window.matchMedia('(max-width: 760px)').matches;
  const tablet = !mobile && window.matchMedia('(max-width: 1050px)').matches;
  const startTarget = [...camera.target];
  const startDistance = camera.distance;
  const startYaw = camera.yaw;
  const startPitch = camera.pitch;

  /* Ejecuta primero P8.2: selección, acuarela, ficha y estado quedan intactos. */
  invokeBase();
  const finalTarget = [...camera.desired];
  const finalDistance = camera.desiredDistance;
  const profile = p9CameraProfile(name, finalTarget);

  if (root) {
    root.dataset.cinematicCamera = 'true';
    root.dataset.cinematicDestination = name;
    root.setAttribute('data-camera-moving', 'true');
  }

  if (typeof webglCameraTimer !== 'undefined') window.clearTimeout(webglCameraTimer);

  const direction = Math.sign(finalTarget[0] - startTarget[0]) || (name === 'overview' ? -1 : 1);
  const breath = mobile ? .65 : tablet ? 1.0 : 1.35;
  const orbit = direction * (mobile ? .025 : tablet ? .045 : .07);
  const stageOne = mobile ? 150 : 190;
  const stageTwo = mobile ? 330 : 470;
  const stageThree = mobile ? 540 : 720;
  const finishAt = mobile ? 980 : 1360;

  /* 1. Respiración: mantiene el origen y abre el encuadre. */
  camera.desired = [...startTarget];
  camera.desiredDistance = Math.min(48, Math.max(startDistance, finalDistance) + breath);
  p9AnimateOrientation(startYaw + orbit, Math.min(.9, startPitch + (mobile ? .01 : .025)), stageTwo, token);

  /* 2. Travelling: avanza por el territorio sin caer todavía sobre el edificio. */
  p9ScheduleCamera(stageOne, () => {
    camera.desired = mix3(startTarget, finalTarget, mobile ? .42 : .30);
    camera.desiredDistance = Math.max(finalDistance + (mobile ? 1.0 : 2.7), startDistance * (mobile ? .90 : .94));
  }, token);

  p9ScheduleCamera(stageTwo, () => {
    camera.desired = mix3(startTarget, finalTarget, mobile ? .78 : .70);
    camera.desiredDistance = finalDistance + (mobile ? .45 : 1.1);
    p9AnimateOrientation(profile.yaw, profile.pitch + (mobile ? .015 : .025), mobile ? 300 : 460, token);
  }, token);

  /* 3. Encuadre: llega al destino con la inclinación propia de cada taller. */
  p9ScheduleCamera(stageThree, () => {
    camera.desired = [...finalTarget];
    camera.desiredDistance = finalDistance;
    p9AnimateOrientation(profile.yaw, profile.pitch, mobile ? 360 : 620, token);
  }, token);

  p9ScheduleCamera(finishAt, () => p9FinishCameraJourney(name, token), token);

  if (typeof webglCameraTimer !== 'undefined') {
    webglCameraTimer = window.setTimeout(() => {
      if (token === p9CameraSequence) root?.removeAttribute('data-camera-moving');
    }, finishAt + 20);
  }
}

const p9BaseFocusPlace = webglFocusPlace;
webglFocusPlace = function p9FocusPlaceCinematic(name) {
  p9RunCameraJourney(name, () => p9BaseFocusPlace(name));
};

const p9BaseFocusOverview = webglFocusOverview;
webglFocusOverview = function p9FocusOverviewCinematic() {
  p9RunCameraJourney('overview', () => p9BaseFocusOverview());
};

/* Si el usuario toma el control manual, la película termina inmediatamente. */
canvas.addEventListener('pointerdown', () => p9CancelCameraJourney(), { capture: true });
canvas.addEventListener('wheel', () => p9CancelCameraJourney(), { capture: true, passive: true });

window.setTimeout(() => {
  if (root) root.dataset.webglPhase = 'p9.3';
  const label = document.querySelector('.webgl-village-heading > span');
  if (label) label.textContent = 'Laboratorio P9.3 · cámara cinematográfica';
  if (status && !root?.dataset.webglError) status.textContent = 'P9.3 · selecciona un taller para iniciar el viaje';
}, 120);

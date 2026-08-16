/* Atelier Lumière · U3.5A · materiales procedurales premium */
(() => {
  const quality = typeof webglQualityMode === 'string' ? webglQualityMode : 'balanced';
  const detail = quality === 'high' ? 1.0 : quality === 'balanced' ? 0.72 : 0.44;

  const MATERIAL = Object.freeze({
    STUCCO: 1,
    ROOF: 2,
    STONE: 3,
    WOOD: 4,
    GLASS: 5,
    METAL: 6,
    EARTH: 7,
    VEGETATION: 8
  });

  const premiumProgram = program(`#version 300 es
in vec3 aPosition;
in vec3 aNormal;
uniform mat4 uModel;
uniform mat4 uViewProjection;
uniform vec3 uCamera;
out vec3 vNormal;
out vec3 vWorld;
out vec3 vLocal;
out float vDistance;
void main() {
  vec4 world = uModel * vec4(aPosition, 1.0);
  vWorld = world.xyz;
  vLocal = aPosition;
  vNormal = normalize(mat3(uModel) * aNormal);
  vDistance = distance(world.xyz, uCamera);
  gl_Position = uViewProjection * world;
}` , `#version 300 es
precision highp float;
in vec3 vNormal;
in vec3 vWorld;
in vec3 vLocal;
in float vDistance;
uniform vec4 uColor;
uniform vec3 uLight;
uniform vec3 uFogColor;
uniform vec3 uPaperColor;
uniform vec3 uCamera;
uniform int uMaterial;
uniform float uDetail;
out vec4 outColor;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float value = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 3; i++) {
    value += noise2(p) * amp;
    p = p * 2.07 + vec2(13.7, 7.3);
    amp *= 0.5;
  }
  return value;
}
vec2 surfaceUV(vec3 n, vec3 world) {
  vec3 a = abs(n);
  if (a.y >= a.x && a.y >= a.z) return world.xz;
  if (a.x >= a.z) return world.zy;
  return world.xy;
}
float mortarGrid(vec2 uv, float scale) {
  vec2 cell = fract(uv * scale);
  float edge = min(min(cell.x, 1.0 - cell.x), min(cell.y, 1.0 - cell.y));
  return 1.0 - smoothstep(0.018, 0.07, edge);
}

void main() {
  vec3 normal = normalize(vNormal);
  vec3 lightDir = normalize(uLight);
  vec3 viewDir = normalize(uCamera - vWorld);
  vec3 halfDir = normalize(lightDir + viewDir);
  vec2 uv = surfaceUV(normal, vWorld);

  float lambert = max(dot(normal, lightDir), 0.0);
  float upward = clamp(normal.y * 0.5 + 0.5, 0.0, 1.0);
  float banded = floor(lambert * 5.0 + 0.48) / 5.0;
  float softLight = mix(lambert, banded, 0.16 * uDetail);
  float verticalShade = (1.0 - upward) * 0.07;
  float shade = 0.79 + softLight * 0.235 - verticalShade;

  vec3 base = mix(uColor.rgb, uPaperColor, 0.025);
  vec3 color = base * shade;
  float roughness = 0.78;
  float specularStrength = 0.0;

  float screenGrain = hash21(gl_FragCoord.xy * (0.37 + 0.21 * uDetail));
  float worldGrain = fbm(uv * (2.3 + 2.5 * uDetail));

  if (uMaterial == 1) {
    /* Estuco / cal: poro fino, manchas suaves y fibra mineral. */
    float pore = hash21(floor(uv * (31.0 + 27.0 * uDetail)));
    float wash = fbm(uv * 1.7 + 4.3);
    color *= 0.955 + worldGrain * 0.075;
    color = mix(color, color * 0.91, smoothstep(0.965, 1.0, pore) * 0.34 * uDetail);
    color += (wash - 0.5) * 0.018 * uDetail;
    roughness = 0.92;
  } else if (uMaterial == 2) {
    /* Teja: bandas, juntas y variación terracota sin bitmap. */
    float rows = abs(sin((uv.y + worldGrain * 0.045) * 11.4));
    float ridges = pow(abs(sin(uv.x * 17.0 + floor(uv.y * 3.6) * 0.72)), 12.0);
    float grout = smoothstep(0.90, 0.995, rows);
    float fired = fbm(uv * 3.8 + 11.0);
    color *= 0.90 + fired * 0.17;
    color *= 1.0 - grout * 0.095 * uDetail;
    color += ridges * vec3(0.055, 0.032, 0.016) * uDetail;
    roughness = 0.76;
  } else if (uMaterial == 3) {
    /* Piedra: bloques irregulares y junta muy discreta. */
    vec2 stoneUv = uv + vec2(floor(uv.y * 1.7) * 0.18, 0.0);
    float joints = mortarGrid(stoneUv, 1.55 + 0.35 * uDetail);
    float block = hash21(floor(stoneUv * (1.55 + 0.35 * uDetail)));
    color *= 0.90 + block * 0.15;
    color = mix(color, uPaperColor * 0.83, joints * 0.22 * uDetail);
    color += (worldGrain - 0.5) * 0.026;
    roughness = 0.96;
  } else if (uMaterial == 4) {
    /* Madera: veta longitudinal con pequeños cambios de tono. */
    float warp = noise2(vec2(uv.y * 0.75, uv.x * 0.21)) * 0.9;
    float grain = sin((uv.y + warp * 0.095) * 29.0) * 0.5 + 0.5;
    float fine = sin((uv.y + warp * 0.04) * 71.0) * 0.5 + 0.5;
    float knot = smoothstep(0.86, 1.0, noise2(uv * vec2(1.4, 3.8)));
    color *= 0.88 + grain * 0.12 + fine * 0.035;
    color *= 1.0 - knot * 0.07 * uDetail;
    roughness = 0.70;
    specularStrength = 0.035;
  } else if (uMaterial == 5) {
    /* Cristal / luz: reflejo de borde, profundidad y brillo cálido controlado. */
    float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 3.0);
    float pane = 0.5 + 0.5 * sin((uv.x + uv.y) * 8.0 + worldGrain * 2.0);
    color = mix(color, uPaperColor, 0.055);
    color += fresnel * vec3(0.16, 0.14, 0.10) * (0.55 + 0.45 * uDetail);
    color += pane * vec3(0.022, 0.018, 0.010) * uDetail;
    roughness = 0.20;
    specularStrength = 0.32;
  } else if (uMaterial == 6) {
    /* Latón / metal pintado: brillo cepillado, nunca cromado. */
    float brushed = sin(uv.y * 96.0 + worldGrain * 4.0) * 0.5 + 0.5;
    color *= 0.91 + brushed * 0.09;
    roughness = 0.38;
    specularStrength = 0.36;
  } else if (uMaterial == 7) {
    /* Camino / tierra: grano mineral y variación de compactación. */
    float pebble = hash21(floor(uv * (17.0 + 15.0 * uDetail)));
    float compact = fbm(uv * 1.55 + 19.0);
    color *= 0.91 + compact * 0.13;
    color += (pebble - 0.5) * 0.028 * uDetail;
    roughness = 1.0;
  } else if (uMaterial == 8) {
    /* Vegetación: moteado orgánico para romper superficies planas. */
    float leaves = noise2(uv * (5.0 + 3.0 * uDetail));
    float fleck = hash21(floor(uv * 23.0));
    color *= 0.84 + leaves * 0.22;
    color += (fleck - 0.5) * 0.022 * uDetail;
    roughness = 0.94;
  }

  /* Brillo físicamente sugerido, muy controlado para conservar el acabado editorial. */
  float shininess = mix(7.0, 42.0, 1.0 - roughness);
  float specular = pow(max(dot(normal, halfDir), 0.0), shininess) * specularStrength;
  float metalTint = uMaterial == 6 ? 1.0 : 0.0;
  color += specular * mix(vec3(1.0), vec3(0.96, 0.78, 0.48), metalTint) * (0.55 + 0.45 * uDetail);

  /* Fibra de papel común a todos los materiales: une la escena visualmente. */
  float fibre = sin(gl_FragCoord.x * 0.31 + gl_FragCoord.y * 0.083 + worldGrain * 7.0) * 0.5 + 0.5;
  color += (screenGrain - 0.5) * 0.008 * uDetail;
  color += (fibre - 0.5) * 0.0045 * uDetail;

  /* Perspectiva atmosférica: el detalle se funde antes de llegar al horizonte. */
  float fog = smoothstep(27.0, 62.0, vDistance);
  color = mix(color, uFogColor, fog * 0.74);
  color = mix(color, uPaperColor, fog * 0.082);

  outColor = vec4(color, uColor.a);
}`);

  const locations = {
    position: gl.getAttribLocation(premiumProgram, 'aPosition'),
    normal: gl.getAttribLocation(premiumProgram, 'aNormal'),
    model: gl.getUniformLocation(premiumProgram, 'uModel'),
    vp: gl.getUniformLocation(premiumProgram, 'uViewProjection'),
    color: gl.getUniformLocation(premiumProgram, 'uColor'),
    camera: gl.getUniformLocation(premiumProgram, 'uCamera'),
    light: gl.getUniformLocation(premiumProgram, 'uLight'),
    fog: gl.getUniformLocation(premiumProgram, 'uFogColor'),
    paper: gl.getUniformLocation(premiumProgram, 'uPaperColor'),
    material: gl.getUniformLocation(premiumProgram, 'uMaterial'),
    detail: gl.getUniformLocation(premiumProgram, 'uDetail')
  };

  function bind(mesh) {
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.position);
    gl.enableVertexAttribArray(locations.position);
    gl.vertexAttribPointer(locations.position, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.normal);
    gl.enableVertexAttribArray(locations.normal);
    gl.vertexAttribPointer(locations.normal, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.index);
  }

  function rgb(color) {
    return [color?.[0] ?? 1, color?.[1] ?? 1, color?.[2] ?? 1];
  }

  function distanceColor(a, b) {
    const aa = rgb(a), bb = rgb(b);
    return Math.hypot(aa[0] - bb[0], aa[1] - bb[1], aa[2] - bb[2]);
  }

  function brightness(color) {
    const c = rgb(color);
    return c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114;
  }

  function materialFor(object) {
    if (Number.isInteger(object?.materialKind)) return object.materialKind;
    const color = p9ObjectColor(object);
    const alpha = color[3] ?? 1;

    if (object?.mesh === meshes.roof) return MATERIAL.ROOF;
    if (distanceColor(color, palette.green) < .20 || distanceColor(color, palette.greenDark) < .20) return MATERIAL.VEGETATION;
    if (distanceColor(color, palette.trunk) < .18) return MATERIAL.WOOD;
    if (distanceColor(color, palette.road) < .20) return MATERIAL.EARTH;

    const nearGround = (object?.position?.[1] ?? 1) < .20 && (object?.scale?.[1] ?? 1) < .09;
    if (nearGround) return MATERIAL.EARTH;

    const thinFace = Math.min(object?.scale?.[0] ?? 1, object?.scale?.[2] ?? 1) < .12;
    const warmBright = color[0] > .72 && color[1] > .36 && brightness(color) > .48;
    if (thinFace && warmBright) return MATERIAL.GLASS;
    if (alpha < .72 && warmBright) return MATERIAL.GLASS;

    if (distanceColor(color, palette.gold) < .20) return MATERIAL.METAL;
    if (distanceColor(color, palette.wine) < .20 || distanceColor(color, palette.wineSoft) < .20) return MATERIAL.WOOD;

    if (typeof p9Stone !== 'undefined' && distanceColor(color, p9Stone) < .20) return MATERIAL.STONE;
    if (typeof p9StoneDark !== 'undefined' && distanceColor(color, p9StoneDark) < .23) return MATERIAL.STONE;

    const neutral = Math.max(color[0], color[1], color[2]) - Math.min(color[0], color[1], color[2]);
    if (brightness(color) < .63 && neutral < .18) return MATERIAL.STONE;
    return MATERIAL.STUCCO;
  }

  const previousDraw = drawObject;
  drawObject = function u35DrawPremiumMaterial(object, vp, cameraPositionValue) {
    const model = modelMatrix(object);
    const color = p9ObjectColor(object);
    const material = materialFor(object);

    gl.useProgram(premiumProgram);
    bind(object.mesh);
    gl.uniformMatrix4fv(locations.model, false, model);
    gl.uniformMatrix4fv(locations.vp, false, vp);
    gl.uniform4fv(locations.color, color);
    gl.uniform3fv(locations.camera, cameraPositionValue);
    gl.uniform3fv(locations.light, p9LightDirection);
    gl.uniform3fv(locations.fog, p9PaperRgb);
    gl.uniform3fv(locations.paper, p9PaperRgb);
    gl.uniform1i(locations.material, material);
    gl.uniform1f(locations.detail, detail);
    gl.drawElements(gl.TRIANGLES, object.mesh.count, gl.UNSIGNED_SHORT, 0);

    if (!object.edges || object.mesh.lineCount <= 0) return;

    /* Conservamos el trazo ilustrado P9.2 encima del material. */
    gl.useProgram(p9IllustrationLineProgram);
    gl.bindBuffer(gl.ARRAY_BUFFER, object.mesh.lines);
    gl.enableVertexAttribArray(p9IllustrationLineLocations.position);
    gl.vertexAttribPointer(p9IllustrationLineLocations.position, 3, gl.FLOAT, false, 0, 0);
    gl.uniformMatrix4fv(p9IllustrationLineLocations.model, false, model);
    gl.uniformMatrix4fv(p9IllustrationLineLocations.vp, false, vp);
    gl.uniform4fv(p9IllustrationLineLocations.color, palette.ink);
    gl.uniform3fv(p9IllustrationLineLocations.camera, cameraPositionValue);
    gl.drawArrays(gl.LINES, 0, object.mesh.lineCount / 3);
  };

  window.AtelierMaterialTextures = Object.freeze({ MATERIAL, materialFor, detail, previousDraw });

  if (root) {
    root.dataset.webglPhase = 'u3.5a';
    root.dataset.materialTextures = 'procedural';
    root.dataset.materialTextureQuality = quality;
  }
  if (status && !root?.dataset.webglError) status.textContent = `U3.5A · materiales procedurales ${quality}`;
})();
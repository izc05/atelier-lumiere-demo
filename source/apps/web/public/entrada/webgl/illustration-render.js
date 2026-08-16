/* Pueblo Atelier · P9.2 · render de ilustración arquitectónica */

const p9IllustrationFillProgram = program(`#version 300 es
in vec3 aPosition;
in vec3 aNormal;
uniform mat4 uModel;
uniform mat4 uViewProjection;
uniform vec3 uCamera;
out vec3 vNormal;
out vec3 vWorld;
out float vDistance;
void main() {
  vec4 world = uModel * vec4(aPosition, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(mat3(uModel) * aNormal);
  vDistance = distance(world.xyz, uCamera);
  gl_Position = uViewProjection * world;
}` , `#version 300 es
precision highp float;
in vec3 vNormal;
in vec3 vWorld;
in float vDistance;
uniform vec4 uColor;
uniform vec3 uLight;
uniform vec3 uFogColor;
uniform vec3 uPaperColor;
out vec4 outColor;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  vec3 normal = normalize(vNormal);
  vec3 lightDir = normalize(uLight);
  float lambert = max(dot(normal, lightDir), 0.0);
  float upward = clamp(normal.y * 0.5 + 0.5, 0.0, 1.0);

  /* Luz editorial: suave, con discretización mínima para recordar una aguada. */
  float banded = floor(lambert * 4.0 + 0.45) / 4.0;
  float softLight = mix(lambert, banded, 0.22);
  float verticalShade = (1.0 - upward) * 0.075;
  float shade = 0.79 + softLight * 0.235 - verticalShade;

  /* Grano doble: papel fino en pantalla + irregularidad estable ligada al mundo. */
  float screenGrain = hash21(gl_FragCoord.xy * 0.73);
  float worldGrain = hash21(vWorld.xz * 5.7 + vWorld.yy * 1.3);
  float fibre = sin((gl_FragCoord.x * 0.48 + gl_FragCoord.y * 0.13) + worldGrain * 5.0) * 0.5 + 0.5;

  /* Rayado apenas visible solo en las caras en sombra. */
  float hatchMask = 1.0 - smoothstep(0.18, 0.68, lambert);
  float hatchLine = smoothstep(0.78, 0.96, fract((gl_FragCoord.x + gl_FragCoord.y * 0.62) * 0.115));

  vec3 base = mix(uColor.rgb, uPaperColor, 0.035);
  vec3 color = base * shade;
  color += (screenGrain - 0.5) * 0.012;
  color += (worldGrain - 0.5) * 0.008;
  color += (fibre - 0.5) * 0.004;
  color -= hatchLine * hatchMask * 0.018;

  /* Perspectiva atmosférica: los fondos desaparecen progresivamente dentro del papel. */
  float fog = smoothstep(27.0, 62.0, vDistance);
  color = mix(color, uFogColor, fog * 0.73);
  color = mix(color, uPaperColor, fog * 0.075);

  outColor = vec4(color, uColor.a);
}`);

const p9IllustrationLineProgram = program(`#version 300 es
in vec3 aPosition;
uniform mat4 uModel;
uniform mat4 uViewProjection;
uniform vec3 uCamera;
out float vDistance;
out vec3 vWorld;
void main() {
  vec4 world = uModel * vec4(aPosition, 1.0);
  vWorld = world.xyz;
  vDistance = distance(world.xyz, uCamera);
  gl_Position = uViewProjection * world;
}` , `#version 300 es
precision highp float;
in float vDistance;
in vec3 vWorld;
uniform vec4 uColor;
out vec4 outColor;
float hash21(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 19.19);
  return fract(p.x * p.y);
}
void main() {
  float fog = smoothstep(24.0, 58.0, vDistance);
  float grain = hash21(gl_FragCoord.xy * 0.37 + vWorld.xz * 2.0);
  float alpha = uColor.a * mix(1.0, 0.42, fog) * mix(0.82, 1.0, grain);
  outColor = vec4(uColor.rgb, alpha);
}`);

const p9IllustrationFillLocations = {
  position: gl.getAttribLocation(p9IllustrationFillProgram, 'aPosition'),
  normal: gl.getAttribLocation(p9IllustrationFillProgram, 'aNormal'),
  model: gl.getUniformLocation(p9IllustrationFillProgram, 'uModel'),
  vp: gl.getUniformLocation(p9IllustrationFillProgram, 'uViewProjection'),
  color: gl.getUniformLocation(p9IllustrationFillProgram, 'uColor'),
  camera: gl.getUniformLocation(p9IllustrationFillProgram, 'uCamera'),
  light: gl.getUniformLocation(p9IllustrationFillProgram, 'uLight'),
  fog: gl.getUniformLocation(p9IllustrationFillProgram, 'uFogColor'),
  paper: gl.getUniformLocation(p9IllustrationFillProgram, 'uPaperColor')
};

const p9IllustrationLineLocations = {
  position: gl.getAttribLocation(p9IllustrationLineProgram, 'aPosition'),
  model: gl.getUniformLocation(p9IllustrationLineProgram, 'uModel'),
  vp: gl.getUniformLocation(p9IllustrationLineProgram, 'uViewProjection'),
  color: gl.getUniformLocation(p9IllustrationLineProgram, 'uColor'),
  camera: gl.getUniformLocation(p9IllustrationLineProgram, 'uCamera')
};

function p9BindIllustrationFill(mesh) {
  gl.bindBuffer(gl.ARRAY_BUFFER, mesh.position);
  gl.enableVertexAttribArray(p9IllustrationFillLocations.position);
  gl.vertexAttribPointer(p9IllustrationFillLocations.position, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, mesh.normal);
  gl.enableVertexAttribArray(p9IllustrationFillLocations.normal);
  gl.vertexAttribPointer(p9IllustrationFillLocations.normal, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.index);
}

function p9ObjectColor(object) {
  const color = object?.color;
  if (!Array.isArray(color) && !(color instanceof Float32Array)) return [1, 1, 1, 1];
  if (color.length >= 4) return color;
  return [color[0] ?? 1, color[1] ?? 1, color[2] ?? 1, 1];
}

const p9LightDirection = new Float32Array([-.42, .88, .31]);
const p9PaperRgb = new Float32Array(palette.paperLight.slice(0, 3));

/* Sombra de contacto muy tenue bajo los tres conjuntos principales y el pabellón. */
function p9AddContactShadow(x, z, sx, sz, rotation = 0, alpha = .055) {
  const shadow = [palette.ink[0], palette.ink[1], palette.ink[2], alpha];
  add(meshes.box, [x, atelierTerrainHeight(x, z) + .055, z], [sx, .008, sz], shadow, rotation, false);
}
p9AddContactShadow(0, .1, 3.65, 2.55, 0, .050);
p9AddContactShadow(-11, 7.55, 3.0, 2.25, 0, .047);
p9AddContactShadow(12, -6.45, 2.95, 2.25, 0, .045);
p9AddContactShadow(17.2, 1.0, .85, .85, 0, .032);

/* El motor P8 sigue animando la cámara; solo cambiamos la forma de dibujar cada objeto. */
drawObject = function p9DrawIllustratedObject(object, vp, cameraPositionValue) {
  const model = modelMatrix(object);
  const color = p9ObjectColor(object);

  gl.useProgram(p9IllustrationFillProgram);
  p9BindIllustrationFill(object.mesh);
  gl.uniformMatrix4fv(p9IllustrationFillLocations.model, false, model);
  gl.uniformMatrix4fv(p9IllustrationFillLocations.vp, false, vp);
  gl.uniform4fv(p9IllustrationFillLocations.color, color);
  gl.uniform3fv(p9IllustrationFillLocations.camera, cameraPositionValue);
  gl.uniform3fv(p9IllustrationFillLocations.light, p9LightDirection);
  gl.uniform3fv(p9IllustrationFillLocations.fog, p9PaperRgb);
  gl.uniform3fv(p9IllustrationFillLocations.paper, p9PaperRgb);
  gl.drawElements(gl.TRIANGLES, object.mesh.count, gl.UNSIGNED_SHORT, 0);

  if (!object.edges || object.mesh.lineCount <= 0) return;

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

/* La tinta se vuelve algo más cálida y menos opaca; P9.2 debe sugerir lápiz, no contorno de juego. */
palette.ink[0] = .245;
palette.ink[1] = .176;
palette.ink[2] = .145;
palette.ink[3] = .165;

window.setTimeout(() => {
  if (root) {
    root.dataset.webglPhase = 'p9.2';
    root.dataset.illustrationRender = 'true';
  }
  const label = document.querySelector('.webgl-village-heading > span');
  if (label) label.textContent = 'Laboratorio P9.2 · ilustración arquitectónica';
  if (status && !root?.dataset.webglError) status.textContent = 'P9.2 · render de tinta, papel y luz editorial';
}, 80);

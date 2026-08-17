const root = document.querySelector('[data-webgl-village]');
const canvas = document.querySelector('[data-webgl-canvas]');
const status = document.querySelector('[data-webgl-status]');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const gl = canvas?.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'high-performance' });
if (!gl) {
  if (root) root.dataset.webglError = 'true';
  if (status) status.textContent = 'WebGL no disponible · usa el mapa ligero';
  throw new Error('WebGL2 no disponible');
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const mix = (a, b, t) => a + (b - a) * t;
const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const hex = (value) => {
  const n = Number.parseInt(value.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1];
};

const palette = {
  paper: hex('#f4eddf'),
  paperLight: hex('#fffdf8'),
  paperDeep: hex('#e7d9c7'),
  road: hex('#d8c7b0'),
  wine: hex('#4f1020'),
  wineSoft: hex('#7b3544'),
  roof: hex('#9a8068'),
  linen: hex('#b6a18d'),
  gold: hex('#a78342'),
  green: hex('#9da88a'),
  greenDark: hex('#778167'),
  trunk: hex('#9c775d'),
  ink: [0.20, 0.15, 0.14, 0.32]
};

function mat4Identity() {
  return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
}
function mat4Multiply(a, b) {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] =
        a[0 * 4 + r] * b[c * 4 + 0] +
        a[1 * 4 + r] * b[c * 4 + 1] +
        a[2 * 4 + r] * b[c * 4 + 2] +
        a[3 * 4 + r] * b[c * 4 + 3];
    }
  }
  return out;
}
function mat4Translation(x, y, z) {
  const m = mat4Identity(); m[12] = x; m[13] = y; m[14] = z; return m;
}
function mat4Scale(x, y, z) {
  const m = mat4Identity(); m[0] = x; m[5] = y; m[10] = z; return m;
}
function mat4RotationY(a) {
  const c = Math.cos(a), s = Math.sin(a);
  return new Float32Array([c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1]);
}
function mat4Perspective(fov, aspect, near, far) {
  const f = 1 / Math.tan(fov / 2), nf = 1 / (near - far);
  return new Float32Array([
    f / aspect,0,0,0,
    0,f,0,0,
    0,0,(far + near) * nf,-1,
    0,0,(2 * far * near) * nf,0
  ]);
}
function normalize3(v) {
  const d = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0]/d, v[1]/d, v[2]/d];
}
function cross3(a, b) {
  return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
}
function sub3(a, b) { return [a[0]-b[0], a[1]-b[1], a[2]-b[2]]; }
function mat4LookAt(eye, center, up = [0,1,0]) {
  const z = normalize3(sub3(eye, center));
  const x = normalize3(cross3(up, z));
  const y = cross3(z, x);
  return new Float32Array([
    x[0],y[0],z[0],0,
    x[1],y[1],z[1],0,
    x[2],y[2],z[2],0,
    -(x[0]*eye[0]+x[1]*eye[1]+x[2]*eye[2]),
    -(y[0]*eye[0]+y[1]*eye[1]+y[2]*eye[2]),
    -(z[0]*eye[0]+z[1]*eye[1]+z[2]*eye[2]),1
  ]);
}
function modelMatrix(object) {
  const t = mat4Translation(...object.position);
  const r = mat4RotationY(object.rotation || 0);
  const s = mat4Scale(...object.scale);
  return mat4Multiply(t, mat4Multiply(r, s));
}

function compile(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source); gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
  return shader;
}
function program(vertex, fragment) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl.VERTEX_SHADER, vertex));
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fragment));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  return p;
}

const fillProgram = program(`#version 300 es
in vec3 aPosition; in vec3 aNormal;
uniform mat4 uModel; uniform mat4 uViewProjection; uniform vec3 uCamera;
out vec3 vNormal; out float vDistance;
void main(){
  vec4 world = uModel * vec4(aPosition,1.0);
  vNormal = normalize(mat3(uModel) * aNormal);
  vDistance = distance(world.xyz,uCamera);
  gl_Position = uViewProjection * world;
}` , `#version 300 es
precision highp float;
in vec3 vNormal; in float vDistance;
uniform vec4 uColor; uniform vec3 uLight; uniform vec3 uFogColor;
out vec4 outColor;
void main(){
  float light = max(dot(normalize(vNormal),normalize(uLight)),0.0);
  float shade = 0.72 + light * 0.30;
  float grain = fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233))) * 43758.5453);
  vec3 color = uColor.rgb * shade + (grain-.5) * .018;
  float fog = smoothstep(24.0,58.0,vDistance);
  color = mix(color,uFogColor,fog*.78);
  outColor = vec4(color,uColor.a);
}`);
const lineProgram = program(`#version 300 es
in vec3 aPosition; uniform mat4 uModel; uniform mat4 uViewProjection;
void main(){ gl_Position = uViewProjection * uModel * vec4(aPosition,1.0); }
`, `#version 300 es
precision highp float; uniform vec4 uColor; out vec4 outColor;
void main(){ outColor=uColor; }
`);

const fillLocations = {
  position: gl.getAttribLocation(fillProgram, 'aPosition'), normal: gl.getAttribLocation(fillProgram, 'aNormal'),
  model: gl.getUniformLocation(fillProgram, 'uModel'), vp: gl.getUniformLocation(fillProgram, 'uViewProjection'),
  color: gl.getUniformLocation(fillProgram, 'uColor'), camera: gl.getUniformLocation(fillProgram, 'uCamera'),
  light: gl.getUniformLocation(fillProgram, 'uLight'), fog: gl.getUniformLocation(fillProgram, 'uFogColor')
};
const lineLocations = {
  position: gl.getAttribLocation(lineProgram, 'aPosition'), model: gl.getUniformLocation(lineProgram, 'uModel'),
  vp: gl.getUniformLocation(lineProgram, 'uViewProjection'), color: gl.getUniformLocation(lineProgram, 'uColor')
};

function makeMesh(positions, normals, indices, lines) {
  const mesh = { count: indices.length, lineCount: lines.length };
  mesh.position = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, mesh.position); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
  mesh.normal = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, mesh.normal); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normals), gl.STATIC_DRAW);
  mesh.index = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.index); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);
  mesh.lines = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, mesh.lines); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(lines), gl.STATIC_DRAW);
  return mesh;
}

function boxMesh() {
  const p = [
    -1,-1,1, 1,-1,1, 1,1,1, -1,1,1,
    1,-1,-1,-1,-1,-1,-1,1,-1,1,1,-1,
    -1,1,1,1,1,1,1,1,-1,-1,1,-1,
    -1,-1,-1,1,-1,-1,1,-1,1,-1,-1,1,
    1,-1,1,1,-1,-1,1,1,-1,1,1,1,
    -1,-1,-1,-1,-1,1,-1,1,1,-1,1,-1
  ];
  const n=[]; [[0,0,1],[0,0,-1],[0,1,0],[0,-1,0],[1,0,0],[-1,0,0]].forEach(v=>{for(let i=0;i<4;i++)n.push(...v)});
  const idx=[]; for(let f=0;f<6;f++){const o=f*4;idx.push(o,o+1,o+2,o,o+2,o+3)}
  const c=[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]];
  const e=[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
  return makeMesh(p,n,idx,e.flatMap(pair=>[...c[pair[0]],...c[pair[1]]]));
}
function roofMesh() {
  const v=[[-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,1],[0,1,-1],[0,1,1]];
  const faces=[[0,1,2,3],[0,4,5,3],[1,4,5,2],[0,1,4],[3,2,5]];
  const p=[],n=[],idx=[];
  for(const face of faces){const a=v[face[0]],b=v[face[1]],c=v[face[2]];const normal=normalize3(cross3(sub3(b,a),sub3(c,a)));const o=p.length/3;face.forEach(i=>{p.push(...v[i]);n.push(...normal)});if(face.length===4)idx.push(o,o+1,o+2,o,o+2,o+3);else idx.push(o,o+1,o+2)}
  const edges=[[0,1],[1,2],[2,3],[3,0],[0,4],[1,4],[3,5],[2,5],[4,5]];
  return makeMesh(p,n,idx,edges.flatMap(pair=>[...v[pair[0]],...v[pair[1]]]));
}
function coneMesh(segments=7) {
  const p=[],n=[],idx=[],lines=[];
  for(let i=0;i<segments;i++){
    const a=i/segments*Math.PI*2,b=(i+1)/segments*Math.PI*2;
    const p0=[Math.cos(a),-1,Math.sin(a)],p1=[Math.cos(b),-1,Math.sin(b)],top=[0,1,0];
    const normal=normalize3(cross3(sub3(p1,p0),sub3(top,p0)));const o=p.length/3;
    [p0,p1,top].forEach(q=>{p.push(...q);n.push(...normal)});idx.push(o,o+1,o+2);lines.push(...p0,...p1,...p0,...top);
  }
  return makeMesh(p,n,idx,lines);
}
const meshes={box:boxMesh(),roof:roofMesh(),cone:coneMesh()};
const objects=[];
function add(mesh, position, scale, color, rotation=0, edges=true){objects.push({mesh,position,scale,color,rotation,edges});}
function building(x,z,s=1,accent=palette.roof,facade=palette.paperLight){
  add(meshes.box,[x,.72*s,z],[1.05*s,.72*s,.85*s],facade,0,true);
  add(meshes.roof,[x,1.62*s,z],[1.2*s,.52*s,1.02*s],accent,0,true);
  add(meshes.box,[x+.45*s,.52*s,z+.86*s],[.22*s,.52*s,.08*s],palette.wineSoft,0,false);
}
function tree(x,z,s=1){
  add(meshes.box,[x,.28*s,z],[.10*s,.28*s,.10*s],palette.trunk,0,false);
  add(meshes.cone,[x,.94*s,z],[.55*s,.82*s,.55*s],palette.green,0,true);
  add(meshes.cone,[x,1.48*s,z],[.42*s,.65*s,.42*s],palette.greenDark,0,true);
}

add(meshes.box,[0,-.26,0],[22,.25,16],palette.paperDeep,0,false);
add(meshes.box,[0,-.02,0],[20.8,.04,14.8],palette.paper,0,false);
for(const field of [
  [-14,-8,5.3,2.6,.12],[-7,-9,4.2,2.1,-.08],[10,-9,4.8,2.2,.08],[15,-5,3.8,2.1,-.12],
  [-15,5,4.5,2.6,-.05],[-9,9,5,2.1,.1],[9,9,5.2,2.2,-.08],[15,6,3.7,2.5,.08]
]) add(meshes.box,[field[0],.02,field[1]],[field[2],.035,field[3]],mix3(palette.paperDeep,palette.paperLight,.55),field[4],false);
for(const road of [[0,0,18,.13,0], [0,0,14,.12,Math.PI/2],[-8,-4,8,.09,.58],[9,-5,9,.09,-.52],[-9,6,8,.09,-.55],[9,6,8,.09,.55]]) {
  add(meshes.box,[road[0],.07,road[1]],[road[2],.025,road[3]],palette.road,road[4],false);
}
add(meshes.box,[0,.09,0],[2.7,.03,2.7],mix3(palette.paperDeep,palette.gold,.28),Math.PI/4,false);

building(0,0,1.55,palette.wine,palette.paperLight);
building(-11,7,1.25,palette.wine,palette.paperLight);
building(12,-7,1.25,palette.linen,palette.paperLight);

const houses=[[-16,-9,.8],[-12,-9,.7],[-8,-7,.78],[-4,-9,.7],[5,-9,.78],[9,-10,.68],[15,-9,.78],[17,-5,.7],[-17,-3,.68],[-13,-1,.82],[-8,-2,.72],[-4,-4,.66],[5,-3,.7],[9,-2,.78],[15,-1,.7],[17,3,.72],[-16,5,.75],[-13,9,.68],[-7,8,.75],[-3,6,.65],[5,7,.72],[9,9,.78],[14,8,.67],[17,6,.72]];
houses.forEach(([x,z,s],i)=>building(x,z,s,i%5===0?mix3(palette.roof,palette.wine,.25):palette.roof,mix3(palette.paperDeep,palette.paperLight,.6)));
const trees=[[-18,-11,1],[-15,-7,.8],[-11,-11,.9],[-6,-11,1.05],[-1,-11,.7],[4,-11,.9],[8,-12,.75],[13,-11,1],[18,-9,.9],[18,-2,1.1],[17,5,.8],[18,10,1], [13,11,.8],[9,12,1.05],[4,11,.75],[-1,12,.95],[-6,11,.8],[-11,12,1],[-16,10,.9],[-18,6,1.05],[-18,0,.85],[-15,2,.7],[-10,4,.78],[-6,3,.7],[7,3,.7],[11,2,.8],[14,4,.75]];
trees.forEach(t=>tree(...t));

function bindFill(mesh){
  gl.bindBuffer(gl.ARRAY_BUFFER,mesh.position); gl.enableVertexAttribArray(fillLocations.position); gl.vertexAttribPointer(fillLocations.position,3,gl.FLOAT,false,0,0);
  gl.bindBuffer(gl.ARRAY_BUFFER,mesh.normal); gl.enableVertexAttribArray(fillLocations.normal); gl.vertexAttribPointer(fillLocations.normal,3,gl.FLOAT,false,0,0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,mesh.index);
}
function drawObject(object,vp,camera){
  const model=modelMatrix(object);
  gl.useProgram(fillProgram); bindFill(object.mesh);
  gl.uniformMatrix4fv(fillLocations.model,false,model); gl.uniformMatrix4fv(fillLocations.vp,false,vp);
  gl.uniform4fv(fillLocations.color,object.color); gl.uniform3fv(fillLocations.camera,camera);
  gl.uniform3fv(fillLocations.light,new Float32Array([-0.35,.86,.42])); gl.uniform3fv(fillLocations.fog,new Float32Array(palette.paperLight.slice(0,3)));
  gl.drawElements(gl.TRIANGLES,object.mesh.count,gl.UNSIGNED_SHORT,0);
  if(!object.edges) return;
  gl.useProgram(lineProgram); gl.bindBuffer(gl.ARRAY_BUFFER,object.mesh.lines); gl.enableVertexAttribArray(lineLocations.position); gl.vertexAttribPointer(lineLocations.position,3,gl.FLOAT,false,0,0);
  gl.uniformMatrix4fv(lineLocations.model,false,model); gl.uniformMatrix4fv(lineLocations.vp,false,vp); gl.uniform4fv(lineLocations.color,palette.ink);
  gl.drawArrays(gl.LINES,0,object.mesh.lineCount/3);
}

const camera={target:[1.5,0,0],desired:[1.5,0,0],distance:33,desiredDistance:33,yaw:.74,pitch:.72};
const places={overview:{target:[1.5,0,0],distance:33},atelier:{target:[0,0,0],distance:17},izc:{target:[-11,0,7],distance:14},stitch:{target:[12,0,-7],distance:14}};
let dragging=false,lastX=0,lastY=0,lastTime=performance.now();
function resize(){
  const dpr=Math.min(window.devicePixelRatio||1,1.6);const w=Math.max(1,Math.round(canvas.clientWidth*dpr)),h=Math.max(1,Math.round(canvas.clientHeight*dpr));
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h}gl.viewport(0,0,w,h);
}
function cameraPosition(){
  const flat=Math.cos(camera.pitch)*camera.distance;
  return [camera.target[0]+Math.sin(camera.yaw)*flat, Math.sin(camera.pitch)*camera.distance, camera.target[2]+Math.cos(camera.yaw)*flat];
}
function frame(now){
  resize();
  const dt=Math.min(.05,(now-lastTime)/1000);lastTime=now;const k=reducedMotion.matches?1:1-Math.exp(-dt*5.5);
  camera.target=mix3(camera.target,camera.desired,k);camera.distance=mix(camera.distance,camera.desiredDistance,k);
  const eye=cameraPosition();const aspect=canvas.width/canvas.height;const proj=mat4Perspective(36*Math.PI/180,aspect,.1,100);const view=mat4LookAt(eye,camera.target);const vp=mat4Multiply(proj,view);
  gl.enable(gl.DEPTH_TEST);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.clearColor(...palette.paperLight);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  objects.forEach(o=>drawObject(o,vp,eye));
  requestAnimationFrame(frame);
}

canvas.addEventListener('pointerdown',(e)=>{if(e.button!==0)return;dragging=true;lastX=e.clientX;lastY=e.clientY;canvas.classList.add('is-dragging');canvas.setPointerCapture?.(e.pointerId)});
canvas.addEventListener('pointermove',(e)=>{if(!dragging)return;const dx=e.clientX-lastX,dy=e.clientY-lastY;lastX=e.clientX;lastY=e.clientY;const unit=camera.desiredDistance*.0022;const right=[Math.cos(camera.yaw),0,-Math.sin(camera.yaw)];const forward=[-Math.sin(camera.yaw),0,-Math.cos(camera.yaw)];camera.desired[0]+=(-dx*right[0]+dy*forward[0])*unit;camera.desired[2]+=(-dx*right[2]+dy*forward[2])*unit;});
function endDrag(e){dragging=false;canvas.classList.remove('is-dragging');if(e?.pointerId!==undefined)canvas.releasePointerCapture?.(e.pointerId)}
canvas.addEventListener('pointerup',endDrag);canvas.addEventListener('pointercancel',endDrag);
canvas.addEventListener('wheel',(e)=>{e.preventDefault();camera.desiredDistance=clamp(camera.desiredDistance*Math.exp(e.deltaY*.001),10,48)},{passive:false});
window.addEventListener('resize',resize,{passive:true});
for(const button of document.querySelectorAll('[data-camera-place]')){
  button.addEventListener('click',()=>{const place=places[button.dataset.cameraPlace];if(!place)return;camera.desired=[...place.target];camera.desiredDistance=place.distance;document.querySelectorAll('[data-camera-place]').forEach(b=>b.classList.toggle('is-active',b===button));});
}

document.querySelector('[data-camera-place="overview"]')?.classList.add('is-active');
if(root){root.dataset.ready='true';root.dataset.webglPhase='p8.1'}
if(status)status.textContent='WebGL activo · escena 3D procedimental';
requestAnimationFrame(frame);

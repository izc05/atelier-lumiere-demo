/* Atelier Lumière · U3.10 · agua, cristal y metal con reflejo ligero */
(() => {
  if (!root || !window.AtelierMaterialTextures) return;
  if (typeof drawObject !== 'function' || typeof program !== 'function' || typeof modelMatrix !== 'function') return;

  const MATERIAL = window.AtelierMaterialTextures.MATERIAL;
  const quality = typeof webglQualityMode === 'string' ? webglQualityMode : 'balanced';
  if (quality === 'lite') {
    root.dataset.reflectiveMaterials='u3.10-lite-fallback';
    return;
  }

  const reflectiveProgram = program(`#version 300 es
in vec3 aPosition;
in vec3 aNormal;
uniform mat4 uModel;
uniform mat4 uViewProjection;
uniform vec3 uCamera;
out vec3 vNormal;
out vec3 vWorld;
out vec2 vLocalXZ;
out float vDistance;
void main(){
  vec4 world=uModel*vec4(aPosition,1.0);
  vWorld=world.xyz;
  vNormal=normalize(mat3(uModel)*aNormal);
  vLocalXZ=aPosition.xz;
  vDistance=distance(world.xyz,uCamera);
  gl_Position=uViewProjection*world;
}` , `#version 300 es
precision highp float;
in vec3 vNormal;
in vec3 vWorld;
in vec2 vLocalXZ;
in float vDistance;
uniform vec4 uColor;
uniform vec3 uCamera;
uniform vec3 uLight;
uniform vec3 uFogColor;
uniform vec3 uPaperColor;
uniform float uTime;
uniform int uKind;
uniform float uWater;
uniform float uDetail;
out vec4 outColor;

float hash21(vec2 p){
  p=fract(p*vec2(123.34,456.21));
  p+=dot(p,p+45.32);
  return fract(p.x*p.y);
}
float noise2(vec2 p){
  vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  float a=hash21(i),b=hash21(i+vec2(1.0,0.0)),c=hash21(i+vec2(0.0,1.0)),d=hash21(i+vec2(1.0,1.0));
  return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);
}

void main(){
  vec3 n=normalize(vNormal);
  vec3 viewDir=normalize(uCamera-vWorld);
  vec3 lightDir=normalize(uLight);
  vec3 halfDir=normalize(lightDir+viewDir);
  float fresnel=pow(1.0-max(dot(n,viewDir),0.0),3.0);
  float ndl=max(dot(n,lightDir),0.0);
  vec3 color=uColor.rgb;
  float alpha=uColor.a;

  if(uKind==5){
    float waveA=sin(vWorld.x*2.1+vWorld.z*.9+uTime*.46);
    float waveB=sin(vWorld.z*3.0-vWorld.x*.55-uTime*.31);
    float ripple=(waveA+waveB)*.5;
    float sparkle=pow(max(dot(n,halfDir),0.0),42.0);
    vec3 reflection=mix(uPaperColor,vec3(.77,.84,.82),.35+.22*fresnel);

    if(uWater>.5){
      float moving=.5+.5*sin((vWorld.x+vWorld.z)*5.4+uTime*.72+ripple*.8);
      float caustic=smoothstep(.76,1.0,moving)*(.18+.22*uDetail);
      color=mix(color,reflection,.20+.24*fresnel);
      color+=vec3(.10,.12,.10)*caustic;
      color+=sparkle*vec3(1.0,.86,.58)*(.18+.22*uDetail);
      alpha=min(1.0,max(alpha,.54));
    }else{
      float pane=noise2(vWorld.xy*1.9+vec2(uTime*.015,0.0));
      color=mix(color,reflection,.13+.27*fresnel);
      color+=sparkle*vec3(1.0,.88,.64)*(.12+.20*uDetail);
      color+=(pane-.5)*.018*uDetail;
      alpha=min(1.0,max(alpha,.60));
    }
  }else{
    float brushed=.5+.5*sin(vWorld.y*118.0+vWorld.x*9.0);
    float glint=pow(max(dot(n,halfDir),0.0),54.0);
    float edge=pow(1.0-max(dot(n,viewDir),0.0),2.0);
    color*=.88+brushed*.12;
    color+=glint*vec3(1.0,.77,.38)*(.30+.25*uDetail);
    color+=edge*vec3(.10,.06,.02)*.22;
  }

  color*=.88+ndl*.16;
  float grain=(hash21(gl_FragCoord.xy*.41)-.5)*.004*uDetail;
  color+=grain;
  float fog=smoothstep(29.0,63.0,vDistance);
  color=mix(color,uFogColor,fog*.70);
  outColor=vec4(color,alpha);
}`);

  const loc={
    position:gl.getAttribLocation(reflectiveProgram,'aPosition'),
    normal:gl.getAttribLocation(reflectiveProgram,'aNormal'),
    model:gl.getUniformLocation(reflectiveProgram,'uModel'),
    vp:gl.getUniformLocation(reflectiveProgram,'uViewProjection'),
    color:gl.getUniformLocation(reflectiveProgram,'uColor'),
    camera:gl.getUniformLocation(reflectiveProgram,'uCamera'),
    light:gl.getUniformLocation(reflectiveProgram,'uLight'),
    fog:gl.getUniformLocation(reflectiveProgram,'uFogColor'),
    paper:gl.getUniformLocation(reflectiveProgram,'uPaperColor'),
    time:gl.getUniformLocation(reflectiveProgram,'uTime'),
    kind:gl.getUniformLocation(reflectiveProgram,'uKind'),
    water:gl.getUniformLocation(reflectiveProgram,'uWater'),
    detail:gl.getUniformLocation(reflectiveProgram,'uDetail')
  };

  function bind(mesh){
    gl.bindBuffer(gl.ARRAY_BUFFER,mesh.position);
    gl.enableVertexAttribArray(loc.position);
    gl.vertexAttribPointer(loc.position,3,gl.FLOAT,false,0,0);
    gl.bindBuffer(gl.ARRAY_BUFFER,mesh.normal);
    gl.enableVertexAttribArray(loc.normal);
    gl.vertexAttribPointer(loc.normal,3,gl.FLOAT,false,0,0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,mesh.index);
  }

  const previousDraw=drawObject;
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const detail=quality==='high'?1:.68;

  drawObject=function u310ReflectiveDraw(object,vp,cameraPositionValue){
    const kind=object?.materialKind;
    if(kind!==MATERIAL.GLASS && kind!==MATERIAL.METAL){
      previousDraw(object,vp,cameraPositionValue);
      return;
    }

    const model=modelMatrix(object);
    const color=typeof p9ObjectColor==='function'?p9ObjectColor(object):(object.color||[1,1,1,1]);
    const isWater=kind===MATERIAL.GLASS && (object?.u332Water===true || ((object?.position?.[1]??1)<.16 && (object?.scale?.[1]??1)<.08));
    const time=reduced?0:performance.now()/1000;

    gl.useProgram(reflectiveProgram);
    bind(object.mesh);
    gl.uniformMatrix4fv(loc.model,false,model);
    gl.uniformMatrix4fv(loc.vp,false,vp);
    gl.uniform4fv(loc.color,color);
    gl.uniform3fv(loc.camera,cameraPositionValue);
    gl.uniform3fv(loc.light,p9LightDirection);
    gl.uniform3fv(loc.fog,p9PaperRgb);
    gl.uniform3fv(loc.paper,p9PaperRgb);
    gl.uniform1f(loc.time,time);
    gl.uniform1i(loc.kind,kind);
    gl.uniform1f(loc.water,isWater?1:0);
    gl.uniform1f(loc.detail,detail);
    gl.drawElements(gl.TRIANGLES,object.mesh.count,gl.UNSIGNED_SHORT,0);

    if(!object.edges || object.mesh.lineCount<=0) return;
    gl.useProgram(p9IllustrationLineProgram);
    gl.bindBuffer(gl.ARRAY_BUFFER,object.mesh.lines);
    gl.enableVertexAttribArray(p9IllustrationLineLocations.position);
    gl.vertexAttribPointer(p9IllustrationLineLocations.position,3,gl.FLOAT,false,0,0);
    gl.uniformMatrix4fv(p9IllustrationLineLocations.model,false,model);
    gl.uniformMatrix4fv(p9IllustrationLineLocations.vp,false,vp);
    gl.uniform4fv(p9IllustrationLineLocations.color,palette.ink);
    gl.uniform3fv(p9IllustrationLineLocations.camera,cameraPositionValue);
    gl.drawArrays(gl.LINES,0,object.mesh.lineCount/3);
  };

  root.dataset.reflectiveMaterials='u3.10';
  root.dataset.reflectiveMaterialQuality=quality;
  root.dataset.webglPhase='u3.10';
  if(status && !root.dataset.webglError) status.textContent=`U3.10 · agua, cristal y metal · ${quality}`;
})();

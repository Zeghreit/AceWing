// Volumetric cloud layer: ray-marched at half resolution against the scene depth,
// composited over the opaque scene, then transparent FX (layer 1) are drawn on top with the same depth.
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

export const FX_LAYER = 1;

// ---------- tileable 3D noise: R = perlin-worley shape, G = worley detail ----------
export function makeNoise3D(N = 64) {
  const data = new Uint8Array(N * N * N * 2), raw = new Float32Array(N * N * N * 2);
  const rnd = (() => { let s = 1234567; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  function lattice(P) { const a = new Float32Array(P * P * P); for (let i = 0; i < a.length; i++) a[i] = rnd(); return a; }
  const fade = t => t * t * (3 - 2 * t);
  function value(L, P, x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = fade(x - xi), yf = fade(y - yi), zf = fade(z - zi);
    const g = (i, j, k) => L[((i % P + P) % P) + ((j % P + P) % P) * P + ((k % P + P) % P) * P * P];
    const l = (a, b, t) => a + (b - a) * t;
    return l(l(l(g(xi, yi, zi), g(xi + 1, yi, zi), xf), l(g(xi, yi + 1, zi), g(xi + 1, yi + 1, zi), xf), yf),
      l(l(g(xi, yi, zi + 1), g(xi + 1, yi, zi + 1), xf), l(g(xi, yi + 1, zi + 1), g(xi + 1, yi + 1, zi + 1), xf), yf), zf);
  }
  function worleyPts(C) { const p = new Float32Array(C * C * C * 3); for (let i = 0; i < p.length; i++) p[i] = rnd(); return p; }
  function worley(pts, C, x, y, z) { // x,y,z in cell units, tiled with period C
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z); let md = 9;
    for (let k = -1; k <= 1; k++) for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const cx = xi + i, cy = yi + j, cz = zi + k;
      const w = (((cx % C) + C) % C) + (((cy % C) + C) % C) * C + (((cz % C) + C) % C) * C * C;
      const dx = cx + pts[w * 3] - x, dy = cy + pts[w * 3 + 1] - y, dz = cz + pts[w * 3 + 2] - z;
      const d = dx * dx + dy * dy + dz * dz; if (d < md) md = d;
    }
    return Math.min(1, Math.sqrt(md));
  }
  const oct = [4, 8, 16].map(P => ({ P, L: lattice(P) }));
  const w1 = { C: 5, p: worleyPts(5) }, w2 = { C: 10, p: worleyPts(10) }, w3 = { C: 16, p: worleyPts(16) };
  let o = 0;
  for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N, w = z / N;
    let f = 0, a = 0.55, sum = 0;
    for (const q of oct) { f += value(q.L, q.P, u * q.P, v * q.P, w * q.P) * a; sum += a; a *= 0.5; }
    f /= sum;
    const W1 = 1 - worley(w1.p, w1.C, u * w1.C, v * w1.C, w * w1.C);
    const W2 = 1 - worley(w2.p, w2.C, u * w2.C, v * w2.C, w * w2.C);
    const W3 = 1 - worley(w3.p, w3.C, u * w3.C, v * w3.C, w * w3.C);
    const wf = W1 * 0.6 + W2 * 0.3 + W3 * 0.1;
    raw[o++] = f * 0.55 + wf * 0.45; // perlin-worley blend
    raw[o++] = W2 * 0.625 + W3 * 0.375;
  }
  // stretch both channels to the full 0..1 range
  for (let ch = 0; ch < 2; ch++) {
    let lo = 1e9, hi = -1e9; for (let i = ch; i < raw.length; i += 2) { lo = Math.min(lo, raw[i]); hi = Math.max(hi, raw[i]); }
    for (let i = ch; i < raw.length; i += 2) data[i] = Math.round((raw[i] - lo) / (hi - lo) * 255);
  }
  const t = new THREE.Data3DTexture(data, N, N, N);
  t.format = THREE.RGFormat; t.type = THREE.UnsignedByteType;
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping; t.unpackAlignment = 1; t.needsUpdate = true;
  return t;
}

// shared GLSL for cloud coverage (also used by the ocean for cloud shadows)
export const COVERAGE_GLSL = `
  uniform highp sampler3D uNoise; uniform float uCoverage; uniform float uCloudBase; uniform float uCloudTop; uniform vec2 uWind; uniform float uCTime;
  float cloudWeather(vec2 xz){ vec3 q = vec3(xz*0.000045, 0.37); return texture(uNoise, q).r*0.62 + texture(uNoise, q*2.9+0.21).r*0.38; }
  float cloudCoverage(vec2 xz){ float c = uCoverage; return smoothstep(1.0-c-0.12, 1.0-c+0.18, cloudWeather(xz)); }
`;

const cloudFrag = `
  layout(location = 0) out highp vec4 pc_fragColor; layout(location = 1) out highp vec4 oDist;
  #define gl_FragColor pc_fragColor
  precision highp float; precision highp sampler3D;
  uniform sampler2D tDepth; uniform mat4 uInvProj; uniform mat4 uCamWorld; uniform vec3 uCamPos; uniform float uNear; uniform float uFar;
  uniform vec3 uSun; uniform vec3 uSunCol; uniform vec3 uAmbTop; uniform vec3 uAmbLow; uniform float uDensity;
  uniform vec3 uFogCol; uniform float uFogD; uniform vec2 uRes;
  ${COVERAGE_GLSL}
  varying vec2 vUv;
  float remap(float v, float l0, float h0, float l1, float h1){ return l1 + (v-l0)*(h1-l1)/max(1e-4, h0-l0); }
  float density(vec3 p, bool detail){
    float h = (p.y-uCloudBase)/(uCloudTop-uCloudBase);
    if (h < 0.0 || h > 1.0) return 0.0;
    vec2 w = p.xz + uWind*uCTime;
    float cov = cloudCoverage(w);
    if (cov < 0.01) return 0.0;
    float top = mix(0.35, 1.0, cov);
    float hs = smoothstep(0.0, 0.07, h) * (1.0 - smoothstep(top*0.55, top, h));
    float n = texture(uNoise, vec3(w.x, p.y*1.3, w.y)*0.00032).r;
    float d = remap(n, 1.0 - cov*hs, 1.0, 0.0, 1.0);
    if (d <= 0.0) return 0.0;
    if (detail) {
      float e = texture(uNoise, (vec3(w.x, p.y, w.y) + vec3(0.0, -uCTime*3.0, 0.0))*0.0021).g;
      d = remap(d, mix(e, 1.0-e, clamp(h*4.0,0.,1.))*0.35, 1.0, 0.0, 1.0);
    }
    return clamp(d, 0.0, 1.0);
  }
  float hg(float c, float g){ float g2=g*g; return (1.0-g2)/(4.0*3.14159*pow(1.0+g2-2.0*g*c, 1.5)); }
  uniform float uFrame;
  float ign(vec2 p){ return fract(52.9829189*fract(dot(p, vec2(0.06711056, 0.00583715)))); }
  void main(){
    oDist = vec4(20000.0);
    vec4 ndc = vec4(vUv*2.0-1.0, 1.0, 1.0);
    vec4 vp = uInvProj*ndc; vp.xyz /= vp.w;
    vec3 vdir = normalize(vp.xyz);
    vec3 dir = normalize((uCamWorld*vec4(vdir,0.0)).xyz);
    float dz = texture2D(tDepth, vUv).x;
    float tScene = 1e9;
    if (dz < 0.99999) { float z = dz*2.0-1.0; float lin = 2.0*uNear*uFar/(uFar+uNear - z*(uFar-uNear)); tScene = lin/max(1e-4, -vdir.z); }
    float cy = uCamPos.y, t0 = 0.0, t1 = 0.0;
    if (cy < uCloudBase) { if (dir.y <= 0.0) { gl_FragColor = vec4(0.0); return; } t0 = (uCloudBase-cy)/dir.y; t1 = (uCloudTop-cy)/dir.y; }
    else if (cy > uCloudTop) { if (dir.y >= 0.0) { gl_FragColor = vec4(0.0); return; } t0 = (uCloudTop-cy)/dir.y; t1 = (uCloudBase-cy)/dir.y; }
    else { t0 = 0.0; t1 = dir.y > 0.0 ? (uCloudTop-cy)/dir.y : dir.y < 0.0 ? (uCloudBase-cy)/dir.y : 1e9; }
    t1 = min(min(t1, tScene), 34000.0);
    if (t1 <= t0) { gl_FragColor = vec4(0.0); return; }
    const int STEPS = 96;
    float stepLen = max((t1-t0)/float(STEPS), 14.0 + t0*0.003);
    float t = t0 + stepLen*ign(gl_FragCoord.xy + uFrame*5.588238);
    float cosT = dot(dir, uSun);
    float phase = mix(hg(cosT, 0.65), hg(cosT, -0.15), 0.35) * 12.57;
    float T = 1.0; vec3 col = vec3(0.0); float tWeighted = 0.0, wsum = 0.0;
    for (int i = 0; i < STEPS; i++) {
      if (t > t1 || T < 0.02) break;
      vec3 p = uCamPos + dir*t;
      float d = density(p, true);
      if (d > 0.0) {
        // light march toward the sun
        float od = 0.0; float ls = 30.0; vec3 lp = p;
        for (int j = 0; j < 6; j++) { lp += uSun*ls; od += density(lp, false)*ls; ls *= 1.6; }
        float sig = uDensity*d;
        float beer = max(exp(-od*uDensity*0.9), exp(-od*uDensity*0.22)*0.55); // cheap multiple scattering
        float powder = 1.0 - exp(-od*uDensity*2.0 - 0.1);
        float h = clamp((p.y-uCloudBase)/(uCloudTop-uCloudBase), 0.0, 1.0);
        vec3 L = uSunCol*beer*mix(1.0, powder*2.0, 0.5)*phase + mix(uAmbLow, uAmbTop, h)*(0.75 + 0.25*d);
        float a = exp(-sig*stepLen);
        col += T*L*(1.0 - a);
        tWeighted += t*T*(1.0-a); wsum += T*(1.0-a);
        T *= a;
      }
      t += stepLen * (d > 0.0 ? 1.0 : 1.6);
    }
    float alpha = 1.0 - T;
    if (wsum > 0.0) {
      float dist = tWeighted/wsum; oDist = vec4(dist);
      float f = clamp(1.0-exp(-pow(dist*uFogD, 2.0)), 0.0, 1.0);
      col = mix(col, uFogCol*alpha, f);
      alpha *= 1.0 - f*0.15;
    }
    gl_FragColor = vec4(col, alpha);
  }`;

export class CloudScenePass extends Pass {
  constructor(scene, camera, noise, opt = {}) {
    super();
    this.scene = scene; this.camera = camera; this.enabled = true;
    this.depth = new THREE.DepthTexture(1, 1); this.depth.type = THREE.UnsignedIntType;
    this.sceneRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthTexture: this.depth });
    this.outRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthTexture: this.depth });
    this.cloudRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, count: 2, depthBuffer: false });
    // linear view depth copy, readable by soft particles while the real depth buffer is bound
    this.linRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, format: THREE.RedFormat, depthBuffer: false });
    this.linQuad = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { tDepth: { value: this.depth }, uNear: { value: 0.5 }, uFar: { value: 40000 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }',
      fragmentShader: `uniform sampler2D tDepth; uniform float uNear, uFar; varying vec2 vUv;
        void main(){ float z = texture2D(tDepth, vUv).x*2.0-1.0; gl_FragColor = vec4(2.0*uNear*uFar/(uFar+uNear - z*(uFar-uNear)), 0.0, 0.0, 1.0); }`,
      depthTest: false, depthWrite: false,
    }));
    this.uniforms = {
      tDepth: { value: this.depth }, uNoise: { value: noise }, uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() },
      uCamPos: { value: new THREE.Vector3() }, uNear: { value: 0.5 }, uFar: { value: 40000 },
      uSun: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(5, 5, 5) }, uAmbTop: { value: new THREE.Color(0.6, 0.7, 0.9) }, uAmbLow: { value: new THREE.Color(0.3, 0.33, 0.4) },
      uDensity: { value: 0.035 }, uCoverage: { value: 0.45 }, uCloudBase: { value: 1000 }, uCloudTop: { value: 2400 }, uWind: { value: new THREE.Vector2(9, 4) }, uCTime: { value: 0 },
      uFogCol: { value: new THREE.Color() }, uFogD: { value: 0.00006 }, uRes: { value: new THREE.Vector2() }, uFrame: { value: 0 },
    };
    this.cloudQuad = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: this.uniforms, glslVersion: THREE.GLSL3, vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }', fragmentShader: cloudFrag.replace('const int STEPS = 96;', `const int STEPS = ${opt.steps || 96};`), depthTest: false, depthWrite: false,
    }));
    // temporal accumulation: reproject last frame's clouds by view direction (clouds are far away),
    // clamp to the current 3x3 neighbourhood to kill ghosting, blend ~12% new samples per frame
    this.hist = [0, 1].map(() => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false }));
    this.hi = 0; this.prevVP = new THREE.Matrix4(); this.hasHist = false;
    this.resolveQuad = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { tCur: { value: null }, tDist: { value: null }, tHist: { value: null }, uPrevVP: { value: this.prevVP }, uInvProj: this.uniforms.uInvProj, uCamWorld: this.uniforms.uCamWorld,
        uTexel: { value: new THREE.Vector2() }, uBlend: { value: 1 }, uCamPos: this.uniforms.uCamPos, uCloudBase: this.uniforms.uCloudBase, uCloudTop: this.uniforms.uCloudTop },
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }',
      fragmentShader: `uniform sampler2D tCur, tHist, tDist; uniform mat4 uPrevVP, uInvProj, uCamWorld; uniform vec2 uTexel; uniform float uBlend; uniform vec3 uCamPos; uniform float uCloudBase, uCloudTop; varying vec2 vUv;
        void main(){
          vec4 c = texture2D(tCur, vUv);
          vec4 mn = c, mx = c, avg = c; float dmin = texture2D(tDist, vUv).r;
          for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
            if (x == 0 && y == 0) continue;
            vec2 o = vUv + vec2(float(x), float(y))*uTexel;
            vec4 n = texture2D(tCur, o); mn = min(mn, n); mx = max(mx, n); avg += n; dmin = min(dmin, texture2D(tDist, o).r);
          }
          avg /= 9.0;
          vec4 vp = uInvProj*vec4(vUv*2.0-1.0, 1.0, 1.0); vec3 dir = normalize((uCamWorld*vec4(normalize(vp.xyz/vp.w), 0.0)).xyz);
          vec4 pc = uPrevVP*vec4(uCamPos + dir*clamp(dmin, 50.0, 40000.0), 1.0);
          vec2 puv = pc.xy/pc.w*0.5+0.5;
          if (uBlend >= 1.0 || pc.w <= 0.0 || any(lessThan(puv, vec2(0.0))) || any(greaterThan(puv, vec2(1.0)))) { gl_FragColor = mix(c, avg, 0.5); return; }
          vec4 ext = (mx - mn)*0.6 + vec4(0.03);   // loose box: keeps structured step-aliasing averaging out, still stops smears
          vec4 h = clamp(texture2D(tHist, puv), mn - ext, mx + ext);
          gl_FragColor = mix(h, c, uBlend);
        }`,
      depthTest: false, depthWrite: false,
    }));
    this.compQuad = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { tScene: { value: this.sceneRT.texture }, tCloud: { value: this.cloudRT.texture }, uTexel: { value: new THREE.Vector2() } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }',
      fragmentShader: `uniform sampler2D tScene, tCloud; varying vec2 vUv;
        uniform vec2 uTexel;
        void main(){
          vec4 c = texture2D(tCloud, vUv)*0.4
            + (texture2D(tCloud, vUv+vec2(uTexel.x,0.0)) + texture2D(tCloud, vUv-vec2(uTexel.x,0.0))
            +  texture2D(tCloud, vUv+vec2(0.0,uTexel.y)) + texture2D(tCloud, vUv-vec2(0.0,uTexel.y)))*0.15;
          vec3 s = texture2D(tScene, vUv).rgb; gl_FragColor = vec4(s*(1.0-c.a) + c.rgb, 1.0); }`,
      depthTest: false, depthWrite: false,
    }));
    this.copyQuad = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { t: { value: this.outRT.texture } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }',
      fragmentShader: 'uniform sampler2D t; varying vec2 vUv; void main(){ gl_FragColor = texture2D(t, vUv); }', depthTest: false, depthWrite: false,
    }));
    this.scale = opt.scale || 0.5;
  }
  setSize(w, h) {
    this.sceneRT.setSize(w, h); this.outRT.setSize(w, h); this.linRT.setSize(w, h);
    this.cloudRT.setSize(Math.max(1, Math.floor(w * this.scale)), Math.max(1, Math.floor(h * this.scale)));
    this.uniforms.uRes.value.set(w * this.scale, h * this.scale);
    for (const r of this.hist) r.setSize(Math.max(1, Math.floor(w * this.scale)), Math.max(1, Math.floor(h * this.scale)));
    this.resolveQuad.material.uniforms.uTexel.value.set(1 / (w * this.scale), 1 / (h * this.scale)); this.hasHist = false;
    this.compQuad.material.uniforms.uTexel.value.set(1 / (w * this.scale), 1 / (h * this.scale));
  }
  render(renderer, writeBuffer) {
    const cam = this.camera, u = this.uniforms, ac = renderer.autoClear;
    // 1. opaque world
    cam.layers.set(0);
    renderer.setRenderTarget(this.sceneRT); renderer.clear(); renderer.render(this.scene, cam);
    this.linQuad.material.uniforms.uNear.value = cam.near; this.linQuad.material.uniforms.uFar.value = cam.far;
    renderer.setRenderTarget(this.linRT); this.linQuad.render(renderer);
    // 2. clouds
    u.uInvProj.value.copy(cam.projectionMatrixInverse); u.uCamWorld.value.copy(cam.matrixWorld);
    u.uCamPos.value.copy(cam.position); u.uNear.value = cam.near; u.uFar.value = cam.far;
    u.uFrame.value = (u.uFrame.value + 1) % 64;
    renderer.setRenderTarget(this.cloudRT); this.cloudQuad.render(renderer);
    const ru = this.resolveQuad.material.uniforms, src = this.hist[this.hi], dst = this.hist[1 - this.hi];
    ru.tCur.value = this.cloudRT.textures[0]; ru.tDist.value = this.cloudRT.textures[1]; ru.tHist.value = src.texture; ru.uBlend.value = this.hasHist ? 0.12 : 1;
    renderer.setRenderTarget(dst); this.resolveQuad.render(renderer);
    this.hi = 1 - this.hi; this.hasHist = true;
    this.prevVP.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this.compQuad.material.uniforms.tCloud.value = dst.texture;
    // 3. composite, then FX on top with the shared depth
    renderer.autoClear = false;
    renderer.setRenderTarget(this.outRT); this.compQuad.render(renderer);
    cam.layers.set(FX_LAYER);
    const bg = this.scene.background; this.scene.background = null;
    renderer.render(this.scene, cam);
    this.scene.background = bg;
    cam.layers.set(0);
    renderer.autoClear = ac;
    // 4. hand over to the rest of the chain
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer); this.copyQuad.render(renderer);
  }
}

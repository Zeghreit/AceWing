import * as THREE from 'three';

// ---------------- Ocean ----------------
// Gerstner-wave ocean on a camera-centred radial grid: sky-cube reflections, sun glitter,
// sub-surface scattering on crests, crest foam, detail normal maps and cloud shadows.
import { COVERAGE_GLSL } from './clouds.js';

function oceanNormalMap(N = 256) {
  const P = 16, L = new Float32Array(P * P).map(() => Math.random());
  const fade = t => t * t * (3 - 2 * t);
  const val = (x, y, p) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = fade(x - xi), yf = fade(y - yi);
    const g = (i, j) => L[((i % p + p) % p) % P + (((j % p + p) % p) % P) * P];
    return (g(xi, yi) * (1 - xf) + g(xi + 1, yi) * xf) * (1 - yf) + (g(xi, yi + 1) * (1 - xf) + g(xi + 1, yi + 1) * xf) * yf;
  };
  const H = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let h = 0, a = 1;
    for (const f of [4, 8, 16]) { h += val(x / N * f, y / N * f, f) * a; a *= 0.5; }
    // ridged look for choppy wavelets
    H[y * N + x] = 1 - Math.abs(h / 1.75 * 2 - 1);
  }
  const d = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const hx = H[y * N + (x + 1) % N] - H[y * N + (x - 1 + N) % N], hy = H[((y + 1) % N) * N + x] - H[((y - 1 + N) % N) * N + x];
    let nx = -hx * 6, ny = -hy * 6, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const o = (y * N + x) * 4; d[o] = (nx * 0.5 + 0.5) * 255; d[o + 1] = (ny * 0.5 + 0.5) * 255; d[o + 2] = (nz * 0.5 + 0.5) * 255; d[o + 3] = H[y * N + x] * 255;
  }
  const t = new THREE.DataTexture(d, N, N); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 8; t.needsUpdate = true;
  return t;
}

export function makeOcean(noise) {
  // radial grid: dense near the camera, sparse out to the horizon
  const R = 200, S = 256, pos = [], idx = [];
  const rad = i => i === 0 ? 0 : 3 * i * (1 + Math.pow(i / 48, 3));
  pos.push(0, 0, 0);
  for (let i = 1; i <= R; i++) for (let j = 0; j < S; j++) { const a = j / S * Math.PI * 2, r = rad(i); pos.push(Math.cos(a) * r, 0, Math.sin(a) * r); }
  for (let j = 0; j < S; j++) idx.push(0, 1 + (j + 1) % S, 1 + j);
  for (let i = 1; i < R; i++) for (let j = 0; j < S; j++) {
    const a = 1 + (i - 1) * S + j, b = 1 + (i - 1) * S + (j + 1) % S, c = a + S, d = b + S;
    idx.push(a, b, d, a, d, c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx);
  // wave set: dir.x, dir.y, steepness, wavelength
  // 12 waves spread around the wind direction, wavelengths 230 m → 7 m
  let seed = 11; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const waves = [];
  for (let n = 0; n < 12; n++) {
    const a = 0.35 + (r() - 0.5) * 2.2, l = 230 * Math.pow(0.73, n) * (0.85 + r() * 0.3);
    const steep = [0.045, 0.055, 0.075, 0.09, 0.1, 0.095, 0.085, 0.075, 0.065, 0.055, 0.05, 0.045][n];
    waves.push(new THREE.Vector4(Math.cos(a), Math.sin(a), steep * (0.8 + r() * 0.4), l));
  }
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uSun: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(1, 1, 1) },
      uDeep: { value: new THREE.Color(0x06243a) }, uShallow: { value: new THREE.Color(0x1b5c78) }, uSky: { value: new THREE.Color(0x9cc4e4) },
      uFog: { value: new THREE.Color(0x9cc4e4) }, uFogD: { value: 0.00012 }, uCam: { value: new THREE.Vector3() },
      uEnv: { value: null }, uNormal: { value: oceanNormalMap() }, uW: { value: waves },
      uNoise: { value: noise }, uCoverage: { value: 0.45 }, uCloudBase: { value: 1000 }, uCloudTop: { value: 2400 }, uWind: { value: new THREE.Vector2(9, 4) }, uCTime: { value: 0 },
    },
    vertexShader: `
      uniform float uTime; uniform vec4 uW[12]; uniform vec3 uCam;
      varying vec3 vW; varying vec3 vN; varying float vCrest; varying float vH;
      void main(){
        vec3 p = (modelMatrix*vec4(position,1.0)).xyz;
        float dist = length(p.xz - uCam.xz);
        vec3 g = p; vec3 T = vec3(1.0,0.0,0.0), B = vec3(0.0,0.0,1.0); float crest = 0.0;
        for (int i = 0; i < 12; i++) {
          vec4 w = uW[i]; float k = 6.28318/w.w; float c = sqrt(9.8/k); vec2 d = w.xy;
          float fade = 1.0 - smoothstep(w.w*6.0, w.w*16.0, dist);
          float f = k*(dot(d, p.xz) - c*uTime); float a = w.z/k*fade;
          float s = sin(f), co = cos(f);
          g.x += d.x*a*co; g.y += a*s; g.z += d.y*a*co;
          T += vec3(-d.x*d.x*w.z*s, d.x*w.z*co, -d.x*d.y*w.z*s)*fade;
          B += vec3(-d.x*d.y*w.z*s, d.y*w.z*co, -d.y*d.y*w.z*s)*fade;
          crest += w.z*s*fade;
        }
        vN = normalize(cross(B, T)); vW = g; vCrest = crest; vH = g.y;
        gl_Position = projectionMatrix*viewMatrix*vec4(g,1.0);
      }`,
    fragmentShader: `
      uniform float uTime; uniform vec3 uSun,uSunCol,uDeep,uShallow,uSky,uFog,uCam; uniform float uFogD;
      uniform samplerCube uEnv; uniform sampler2D uNormal;
      ${COVERAGE_GLSL}
      varying vec3 vW; varying vec3 vN; varying float vCrest; varying float vH;
      uniform vec4 uW[12];
      vec3 nmap(vec2 uv){ return texture2D(uNormal, uv).xzy*2.0-1.0; }
      vec3 waveNormal(vec2 xz, float dist, out float crest){
        vec3 T = vec3(1.0,0.0,0.0), B = vec3(0.0,0.0,1.0); crest = 0.0;
        for (int i = 0; i < 12; i++) {
          vec4 w = uW[i]; float k = 6.28318/w.w; float c = sqrt(9.8/k); vec2 d = w.xy;
          float fd = (1.0 - smoothstep(w.w*12.0, w.w*40.0, dist)) * (1.0 - 0.6*smoothstep(150.0, 2500.0, dist));
          float f = k*(dot(d, xz) - c*uTime); float s = sin(f), co = cos(f);
          T += vec3(-d.x*d.x*w.z*s, d.x*w.z*co, -d.x*d.y*w.z*s)*fd;
          B += vec3(-d.x*d.y*w.z*s, d.y*w.z*co, -d.y*d.y*w.z*s)*fd;
          crest += w.z*s*fd;
        }
        return normalize(cross(B, T));
      }
      void main(){
        float d = distance(uCam, vW);
        vec3 v = normalize(uCam - vW);
        float detail = mix(0.75, 0.12, smoothstep(80.0, 4000.0, d));
        vec3 n1 = nmap(vW.xz/48.0 + vec2(uTime*0.020, uTime*0.012));
        vec3 n2 = nmap(vW.xz/13.0 + vec2(-uTime*0.035, uTime*0.041));
        vec3 n3 = nmap(vW.xz/300.0 + vec2(uTime*0.004, -uTime*0.006));
        vec3 dn = normalize(vec3(n1.x+n2.x*0.6+n3.x*1.2, 1.0/detail + 0.8, n1.z+n2.z*0.6+n3.z*1.2));
        float crestF; vec3 wn = waveNormal(vW.xz, d, crestF);
        vec3 n = normalize(vec3(wn.x + dn.x*detail*0.55, wn.y, wn.z + dn.z*detail*0.55));
        float NdV = max(dot(n, v), 0.0);
        float F = 0.02 + 0.98*pow(1.0 - NdV, 5.0);
        vec3 r = reflect(-v, n); r.y = max(r.y, 0.015);
        vec3 refl = textureCube(uEnv, r).rgb*0.85;
        // body colour + sub-surface scattering through wave crests
        float sunUp = smoothstep(-0.05, 0.15, uSun.y);
        vec3 body = uDeep * (0.25 + 0.75*sunUp) + uSky*0.04;
        float sss = pow(max(dot(v, -uSun) + 0.35, 0.0), 3.0) * max(vH + 0.6, 0.0) * 0.35 + max(crestF, 0.0)*0.8;
        body += uShallow * sss * sunUp;
        vec3 col = mix(body, refl, F);
        // sun glitter
        float rough = mix(0.012, 0.06, smoothstep(200.0, 8000.0, d));
        vec3 hv = normalize(uSun + v);
        float ndh = max(dot(n, hv), 0.0);
        float spec = pow(ndh, 2.0/(rough*rough)) * (1.0/(3.14159*rough*rough)) * 0.08;
        col += uSunCol * spec * sunUp;
        // crest foam
        float foamN = texture2D(uNormal, vW.xz/9.0 + uTime*0.02).a;
        float foam = smoothstep(0.5, 0.75, crestF + foamN*0.2) * (1.0 - smoothstep(400.0, 1800.0, d));
        col = mix(col, vec3(0.78, 0.82, 0.85)*(0.35 + 0.65*sunUp) + uSky*0.1, foam*0.4);
        // cloud shadows
        vec2 cp = vW.xz + uSun.xz/max(uSun.y, 0.15)*uCloudBase + uWind*uCTime;
        float shadow = cloudCoverage(cp);
        col *= 1.0 - shadow*0.45*sunUp;
        float f = 1.0 - exp(-pow(d*uFogD, 2.0));
        col = mix(col, uFog, clamp(f, 0.0, 1.0));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const m = new THREE.Mesh(geo, mat); m.frustumCulled = false;
  return m;
}

// ---------------- Particles ----------------
const softTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); return t;
})();

export class Particles {
  constructor(max, additive) {
    this.max = max; this.n = 0; this.i = 0;
    this.pos = new Float32Array(max * 3); this.vel = new Float32Array(max * 3); this.col = new Float32Array(max * 3);
    this.a = new Float32Array(max); this.size = new Float32Array(max); this.life = new Float32Array(max); this.age = new Float32Array(max);
    this.grow = new Float32Array(max); this.drag = new Float32Array(max); this.grav = new Float32Array(max); this.a0 = new Float32Array(max); this.fade = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.a, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: softTex }, uScale: { value: 800 }, uFog: { value: new THREE.Color() }, uFogD: { value: 0.0001 } },
      vertexShader: `attribute float alpha; attribute float size; varying float vA; varying vec3 vC; varying float vF; uniform float uScale; uniform float uFogD;
        void main(){ vA=alpha; vC=color; vec4 mv=modelViewMatrix*vec4(position,1.); float d=-mv.z; vF=1.0-exp(-pow(d*uFogD,2.0));
          gl_PointSize = size*uScale/max(d,1.0); gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `uniform sampler2D map; uniform vec3 uFog; varying float vA; varying vec3 vC; varying float vF;
        void main(){ float t=texture2D(map,gl_PointCoord).a; ${additive ? 'gl_FragColor=vec4(vC*t*vA*(1.0-vF),1.0);' : 'gl_FragColor=vec4(mix(vC,uFog,vF), t*vA);'} }`,
      vertexColors: true, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 3 : 2;
  }
  emit(p, v, color, size, life, o = {}) {
    const i = this.i; this.i = (this.i + 1) % this.max; if (this.n < this.max) this.n++;
    const k = i * 3;
    this.pos[k] = p.x; this.pos[k + 1] = p.y; this.pos[k + 2] = p.z;
    this.vel[k] = v.x; this.vel[k + 1] = v.y; this.vel[k + 2] = v.z;
    this.col[k] = color.r; this.col[k + 1] = color.g; this.col[k + 2] = color.b;
    this.size[i] = size; this.life[i] = life; this.age[i] = 0; this.a0[i] = o.alpha ?? 1; this.a[i] = this.a0[i];
    this.grow[i] = o.grow ?? 0; this.drag[i] = o.drag ?? 0.5; this.grav[i] = o.grav ?? 0; this.fade[i] = o.fadeIn ?? 0;
  }
  update(dt) {
    for (let i = 0; i < this.n; i++) {
      if (this.age[i] >= this.life[i]) { this.a[i] = 0; continue; }
      this.age[i] += dt; const t = this.age[i] / this.life[i]; const k = i * 3;
      const dr = Math.exp(-this.drag[i] * dt);
      this.vel[k] *= dr; this.vel[k + 1] = this.vel[k + 1] * dr - this.grav[i] * dt; this.vel[k + 2] *= dr;
      this.pos[k] += this.vel[k] * dt; this.pos[k + 1] += this.vel[k + 1] * dt; this.pos[k + 2] += this.vel[k + 2] * dt;
      this.size[i] += this.grow[i] * dt;
      const fi = this.fade[i] > 0 ? Math.min(1, t / this.fade[i]) : 1;
      this.a[i] = this.a0[i] * fi * (1 - t) * (1 - t * 0.3);
    }
    const g = this.geo.attributes;
    g.position.needsUpdate = g.alpha.needsUpdate = g.size.needsUpdate = g.color.needsUpdate = true;
    this.geo.setDrawRange(0, this.n);
  }
  setFog(c, d) { this.mat.uniforms.uFog.value.copy(c); this.mat.uniforms.uFogD.value = d; }
}

// ---------------- Clouds ----------------
function cloudTex(seed) {
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
  let s = seed; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 38; i++) {
    const px = 128 + (r() - 0.5) * 150, py = 140 + (r() - 0.5) * 70 - Math.abs(px - 128) * 0.15, rad = 25 + r() * 45;
    const g = x.createRadialGradient(px, py - rad * 0.25, rad * 0.1, px, py, rad);
    const shade = Math.floor(215 + (128 - py) * 0.35);
    g.addColorStop(0, `rgba(255,255,255,0.55)`); g.addColorStop(0.6, `rgba(${shade},${shade},${shade + 8},0.35)`); g.addColorStop(1, 'rgba(200,205,215,0)');
    x.fillStyle = g; x.beginPath(); x.arc(px, py, rad, 0, 7); x.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export class Clouds {
  constructor(scene) {
    this.group = new THREE.Group(); scene.add(this.group);
    this.texs = [1, 7, 42, 99, 1234].map(cloudTex);
    this.mats = this.texs.map(t => new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, fog: true, color: 0xffffff }));
    this.clusters = [];
    this.R = 9000;
  }
  build(count, alt, spread, tint) {
    this.group.clear(); this.clusters = [];
    this.mats.forEach(m => m.color.set(tint));
    for (let i = 0; i < count; i++) {
      const c = new THREE.Group();
      const big = Math.random() < 0.35;
      const n = big ? 9 : 4 + Math.floor(Math.random() * 4);
      const sc = big ? 1.8 : 1;
      for (let j = 0; j < n; j++) {
        const sp = new THREE.Sprite(this.mats[Math.floor(Math.random() * this.mats.length)]);
        const s = (220 + Math.random() * 260) * sc;
        sp.scale.set(s, s * 0.6, 1);
        sp.position.set((Math.random() - 0.5) * 380 * sc, (Math.random() - 0.3) * 90 * sc, (Math.random() - 0.5) * 380 * sc);
        sp.material.rotation = 0;
        c.add(sp);
      }
      c.userData.r = 260 * sc;
      c.position.set((Math.random() - 0.5) * 2 * this.R, alt + (Math.random() - 0.5) * spread, (Math.random() - 0.5) * 2 * this.R);
      this.group.add(c); this.clusters.push(c);
    }
  }
  // wraps clusters around the camera; returns 0..1 "inside cloud" amount
  update(cam) {
    let inside = 0;
    for (const c of this.clusters) {
      const dx = c.position.x - cam.x, dz = c.position.z - cam.z;
      if (dx > this.R) c.position.x -= 2 * this.R; else if (dx < -this.R) c.position.x += 2 * this.R;
      if (dz > this.R) c.position.z -= 2 * this.R; else if (dz < -this.R) c.position.z += 2 * this.R;
      const d = c.position.distanceTo(cam);
      if (d < c.userData.r) inside = Math.max(inside, 1 - d / c.userData.r);
    }
    return inside;
  }
}

// ---------------- Speed streaks (wind lines near the camera) ----------------
export class Streaks {
  constructor(scene, n = 260) {
    this.n = n; this.p = new Float32Array(n * 3);
    this.buf = new Float32Array(n * 6); this.cb = new Float32Array(n * 6);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.buf, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.cb, 3).setUsage(THREE.DynamicDrawUsage));
    this.lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.lines.frustumCulled = false; scene.add(this.lines);
    this.B = 140; for (let i = 0; i < n * 3; i++) this.p[i] = (Math.random() - 0.5) * 2 * this.B;
  }
  update(cam, vel, intensity) {
    const B = this.B, len = 0.045;
    for (let i = 0; i < this.n; i++) {
      const k = i * 3;
      for (let a = 0; a < 3; a++) {
        let d = this.p[k + a] - cam.getComponent(a);
        if (d > B) this.p[k + a] -= 2 * B; else if (d < -B) this.p[k + a] += 2 * B;
      }
      const o = i * 6;
      this.buf[o] = this.p[k]; this.buf[o + 1] = this.p[k + 1]; this.buf[o + 2] = this.p[k + 2];
      this.buf[o + 3] = this.p[k] - vel.x * len; this.buf[o + 4] = this.p[k + 1] - vel.y * len; this.buf[o + 5] = this.p[k + 2] - vel.z * len;
      const dist = Math.hypot(this.p[k] - cam.x, this.p[k + 1] - cam.y, this.p[k + 2] - cam.z);
      const b = intensity * Math.max(0, 1 - dist / B) * 0.5;
      this.cb[o] = this.cb[o + 1] = this.cb[o + 2] = b; this.cb[o + 3] = this.cb[o + 4] = this.cb[o + 5] = 0;
    }
    this.lines.geometry.attributes.position.needsUpdate = true; this.lines.geometry.attributes.color.needsUpdate = true;
  }
}

// ---------------- Ribbon trail (wingtip vapour, missile smoke line) ----------------
export class Ribbon {
  constructor(scene, n = 60, width = 0.8, color = 0xffffff) {
    this.n = n; this.width = width; this.pts = []; this.alpha = 0;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 2 * 3); this.al = new Float32Array(n * 2);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.al, 1).setUsage(THREE.DynamicDrawUsage));
    const idx = []; for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({
      uniforms: { uC: { value: new THREE.Color(color) } },
      vertexShader: `attribute float alpha; varying float vA; void main(){ vA=alpha; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: `uniform vec3 uC; varying float vA; void main(){ gl_FragColor=vec4(uC, vA); }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    }));
    this.mesh.frustumCulled = false; scene.add(this.mesh);
  }
  push(p, side, strength) {
    this.pts.unshift({ p: p.clone(), s: side.clone(), a: strength });
    if (this.pts.length > this.n) this.pts.pop();
    for (let i = 0; i < this.n; i++) {
      const q = this.pts[Math.min(i, this.pts.length - 1)]; const t = i / (this.n - 1);
      const w = this.width * (1 + t * 1.5);
      const k = i * 6;
      this.pos[k] = q.p.x + q.s.x * w; this.pos[k + 1] = q.p.y + q.s.y * w; this.pos[k + 2] = q.p.z + q.s.z * w;
      this.pos[k + 3] = q.p.x - q.s.x * w; this.pos[k + 4] = q.p.y - q.s.y * w; this.pos[k + 5] = q.p.z - q.s.z * w;
      const a = i < this.pts.length ? q.a * (1 - t) * 0.2 : 0;
      this.al[i * 2] = this.al[i * 2 + 1] = a;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true; this.mesh.geometry.attributes.alpha.needsUpdate = true;
  }
  clear() { this.pts = []; this.al.fill(0); this.mesh.geometry.attributes.alpha.needsUpdate = true; }
}

// ---------------- Tracers ----------------
export class Tracers {
  constructor(scene, max = 400) {
    const g = new THREE.BoxGeometry(0.25, 0.25, 14);
    this.mesh = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.mesh.frustumCulled = false;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    scene.add(this.mesh); this.max = max; this.list = [];
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._z = new THREE.Vector3(0, 0, 1); this._s = new THREE.Vector3(1, 1, 1);
  }
  fire(p, v, owner, color, dmg) {
    if (this.list.length >= this.max) this.list.shift();
    this.list.push({ p: p.clone(), v: v.clone(), life: 2.2, owner, color: new THREE.Color(color), dmg });
  }
  update(dt, hitTest) {
    const out = [];
    for (const b of this.list) {
      const prev = b.p.clone();
      b.p.addScaledVector(b.v, dt); b.life -= dt;
      if (b.p.y < 0) { b.life = 0; out.push({ water: true, p: b.p.clone() }); continue; }
      const h = hitTest(b, prev); if (h) { b.life = 0; out.push(h); }
    }
    this.list = this.list.filter(b => b.life > 0);
    this.list.forEach((b, i) => {
      this._q.setFromUnitVectors(this._z, this._s.copy(b.v).normalize()); this._s.set(1, 1, 1);
      this._m.compose(b.p, this._q, this._s); this.mesh.setMatrixAt(i, this._m); this.mesh.setColorAt(i, b.color);
    });
    this.mesh.count = this.list.length;
    this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    return out;
  }
}

// ---------------- Final screen pass: speed blur, CA, vignette, damage, cloud whiteout ----------------
export const FinalShader = {
  uniforms: { tDiffuse: { value: null }, uSpeed: { value: 0 }, uDamage: { value: 0 }, uWhite: { value: 0 }, uWhiteCol: { value: new THREE.Color(1, 1, 1) }, uTime: { value: 0 }, uFlash: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uSpeed,uDamage,uWhite,uTime,uFlash; uniform vec3 uWhiteCol; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
    void main(){
      vec2 c=vec2(0.5); vec2 d=vUv-c; float r=length(d);
      float amt = uSpeed*0.05*smoothstep(0.12,0.7,r);
      vec3 col=vec3(0.); float tot=0.;
      for(int i=0;i<10;i++){ float t=float(i)/9.; float w=1.-t*0.6; vec2 uv=vUv-d*amt*t;
        vec2 ca=d*(0.004+uSpeed*0.006)*r;
        col.r += texture2D(tDiffuse, uv+ca).r*w; col.g += texture2D(tDiffuse, uv).g*w; col.b += texture2D(tDiffuse, uv-ca).b*w; tot+=w; }
      col/=tot;
      col = mix(col, uWhiteCol, uWhite*0.85);
      float vig = smoothstep(0.95, 0.35, r*(1.0+uSpeed*0.25));
      col *= mix(0.55,1.0,vig);
      col = mix(col, vec3(0.9,0.05,0.02), uDamage*smoothstep(0.25,0.75,r)*0.7);
      col += uFlash*vec3(1.0,0.85,0.6);
      col += (h(vUv*vec2(1920.,1080.)+uTime)-0.5)*0.025;
      gl_FragColor=vec4(col,1.);
    }`,
};

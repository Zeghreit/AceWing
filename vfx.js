// Combat VFX: volumetric-looking fireballs, lit soft smoke, velocity-stretched sparks,
// muzzle flashes and a small pool of dynamic point lights.
import * as THREE from 'three';

// ---------- procedural sprite atlas (2x2 puffs), alpha = density ----------
function puffAtlas() {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S * 2;
  const x = c.getContext('2d'), img = x.createImageData(S * 2, S * 2), d = img.data;
  const hash = (a, b, s) => { const h = Math.sin(a * 127.1 + b * 311.7 + s * 17.3) * 43758.5453; return h - Math.floor(h); };
  const vn = (px, py, s) => { const xi = Math.floor(px), yi = Math.floor(py), xf = px - xi, yf = py - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), cc = hash(xi, yi + 1, s), e = hash(xi + 1, yi + 1, s); return a + (b - a) * u + (cc - a) * v + (a - b - cc + e) * u * v; };
  for (let t = 0; t < 4; t++) {
    const ox = (t % 2) * S, oy = Math.floor(t / 2) * S;
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const u = i / S * 2 - 1, v = j / S * 2 - 1, r = Math.hypot(u, v);
      let n = 0, a = 0.5, f = 3; for (let o = 0; o < 5; o++) { n += vn(u * f + t * 7, v * f + t * 3, t + o) * a; f *= 2.1; a *= 0.5; }
      const dens = Math.max(0, Math.min(1, (1 - r * r * 1.1) * 1.4 * (0.45 + n) - 0.25));
      const k = ((oy + j) * S * 2 + ox + i) * 4; d[k] = d[k + 1] = d[k + 2] = 255; d[k + 3] = Math.round(Math.pow(dens, 1.2) * 255);
    }
  }
  x.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c); tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; return tex;
}
const ATLAS = puffAtlas();

// ---------- soft, lit, rotating particles ----------
export class Particles {
  constructor(max, additive, shared) {
    this.max = max; this.n = 0; this.i = 0; this.additive = additive;
    this.pos = new Float32Array(max * 3); this.vel = new Float32Array(max * 3); this.col = new Float32Array(max * 3);
    this.a = new Float32Array(max); this.size = new Float32Array(max); this.life = new Float32Array(max); this.age = new Float32Array(max);
    this.grow = new Float32Array(max); this.drag = new Float32Array(max); this.grav = new Float32Array(max); this.a0 = new Float32Array(max); this.fade = new Float32Array(max);
    this.rot = new Float32Array(max); this.spin = new Float32Array(max); this.tile = new Float32Array(max); this.heat = new Float32Array(max); this.heat0 = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    const A = (name, arr, n) => g.setAttribute(name, new THREE.BufferAttribute(arr, n).setUsage(THREE.DynamicDrawUsage));
    A('position', this.pos, 3); A('color', this.col, 3); A('alpha', this.a, 1); A('size', this.size, 1); A('rot', this.rot, 1); A('tile', this.tile, 1); A('heat', this.heat, 1);
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: ATLAS }, uScale: { value: 800 }, uFog: { value: new THREE.Color() }, uFogD: { value: 0.0001 },
        tDepth: shared.depth, uRes: shared.res, uNearFar: shared.nearFar, uSunView: shared.sunView, uSunCol: shared.sunCol, uAmb: shared.amb,
      },
      vertexShader: `attribute float alpha; attribute float size; attribute float rot; attribute float tile; attribute float heat;
        varying float vA; varying vec3 vC; varying float vF; varying float vRot; varying vec2 vTile; varying float vDepth; varying float vSize; varying float vHeat;
        uniform float uScale; uniform float uFogD;
        void main(){ vA=alpha; vC=color; vRot=rot; vHeat=heat; vTile=vec2(mod(tile,2.0), floor(tile/2.0))*0.5;
          vec4 mv=modelViewMatrix*vec4(position,1.); float d=-mv.z; vDepth=d; vSize=size; vF=1.0-exp(-pow(d*uFogD,2.0));
          gl_PointSize = size*uScale/max(d,1.0); gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `uniform sampler2D map; uniform sampler2D tDepth; uniform vec2 uRes; uniform vec2 uNearFar; uniform vec3 uFog; uniform vec3 uSunView; uniform vec3 uSunCol; uniform vec3 uAmb;
        varying float vA; varying vec3 vC; varying float vF; varying float vRot; varying vec2 vTile; varying float vDepth; varying float vSize; varying float vHeat;
        void main(){
          vec2 p = gl_PointCoord - 0.5; float cs = cos(vRot), sn = sin(vRot);
          vec2 q = vec2(cs*p.x - sn*p.y, sn*p.x + cs*p.y) + 0.5;
          if (q.x < 0.0 || q.y < 0.0 || q.x > 1.0 || q.y > 1.0) discard;
          vec2 uv = vTile + q*0.5;
          float dens = texture2D(map, uv).a;
          if (dens < 0.01) discard;
          // soft intersection with the world
          float sceneD = texture2D(tDepth, gl_FragCoord.xy/uRes).r;
          float soft = clamp((sceneD - vDepth) / max(vSize*0.35, 0.5), 0.0, 1.0);
          ${additive ? `
          float a = dens*vA*soft;
          vec3 c = mix(vC, vec3(1.0,0.95,0.8), smoothstep(0.6,1.0,dens)*0.6) * (1.0 + vHeat*3.0);
          gl_FragColor = vec4(c*a*(1.0-vF), 1.0);` : `
          // pseudo normal from the density gradient + sphere bulge, lit by the sun (view space)
          float e = 0.02;
          float dx = texture2D(map, vTile + clamp(q+vec2(e,0.0),0.0,1.0)*0.5).a - texture2D(map, vTile + clamp(q-vec2(e,0.0),0.0,1.0)*0.5).a;
          float dy = texture2D(map, vTile + clamp(q+vec2(0.0,e),0.0,1.0)*0.5).a - texture2D(map, vTile + clamp(q-vec2(0.0,e),0.0,1.0)*0.5).a;
          vec2 g2 = vec2(cs*dx + sn*dy, -sn*dx + cs*dy);
          vec3 n = normalize(vec3(-g2*3.0 + p*1.6, 0.6 + dens));
          n.y = -n.y;
          float lam = clamp(dot(n, uSunView)*0.5 + 0.5, 0.0, 1.0);
          float thick = 1.0 - dens*0.55;
          vec3 lit = vC * (uAmb*0.75 + uSunCol*lam*thick*0.75);
          lit += vec3(1.0,0.4,0.1) * vHeat * vHeat * 3.0 * dens;           // glowing underside of fresh fire smoke
          float a = dens*vA*soft;
          gl_FragColor = vec4(mix(lit, uFog, vF), a);`}
        }`,
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
    this.rot[i] = Math.random() * 6.283; this.spin[i] = (Math.random() - 0.5) * (o.spin ?? 0.6); this.tile[i] = Math.floor(Math.random() * 4);
    this.heat0[i] = this.heat[i] = o.heat ?? 0;
  }
  update(dt) {
    for (let i = 0; i < this.n; i++) {
      if (this.age[i] >= this.life[i]) { this.a[i] = 0; continue; }
      this.age[i] += dt; const t = this.age[i] / this.life[i]; const k = i * 3;
      const dr = Math.exp(-this.drag[i] * dt);
      this.vel[k] *= dr; this.vel[k + 1] = this.vel[k + 1] * dr - this.grav[i] * dt; this.vel[k + 2] *= dr;
      this.pos[k] += this.vel[k] * dt; this.pos[k + 1] += this.vel[k + 1] * dt; this.pos[k + 2] += this.vel[k + 2] * dt;
      this.size[i] += this.grow[i] * dt * (1 - t * 0.6);
      this.rot[i] += this.spin[i] * dt;
      this.heat[i] = this.heat0[i] * Math.max(0, 1 - t * 4);
      const fi = this.fade[i] > 0 ? Math.min(1, t / this.fade[i]) : 1;
      this.a[i] = this.a0[i] * fi * (1 - t) * (1 - t * 0.3);
    }
    const g = this.geo.attributes;
    for (const k of ['position', 'alpha', 'size', 'color', 'rot', 'tile', 'heat']) g[k].needsUpdate = true;
    this.geo.setDrawRange(0, this.n);
  }
  setFog(c, d) { this.mat.uniforms.uFog.value.copy(c); this.mat.uniforms.uFogD.value = d; }
}

// ---------- fireballs: noise-displaced spheres with a temperature ramp ----------
const fireVS = `
  precision highp sampler3D; uniform sampler3D uNoise; uniform float uT; uniform float uSeed;
  varying vec3 vP; varying vec3 vN; varying vec3 vV;
  void main(){
    vec3 p = position;
    float n = texture(uNoise, p*0.35 + vec3(uSeed, uSeed*0.7, uT*0.25)).r;
    p += normal * (n - 0.45) * 0.95;
    vP = position; vec4 mv = modelViewMatrix*vec4(p,1.0);
    vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix*mv;
  }`;
const fireFS = `
  precision highp sampler3D; uniform sampler3D uNoise; uniform float uT; uniform float uLife; uniform float uSeed; uniform vec3 uSmoke;
  varying vec3 vP; varying vec3 vN; varying vec3 vV;
  void main(){
    float age = clamp(uT/uLife, 0.0, 1.0);
    vec3 q = vP*0.9 + vec3(uSeed, -uT*0.6, uSeed*0.3);
    float n = texture(uNoise, q*0.5).r*0.6 + texture(uNoise, q*1.3).g*0.4;
    float rim = pow(clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0), 0.7);
    float heat = (1.25 - age*1.6) * (0.55 + rim*0.6) - n*0.55;
    vec3 c;
    if (heat > 0.75) c = mix(vec3(1.0,0.75,0.35), vec3(1.0,0.97,0.85), (heat-0.75)*3.0) * 9.0;
    else if (heat > 0.45) c = mix(vec3(1.0,0.35,0.06), vec3(1.0,0.75,0.35), (heat-0.45)/0.3) * 5.5;
    else if (heat > 0.2) c = mix(vec3(0.35,0.08,0.02), vec3(1.0,0.35,0.06), (heat-0.2)/0.25) * 2.5;
    else c = uSmoke * (0.4 + n*0.5);
    float alpha = smoothstep(0.0, 0.3, n + 0.42 - age*1.05) * (1.0 - smoothstep(0.7, 1.0, age));
    gl_FragColor = vec4(c, alpha * mix(0.75, 1.0, rim));
  }`;
export class Fireballs {
  constructor(scene, noise, layer, max = 40) {
    this.list = []; const geo = new THREE.IcosahedronGeometry(1, 5);
    for (let i = 0; i < max; i++) {
      const m = new THREE.Mesh(geo, new THREE.ShaderMaterial({
        uniforms: { uNoise: { value: noise }, uT: { value: 0 }, uLife: { value: 1 }, uSeed: { value: Math.random() * 10 }, uSmoke: { value: new THREE.Color(0.05, 0.045, 0.04) } },
        vertexShader: fireVS, fragmentShader: fireFS, transparent: true, depthWrite: false,
      }));
      m.visible = false; m.frustumCulled = false; m.layers.set(layer); m.renderOrder = 1; scene.add(m);
      this.list.push({ m, t: 0, life: 1, r: 1, vel: new THREE.Vector3(), alive: false });
    }
    this.k = 0;
  }
  spawn(p, radius, life, vel) {
    const f = this.list[this.k]; this.k = (this.k + 1) % this.list.length;
    f.alive = true; f.t = 0; f.life = life; f.r = radius; f.vel.copy(vel || new THREE.Vector3());
    f.m.position.copy(p); f.m.visible = true; f.m.material.uniforms.uSeed.value = Math.random() * 10; f.m.material.uniforms.uLife.value = life;
    f.m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
  }
  update(dt) {
    for (const f of this.list) {
      if (!f.alive) continue;
      f.t += dt; if (f.t > f.life) { f.alive = false; f.m.visible = false; continue; }
      f.vel.multiplyScalar(Math.exp(-dt * 2)); f.vel.y += 6 * dt;
      f.m.position.addScaledVector(f.vel, dt);
      const s = f.r * (0.25 + 0.9 * (1 - Math.exp(-f.t * 7)) + f.t * 0.25);
      f.m.scale.setScalar(s); f.m.material.uniforms.uT.value = f.t;
    }
  }
}

// ---------- sparks: velocity-stretched hot streaks ----------
export class Sparks {
  constructor(scene, layer, max = 900) {
    this.max = max; this.i = 0; this.p = new Float32Array(max * 3); this.v = new Float32Array(max * 3); this.life = new Float32Array(max); this.age = new Float32Array(max).fill(9);
    this.buf = new Float32Array(max * 6); this.cb = new Float32Array(max * 6);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.buf, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.cb, 3).setUsage(THREE.DynamicDrawUsage));
    this.lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.lines.frustumCulled = false; this.lines.layers.set(layer); scene.add(this.lines);
  }
  emit(p, v, life) { const i = this.i; this.i = (this.i + 1) % this.max; this.p.set([p.x, p.y, p.z], i * 3); this.v.set([v.x, v.y, v.z], i * 3); this.life[i] = life; this.age[i] = 0; }
  burst(p, n, speed, base) {
    for (let k = 0; k < n; k++) {
      const d = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.35, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.3 + Math.random()));
      if (base) d.add(base);
      this.emit(p, d, 0.35 + Math.random() * 0.8);
    }
  }
  update(dt) {
    for (let i = 0; i < this.max; i++) {
      const k = i * 3, o = i * 6;
      if (this.age[i] >= this.life[i]) { this.cb.fill(0, o, o + 6); continue; }
      this.age[i] += dt; const t = this.age[i] / this.life[i];
      const dr = Math.exp(-dt * 1.6); this.v[k] *= dr; this.v[k + 1] = this.v[k + 1] * dr - 9.8 * dt; this.v[k + 2] *= dr;
      this.p[k] += this.v[k] * dt; this.p[k + 1] += this.v[k + 1] * dt; this.p[k + 2] += this.v[k + 2] * dt;
      const L = 0.035;
      this.buf[o] = this.p[k]; this.buf[o + 1] = this.p[k + 1]; this.buf[o + 2] = this.p[k + 2];
      this.buf[o + 3] = this.p[k] - this.v[k] * L; this.buf[o + 4] = this.p[k + 1] - this.v[k + 1] * L; this.buf[o + 5] = this.p[k + 2] - this.v[k + 2] * L;
      const b = (1 - t) * 4;
      this.cb[o] = b; this.cb[o + 1] = b * (0.75 - t * 0.4); this.cb[o + 2] = b * 0.3 * (1 - t);
      this.cb[o + 3] = b * 0.5; this.cb[o + 4] = b * 0.2; this.cb[o + 5] = 0;
    }
    this.lines.geometry.attributes.position.needsUpdate = true; this.lines.geometry.attributes.color.needsUpdate = true;
  }
}

// ---------- dynamic lights ----------
export class LightPool {
  constructor(scene, n = 5) {
    this.l = []; for (let i = 0; i < n; i++) { const L = new THREE.PointLight(0xffaa55, 0, 600, 2); L.visible = true; scene.add(L); this.l.push({ L, t: 0, dur: 1, i0: 0 }); }
    this.k = 1; // slot 0 is reserved for the gun
  }
  flash(p, color, intensity, range, dur, slot) {
    const s = slot ?? (this.k = 1 + (this.k % (this.l.length - 1)));
    const o = this.l[s]; o.L.position.copy(p); o.L.color.set(color); o.L.distance = range; o.i0 = intensity; o.t = 0; o.dur = dur;
  }
  update(dt) {
    for (const o of this.l) { o.t += dt; const k = Math.max(0, 1 - o.t / o.dur); o.L.intensity = o.i0 * k * k * (0.85 + Math.random() * 0.3); }
  }
}

// ---------- muzzle flash sprite ----------
export function makeMuzzleFlash(layer) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  x.translate(64, 64);
  const g = x.createRadialGradient(0, 0, 0, 0, 0, 60); g.addColorStop(0, 'rgba(255,250,230,1)'); g.addColorStop(0.25, 'rgba(255,200,110,0.9)'); g.addColorStop(1, 'rgba(255,120,30,0)');
  x.fillStyle = g;
  for (let i = 0; i < 6; i++) { x.rotate(Math.PI / 3); x.beginPath(); x.moveTo(0, -7); x.lineTo(62, 0); x.lineTo(0, 7); x.fill(); }
  x.beginPath(); x.arc(0, 0, 26, 0, 7); x.fill();
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false, color: new THREE.Color(3, 2.4, 1.6) }));
  s.layers.set(layer); s.visible = false; s.scale.setScalar(3.5);
  return s;
}

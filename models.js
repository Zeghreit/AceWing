// Procedural models. Convention: forward = +Z, up = +Y, pilot's right = -X. 1 unit = 1 m.
import * as THREE from 'three';

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.3, ...o });

// 2D outline on the XZ plane → thin flat slab (thickness along Y)
function flatPlate(pts, thick, mat) {
  const s = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: true, bevelThickness: thick * 0.4, bevelSize: thick * 0.6, bevelSegments: 1 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, -thick / 2, 0);
  g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
}
// 2D outline on the ZY plane → thin fin (thickness along X)
function finPlate(pts, thick, mat) {
  const s = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: true, bevelThickness: thick * 0.4, bevelSize: thick * 0.5, bevelSegments: 1 });
  g.rotateY(-Math.PI / 2);
  g.translate(thick / 2, 0, 0);
  g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
}
function lathe(profile, seg = 20) {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  g.rotateX(Math.PI / 2); // lathe axis Y → Z
  return g;
}

export const flameMaterial = () => new THREE.ShaderMaterial({
  uniforms: { uT: { value: 0 }, uPow: { value: 0.5 }, uCol: { value: new THREE.Color(1.0, 0.55, 0.2) } },
  vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
    void main(){ vUv=uv; vec4 mv=modelViewMatrix*vec4(position,1.); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }`,
  fragmentShader: `uniform float uT; uniform float uPow; uniform vec3 uCol; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
    void main(){ float along = vUv.y; // 1 at nozzle, 0 at tip
      float rim = pow(abs(dot(vN,vV)), 1.5);
      float fl = 0.75+0.25*sin(uT*60.0+along*20.0);
      float diamonds = 0.6+0.4*pow(abs(sin(along*18.0 - uT*30.)),4.)*uPow;
      vec3 core = mix(uCol, vec3(1.0,0.95,0.85), pow(along,2.0));
      vec3 blue = vec3(0.35,0.55,1.0);
      vec3 c = mix(blue, core, smoothstep(0.1,0.7,uPow));
      float a = pow(along, 1.2) * rim * fl * diamonds * (0.35+uPow);
      gl_FragColor = vec4(c*a*3.0, a); }`,
  transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
});

function navLight(color) {
  return new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color, toneMapped: false }));
}

// ---------- Fighter jet (variable sweep when variable=true) ----------
export function makeJet(opt = {}) {
  const { body = 0xa3adb6, dark = 0x3c434b, accent = 0xb8322a, variable = true, sweep = 0.4 } = opt;
  const g = new THREE.Group();
  const mBody = std(body, { roughness: 0.55, metalness: 0.35 });
  const mDark = std(dark, { roughness: 0.6, metalness: 0.4 });
  const mAcc = std(accent, { roughness: 0.5 });
  const mGlass = new THREE.MeshStandardMaterial({ color: 0x0c1826, roughness: 0.05, metalness: 0.9, envMapIntensity: 2 });

  const fus = new THREE.Mesh(lathe([[0, 9.8], [0.3, 9.0], [0.62, 7.6], [0.88, 5.6], [1.02, 3.2], [1.12, 0.5], [1.1, -3], [0.95, -6.5], [0.7, -8.6]], 24), mBody);
  fus.scale.set(1.25, 0.78, 1); g.add(fus);
  const radome = new THREE.Mesh(new THREE.ConeGeometry(0.34, 1.0, 16), mDark); radome.rotation.x = Math.PI / 2; radome.position.z = 9.75; g.add(radome);
  // flat centre "pancake" between nacelles
  const deck = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.5, 11), mBody); deck.position.set(0, -0.15, -3); g.add(deck);
  // nacelles
  for (const s of [1, -1]) {
    const nac = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.8, 11.2, 18), mBody); nac.rotation.x = Math.PI / 2; nac.position.set(s * 1.75, -0.35, -3.6); g.add(nac);
    const intake = new THREE.Mesh(new THREE.BoxGeometry(1.35, 1.4, 1.6), mBody); intake.position.set(s * 1.75, -0.25, 2.3); g.add(intake);
    const hole = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.15, 0.1), new THREE.MeshBasicMaterial({ color: 0x050607 })); hole.position.set(s * 1.75, -0.25, 3.12); g.add(hole);
    const noz = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.72, 1.2, 18, 1, true), mDark); noz.rotation.x = Math.PI / 2; noz.position.set(s * 1.75, -0.35, -9.7); g.add(noz);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(0.55, 18), new THREE.MeshBasicMaterial({ color: 0xff7a30, toneMapped: false })); glow.rotation.y = Math.PI; glow.position.set(s * 1.75, -0.35, -9.6); g.add(glow);
    // afterburner flame
    const fg = new THREE.CylinderGeometry(0.55, 0.05, 1, 16, 1, true); fg.translate(0, -0.5, 0); fg.rotateX(Math.PI / 2); // extends toward -Z
    const fl = new THREE.Mesh(fg, flameMaterial()); fl.position.set(s * 1.75, -0.35, -10.2); fl.frustumCulled = false; g.add(fl);
    (g.userData.flames ||= []).push(fl);
    // vertical tail, canted
    const tail = finPlate([[-5.6, 0], [-9.4, 0], [-9.7, 3.6], [-8.3, 3.6]], 0.14, mBody);
    tail.position.set(s * 1.75, 0.35, 0); tail.rotation.z = -s * 0.14; g.add(tail);
    const tipc = finPlate([[-8.5, 3.0], [-9.62, 3.0], [-9.7, 3.6], [-8.3, 3.6]], 0.16, mAcc); tipc.position.copy(tail.position); tipc.rotation.copy(tail.rotation); g.add(tipc);
    // stabilator
    const stab = flatPlate([[0, -7.3], [0, -9.6], [s * 3.6, -10.2], [s * 3.6, -9.3]], 0.12, mBody); stab.position.set(s * 1.9, -0.35, 0); g.add(stab);
    // wing glove (fixed)
    const glove = flatPlate([[0, 3.5], [0, -3], [s * 1.9, -3], [s * 1.9, -1.2]], 0.2, mBody); glove.position.set(s * 2.3, -0.05, 0); g.add(glove);
    // swinging wing
    const piv = new THREE.Group(); piv.position.set(s * 3.4, -0.02, -1.4); g.add(piv);
    const wing = flatPlate([[0, 1.0], [0, -2.2], [s * 7.6, -2.9], [s * 7.6, -1.5]], 0.14, mBody); piv.add(wing);
    const tip = new THREE.Object3D(); tip.position.set(s * 7.5, 0, -2.2); piv.add(tip);
    const nl = navLight(s > 0 ? 0xff2a2a : 0x2aff5a); nl.position.set(s * 7.55, 0, -1.6); piv.add(nl);
    piv.rotation.y = s * sweep;
    (g.userData.wings ||= []).push(piv);
    (g.userData.tips ||= []).push(tip);
  }
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), mGlass); canopy.scale.set(0.55, 0.55, 2.4); canopy.position.set(0, 0.55, 5.0); g.add(canopy);
  const spine = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 6), mBody); spine.position.set(0, 0.45, 0.5); g.add(spine);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.05, 0.6), mAcc); stripe.position.set(0, 0.62, 2.1); g.add(stripe);
  g.userData.variable = variable;
  // landing gear (hidden by default)
  const gear = new THREE.Group();
  const mG = std(0x222222);
  for (const [x, z] of [[0, 6.5], [2.3, -2.5], [-2.3, -2.5]]) {
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.6), mG); strut.position.set(x, -1.2, z); gear.add(strut);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.25, 12), mG); wheel.rotation.z = Math.PI / 2; wheel.position.set(x, -2.0, z); gear.add(wheel);
  }
  const hook = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 2.2), mG); hook.position.set(0, -1.0, -9.5); hook.rotation.x = 0.5; gear.add(hook);
  gear.visible = false; g.add(gear); g.userData.gear = gear;
  g.traverse(o => { if (o.isMesh) o.castShadow = false; });
  return g;
}

export function setSweep(jet, sweep) {
  if (!jet.userData.wings) return;
  const [l, r] = jet.userData.wings; l.rotation.y = sweep; r.rotation.y = -sweep;
}

// ---------- Tanker ----------
export function makeTanker() {
  const g = new THREE.Group();
  const mB = std(0x8f979e), mD = std(0x40464c);
  g.add(new THREE.Mesh(lathe([[0, 24], [1.2, 22.5], [2.4, 19], [2.6, 10], [2.6, -12], [1.6, -20], [0.5, -23]], 20), mB));
  for (const s of [1, -1]) {
    const w = flatPlate([[0, 4], [0, -3], [s * 22, -11], [s * 22, -8.5]], 0.4, mB); w.position.set(s * 2.2, -0.8, 0); g.add(w);
    for (const e of [7, 14]) {
      const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.8, 4.5, 14), mD); eng.rotation.x = Math.PI / 2; eng.position.set(s * (2.2 + e), -2.0, 3 - e * 0.4); g.add(eng);
    }
    const st = flatPlate([[0, -17], [0, -21.5], [s * 8, -24], [s * 8, -22.5]], 0.3, mB); st.position.set(s * 1, 0.5, 0); g.add(st);
  }
  const vt = finPlate([[-15, 0], [-22.5, 0], [-24, 9], [-20, 9]], 0.35, mB); vt.position.y = 1.5; g.add(vt);
  // boom-less drogue hose from the tail
  const hoseLen = 38;
  const hose = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, hoseLen, 6), mD);
  hose.rotation.x = Math.PI / 2 - 0.12; hose.position.set(0, -2.8, -22 - hoseLen / 2); g.add(hose);
  const drogue = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.2, 1.4, 16, 1, true), new THREE.MeshStandardMaterial({ color: 0xdddddd, side: THREE.DoubleSide }));
  drogue.rotation.x = Math.PI / 2; drogue.position.set(0, -2.8 - Math.sin(0.12) * hoseLen, -22 - hoseLen); g.add(drogue);
  const beacon = navLight(0xffcc44); beacon.scale.setScalar(3); beacon.position.copy(drogue.position); g.add(beacon);
  g.userData.drogue = drogue.position.clone();
  return g;
}

// ---------- Missile ----------
export function makeMissile(color = 0xe8e8e8) {
  const g = new THREE.Group();
  const m = std(color, { roughness: 0.4 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 3.2, 10), m); body.rotation.x = Math.PI / 2; g.add(body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.5, 10), std(0x333333)); nose.rotation.x = Math.PI / 2; nose.position.z = 1.85; g.add(nose);
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.5, 0.5), m); const a = i * Math.PI / 2;
    f.position.set(Math.cos(a) * 0.25, Math.sin(a) * 0.25, -1.4); f.rotation.z = a; g.add(f);
  }
  const fl = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffb060, toneMapped: false }));
  fl.scale.set(1, 1, 2.2); fl.position.z = -2.1; g.add(fl);
  return g;
}

// ---------- Ships ----------
function hullGeom(len, beam, h) {
  const s = new THREE.Shape();
  s.moveTo(-beam / 2, -len / 2); s.lineTo(beam / 2, -len / 2); s.lineTo(beam / 2, len * 0.22);
  s.quadraticCurveTo(beam / 2, len * 0.42, 0, len / 2); s.quadraticCurveTo(-beam / 2, len * 0.42, -beam / 2, len * 0.22); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false });
  g.rotateX(Math.PI / 2); // shape Y → +Z (bow), extrusion → -Y
  g.translate(0, h, 0);
  g.computeVertexNormals();
  return g;
}
export function makeShip(color = 0x6d747c, len = 120) {
  const g = new THREE.Group();
  const mH = std(color, { roughness: 0.7, side: THREE.DoubleSide }), mD = std(0x3a3f44, { roughness: 0.8 });
  const hull = new THREE.Mesh(hullGeom(len, len * 0.13, 9), mH); hull.position.y = -3; g.add(hull);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(len * 0.12, 0.3, len * 0.9), mD); deck.position.set(0, 6, -len * 0.04); g.add(deck);
  const sup = new THREE.Mesh(new THREE.BoxGeometry(len * 0.09, 9, len * 0.22), mH); sup.position.set(0, 10.5, -len * 0.02); g.add(sup);
  const brg = new THREE.Mesh(new THREE.BoxGeometry(len * 0.1, 3, len * 0.08), mH); brg.position.set(0, 16, len * 0.06); g.add(brg);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, 16), mD); mast.position.set(0, 24, 0); g.add(mast);
  const radar = new THREE.Mesh(new THREE.BoxGeometry(6, 1.2, 0.4), mD); radar.position.set(0, 31, 0); g.add(radar); g.userData.radar = radar;
  const tur = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.6, 2, 12), mH); tur.position.set(0, 7.2, len * 0.3); g.add(tur);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 7), mD); barrel.rotation.x = Math.PI / 2 - 0.3; barrel.position.set(0, 8.5, len * 0.3 + 3); g.add(barrel);
  const aft = new THREE.Mesh(new THREE.BoxGeometry(len * 0.1, 5, len * 0.14), mH); aft.position.set(0, 8, -len * 0.25); g.add(aft);
  return g;
}

function deckTexture(enemy) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 1024;
  const x = c.getContext('2d');
  x.fillStyle = enemy ? '#57504d' : '#5a5f64'; x.fillRect(0, 0, 256, 1024);
  for (let i = 0; i < 4000; i++) { x.fillStyle = `rgba(255,255,255,${Math.random() * 0.04})`; x.fillRect(Math.random() * 256, Math.random() * 1024, 2, 2); }
  // angled landing strip (aft = bottom of texture)
  x.save(); x.translate(128, 1024);
  x.strokeStyle = '#e8e8e0'; x.lineWidth = 3; x.strokeRect(-40, -640, 80, 640);
  x.setLineDash([26, 22]); x.beginPath(); x.moveTo(0, -20); x.lineTo(0, -630); x.stroke(); x.setLineDash([]);
  x.fillStyle = '#e8c83a'; for (let i = 0; i < 4; i++) x.fillRect(-40, -150 - i * 22, 80, 3);
  x.restore();
  x.strokeStyle = '#d8d8d0'; x.lineWidth = 2; x.setLineDash([18, 16]); x.beginPath(); x.moveTo(60, 30); x.lineTo(60, 420); x.stroke();
  x.setLineDash([]); x.fillStyle = '#e8e8e0'; x.font = 'bold 64px sans-serif'; x.textAlign = 'center'; x.fillText(enemy ? '17' : '74', 128, 120);
  const t = new THREE.CanvasTexture(c); t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
export function makeCarrier(enemy = false) {
  const g = new THREE.Group();
  const L = 330, B = 40, H = 20;
  const mH = std(enemy ? 0x6b5f5c : 0x676e75, { roughness: 0.75, side: THREE.DoubleSide });
  const hull = new THREE.Mesh(hullGeom(L, B, H + 4), mH); hull.position.y = -4; g.add(hull);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(76, 1.2, L), [mH, mH, new THREE.MeshStandardMaterial({ map: deckTexture(enemy), roughness: 0.85 }), mH, mH, mH]);
  deck.position.set(-6, H, 0); g.add(deck);
  const island = new THREE.Mesh(new THREE.BoxGeometry(10, 18, 36), mH); island.position.set(-28, H + 9.5, -20); g.add(island);
  // wait: pilot's right is -X, the island sits on starboard (right) side → -X ✓
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.9, 16), std(0x333333)); mast.position.set(-28, H + 26, -18); g.add(mast);
  const rad = new THREE.Mesh(new THREE.BoxGeometry(8, 1.5, 0.5), std(0x333333)); rad.position.set(-28, H + 33, -18); g.add(rad); g.userData.radar = rad;
  // arresting wires across the angled deck
  const mW = new THREE.MeshBasicMaterial({ color: 0x111111 });
  for (let i = 0; i < 4; i++) { const w = new THREE.Mesh(new THREE.BoxGeometry(24, 0.15, 0.15), mW); w.position.set(-6, H + 0.7, -L / 2 + 50 + i * 13); g.add(w); }
  // deck edge lights
  const lm = new THREE.MeshBasicMaterial({ color: enemy ? 0xff4040 : 0x7fd0ff, toneMapped: false });
  for (let i = 0; i < 12; i++) for (const s of [1, -1]) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.35, 6, 4), lm); l.position.set(-6 + s * 16, H + 0.9, -L / 2 + 20 + i * 18); g.add(l); }
  g.userData.deckY = H + 0.6; g.userData.L = L; g.userData.W = 76; g.userData.deckX = -6;
  return g;
}

// ---------- Islands ----------
function hash(n) { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); }
export function makeIsland(radius, height, seed) {
  const seg = 64, rings = 22;
  const geo = new THREE.BufferGeometry();
  const pos = [], col = [], idx = [];
  const lobes = [1, 2, 3, 5].map((k, i) => ({ k, a: 0.15 / (i + 1) + hash(seed + i) * 0.12, p: hash(seed * 3 + i) * 6.28 }));
  const rim = a => 1 + lobes.reduce((s, l) => s + l.a * Math.sin(l.k * a + l.p), 0);
  const hAt = (r01, a) => {
    if (r01 > 1) return -8;
    const base = Math.pow(1 - r01, 1.6);
    const n = 0.18 * Math.sin(a * 7 + seed) * Math.sin(r01 * 9 + seed * 2) + 0.1 * Math.sin(a * 13 + r01 * 17 + seed);
    return height * base * (1 + n) - 6 * r01 * r01 * r01 + 2;
  };
  pos.push(0, hAt(0, 0), 0); col.push(0.35, 0.4, 0.3);
  for (let r = 1; r <= rings; r++) {
    const r01 = r / rings * 1.08;
    for (let s = 0; s < seg; s++) {
      const a = s / seg * Math.PI * 2, R = radius * rim(a) * r01;
      const h = hAt(r01, a);
      pos.push(Math.cos(a) * R, h, Math.sin(a) * R);
      const t = h / height;
      let c;
      if (h < 3.5) c = [0.82, 0.76, 0.58];
      else if (t < 0.55) c = [0.22 + hash(r * 9 + s) * 0.06, 0.38 + hash(r + s * 3) * 0.08, 0.18];
      else if (t < 0.8) c = [0.38, 0.36, 0.3];
      else c = [0.55, 0.53, 0.5];
      col.push(...c);
    }
  }
  for (let s = 0; s < seg; s++) idx.push(0, 1 + (s + 1) % seg, 1 + s);
  for (let r = 1; r < rings; r++) for (let s = 0; s < seg; s++) {
    const a = 1 + (r - 1) * seg + s, b = 1 + (r - 1) * seg + (s + 1) % seg, c = a + seg, d = b + seg;
    idx.push(a, b, d, a, d, c);
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx); geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }));
  mesh.userData.heightAt = (lx, lz) => {
    const R = Math.hypot(lx, lz), a = Math.atan2(lz, lx);
    const r01 = R / (radius * rim(a));
    return hAt(r01, (a + Math.PI * 2) % (Math.PI * 2));
  };
  mesh.userData.radius = radius * 1.4;
  return mesh;
}

export function makeBase() {
  const g = new THREE.Group();
  const m = std(0x6f6a5c, { roughness: 0.9 }), d = std(0x3b3d38);
  const b = new THREE.Mesh(new THREE.BoxGeometry(22, 7, 14), m); b.position.y = 3.5; g.add(b);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(6, 14, 8, 0, 6.28, 0, 1.57), std(0xd8d8d0)); dome.position.set(16, 0, 6); g.add(dome);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, 18), d); mast.position.set(-14, 9, -4); g.add(mast);
  const dish = new THREE.Mesh(new THREE.CylinderGeometry(4, 1, 1.2, 14), d); dish.position.set(-14, 18, -4); dish.rotation.x = 1.1; g.add(dish); g.userData.radar = dish;
  for (const s of [1, -1]) { const l = new THREE.Mesh(new THREE.BoxGeometry(3, 2.2, 7), d); l.position.set(s * 6, 8.5, 0); l.rotation.x = -0.5; g.add(l); }
  return g;
}

// ---------- Ground vehicles & towers (procedural fallbacks for the AssetForge GLBs) ----------
export function makeTank() {
  const g = new THREE.Group(), m = std(0x5b5f3c, { roughness: 0.85 }), d = std(0x2c2e22, { roughness: 0.9 });
  const hull = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.3, 7.4), m); hull.position.y = 1.3; g.add(hull);
  for (const s of [1, -1]) { const tr = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.1, 7.8), d); tr.position.set(s * 1.9, 0.6, 0); g.add(tr); }
  const tur = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.8, 0.9, 10), m); tur.position.set(0, 2.4, -0.4); g.add(tur);
  const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 5.2), d); gun.rotation.x = Math.PI / 2; gun.position.set(0, 2.5, 2.6); g.add(gun);
  return g;
}
export function makeSamTruck() {
  const g = new THREE.Group(), m = std(0x4d5438, { roughness: 0.85 }), d = std(0x222420, { roughness: 0.9 });
  const bed = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.2, 10), m); bed.position.y = 1.6; g.add(bed);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.8, 2.4), m); cab.position.set(0, 2.5, 3.9); g.add(cab);
  for (let i = 0; i < 4; i++) for (const s of [1, -1]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.4, 10), d); w.rotation.z = Math.PI / 2; w.position.set(s * 1.3, 0.6, 3.6 - i * 2.4); g.add(w); }
  const rack = new THREE.Group(); rack.position.set(0, 2.4, -1.2); rack.rotation.x = -0.6; g.add(rack);
  for (let i = 0; i < 4; i++) { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 6.5, 10), std(0x6a7050)); t.rotation.x = Math.PI / 2; t.position.set((i % 2 - 0.5) * 0.9, Math.floor(i / 2) * 0.8, 0); rack.add(t); }
  return g;
}
export function makeRadioTower() {
  const g = new THREE.Group(), red = std(0xc0392b, { roughness: 0.6 }), white = std(0xe8e8e8, { roughness: 0.6 }), d = std(0x333333);
  const H = 60, segs = 6;
  for (let i = 0; i < segs; i++) {
    const r0 = 4 - i * 0.55, r1 = 4 - (i + 1) * 0.55, h = H / segs;
    const s = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, h, 4, 1, true), new THREE.MeshStandardMaterial({ color: i % 2 ? 0xe8e8e8 : 0xc0392b, wireframe: true }));
    s.position.y = h * (i + 0.5); s.rotation.y = Math.PI / 4; g.add(s);
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, h), i % 2 ? white : red); core.position.y = h * (i + 0.5); g.add(core);
  }
  const dish = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 0.6, 1, 14), white); dish.rotation.x = 1.2; dish.position.set(0, H * 0.72, 1.8); g.add(dish);
  const radar = new THREE.Mesh(new THREE.BoxGeometry(7, 1, 0.4), d); radar.position.y = H + 1; g.add(radar); g.userData.radar = radar;
  const shed = new THREE.Mesh(new THREE.BoxGeometry(8, 4, 6), std(0x7a7466)); shed.position.set(7, 2, 0); g.add(shed);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2020, toneMapped: false })); lamp.position.y = H + 2; g.add(lamp);
  return g;
}

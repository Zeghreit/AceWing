// Land for the inland sorties: a mountain range with a river valley, and a coastal city at dusk.
// Both sit north of the coast (z > COAST) so the carrier still has open sea behind the player.
import * as THREE from 'three';

export const COAST = 5000;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function hash2(x, y, s) { const h = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return h - Math.floor(h); }
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function ridged(x, y, s, oct = 5) {
  let f = 0, a = 0.5, w = 1;
  for (let i = 0; i < oct; i++) { let n = 1 - Math.abs(vnoise(x, y, s + i) * 2 - 1); n *= n; n *= w; w = Math.min(1, n * 1.8); f += n * a; x *= 2.03; y *= 2.03; a *= 0.5; }
  return f;
}
function fbm(x, y, s, oct = 4) { let f = 0, a = 0.5; for (let i = 0; i < oct; i++) { f += vnoise(x, y, s + i) * a; x *= 2.1; y *= 2.1; a *= 0.5; } return f; }

// grid-sampled heightfield: the collision height is interpolated from exactly the vertices that are drawn
function buildField(size, N, cz, fn) {
  const H = new Float32Array((N + 1) * (N + 1)), step = size / N, x0 = -size / 2, z0 = cz - size / 2;
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) H[j * (N + 1) + i] = fn(x0 + i * step, z0 + j * step);
  const at = (x, z) => {
    const fx = (x - x0) / step, fz = (z - z0) / step;
    if (fx < 0 || fz < 0 || fx >= N || fz >= N) return -50;
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, k = j * (N + 1) + i;
    return (H[k] * (1 - u) + H[k + 1] * u) * (1 - v) + (H[k + N + 1] * (1 - u) + H[k + N + 2] * u) * v;
  };
  return { H, step, x0, z0, N, at };
}
function fieldMesh(F, colorFn, mat) {
  const N = F.N, pos = new Float32Array((N + 1) * (N + 1) * 3), idx = [];
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) { const k = j * (N + 1) + i; pos[k * 3] = F.x0 + i * F.step; pos[k * 3 + 1] = F.H[k]; pos[k * 3 + 2] = F.z0 + j * F.step; }
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  const n = g.attributes.normal, col = new Float32Array(pos.length);
  for (let k = 0; k < pos.length / 3; k++) { const c = colorFn(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2], n.getY(k)); col[k * 3] = c[0]; col[k * 3 + 1] = c[1]; col[k * 3 + 2] = c[2]; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.Mesh(g, mat); m.frustumCulled = false; return m;
}

// per-pixel ground detail so the coarse grid never reads as smooth plastic
const DETAIL_GLSL = `
  float tdh(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
  float tdn(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
    return mix(mix(tdh(i),tdh(i+vec2(1,0)),u.x), mix(tdh(i+vec2(0,1)),tdh(i+vec2(1,1)),u.x), u.y); }
  float tdf(vec2 p){ return tdn(p)*0.5 + tdn(p*2.3)*0.28 + tdn(p*5.1)*0.14 + tdn(p*11.7)*0.08; }`;
function withDetail(mat, extra) {
  mat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vTWP;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvTWP = (modelMatrix * vec4(transformed,1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vTWP;' + DETAIL_GLSL)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float dd = length(vTWP - cameraPosition);
        float det = mix(tdf(vTWP.xz/9.0), 0.5, smoothstep(300.0, 2500.0, dd)) * 0.55 + tdf(vTWP.xz/140.0)*0.45;
        diffuseColor.rgb *= 0.62 + det*0.75;`);
    if (extra) extra(sh);
  };
  return mat;
}

// Tileable ground textures (AssetForge/Gemini). When present the mountains are splat-shaded from them.
export const TERRAIN_TEX = {};
const SPLAT_VERT = ['#include <common>', '#include <common>\nattribute vec3 splat; varying vec3 vSplat; varying vec3 vTN;',
  '#include <worldpos_vertex>', '#include <worldpos_vertex>\nvSplat = splat; vTN = normalize(mat3(modelMatrix) * objectNormal);'];
const SPLAT_FRAG = `
  uniform sampler2D tGrass, tRock, tSnow, tForest; varying vec3 vSplat; varying vec3 vTN;
  vec3 tex2(sampler2D t, vec2 uv){ // two rotated scales hide tiling
    vec3 a = texture2D(t, uv).rgb; vec2 r = vec2(uv.x*0.8 - uv.y*0.6, uv.x*0.6 + uv.y*0.8)*0.37 + 0.31;
    return mix(a, texture2D(t, r).rgb, 0.45); }
  vec3 triRock(vec3 p, vec3 n){ vec3 w = pow(abs(n), vec3(4.0)); w /= (w.x+w.y+w.z);
    return texture2D(tRock, p.zy/46.0).rgb*w.x + texture2D(tRock, p.xz/46.0).rgb*w.y + texture2D(tRock, p.xy/46.0).rgb*w.z; }`;
const SPLAT_APPLY = `
  {
    float macro = tdf(vTWP.xz/900.0);
    float nz = tdf(vTWP.xz/37.0);
    float gd = length(vTWP - cameraPosition);
    vec3 grassNear = tex2(tGrass, vTWP.xz/5.0);
    vec3 grassFar = vec3(0.19, 0.26, 0.11) * (0.8 + 0.4*tdf(vTWP.xz/60.0));
    vec3 grass = mix(grassNear, grassFar, smoothstep(60.0, 450.0, gd)) * mix(vec3(0.85,0.95,0.8), vec3(1.1,1.02,0.85), macro);
    vec3 forest = tex2(tForest, vTWP.xz/160.0) * vec3(1.5, 1.6, 1.4) + vec3(0.015, 0.02, 0.01);
    vec3 rock = triRock(vTWP, normalize(vTN));
    vec3 snow = tex2(tSnow, vTWP.xz/34.0);
    float fw = smoothstep(0.35, 0.65, vSplat.x + (nz-0.5)*0.5);
    float rw = smoothstep(0.3, 0.6, vSplat.y + (nz-0.5)*0.45);
    float sw = smoothstep(0.35, 0.6, vSplat.z + (nz-0.5)*0.35);
    vec3 c = mix(grass, forest, fw); c = mix(c, rock, rw); c = mix(c, snow, sw);
    diffuseColor.rgb = c;
  }`;

function proceduralRock(N = 256) {
  const d = new Uint8Array(N * N * 4);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const r = ridged(i / N * 8, j / N * 8, 77, 5), f = fbm(i / N * 16, j / N * 16, 12, 4);
    const g = 70 + r * 90 + f * 50, k = (j * N + i) * 4; d[k] = g; d[k + 1] = g * 0.97; d[k + 2] = g * 0.93; d[k + 3] = 255;
  }
  const t = new THREE.DataTexture(d, N, N); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.needsUpdate = true; return t;
}

// ================= Mountains =================
export function makeMountains() {
  const valleyX = z => 1600 * Math.sin(z * 0.00032) + 700 * Math.sin(z * 0.00091 + 1.3);
  const hfn = (x, z) => {
    const coast = smooth(COAST, COAST + 3500, z);
    let h = Math.pow(ridged(x * 0.00019, z * 0.00019, 3), 1.35) * 2600 + fbm(x * 0.0012, z * 0.0012, 9) * 120;
    const dv = Math.abs(x - valleyX(z)), carve = 1 - smooth(220, 1500, dv);
    h = h * (1 - carve * 0.92) + 30 - 36 * (1 - smooth(40, 110, dv)); // river channel floods with sea level
    return h * coast - 40 * (1 - coast);
  };
  const size = 34000, N = 300, cz = COAST - 800 + size / 2;
  const F = buildField(size, N, cz, hfn);
  if (TERRAIN_TEX.grass && !TERRAIN_TEX.rock) TERRAIN_TEX.rock = proceduralRock();
  const textured = !!(TERRAIN_TEX.grass && TERRAIN_TEX.rock && TERRAIN_TEX.snow && TERRAIN_TEX.forest);
  const mat = withDetail(new THREE.MeshStandardMaterial({ vertexColors: !textured, roughness: 0.95, metalness: 0 }), textured ? sh => {
    Object.assign(sh.uniforms, { tGrass: { value: TERRAIN_TEX.grass }, tRock: { value: TERRAIN_TEX.rock }, tSnow: { value: TERRAIN_TEX.snow }, tForest: { value: TERRAIN_TEX.forest } });
    sh.vertexShader = sh.vertexShader.replace(SPLAT_VERT[0], SPLAT_VERT[1]).replace(SPLAT_VERT[2], SPLAT_VERT[3]);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>' + SPLAT_FRAG)
      .replace('#include <color_fragment>', '#include <color_fragment>' + SPLAT_APPLY);
  } : null);
  const mesh = fieldMesh(F, (x, y, z, ny) => {
    const r = hash2(Math.floor(x / 60), Math.floor(z / 60), 5) * 0.06;
    if (y < 6) return [0.62 + r, 0.58 + r, 0.46];                               // beach / river gravel
    const snow = smooth(1050, 1450, y + (ny - 0.8) * 700);
    const rock = smooth(0.86, 0.7, ny) * (1 - snow * 0.6);
    const forest = smooth(0.48, 0.62, fbm(x * 0.0016, z * 0.0016, 31)) * (1 - smooth(600, 1000, y));
    let c = y < 700 ? [0.2 + r, 0.3 + r, 0.13] : [0.3 + r, 0.31 + r, 0.22];      // meadow / alpine
    c = c.map((v, i) => v * (1 - forest) + [0.07, 0.14, 0.06][i] * forest);
    c = c.map((v, i) => v * (1 - rock) + [0.36, 0.34, 0.32][i] * rock);
    return c.map((v, i) => v * (1 - snow) + [0.92, 0.94, 0.97][i] * snow);
  }, mat);
  { // splat weights per vertex: forest, rock, snow
    const g = mesh.geometry, P = g.attributes.position, Nn = g.attributes.normal, sp = new Float32Array(P.count * 3);
    for (let k = 0; k < P.count; k++) {
      const x = P.getX(k), y = P.getY(k), z = P.getZ(k), ny = Nn.getY(k);
      const snow = smooth(1050, 1450, y + (ny - 0.8) * 700);
      const rock = smooth(0.86, 0.7, ny) * (1 - snow * 0.6);
      const forest = smooth(0.48, 0.62, fbm(x * 0.0016, z * 0.0016, 31)) * (1 - smooth(600, 1000, y)) * (y > 8 ? 1 : 0);
      sp[k * 3] = forest; sp[k * 3 + 1] = rock; sp[k * 3 + 2] = snow;
    }
    g.setAttribute('splat', new THREE.BufferAttribute(sp, 3));
  }
  // river ribbon along the valley floor
  const road = [];
  for (let z = COAST + 1200; z < COAST + 24000; z += 350) road.push(new THREE.Vector3(valleyX(z) + 170, 0, z));
  road.forEach(p => p.y = F.at(p.x, p.z));
  const sites = { sam: [], tower: [] };
  const peak = (zc, side) => { // highest point in a window beside the valley
    let best = null;
    for (let k = 0; k < 40; k++) { const z = zc + (hash2(k, zc, 1) - 0.5) * 1800, x = valleyX(z) + side * (1400 + hash2(k, zc, 2) * 1600); const y = F.at(x, z); if (!best || y > best.y) best = new THREE.Vector3(x, y, z); }
    return best;
  };
  [9000, 13500, 18000, 22500].forEach((z, i) => sites.sam.push(peak(COAST + z - 5000, i % 2 ? 1 : -1)));
  [11000, 20000].forEach((z, i) => sites.tower.push(peak(COAST + z - 5000, i % 2 ? -1 : 1)));
  const group = new THREE.Group(); group.add(mesh);
  return { kind: 'mountains', group, heightAt: F.at, groundAt: F.at, paths: [road], sites, center: new THREE.Vector3(0, 0, COAST + 12000) };
}


// ================= Saint Petersburg–style city (procedural) =================
// The Neva bends around the historic centre and runs into the sea; two canals cut the bend.
// Perimeter blocks with a common cornice line, pastel facades, tin roofs, granite embankments and bridges.
const PALETTE = [0xd9b36a, 0xd8a59a, 0x9cc9b0, 0xa9c4d6, 0xe6d7b5, 0xc47a5a, 0xcfc6b0, 0xe3c27a, 0xb9d0c0, 0xd6b0a0];
const ROOFS = [0x5f6d68, 0x6b4a3e, 0x55616a, 0x7a3b30, 0x4d5a52];

function polyInfo(px, pz, pts) {
  let best = 1e18, bi = 0, bu = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    let u = ((px - ax) * dx + (pz - az) * dz) / l2; u = Math.max(0, Math.min(1, u));
    const qx = ax + dx * u - px, qz = az + dz * u - pz, d = qx * qx + qz * qz;
    if (d < best) { best = d; bi = i; bu = u; }
  }
  return { d: Math.sqrt(best), i: bi, u: bu };
}
function along(pts, i, u) { // point + unit tangent on segment i at u
  const [ax, az] = pts[i], [bx, bz] = pts[i + 1], l = Math.hypot(bx - ax, bz - az);
  return { x: ax + (bx - ax) * u, z: az + (bz - az) * u, tx: (bx - ax) / l, tz: (bz - az) / l };
}

export function makeCity(glbs = {}, opt = {}) {
  const C = new THREE.Vector3(0, 0, 13500), R = 4600, BASE = 3;
  const waters = [
    { w: 460, pts: [[14000, 16600], [5000, 16000], [1000, 15200], [-2500, 13000], [-4000, 9500], [-4700, 4200]] }, // Neva
    { w: 34, pts: [[2700, 15530], [1600, 13800], [0, 12900], [-1800, 12400], [-3060, 12620]] },                     // Moika-like canal
    { w: 44, pts: [[4300, 16070], [3600, 13500], [1800, 11700], [-600, 11000], [-3750, 10950]] },                   // Fontanka-like canal
    { w: 28, pts: [[3500, 15760], [2950, 14700], [2350, 13750], [2650, 13150], [1600, 12600], [800, 12420], [300, 11950], [-900, 11780], [-2000, 11950], [-3150, 11800]] }, // winding Griboedov-like canal
  ];
  const waterDist = (x, z) => { let m = 1e9; for (const W of waters) m = Math.min(m, polyInfo(x, z, W.pts).d - W.w / 2); return m; };
  const hfn = (x, z) => {
    const coast = smooth(COAST - 200, COAST + 900, z);
    const dC = Math.hypot(x - C.x, z - C.z);
    const hills = smooth(R + 600, R + 7000, dC) * Math.pow(fbm(x * 0.0003, z * 0.0003, 21), 1.5) * 900 * smooth(500, 2000, waterDist(x, z));
    return (BASE + hills) * coast - 30 * (1 - coast);
  };
  const size = 34000, N = 280, cz = COAST - 800 + size / 2;
  const F = buildField(size, N, cz, hfn);
  const groundAt = (x, z) => waterDist(x, z) < 0 ? 0 : F.at(x, z);

  // ---------- solids for collision: axis-aligned boxes in a spatial hash ----------
  const CELL = 60, hashMap = new Map(), solids = [];
  // oriented boxes: centre, cos/sin of yaw, half extents; stored in a spatial hash over their AABB
  const addSolidR = (cx, cz, c, sn, hx, hz, y0, y1) => {
    const so = { cx, cz, c, s: sn, hx, hz, y0, y1 }; solids.push(so);
    const ex = Math.abs(c) * hx + Math.abs(sn) * hz, ez = Math.abs(sn) * hx + Math.abs(c) * hz;
    for (let i = Math.floor((cx - ex) / CELL); i <= Math.floor((cx + ex) / CELL); i++) for (let j = Math.floor((cz - ez) / CELL); j <= Math.floor((cz + ez) / CELL); j++) {
      const k = i * 100003 + j; (hashMap.get(k) || hashMap.set(k, []).get(k)).push(so);
    }
  };
  const addSolid = (x0, x1, z0, z1, y0, y1) => addSolidR((x0 + x1) / 2, (z0 + z1) / 2, 1, 0, (x1 - x0) / 2, (z1 - z0) / 2, y0, y1);
  const inS = (so, x, z) => { const dx = x - so.cx, dz = z - so.cz; return Math.abs(dx * so.c - dz * so.s) <= so.hx && Math.abs(dx * so.s + dz * so.c) <= so.hz; };
  const cellSolids = (x, z) => hashMap.get(Math.floor(x / CELL) * 100003 + Math.floor(z / CELL)) || [];
  const heightAt = (x, z) => { let h = groundAt(x, z); for (const so of cellSolids(x, z)) if (so.y0 < 4 && inS(so, x, z)) h = Math.max(h, so.y1); return h; };
  const solidAt = (x, y, z) => { if (y < groundAt(x, z)) return true; for (const so of cellSolids(x, z)) if (y >= so.y0 && y <= so.y1 && inS(so, x, z)) return true; return false; };
  const group = new THREE.Group();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), col = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);

  // ---------- landmarks (AssetForge GLBs when present) ----------
  const neva = waters[0].pts, moika = waters[1].pts;
  const bank = (pts, i, u, side, off) => { const a = along(pts, i, u); return { x: a.x - a.tz * side * off, z: a.z + a.tx * side * off, yaw: Math.atan2(a.tx, a.tz) + Math.PI / 2 }; };
  const L = [
    { k: 'spb_l4', ...bank(neva, 1, 0.72, 1, 230 + 55), len: 210, hgt: 26 },    // palace on the south embankment
    { k: 'spb_l5', ...bank(neva, 1, 0.93, 1, 230 + 260), len: 280, hgt: 72 },   // admiralty with spire
    { k: 'spb_l2', ...bank(neva, 1, 0.6, -1, 230 + 120), len: 122, hgt: 122 },  // fortress cathedral, north bank
    { k: 'spb_l1', x: -300, z: 13550, yaw: 0.3, len: 110, hgt: 101 },            // great dome
    { k: 'spb_l3', ...bank(moika, 1, 0.35, 1, 17 + 45), len: 80, hgt: 81 },     // onion domes on the canal
    { k: 'spb_l6', x: -6800, z: 15600, yaw: 0, len: 380, hgt: 380 },             // glass tower on the far shore
  ];
  const landmarkClear = [];
  for (const l of L) {
    let obj;
    if (glbs[l.k]) { obj = new THREE.Group(); obj.add(glbs[l.k].wrap.clone(true)); }
    else obj = fallbackLandmark(l.k);
    const b0 = new THREE.Box3().setFromObject(obj), sz = b0.getSize(new THREE.Vector3());
    const sc = l.len / Math.max(sz.x, sz.y, sz.z); obj.scale.setScalar(sc);
    obj.position.set(l.x, BASE - b0.min.y * sc, l.z); obj.rotation.y = l.yaw; group.add(obj);
    obj.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(obj);
    addSolid(bb.min.x, bb.max.x, bb.min.z, bb.max.z, 0, bb.max.y);
    landmarkClear.push({ x0: bb.min.x - 25, x1: bb.max.x + 25, z0: bb.min.z - 25, z1: bb.max.z + 25 });
    l.box = bb;
  }

  // ---------- street network ----------
  // Not one grid: each district has its own street geometry, like the real centre.
  //  fan   – polar streets radiating from the Admiralty (the "trident": three main avenues) with ring streets
  //  east  – slightly skewed grid beyond the fan;  west – Kolomna-style grid at another angle
  //  vo    – island "lines": long narrow blocks;    petro – small radial knot around the fortress
  const S = (a, b, s) => hash2(a * 0.37 + 11.1, b * 0.53 + 7.7, s);
  const nevaSide = (x, z) => { const f = polyInfo(x, z, neva); const a = along(neva, f.i, f.u); return ((x - a.x) * -a.tz + (z - a.z) * a.tx) >= 0 ? 1 : -1; };
  const Ad = { x: L[1].x, z: L[1].z }, Fo = { x: L[2].x, z: L[2].z };
  const nA = along(neva, 1, 0.93), phi0 = Math.atan2(nA.tx, -nA.tz), FAN = 1.3, FANR = 3400;
  const angD = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
  const districtOf = (x, z) => {
    if (Math.hypot(x - C.x, z - C.z) > R) return null;
    if (nevaSide(x, z) > 0) {
      const r = Math.hypot(x - Ad.x, z - Ad.z);
      if (r < FANR && Math.abs(angD(Math.atan2(z - Ad.z, x - Ad.x), phi0)) < FAN) return 'fan';
      return x > Ad.x ? 'east' : 'west';
    }
    return Math.hypot(x - Fo.x, z - Fo.z) < 2100 ? 'petro' : 'vo';
  };
  const blocks = [], plazas = [], parks = [], lamps = [], mainStreets = [];
  const pushBlock = (kind, cx, cz, a, W, D, seed) => {
    if (W < 36 || D < 36) return;
    const c = Math.cos(a), s = Math.sin(a), hw = W / 2, hd = D / 2;
    for (const [lx, lz] of [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd], [0, 0]]) if (districtOf(cx + lx * c + lz * s, cz - lx * s + lz * c) !== kind) return;
    if (waterDist(cx, cz) < 30) return;
    const dC = Math.hypot(cx - C.x, cz - C.z);
    if (seed < 0.045) { plazas.push(new THREE.Vector3(cx, BASE, cz)); return; }
    let dry = true;   // yard slab only when the whole block is on land (otherwise it would lie over a canal)
    for (const [lx, lz] of [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd], [-hw, 0], [hw, 0], [0, -hd], [0, hd]]) if (waterDist(cx + lx * c + lz * s, cz - lx * s + lz * c) < 8) dry = false;
    blocks.push({ kind, cx, cz, a, W, D, seed, dC, dry, park: dry && seed > 0.955, dA: Math.hypot(cx - Ad.x, cz - Ad.z) });
  };
  // boundaries with street widths: returns [{p, w}]
  const cuts = (from, to, step0, stepV, w0, wV, seed, forced = []) => {
    const out = []; let p = from, k = 0;
    while (p < to) { out.push({ p, w: w0 + S(k, seed, 1) * wV }); p += step0 + S(k, seed, 2) * stepV; k++; }
    for (const f of forced) { for (let i = out.length - 1; i >= 0; i--) if (Math.abs(out[i].p - f.p) < f.clear) out.splice(i, 1); out.push({ p: f.p, w: f.w, main: true }); }
    return out.sort((a, b) => a.p - b.p);
  };
  const polar = (kind, o, pa, pb, r0, r1, seed, forcedA, forcedR) => {
    const A = cuts(pa, pb, 0.13, 0.16, 16, 8, seed, forcedA), Rr = cuts(r0, r1, 150, 150, 14, 8, seed + 5, forcedR);
    for (const a of A) if (a.main) mainStreets.push({ o, phi: a.p, r0, r1 });
    for (let i = 0; i < A.length - 1; i++) for (let j = 0; j < Rr.length - 1; j++) {
      const ri = Rr[j].p + Rr[j].w / 2, ro = Rr[j + 1].p - Rr[j + 1].w / 2, D = ro - ri;
      const fa = A[i].p + A[i].w / 2 / ri, fb = A[i + 1].p - A[i + 1].w / 2 / ri, dphi = fb - fa;
      if (dphi <= 0 || D < 40) continue;
      const wi = 2 * ri * Math.sin(dphi / 2), k = Math.max(1, Math.round(wi / (170 + S(i, j, seed) * 140)));
      for (let m = 0; m < k; m++) {
        const ph = fa + dphi * (m + 0.5) / k, w = 2 * ri * Math.sin(dphi / k / 2) - (k > 1 ? 10 : 0), rm = (ri + ro) / 2;
        pushBlock(kind, o.x + Math.cos(ph) * rm, o.z + Math.sin(ph) * rm, Math.atan2(-Math.cos(ph), -Math.sin(ph)), w, D, S(i * 7 + m, j, seed + 3));
      }
    }
  };
  const grid = (kind, o, g, u0, u1, v0, v1, su, suv, sv, svv, seed) => {
    const U = cuts(u0, u1, su, suv, 14, 12, seed), V = cuts(v0, v1, sv, svv, 14, 10, seed + 9);
    const eu = [Math.cos(g), Math.sin(g)], ev = [-Math.sin(g), Math.cos(g)];
    for (let i = 0; i < U.length - 1; i++) for (let j = 0; j < V.length - 1; j++) {
      const a0 = U[i].p + U[i].w / 2, a1 = U[i + 1].p - U[i + 1].w / 2, b0 = V[j].p + V[j].w / 2, b1 = V[j + 1].p - V[j + 1].w / 2;
      const um = (a0 + a1) / 2, vm = (b0 + b1) / 2;
      pushBlock(kind, o.x + eu[0] * um + ev[0] * vm, o.z + eu[1] * um + ev[1] * vm, -g, a1 - a0, b1 - b0, S(i, j, seed + 3));
    }
  };
  // the trident: three main avenues ~30° apart, plus a wide ring street
  polar('fan', Ad, phi0 - FAN, phi0 + FAN, 260, FANR, 3,
    [{ p: phi0 - 0.52, w: 36, clear: 0.07 }, { p: phi0, w: 30, clear: 0.07 }, { p: phi0 + 0.5, w: 44, clear: 0.07 }], [{ p: 1500, w: 28, clear: 90 }]);
  grid('east', Ad, 0.22, -6000, 7000, -7000, 6000, 170, 170, 150, 110, 17);
  grid('west', Ad, -0.55, -7000, 6000, -7000, 6000, 150, 120, 180, 130, 29);
  grid('vo', Fo, 0.95, -7000, 7000, -7000, 7000, 95, 40, 330, 150, 37);
  polar('petro', Fo, -Math.PI, Math.PI, 330, 2100, 51, [], []);

  // ---------- buildings: perimeter blocks cut into houses of different height ----------
  const lots = [];
  const bClear = (cx, cz, c, s, hl, hd, m) => {
    for (const [lx, lz] of [[-hl, -hd], [hl, -hd], [-hl, hd], [hl, hd], [0, 0]]) {
      const x = cx + lx * c + lz * s, z = cz - lx * s + lz * c;
      if (waterDist(x, z) < m) return false;
      for (const q of landmarkClear) if (x > q.x0 && x < q.x1 && z > q.z0 && z < q.z1) return false;
    }
    return true;
  };
  const floorsFor = (b, k) => {
    const r = S(b.cx + k * 13.1, b.cz, 61), tall = S(b.cz, b.cx + k * 7.3, 67);
    let f = b.kind === 'fan' ? (b.dA < 900 ? 5 : 6) : b.kind === 'vo' ? 5 : b.kind === 'petro' ? 6 : 5;
    f += Math.round((r - 0.5) * 3.2);
    if (tall < 0.07 && b.dA > 900) f += 3 + Math.floor(r * 3);    // occasional tall tenement / late-era block
    if (b.dC > R * 0.75 && tall > 0.9) f += 4;                    // taller edge of town
    return Math.max(3, Math.min(12, f));
  };
  const domes = [];
  for (const b of blocks) {
    const c = Math.cos(b.a), s = Math.sin(b.a), W = b.W, D = b.D;
    const toW = (lx, lz) => [b.cx + lx * c + lz * s, b.cz - lx * s + lz * c];
    if (b.park) { parks.push(b); continue; }
    const dep = Math.min(14 + b.seed * 14, W / 2 - 4, D / 2 - 4);
    const sides = dep < 12 ? [{ lx: 0, lz: 0, run: W, rot: b.a, dep: D, along: 'x', lzF: 0 }] : [
      { lz: -D / 2 + dep / 2, run: W, rot: b.a, along: 'x' },
      { lz: D / 2 - dep / 2, run: W, rot: b.a + Math.PI, along: 'x' },
      { lx: -W / 2 + dep / 2, run: D - 2 * dep, rot: b.a + Math.PI / 2, along: 'z' },
      { lx: W / 2 - dep / 2, run: D - 2 * dep, rot: b.a - Math.PI / 2, along: 'z' },
    ];
    let k = 0;
    for (const sd of sides) {
      const d0 = sd.dep || dep;
      let p = -sd.run / 2;
      while (p < sd.run / 2 - 8) {
        let len = 16 + S(b.cx + k, b.cz - p, 71) * 42; if (p + len > sd.run / 2 - 10) len = sd.run / 2 - p;
        const mid = p + len / 2; p += len; k++;
        if (S(b.cz + k, b.cx, 73) < 0.035) continue;                      // courtyard arch / gap
        const lx = sd.along === 'x' ? mid : sd.lx, lz = sd.along === 'x' ? sd.lz : mid;
        const [x, z] = toW(lx, lz);
        const dj = d0 * (0.85 + S(k, b.cx, 79) * 0.3);                    // ragged yard line
        const rc = Math.cos(sd.rot), rs = Math.sin(sd.rot);
        if (!bClear(x, z, rc, rs, len / 2, dj / 2, 18)) continue;
        const fl = floorsFor(b, k), h = fl * 3.6 + 2.6, seed = S(x, z, 13);
        lots.push({ x, z, len, dep: dj, rot: sd.rot, h, seed, dC: b.dC, flat: seed < 0.22 || fl >= 9 });
        if ((p >= sd.run / 2 - 1 || mid - len / 2 <= -sd.run / 2 + 1) && S(x, z, 83) < 0.08 && sd.along === 'x')
          domes.push([x + (mid > 0 ? 1 : -1) * (len / 2 - 5) * rc, BASE + h, z - (mid > 0 ? 1 : -1) * (len / 2 - 5) * rs, 4 + seed * 3]);  // corner turret dome
      }
    }
    // inner courtyard wings: St Petersburg blocks are dense, with rows of lower buildings inside ("fligels")
    if (dep >= 12 && D - 2 * dep > 64 && W - 2 * dep > 44) {
      const inner = D - 2 * dep, rows = Math.floor(inner / 52), c0 = Math.cos(b.a), s0 = Math.sin(b.a);
      for (let r = 0; r < rows; r++) {
        const lz = -D / 2 + dep + (r + 0.5) * inner / rows + (S(b.cx, r, 97) - 0.5) * 8;
        const room = W - 2 * dep - 12, len = room * (0.45 + S(b.cz, r, 99) * 0.55), lx = (S(r, b.cx, 101) - 0.5) * (room - len);
        const [x, z] = toW(lx, lz), dj = 11 + S(r, b.cz, 103) * 5;
        if (len < 20 || !bClear(x, z, c0, s0, len / 2, dj / 2, 18)) continue;
        const fl = Math.max(2, floorsFor(b, 50 + r) - 1 - Math.floor(S(x, r, 105) * 2)), h = fl * 3.6 + 2.6;
        lots.push({ x, z, len, dep: dj, rot: b.a, h, seed: S(x, z, 13), dC: b.dC, flat: S(z, x, 107) < 0.4, inner: true });
      }
    }
    // lamps along the block edge
    const per = 2 * (W + D), n = Math.floor(per / 32);
    for (let i = 0; i < n; i++) {
      let t = i * 32, lx, lz;
      if (t < W) { lx = -W / 2 + t; lz = -D / 2 - 5; } else if ((t -= W) < D) { lx = W / 2 + 5; lz = -D / 2 + t; }
      else if ((t -= D) < W) { lx = W / 2 - t; lz = D / 2 + 5; } else { t -= W; lx = -W / 2 - 5; lz = D / 2 - t; }
      const [x, z] = toW(lx, lz); if (waterDist(x, z) > 4) lamps.push(x, BASE + 7, z);
    }
  }
  // churches on some squares
  const churches = plazas.filter((p, i) => i % 3 === 1 && waterDist(p.x, p.z) > 60);
  const boxes = lots;
  for (const l of lots) addSolidR(l.x, l.z, Math.cos(l.rot), Math.sin(l.rot), l.len / 2, l.dep / 2, 0, BASE + l.h + 4);
  // LOD: within lodU.r of lodU.c the boxes collapse and textured AssetForge houses take their place
  const lodU = { c: { value: new THREE.Vector3(1e9, 0, 1e9) }, r: { value: 0 } };
  const addLod = sh => {
    sh.uniforms.uLodC = lodU.c; sh.uniforms.uLodR = lodU.r;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform vec3 uLodC; uniform float uLodR;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        { vec3 ic = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz; if (distance(ic.xz, uLodC.xz) < uLodR) transformed *= 0.0; }`);
  };
  // procedural facades
  const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, 0.5, 0);
  const fmat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0.02 });
  fmat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN; varying float vId; varying float vTop;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix * instanceMatrix * vec4(transformed,1.0)).xyz; vWN = normalize(mat3(modelMatrix * instanceMatrix) * objectNormal); vId = float(gl_InstanceID); vTop = (modelMatrix * instanceMatrix * vec4(0.0,1.0,0.0,1.0)).y;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN; varying float vId; varying float vTop;\nfloat h1(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719)))*43758.5453); }')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        if (vWN.y > 0.5) { diffuseColor.rgb = vec3(0.32,0.34,0.33); }
        else if (vWN.y > -0.5) {
          float u = dot(vWP.xz, normalize(vec2(-vWN.z, vWN.x) + 1e-5));
          float y = vWP.y - 3.0, top = vTop - 3.0;
          // box-filtered window masks: no shimmering at a distance; lit windows are emissive and fade
          // into their average glow instead of flickering in and out
          vec2 cu = vec2(u/3.3, (y-1.4)/3.7), fw = max(fwidth(cu), vec2(1e-4));
          float sharp = 1.0 - smoothstep(0.1, 0.35, max(fw.x, fw.y));
          vec2 f = fract(cu);
          #define PUL(x, a, b, w) clamp((min((x) + (w)*0.5, b) - max((x) - (w)*0.5, a)) / (w), 0.0, 1.0)
          float floorIdx = floor(cu.y);
          float inBody = step(4.8, y) * step(y, top - 2.4);
          float win = PUL(f.x, 0.3, 0.72, fw.x) * PUL(f.y, 0.22, 0.8, fw.y) * inBody;
          float frame = PUL(f.x, 0.24, 0.78, fw.x) * PUL(f.y, 0.16, 0.86, fw.y) * inBody - win;
          float cornice = step(top - 1.6, y) * step(y, top - 0.6) + step(4.3, y) * step(y, 4.8);
          float rust = step(y, 4.3) * (0.82 + 0.18*step(0.5, fract(y/0.9)));
          vec3 base = diffuseColor.rgb * mix(1.0, rust, step(y, 4.3));
          vec3 trim = vec3(0.93, 0.92, 0.88);
          vec3 c = base;
          c = mix(c, trim, clamp(frame + cornice, 0.0, 1.0) * sharp + (0.12 + cornice*0.6) * (1.0 - sharp));
          c = mix(c, vec3(0.1,0.12,0.14), win * sharp + 0.24 * (1.0 - sharp) * inBody);
          diffuseColor.rgb = c;
          float lit = step(0.86, h1(vec3(floor(cu.x), floorIdx, vId)));
          totalEmissiveRadiance += mix(win * lit, 0.034 * inBody, 1.0 - sharp) * vec3(1.0, 0.72, 0.42) * 2.4;
        }`);
  };
  const fmatL = fmat.clone(); fmatL.onBeforeCompile = sh => { fmat.onBeforeCompile(sh); addLod(sh); }; fmatL.customProgramCacheKey = () => 'facadeLod';
  const facades = new THREE.InstancedMesh(box, fmatL, boxes.length);
  // tin roofs: triangular prisms along each house's length (some houses keep a flat roof)
  const prism = new THREE.BufferGeometry();
  { const v = [-0.5, 0, -0.5, 0.5, 0, -0.5, 0, 1, -0.5, -0.5, 0, 0.5, 0.5, 0, 0.5, 0, 1, 0.5];
    prism.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    prism.setIndex([0, 2, 1, 3, 4, 5, 0, 3, 5, 0, 5, 2, 1, 2, 5, 1, 5, 4]); prism.computeVertexNormals(); }
  const pitched = boxes.filter(l => !l.flat);
  const roofMat = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.45, flatShading: true }); roofMat.onBeforeCompile = addLod;
  const roofs = new THREE.InstancedMesh(prism, roofMat, pitched.length);
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  boxes.forEach((l, i) => {
    q.setFromAxisAngle(up, l.rot);
    m4.compose(V3(l.x, BASE - 0.5, l.z), q, V3(l.len, l.h, l.dep)); facades.setMatrixAt(i, m4);
    col.setHex(PALETTE[Math.floor(l.seed * 97) % PALETTE.length]).multiplyScalar(0.85 + hash2(l.x, l.z, 3) * 0.2); facades.setColorAt(i, col);
  });
  pitched.forEach((l, i) => {
    q.setFromAxisAngle(up, l.rot + Math.PI / 2);
    m4.compose(V3(l.x, BASE - 0.5 + l.h, l.z), q, V3(l.dep, 3 + l.seed * 3, l.len));
    roofs.setMatrixAt(i, m4); col.setHex(ROOFS[Math.floor(l.seed * 31) % ROOFS.length]); roofs.setColorAt(i, col);
  });
  facades.frustumCulled = roofs.frustumCulled = false; group.add(facades, roofs);
  // AssetForge houses (near LOD). Each lot gets the model whose proportions fit it best; model front = local -Z = street.
  const types = [];
  for (let n = 1; n <= 12; n++) {
    const k = 'spb_r' + n; if (!glbs[k]) continue;
    const src = glbs[k].wrap; src.updateMatrixWorld(true);
    let geo = null, mat = null;
    src.traverse(o => { if (o.isMesh && !geo) { geo = o.geometry.clone().applyMatrix4(o.matrixWorld); mat = o.material; } });
    if (!geo) continue;
    geo.computeBoundingBox(); const gb = geo.boundingBox, gs = gb.getSize(new THREE.Vector3());
    geo.translate(-(gb.min.x + gb.max.x) / 2, -gb.min.y, -(gb.min.z + gb.max.z) / 2);
    // lit windows: dark glass pixels of the texture glow in a random pattern of world-space cells
    const m = mat.clone();
    m.onBeforeCompile = sh => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vHW; varying float vHNy; varying float vHTop;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvHW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz; vHNy = normalize(mat3(modelMatrix * instanceMatrix) * objectNormal).y; vHTop = (modelMatrix * instanceMatrix * vec4(0.0, ' + gs.y.toFixed(4) + ', 0.0, 1.0)).y;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vHW; varying float vHNy; varying float vHTop;')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          { float lum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
            vec3 cell = floor(vec3(vHW.x / 3.2, (vHW.y - 3.0) / 3.6, vHW.z / 3.2));
            float lit = step(0.84, fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453));
            float body = step(7.0, vHW.y) * step(vHW.y, 3.0 + (vHTop - 3.0) * 0.72);   // skip ground floor and the roof zone
            totalEmissiveRadiance += smoothstep(0.1, 0.04, lum) * body * (1.0 - smoothstep(0.15, 0.3, abs(vHNy))) * lit * vec3(1.0, 0.72, 0.42) * 1.1; }`);
    };
    m.customProgramCacheKey = () => 'house' + n;
    types.push({ k, geo, mat: m, gs, asp: gs.y / gs.x, lots: [] });
  }
  const houseMeshes = [];
  if (types.length) {
    for (const l of lots) {
      let best = null, bs = 1e9;
      for (const t of types) { const sc = Math.abs(Math.log((l.h + 4) / l.len / t.asp)) + S(l.x + t.asp, l.z, 111) * 0.35; if (sc < bs) { bs = sc; best = t; } }
      q.setFromAxisAngle(up, l.rot);
      m4.compose(V3(l.x, BASE - 0.3, l.z), q, V3(l.len / best.gs.x, (l.h + 4) / best.gs.y, l.dep / best.gs.z));
      l.gm = m4.toArray(new Float32Array(16)); l.t = best; best.lots.push(l);
    }
    for (const t of types) { t.im = new THREE.InstancedMesh(t.geo, t.mat, Math.max(1, t.lots.length)); t.im.count = 0; t.im.frustumCulled = false; group.add(t.im); houseMeshes.push(t.im); }
  }
  // spatial index of lots for the LOD pass
  const LC = 250, lotCells = new Map();
  for (const l of lots) { const k = Math.floor(l.x / LC) * 100003 + Math.floor(l.z / LC); (lotCells.get(k) || lotCells.set(k, []).get(k)).push(l); }
  const NEAR = opt.near || 1100, last = new THREE.Vector3(1e9, 0, 1e9);
  const updateLod = cam => {
    if (!types.length) return;
    const far = cam.y > 2600;                                   // from high up everything reads as boxes anyway
    if (!far && Math.hypot(cam.x - last.x, cam.z - last.z) < 60 && lodU.r.value > 0) return;
    last.copy(cam);
    if (far) { lodU.r.value = 0; for (const t of types) t.im.count = 0; return; }
    for (const t of types) t.im.count = 0;
    const r2 = NEAR * NEAR, ci = Math.floor(cam.x / LC), cj = Math.floor(cam.z / LC), n = Math.ceil(NEAR / LC);
    for (let i = ci - n; i <= ci + n; i++) for (let j = cj - n; j <= cj + n; j++) {
      const list = lotCells.get(i * 100003 + j); if (!list) continue;
      for (const l of list) {
        const dx = l.x - cam.x, dz = l.z - cam.z; if (dx * dx + dz * dz >= r2) continue;
        const t = l.t; t.im.instanceMatrix.array.set(l.gm, t.im.count * 16); t.im.count++;
      }
    }
    for (const t of types) t.im.instanceMatrix.needsUpdate = true;
    lodU.c.value.set(cam.x, 0, cam.z); lodU.r.value = NEAR;
  };
  // corner turrets and small churches: drums with domes
  const gold = new THREE.MeshStandardMaterial({ color: 0xc9a24a, roughness: 0.3, metalness: 0.9 });
  const tin = new THREE.MeshStandardMaterial({ color: 0x3f5a52, roughness: 0.45, metalness: 0.6 });
  const drumG = new THREE.CylinderGeometry(1, 1, 1, 16); drumG.translate(0, 0.5, 0);
  const domeG = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  const cc = churches.length, drums = new THREE.InstancedMesh(drumG, fmat, domes.length + cc * 2);
  const domeM = new THREE.InstancedMesh(domeG, tin, domes.length), gDome = new THREE.InstancedMesh(domeG, gold, cc * 2);
  const naves = new THREE.InstancedMesh(box, fmat, cc);
  let di = 0;
  domes.forEach(([x, y, z, r], i) => {
    m4.compose(V3(x, y - 1, z), q.identity(), V3(r, 5, r)); drums.setMatrixAt(di, m4); drums.setColorAt(di++, col.setHex(0xe6d7b5));
    m4.compose(V3(x, y + 4, z), q, V3(r, r * 1.3, r)); domeM.setMatrixAt(i, m4);
  });
  churches.forEach((p, i) => {
    const a = S(p.x, p.z, 91) * Math.PI, h = 16 + S(p.z, p.x, 93) * 8;
    q.setFromAxisAngle(up, a); m4.compose(V3(p.x, BASE - 0.5, p.z), q, V3(46, h, 24)); naves.setMatrixAt(i, m4); naves.setColorAt(i, col.setHex(PALETTE[i % PALETTE.length]));
    for (const [off, r, dh] of [[0, 8, 14], [16, 4.5, 6]]) {
      const x = p.x + Math.cos(a) * off, z = p.z - Math.sin(a) * off;
      m4.compose(V3(x, BASE + h - 1, z), q.identity(), V3(r, dh, r)); drums.setMatrixAt(di, m4); drums.setColorAt(di++, col.setHex(0xe9e1cf));
      m4.compose(V3(x, BASE + h + dh - 1, z), q, V3(r * 1.05, r * 1.5, r * 1.05)); gDome.setMatrixAt(i * 2 + (off ? 1 : 0), m4);
    }
    addSolidR(p.x, p.z, Math.cos(a), Math.sin(a), 24, 13, 0, BASE + h + 26);
  });
  for (const m of [drums, domeM, gDome, naves]) { m.frustumCulled = false; group.add(m); }
  // yards (lighter paving inside blocks) and parks
  const yardM = new THREE.InstancedMesh(box, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 }), blocks.length);
  blocks.forEach((b, i) => {
    q.setFromAxisAngle(up, b.a); m4.compose(V3(b.cx, BASE - 0.6, b.cz), q, b.dry ? V3(b.W, 0.5, b.D) : V3(0, 0, 0)); yardM.setMatrixAt(i, m4);
    yardM.setColorAt(i, b.park ? col.setRGB(0.2, 0.3, 0.14) : col.setRGB(0.44, 0.42, 0.39).multiplyScalar(0.85 + b.seed * 0.3));
  });
  yardM.frustumCulled = false; group.add(yardM);
  const trees = [];
  for (const p of parks) { const c = Math.cos(p.a), s = Math.sin(p.a), n = Math.floor(p.W * p.D / 900);
    for (let t = 0; t < n; t++) { const lx = (S(p.cx, t, 1) - 0.5) * (p.W - 16), lz = (S(p.cz, t, 2) - 0.5) * (p.D - 16);
      trees.push([p.cx + lx * c + lz * s, p.cz - lx * s + lz * c, 6 + S(t, p.cx, 3) * 5]); } }
  const treeM = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0x2f4a26, roughness: 0.95, flatShading: true }), Math.max(1, trees.length));
  trees.forEach(([x, z, r], i) => { m4.makeScale(r, r * 1.3, r).setPosition(x, BASE + r * 1.1, z); treeM.setMatrixAt(i, m4); });
  treeM.frustumCulled = false; group.add(treeM);
  // street lamps as glowing points
  const lampG = new THREE.BufferGeometry(); lampG.setAttribute('position', new THREE.Float32BufferAttribute(lamps, 3));
  const lampP = new THREE.Points(lampG, new THREE.PointsMaterial({ color: 0xffc27a, size: 2.2, sizeAttenuation: true, fog: true }));
  lampP.frustumCulled = false; group.add(lampP);

  // ---------- granite embankments ----------
  const granite = new THREE.MeshStandardMaterial({ color: 0x8a7a72, roughness: 0.75, metalness: 0.05 });
  for (const W of waters) for (const side of [1, -1]) {
    const pts = W.pts, pos = [], idx = [];
    const sampled = [];
    for (let i = 0; i < pts.length - 1; i++) for (let t = 0; t < 1; t += 0.05) { const a = along(pts, i, t); sampled.push(a); }
    sampled.push(along(pts, pts.length - 2, 1));
    sampled.forEach((a, k) => {
      const ox = -a.tz * side * W.w / 2, oz = a.tx * side * W.w / 2;
      const x = a.x + ox, z = a.z + oz, nx = -a.tz * side * 1.2, nz = a.tx * side * 1.2;
      pos.push(x, -3, z, x, BASE + 0.9, z, x + nx, BASE + 0.9, z + nz);
      if (k) { const b = (k - 1) * 3, c = k * 3; idx.push(b, c, b + 1, c, c + 1, b + 1, b + 1, c + 1, b + 2, c + 1, c + 2, b + 2); }
    });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, granite); m.material.side = THREE.DoubleSide; m.frustumCulled = false; group.add(m);
  }
  // ---------- bridges ----------
  const iron = new THREE.MeshStandardMaterial({ color: 0x2c3236, roughness: 0.5, metalness: 0.6 });
  const addBridge = (W, i, u, raised) => {
    const a = along(W.pts, i, u), big = W.w > 100, len = W.w + (big ? 60 : 24), wid = big ? 28 : 16, top = big ? 12 : 5.5;
    const g = new THREE.Group(); g.position.set(a.x, 0, a.z); g.rotation.y = Math.atan2(a.tx, a.tz) + Math.PI / 2; group.add(g);
    const span = (z0, z1) => { const d = new THREE.Mesh(new THREE.BoxGeometry(wid, 2, z1 - z0), granite); d.position.set(0, top - 1, (z0 + z1) / 2); g.add(d);
      for (const s of [1, -1]) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.2, z1 - z0), iron); r.position.set(s * wid / 2, top + 0.6, (z0 + z1) / 2); g.add(r); } };
    if (raised && big) {
      span(-len / 2, -70); span(70, len / 2);
      for (const s of [1, -1]) { const leaf = new THREE.Group(); leaf.position.set(0, top, s * 70); leaf.rotation.x = s * 1.05; g.add(leaf);
        const d = new THREE.Mesh(new THREE.BoxGeometry(wid, 1.6, 70), iron); d.position.z = -s * 35; leaf.add(d); }
    } else span(-len / 2, len / 2);
    const piers = big ? [-0.3, 0, 0.3] : [0];
    for (const p of piers) { if (raised && p === 0) continue; const pr = new THREE.Mesh(new THREE.BoxGeometry(wid + 4, top + 4, big ? 14 : 5), granite); pr.position.set(0, (top - 4) / 2, p * W.w); g.add(pr); }
    g.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(g);
    addSolid(bb.min.x, bb.max.x, bb.min.z, bb.max.z, top - 2.5, top + 1.5);
  };
  addBridge(waters[0], 0, 0.75, false); addBridge(waters[0], 1, 0.35, false); addBridge(waters[0], 1, 0.78, true);
  addBridge(waters[0], 2, 0.45, false); addBridge(waters[0], 3, 0.5, true);
  for (const W of waters.slice(1)) for (let i = 0; i < W.pts.length - 1; i++) for (const u of (W.pts.length > 6 ? [0.5] : [0.3, 0.75])) addBridge(W, i, u, false);

  // ---------- ground: roads, courtyards, river cut-outs ----------
  const segs = []; for (const W of waters) for (let i = 0; i < W.pts.length - 1; i++) segs.push(new THREE.Vector4(W.pts[i][0], W.pts[i][1], W.pts[i + 1][0], W.pts[i + 1][1]));
  const segW = []; for (const W of waters) for (let i = 0; i < W.pts.length - 1; i++) segW.push(W.w / 2);
  const gmat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  withDetail(gmat, sh => {
    sh.uniforms.uC = { value: C }; sh.uniforms.uR = { value: R }; sh.uniforms.uSeg = { value: segs }; sh.uniforms.uSegW = { value: segW };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed,1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vWP; uniform vec3 uC; uniform float uR; uniform vec4 uSeg[${segs.length}]; uniform float uSegW[${segs.length}];
      float waterD(vec2 p){ float m = 1e9; for (int i = 0; i < ${segs.length}; i++) { vec2 a = uSeg[i].xy, b = uSeg[i].zw, ab = b - a;
        float t = clamp(dot(p - a, ab)/dot(ab, ab), 0.0, 1.0); m = min(m, length(p - a - ab*t) - uSegW[i]); } return m; }`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        float wd = waterD(vWP.xz); if (wd < 0.0) discard;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float dC = length(vWP.xz - uC.xz);
        if (dC < uR + 150.0) {
          // asphalt streets and embankment drives; yards/parks are separate slabs
          float edge = 1.0 - smoothstep(uR - 200.0, uR + 150.0, dC);
          vec3 asph = vec3(0.27, 0.26, 0.25) * (0.85 + 0.3 * tdf(vWP.xz / 9.0));
          diffuseColor.rgb = mix(diffuseColor.rgb, mix(asph, vec3(0.42, 0.4, 0.37), 1.0 - step(10.0, wd)), edge);
        }`);
  });
  const ground = fieldMesh(F, (x, y, z) => {
    const r = hash2(Math.floor(x / 80), Math.floor(z / 80), 4) * 0.05;
    if (y < 4 && Math.hypot(x - C.x, z - C.z) > R + 300) return [0.5, 0.48, 0.4];
    return y > 350 ? [0.3 + r, 0.3 + r, 0.24] : [0.24 + r, 0.3 + r, 0.17];
  }, gmat);
  group.add(ground);

  // ---------- targets & routes ----------
  const pick = (list, n) => list.slice(0, n);
  const pal = L[0].box; const square = new THREE.Vector3((pal.min.x + pal.max.x) / 2, BASE, (pal.min.z + pal.max.z) / 2);
  { const a = along(neva, 1, 0.72); square.x += -a.tz * 190; square.z += a.tx * 190; } // palace square behind the palace
  const embank = []; for (let t = 0.05; t <= 0.95; t += 0.05) { const a = along(neva, 1, t); embank.push(new THREE.Vector3(a.x - a.tz * (230 + 14), BASE, a.z + a.tx * (230 + 14))); }
  for (let t = 0.05; t <= 0.9; t += 0.05) { const a = along(neva, 2, t); embank.push(new THREE.Vector3(a.x - a.tz * (230 + 14), BASE, a.z + a.tx * (230 + 14))); }
  // tank routes: down the central avenue of the trident and around the ring street
  const trident = mainStreets.find(m => Math.abs(m.phi - phi0) < 0.01) || mainStreets[0];
  const avenue = []; for (let r = 320; r < FANR - 200; r += 60) avenue.push(new THREE.Vector3(Ad.x + Math.cos(trident.phi) * r, BASE, Ad.z + Math.sin(trident.phi) * r));
  const cross = []; for (let a = -1.1; a <= 1.1; a += 0.03) cross.push(new THREE.Vector3(Ad.x + Math.cos(phi0 + a) * 1500, BASE, Ad.z + Math.sin(phi0 + a) * 1500));
  const free = plazas.filter((p, i) => i % 3 !== 1 && p.distanceTo(C) < R * 0.8), spread = (l, n, o) => Array.from({ length: Math.min(n, l.length) }, (_, k) => l[Math.floor((k + o) * l.length / n) % l.length]);
  const sites = { tower: spread(free.length ? free : parks.map(p => new THREE.Vector3(p.cx, BASE, p.cz)), 4, 0.25), sam: [square, ...spread(free, 2, 0.5)] };
  while (sites.sam.length < 3) sites.sam.push(new THREE.Vector3(C.x + 900 * sites.sam.length, BASE, C.z - 1500));
  return { kind: 'city', update: updateLod, group, heightAt, groundAt, solidAt, paths: [embank, avenue, cross], sites, center: C, waterDist };
}

function fallbackLandmark(k) {
  const g = new THREE.Group();
  const M = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, metalness: c === 0xd4a93a ? 0.9 : 0.05 });
  const gold = M(0xd4a93a);
  if (k === 'spb_l6') { const t = new THREE.Mesh(new THREE.CylinderGeometry(4, 36, 380, 5), M(0x6f9bc4)); t.position.y = 190; g.add(t); return g; }
  if (k === 'spb_l2' || k === 'spb_l5') {
    const nave = new THREE.Mesh(new THREE.BoxGeometry(k === 'spb_l5' ? 280 : 60, 22, 34), M(k === 'spb_l5' ? 0xe3c27a : 0xe6d7b5)); nave.position.y = 11; g.add(nave);
    const tower = new THREE.Mesh(new THREE.BoxGeometry(18, 40, 18), M(0xe6d7b5)); tower.position.y = 20; g.add(tower);
    const spire = new THREE.Mesh(new THREE.ConeGeometry(4, k === 'spb_l5' ? 34 : 82, 8), gold); spire.position.y = 40 + (k === 'spb_l5' ? 17 : 41); g.add(spire); return g;
  }
  if (k === 'spb_l4') { const p = new THREE.Mesh(new THREE.BoxGeometry(210, 24, 60), M(0x9cc9b0)); p.position.y = 12; g.add(p); return g; }
  const body = new THREE.Mesh(new THREE.BoxGeometry(80, 40, 80), M(k === 'spb_l3' ? 0xa84a3a : 0x9c9690)); body.position.y = 20; g.add(body);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(k === 'spb_l3' ? 12 : 22, 20, 12), k === 'spb_l3' ? M(0x3a6fb0) : gold); dome.position.y = k === 'spb_l3' ? 62 : 70; dome.scale.y = k === 'spb_l3' ? 1.4 : 1; g.add(dome);
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(20, 20, 22, 20), M(0xb8b2a8)); drum.position.y = 50; g.add(drum);
  return g;
}

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { CloudScenePass, makeNoise3D, FX_LAYER } from './clouds.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { makeJet, setSweep, makeTanker, makeMissile, makeShip, makeCarrier, makeIsland, makeBase, flameMaterial, makeTank, makeSamTruck, makeRadioTower } from './models.js';
import { makeMountains, makeCity, COAST, TERRAIN_TEX } from './terrain.js';
import { makeOcean, Streaks, Ribbon, Tracers, FinalShader } from './fx.js';
import { Particles, Fireballs, Sparks, LightPool, makeMuzzleFlash } from './vfx.js';
import { drawHud } from './hud.js';
import { Sfx } from './audio.js';

// ======================= config =======================
// Drop AssetForge-generated GLBs into assets/ – they replace the procedural meshes automatically.
// forward axis of the GLB must be +Z (rotY fixes it otherwise), length in metres is normalised.
// phones/tablets: lighter settings (resolution budget, clouds, shadows, house LOD) - also keeps an iPhone cooler
const MOBILE = document.documentElement.classList.contains('touch');   // coarse pointer, or ?touch for testing on a desktop
const GLB = {
  player: { url: 'assets/player.glb', length: 19, rotY: 0 },
  enemy: { url: 'assets/enemy.glb', length: 17, rotY: 0 },
  carrier: { url: 'assets/carrier.glb', length: 330, rotY: 0 },
  tank: { url: 'assets/tank.glb', length: 9.5, rotY: 0, ground: true },
  sam: { url: 'assets/sam.glb', length: 12, rotY: 0, ground: true },
  tower: { url: 'assets/tower.glb', length: 60, rotY: 0, ground: true },
  spb_r1: { url: 'assets/spb_r1.glb', length: 60, rotY: 0, ground: true },
  spb_r2: { url: 'assets/spb_r2.glb', length: 60, rotY: 0, ground: true },
  spb_r3: { url: 'assets/spb_r3.glb', length: 60, rotY: 0, ground: true },
  spb_r4: { url: 'assets/spb_r4.glb', length: 60, rotY: 0, ground: true },
  spb_r5: { url: 'assets/spb_r5.glb', length: 60, rotY: 0, ground: true },
  spb_r6: { url: 'assets/spb_r6.glb', length: 60, rotY: 0, ground: true },
  spb_r7: { url: 'assets/spb_r7.glb', length: 60, rotY: 0, ground: true },
  spb_r8: { url: 'assets/spb_r8.glb', length: 60, rotY: 0, ground: true },
  spb_r9: { url: 'assets/spb_r9.glb', length: 60, rotY: 0, ground: true },
  spb_r10: { url: 'assets/spb_r10.glb', length: 60, rotY: 0, ground: true },
  spb_l1: { url: 'assets/spb_l1.glb', length: 60, rotY: 0, ground: true },
  spb_l2: { url: 'assets/spb_l2.glb', length: 60, rotY: 0, ground: true },
  spb_l3: { url: 'assets/spb_l3.glb', length: 60, rotY: 0, ground: true },
  spb_l4: { url: 'assets/spb_l4.glb', length: 60, rotY: 0, ground: true },
  spb_l5: { url: 'assets/spb_l5.glb', length: 60, rotY: 0, ground: true },
  spb_l6: { url: 'assets/spb_l6.glb', length: 60, rotY: 0, ground: true },
};
const MISSIONS = [
  { name: 'Pacific Dawn', time: 'Dawn · 05:40', brief: 'Bandits are probing the fleet at first light. Clear the sky and come home.',
    sunEl: 4, sunAz: 80, turb: 5, ray: 2.6, mie: 0.004, exp: 0.5, fog: 0xe0b394, fogD: 0.000062, sky: 0xf2c4a2, sunCol: 0xffc59a,
    deep: 0x0b2236, shallow: 0x2a4a60, cloudTint: 0xffd9c4, cov: 0.42, cloudH: 1500, cloudAlt: 1100, kills: 10, ships: 0, bases: 0, islands: 0, refuel: false, ecarrier: false, aggr: 0.55, fuelMul: 0.55 },
  { name: 'Iron Strait', time: 'Noon · 12:10', brief: 'A frigate group is forcing the strait under fighter cover. Sink the ships, splash the escorts. Tanker on call.',
    sunEl: 58, sunAz: 150, turb: 2.2, ray: 2.2, mie: 0.003, exp: 0.3, fog: 0xa9c6e2, fogD: 0.000055, sky: 0x8fb6dc, sunCol: 0xfff2e0,
    deep: 0x05304c, shallow: 0x1b6687, cloudTint: 0xffffff, cov: 0.5, cloudH: 1800, cloudAlt: 1500, kills: 12, ships: 3, bases: 0, islands: 0, refuel: true, ecarrier: false, aggr: 0.75, fuelMul: 1 },
  { name: 'Archipelago', time: 'Afternoon · 16:20', brief: 'Radar and SAM sites hide on the islands. Knock them out and keep the interceptors off your tail.',
    sunEl: 24, sunAz: 230, turb: 4, ray: 2, mie: 0.005, exp: 0.4, fog: 0xbfd0df, fogD: 0.00006, sky: 0xa8c4de, sunCol: 0xffe8c8,
    deep: 0x053a4a, shallow: 0x1f7f8a, cloudTint: 0xfff6ea, cov: 0.55, cloudH: 1700, cloudAlt: 1300, kills: 12, ships: 0, bases: 4, islands: 7, refuel: true, ecarrier: false, aggr: 0.9, fuelMul: 1 },
  { name: 'Sierra Pass', time: 'Morning · 08:30', brief: 'Interceptors are guarding a supply road through the mountains. Follow the river valley, kill the tank column and the SAMs on the ridges.',
    sunEl: 16, sunAz: 110, turb: 2.5, ray: 1.8, mie: 0.004, exp: 0.36, fog: 0xb4c6d8, fogD: 0.000045, sky: 0x9ab8d8, sunCol: 0xfff0dc,
    deep: 0x07303f, shallow: 0x1d6a78, cloudTint: 0xffffff, cov: 0.38, cloudH: 1600, cloudAlt: 2700, kills: 12, ships: 0, bases: 0, islands: 0, land: 'mountains', tanks: 5, sams: 4, towers: 2, refuel: true, ecarrier: false, aggr: 0.95, fuelMul: 1 },
  { name: 'White Nights', time: 'White nights · 23:40', brief: 'Midnight and the sky never goes dark. Radar towers and SAMs hide among the palaces of a river city; armour runs along the granite embankment. Mind the bridges — the big ones are raised.',
    sunEl: 1.2, sunAz: 318, turb: 3, ray: 3.2, mie: 0.004, exp: 0.85, fog: 0xa6a3b8, fogD: 0.000055, sky: 0x8d9cc0, sunCol: 0xffa070,
    deep: 0x1c3a52, shallow: 0x3a6a80, cloudTint: 0xffb89a, cov: 0.32, cloudH: 1200, cloudAlt: 2200, kills: 12, ships: 0, bases: 0, islands: 0, land: 'city', tanks: 6, sams: 3, towers: 4, refuel: false, ecarrier: false, aggr: 1.0, fuelMul: 0.8 },
  { name: 'Red Horizon', time: 'Sunset · 19:05', brief: 'The enemy carrier is in range. Punch through its air wing and put it on the bottom before dark.',
    sunEl: 1.5, sunAz: 265, turb: 6, ray: 3, mie: 0.004, exp: 0.55, fog: 0xd8866a, fogD: 0.000068, sky: 0xe08a64, sunCol: 0xff9a5a,
    deep: 0x160f1c, shallow: 0x4a2a30, cloudTint: 0xffb89a, cov: 0.4, cloudH: 1400, cloudAlt: 1200, kills: 16, ships: 2, bases: 0, islands: 0, refuel: true, ecarrier: true, aggr: 1.05, fuelMul: 1 },
];
const LOADOUTS = [
  { name: 'T-1', desc: 'Short-range heat seeker. Fast lock, lots of rounds.', count: 36, lock: 0.45, range: 2600, cone: 14, turn: 3.4, speed: 560 },
  { name: 'T-2', desc: 'Medium-range radar missile. The balanced pick.', count: 24, lock: 0.75, range: 4200, cone: 11, turn: 3.0, speed: 640 },
  { name: 'T-3', desc: 'Long-range missile. Slow lock, few rounds, huge reach.', count: 14, lock: 1.1, range: 6800, cone: 8, turn: 2.6, speed: 720 },
];

// ======================= setup =======================
const $ = id => document.getElementById(id);
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const AX = V(1, 0, 0), AY = V(0, 1, 0), AZ = V(0, 0, 1);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (a = 1) => (Math.random() - 0.5) * 2 * a;
const _v = V(), _v2 = V(), _v3 = V(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();

const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(65, 1, 1.0, 40000);
scene.add(camera);

const sky = new Sky(); sky.scale.setScalar(20000); scene.add(sky);
const envSky = new Sky(); envSky.scale.setScalar(1000);
const envScene = new THREE.Scene(); envScene.add(envSky);
const pmrem = new THREE.PMREMGenerator(renderer);
let envRT = null;
let seaY = 0;
const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x1a3040, 0.7); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 2.4); scene.add(sun); scene.add(sun.target);
const sunDir = V();
const noise3D = makeNoise3D(64);
const ocean = makeOcean(noise3D); scene.add(ocean);
const cubeRT = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
const cubeCam = new THREE.CubeCamera(1, 3000, cubeRT); envScene.add(cubeCam);
ocean.material.uniforms.uEnv.value = cubeRT.texture;
const fxTag = root => { root.traverse(o => { if (o.material && o.material.blending === THREE.AdditiveBlending) o.layers.set(FX_LAYER); }); return root; };
const streaks = new Streaks(scene);
const shared = { depth: { value: null }, res: { value: new THREE.Vector2(1, 1) }, nearFar: { value: new THREE.Vector2(0.5, 40000) },
  sunView: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color(1, 1, 1) }, amb: { value: new THREE.Color(0.5, 0.55, 0.6) } };
const fire = new Particles(3500, true, shared); scene.add(fire.points);
const smoke = new Particles(6000, false, shared); scene.add(smoke.points);
const tracers = new Tracers(scene, 500);
const trails = [new Ribbon(scene, 70, 0.18), new Ribbon(scene, 70, 0.18)];
[fire.points, smoke.points, streaks.lines, tracers.mesh, ...trails.map(t => t.mesh)].forEach(o => o.layers.set(FX_LAYER));

const composer = new EffectComposer(renderer);
const cloudPass = new CloudScenePass(scene, camera, noise3D, MOBILE ? { steps: 56, scale: 0.4 } : {}); composer.addPass(cloudPass);
shared.depth.value = cloudPass.linRT.texture;
const fireballs = new Fireballs(scene, noise3D, FX_LAYER);
const sparks = new Sparks(scene, FX_LAYER);
const lights = new LightPool(scene, 5);
const muzzleFlash = makeMuzzleFlash(FX_LAYER); scene.add(muzzleFlash); let muzzleT = 0;
// sun shadows follow the player
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
sun.castShadow = true; sun.shadow.mapSize.set(MOBILE ? 1024 : 2048, MOBILE ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -170, right: 170, top: 170, bottom: -170, near: 10, far: 6000 });
sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.8;
const shadowize = (root, cast = true, recv = true) => { root.traverse(o => { if (o.isMesh && !(o.material && o.material.isShaderMaterial)) { o.castShadow = cast; o.receiveShadow = recv; } }); return root; };
const bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.45, 0.5, 1.6); composer.addPass(bloom);
const finalPass = new ShaderPass(FinalShader); composer.addPass(finalPass);
composer.addPass(new OutputPass());
const fxaa = new ShaderPass(FXAAShader); composer.addPass(fxaa);

const hud = $('hud'), hctx = hud.getContext('2d');
let W = 1, H = 1, DPR = 1;
// render resolution: capped by a pixel budget (a 1440p window at 150% scaling would be 7+ Mpx),
// then scaled by an adaptive quality factor that follows the measured frame time
let quality = 1, ftAcc = 0, ftN = 0;
function renderScale() { return Math.min(devicePixelRatio, 1.75, Math.sqrt((MOBILE ? 0.95e6 : 2.3e6) / (W * H))) * quality; }
function resize() {
  W = innerWidth; H = innerHeight; DPR = Math.min(devicePixelRatio, 2);
  const pr = renderScale(); renderer.setPixelRatio(pr); composer.setPixelRatio(pr);
  renderer.setSize(W, H, false); composer.setSize(W, H);
  bloom.resolution.set(W / 2, H / 2);
  shared.res.value.set(W * renderer.getPixelRatio(), H * renderer.getPixelRatio());
  fxaa.material.uniforms.resolution.value.set(1 / (W * renderer.getPixelRatio()), 1 / (H * renderer.getPixelRatio()));
  hud.width = W * DPR; hud.height = H * DPR; hctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  camera.aspect = W / H; camera.updateProjectionMatrix();
  const ps = H * renderer.getPixelRatio() / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  fire.mat.uniforms.uScale.value = smoke.mat.uniforms.uScale.value = ps;
}
addEventListener('resize', resize);

const safeInsets = { l: 0, r: 0, t: 0, b: 0 };
{ const d = document.createElement('div'); d.style.cssText = 'position:fixed;inset:0;pointer-events:none;visibility:hidden;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body.appendChild(d); const upd = () => { const c = getComputedStyle(d); safeInsets.t = parseFloat(c.paddingTop) || 0; safeInsets.r = parseFloat(c.paddingRight) || 0; safeInsets.b = parseFloat(c.paddingBottom) || 0; safeInsets.l = parseFloat(c.paddingLeft) || 0; };
  upd(); addEventListener('resize', upd); }
const sfx = new Sfx();
const DEMO = location.hash === '#demo';            // silent test mode
let muted = DEMO; try { muted = muted || localStorage.getItem('acewing-mute') === '1'; } catch (e) { }
const sfxInit = () => { if (DEMO) return; sfx.init(); sfx.setMuted(muted); };
function setMute(m) { muted = m; sfx.setMuted(m); try { localStorage.setItem('acewing-mute', m ? '1' : '0'); } catch (e) { } const b = document.getElementById('muteBtn'); if (b) { b.textContent = m ? 'Sound off' : 'Sound on'; b.setAttribute('aria-pressed', String(!m)); } }

// ======================= optional GLB models =======================
const glbs = {};
async function loadModels(keys, withTex) {
  const tl = new THREE.TextureLoader();
  const texJobs = !withTex ? [] : ['grass', 'rock', 'snow', 'forest'].map(k => new Promise(res => tl.load(`assets/tex/${k}.jpg`, t => {
    t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); TERRAIN_TEX[k] = t; res();
  }, undefined, res)));
  if (withTex) await Promise.all(texJobs);
  const loader = new GLTFLoader();
  await Promise.all(keys.map(k => [k, GLB[k]]).map(([k, c]) => new Promise(res => {
    const t = setTimeout(res, 60000);
    const onLoad = g => {
      const root = g.scene; root.rotation.y = c.rotY;
      const wrap = new THREE.Group(); wrap.add(root);
      const box = new THREE.Box3().setFromObject(wrap), size = box.getSize(V()), ctr = box.getCenter(V());
      const s = c.length / Math.max(size.x, size.y, size.z);
      root.position.sub(ctr).multiplyScalar(1); wrap.scale.setScalar(s);
      root.position.copy(ctr).multiplyScalar(-1); if (c.ground) root.position.y = -box.min.y;
      glbs[k] = { wrap, size: size.multiplyScalar(s) };
      clearTimeout(t); res();
    };
    // plain .glb next to the page; falls back to a base64 module (hosts that don't serve .glb)
    const viaModule = () => import('./' + c.url + '.js').then(m => {
      const bin = Uint8Array.from(atob(m.default), ch => ch.charCodeAt(0));
      loader.parse(bin.buffer, '', onLoad, () => { clearTimeout(t); res(); });
    }).catch(() => { clearTimeout(t); res(); });
    loader.load(c.url, onLoad, undefined, viaModule);
  })));
}
function fromGlb(k, flameZ) {
  const src = glbs[k]; const g = new THREE.Group(); g.add(src.wrap.clone(true));
  if (flameZ !== undefined) {
    const fg = new THREE.CylinderGeometry(0.55, 0.05, 1, 16, 1, true); fg.translate(0, -0.5, 0); fg.rotateX(Math.PI / 2);
    const nz = src.nozzle || (src.nozzle = findNozzles(g, src.size));
    g.userData.flames = [-1, 1].map(s => { const f = new THREE.Mesh(fg, flameMaterial()); f.position.set(s * nz.x, nz.y, nz.z); f.scale.x = f.scale.y = nz.r / 0.55; f.userData.r = nz.r / 0.55; f.frustumCulled = false; g.add(f); return f; });
    g.userData.tips = [1, -1].map(s => { const o = new THREE.Object3D(); o.position.set(s * src.size.x * 0.48, 0, -src.size.z * 0.1); g.add(o); return o; });
    const gear = new THREE.Group(); gear.visible = false; g.add(gear); g.userData.gear = gear;
  }
  return g;
}
// Locate the engine nozzles on a generated jet: the rear-most geometry close to the centre line and below the tail fins.
function findNozzles(g, size) {
  g.updateMatrixWorld(true);
  const pts = [], v = new THREE.Vector3();
  g.traverse(o => { if (!o.isMesh) return; const a = o.geometry.attributes.position; for (let i = 0; i < a.count; i += 1) { v.fromBufferAttribute(a, i).applyMatrix4(o.matrixWorld); pts.push(v.clone()); } });
  const box = new THREE.Box3().setFromPoints(pts), cy = (box.min.y + box.max.y) / 2;
  const core = pts.filter(p => Math.abs(p.x) < size.x * 0.16 && Math.abs(p.x) > size.x * 0.02 && p.y < cy + size.y * 0.1);
  if (!core.length) return { x: size.x * 0.08, y: 0, z: -size.z / 2, r: 0.55 };
  const zmin = Math.min(...core.map(p => p.z));
  const back = core.filter(p => p.z < zmin + size.z * 0.03);
  const x = back.reduce((s, p) => s + Math.abs(p.x), 0) / back.length;
  const ys = back.map(p => p.y), y = (Math.min(...ys) + Math.max(...ys)) / 2;
  const r = Math.max(0.3, Math.min(0.9, (Math.max(...ys) - Math.min(...ys)) / 2 * 0.8));
  return { x, y, z: zmin + 0.2, r };
}
const newPlayerMesh = () => shadowize(fxTag(glbs.player ? fromGlb('player', 1) : makeJet()));
const newEnemyMesh = () => shadowize(fxTag(glbs.enemy ? fromGlb('enemy', 1) : makeJet({ body: 0x5d514c, dark: 0x2a2624, accent: 0xd8352a, sweep: 0.72, variable: false })), true, false);
function newCarrierMesh(enemy) {
  let g;
  if (glbs.carrier) {
    g = fromGlb('carrier');
    if (enemy) g.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.setRGB(1.0, 0.72, 0.66); } });
    let prof = deckProfile(g);
    g.children[0].position.y += 20.6 - prof.deckY; // float the deck 20 m above the waterline
    prof = deckProfile(g);
    Object.assign(g.userData, { deckY: prof.deckY, L: prof.maxZ - prof.minZ, W: (prof.maxX - prof.minX) * 0.8, deckX: (prof.maxX + prof.minX) / 2, prof });
  } else { g = makeCarrier(enemy); g.userData.prof = deckProfile(g); }
  return g;
}
// Raycast a coarse height map of the ship once, so decks, islands and hulls collide whatever the model.
function deckProfile(g) {
  g.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(g), rc = new THREE.Raycaster(), nx = 16, nz = 64, hf = new Float32Array(nx * nz);
  const dx = (box.max.x - box.min.x) / nx, dz = (box.max.z - box.min.z) / nz, count = {};
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    rc.set(V(box.min.x + (i + 0.5) * dx, box.max.y + 10, box.min.z + (j + 0.5) * dz), V(0, -1, 0));
    const h = rc.intersectObject(g, true)[0]; const y = h ? h.point.y : -999; hf[i * nz + j] = y;
    if (h) { const k = Math.round(y); count[k] = (count[k] || 0) + 1; }
  }
  const deckY = +Object.entries(count).sort((a, b) => b[1] - a[1])[0][0];
  const p = { minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z, nx, nz, hf, deckY };
  p.at = (x, z) => { const i = Math.floor((x - p.minX) / dx), j = Math.floor((z - p.minZ) / dz); return (i < 0 || j < 0 || i >= nx || j >= nz) ? -999 : hf[i * nz + j]; };
  return p;
}

// ======================= input =======================
const keys = {};
let invert = false;
const touch = { pitch: 0, roll: 0, gun: false, up: false, down: false };
addEventListener('keydown', e => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (!keys[e.code]) press(e.code);
  keys[e.code] = true;
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; if (state === 'play') setPause(true); });
function press(code) {
  if (state === 'title' && (code === 'Enter' || code === 'Space')) return startCampaign(0);
  if (state === 'title' && /^Digit[1-9]$/.test(code) && +code[5] <= MISSIONS.length) return startCampaign(+code[5] - 1);
  if (state === 'brief') {
    if (code === 'Digit1' || code === 'Digit2' || code === 'Digit3') return pickLoadout(+code.slice(5) - 1);
    if (code === 'Enter' || code === 'Space') return launch();
  }
  if (state === 'result' && (code === 'Enter' || code === 'Space')) return $('resultBtn').click();
  if (state !== 'play') return;
  if (code === 'KeyP' || code === 'Escape') return setPause(!paused);
  if (paused) return;
  if (code === 'KeyF' || code === 'Enter') fireMissile();
  if (code === 'KeyX') dropFlares();
  if (code === 'KeyG') toggleGear();
  if (code === 'KeyC') camMode = camMode === 'chase' ? 'cockpit' : 'chase';
  if (code === 'KeyM') setMute(!muted);
  if (code === 'KeyI') { invert = !invert; say(invert ? 'PITCH INVERTED' : 'PITCH NORMAL', 1.2); }
}
let pad = null, padPrev = [];
function pollPad() {
  const gp = navigator.getGamepads ? [...navigator.getGamepads()].find(Boolean) : null; pad = gp || null;
  if (!pad) return;
  const b = pad.buttons.map(x => x.pressed);
  const edge = i => b[i] && !padPrev[i];
  if (state === 'title' && (edge(0) || edge(9))) startCampaign(0);
  else if (state === 'brief') { if (edge(14)) pickLoadout((loadIdx + 2) % 3); if (edge(15)) pickLoadout((loadIdx + 1) % 3); if (edge(0) || edge(9)) launch(); }
  else if (state === 'result' && (edge(0) || edge(9))) $('resultBtn').click();
  else if (state === 'play') {
    if (edge(9)) setPause(!paused);
    if (!paused) { if (edge(1)) fireMissile(); if (edge(2)) dropFlares(); if (edge(3)) camMode = camMode === 'chase' ? 'cockpit' : 'chase'; if (edge(12)) toggleGear(); }
  }
  padPrev = b;
}
function readControls() {
  const k = c => keys[c] ? 1 : 0;
  let pitch = (k('KeyS') + k('ArrowDown')) - (k('KeyW') + k('ArrowUp'));
  let roll = (k('KeyD') + k('ArrowRight')) - (k('KeyA') + k('ArrowLeft'));
  let yaw = k('KeyE') - k('KeyQ');
  let thr = (k('ShiftLeft') + k('ShiftRight')) - k('KeyZ');
  let gun = keys.Space || mouseGun || touch.gun;
  if (pad) {
    const dz = v => Math.abs(v) < 0.12 ? 0 : v;
    roll += dz(pad.axes[0]); pitch += dz(pad.axes[1]);
    yaw += (pad.buttons[5]?.value || 0) - (pad.buttons[4]?.value || 0);
    thr += (pad.buttons[7]?.value || 0) - (pad.buttons[6]?.value || 0);
    gun = gun || pad.buttons[0]?.pressed;
  }
  pitch += touch.pitch; roll += touch.roll; thr += (touch.up ? 1 : 0) - (touch.down ? 1 : 0);
  if (invert) pitch = -pitch;
  return { pitch: clamp(pitch, -1, 1), roll: clamp(roll, -1, 1), yaw: clamp(yaw, -1, 1), thr: clamp(thr, -1, 1), gun };
}
let mouseGun = false;
canvas.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse' && state === 'play') { if (e.button === 0) mouseGun = true; if (e.button === 2) fireMissile(); } });
addEventListener('pointerup', e => { if (e.pointerType === 'mouse') mouseGun = false; });
canvas.addEventListener('contextmenu', e => e.preventDefault());

// touch controls
const isTouch = MOBILE;
if (isTouch) {
  // floating stick: it appears under the left thumb wherever it lands
  const zone = $('stickZone'), stick = $('stick'), knob = $('knob');
  let sid = null, sx = 0, sy = 0; const R = 60;
  const moveStick = e => {
    let dx = (e.clientX - sx) / R, dy = (e.clientY - sy) / R; const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
    // small dead zone and a gentle curve for fine aiming
    const cv = v => Math.sign(v) * Math.pow(Math.max(0, Math.abs(v) - 0.06) / 0.94, 1.35);
    touch.roll = cv(dx); touch.pitch = cv(dy); knob.style.transform = `translate(${dx * R * 0.75}px, ${dy * R * 0.75}px)`;
  };
  zone.addEventListener('pointerdown', e => { if (sid !== null) return; sid = e.pointerId; sx = e.clientX; sy = e.clientY; try { zone.setPointerCapture(sid); } catch (_) { }
    stick.style.left = sx + 'px'; stick.style.top = sy + 'px'; stick.classList.add('on'); moveStick(e); });
  zone.addEventListener('pointermove', e => { if (e.pointerId === sid) moveStick(e); });
  const endStick = e => { if (e.pointerId !== sid) return; sid = null; touch.pitch = touch.roll = 0; knob.style.transform = ''; stick.classList.remove('on'); stick.style.left = stick.style.top = ''; };
  zone.addEventListener('pointerup', endStick); zone.addEventListener('pointercancel', endStick);
  $('tPause').addEventListener('pointerdown', e => { e.preventDefault(); if (state === 'play') setPause(!paused); });
  $('hint').textContent = 'Left thumb anywhere: stick. Right side: gun, missiles, flares, throttle. Add to Home Screen for full screen.';
  $('hint2').textContent = 'Tap a loadout, then Launch';
  document.addEventListener('gesturestart', e => e.preventDefault());           // no pinch-zoom in Safari
  document.addEventListener('dblclick', e => e.preventDefault());
  const hold = (id, key) => { const el = $(id); el.addEventListener('pointerdown', e => { e.preventDefault(); touch[key] = true; }); ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => el.addEventListener(ev, () => touch[key] = false)); };
  hold('tGun', 'gun'); hold('tUp', 'up'); hold('tDown', 'down');
  $('tMsl').addEventListener('pointerdown', e => { e.preventDefault(); fireMissile(); });
  $('tFlr').addEventListener('pointerdown', e => { e.preventDefault(); dropFlares(); });
  $('tGear').addEventListener('pointerdown', e => { e.preventDefault(); toggleGear(); });
  $('tCam').addEventListener('pointerdown', e => { e.preventDefault(); camMode = camMode === 'chase' ? 'cockpit' : 'chase'; });
}

// ======================= world state =======================
let state = 'title', paused = false, missionIdx = 0, loadIdx = 1, lives = 3, score = 0, time = 0, timeScale = 1, slowT = 0;
let phase = 'launch', phaseT = 0, kills = 0, camMode = 'chase', shake = 0, dmgFlash = 0, whiteFlash = 0;
let msg = '', msgT = 0, msgCol = null;
let enemies = [], grounds = [], missiles = [], flares = [], debris = [], islands = [], rings = [];
let carrier = null, tanker = null, refueled = false, refuelProg = 0, land = null;
const groundY = (x, z) => land ? Math.max(0, land.heightAt(x, z)) : 0;
let spawnT = 0, respawnT = 0, deathPos = V(), resultT = 0;
let hiscore = 0; try { hiscore = +localStorage.getItem('acewing-hi') || 0; } catch (e) { }

const P = {
  mesh: null, pos: V(), q: new THREE.Quaternion(), vel: V(), fwd: V(0, 0, 1), up: V(0, 1, 0), right: V(-1, 0, 0),
  speed: 0, throttle: 0.6, rp: 0, rr: 0, ry: 0, hp: 100, fuel: 1, missiles: 0, ammo: 0, flares: 0, gear: false, alive: true,
  g: 1, sweep: 0.4, rail: 1, gunT: 0, mslCd: 0, lock: { t: null, prog: 0, locked: false }, vs: 0, ab: 0, bank: 0, flameout: 0,
};
function basis() { P.fwd.set(0, 0, 1).applyQuaternion(P.q); P.up.set(0, 1, 0).applyQuaternion(P.q); P.right.set(-1, 0, 0).applyQuaternion(P.q); }
function say(t, d = 2.5, col = null) { msg = t; msgT = d; msgCol = col; }

// ======================= environment =======================
function setEnvironment(m) {
  const u = sky.material.uniforms;
  for (const s of [sky, envSky]) {
    const uu = s.material.uniforms; uu.turbidity.value = m.turb; uu.rayleigh.value = m.ray; uu.mieCoefficient.value = m.mie; uu.mieDirectionalG.value = 0.85;
  }
  const phi = THREE.MathUtils.degToRad(90 - m.sunEl), th = THREE.MathUtils.degToRad(m.sunAz);
  sunDir.setFromSphericalCoords(1, phi, th);
  u.sunPosition.value.copy(sunDir); envSky.material.uniforms.sunPosition.value.copy(sunDir);
  if (envRT) envRT.dispose();
  envRT = pmrem.fromScene(envScene); scene.environment = envRT.texture; scene.environmentIntensity = 0.55;
  renderer.toneMappingExposure = m.exp;
  const fogC = new THREE.Color(m.fog);
  scene.fog = new THREE.FogExp2(fogC, m.fogD);
  sun.color.set(m.sunCol); sun.intensity = 1.2 + Math.min(1, m.sunEl / 30) * 1.8;
  hemi.color.set(m.sky); hemi.groundColor.set(m.deep); hemi.intensity = 0.55;
  const ou = ocean.material.uniforms;
  // calm, lowered water for the river city — Gerstner swell would overtop the 3 m granite quays
  if (!ocean.userData.baseW) ocean.userData.baseW = ou.uW.value.map(w => w.clone());
  const calm = m.land === 'city' ? 0.16 : 1; seaY = m.land === 'city' ? -1.2 : 0;
  ou.uW.value.forEach((w, i) => { w.copy(ocean.userData.baseW[i]); w.z *= calm; });
  ou.uSun.value.copy(sunDir); ou.uSunCol.value.set(m.sunCol); ou.uDeep.value.set(m.deep); ou.uShallow.value.set(m.shallow);
  ou.uSky.value.set(m.sky); ou.uFog.value.copy(fogC); ou.uFogD.value = m.fogD;
  fire.setFog(fogC, m.fogD); smoke.setFog(fogC, m.fogD);
  cubeCam.update(renderer, envScene);
  const cu = cloudPass.uniforms, sunK = 2.2 + 4.5 * Math.min(1, m.sunEl / 35);
  cu.uSun.value.copy(sunDir); cu.uSunCol.value.set(m.sunCol).multiplyScalar(sunK);
  cu.uAmbTop.value.set(m.sky).multiplyScalar(0.9 + 0.6 * Math.min(1, m.sunEl / 35)); cu.uAmbLow.value.set(m.deep).multiplyScalar(0.6).add(new THREE.Color(m.sky).multiplyScalar(0.55));
  cu.uCloudBase.value = m.cloudAlt; cu.uCloudTop.value = m.cloudAlt + m.cloudH; cu.uCoverage.value = m.cov; cu.uDensity.value = 0.03;
  cu.uFogCol.value.copy(fogC); cu.uFogD.value = m.fogD * 0.8;
  for (const k of ['uCoverage', 'uCloudBase', 'uCloudTop']) ou[k].value = cu[k].value;
}

// ======================= effects =======================
const C = (hex) => new THREE.Color(hex);
const COL = { dust: C(0x8a7a64), fire: C(0xffa040), hot: C(0xfff0c0), smoke: C(0x3a3634), smokeL: C(0x8c8884), spark: C(0xffd070), white: C(0xf4f6f8), flak: C(0x1d1b1a), trail: C(0xd8dadc), flare: C(0xfff2c0), red: C(0xff4020) };
function explode(p, scale = 1, vel = null, water = false) {
  const bv = vel ? vel.clone().multiplyScalar(0.25) : V();
  const onGround = !water && land && p.y < land.heightAt(p.x, p.z) + 25;
  // fireballs
  const nb = Math.round(3 + 2.5 * scale);
  for (let i = 0; i < nb; i++) fireballs.spawn(p.clone().add(V(rnd(9), rnd(6), rnd(9)).multiplyScalar(scale)), (4.5 + Math.random() * 5) * scale, 0.8 + scale * 0.4 + Math.random() * 0.5, bv.clone().add(V(rnd(16), rnd(10) + 5, rnd(16)).multiplyScalar(scale)));
  // white-hot core
  for (let i = 0; i < 10 * scale; i++) fire.emit(p, V(rnd(35), rnd(35), rnd(35)).multiplyScalar(scale).add(bv), COL.hot, (7 + Math.random() * 9) * scale, 0.18 + Math.random() * 0.2, { grow: 45 * scale, drag: 3, heat: 1 });
  // lit smoke that keeps rising and spreading
  for (let i = 0; i < 18 * scale; i++) smoke.emit(p.clone().add(V(rnd(9), rnd(6), rnd(9)).multiplyScalar(scale)), V(rnd(14), rnd(8) + 9, rnd(14)).multiplyScalar(scale).add(bv),
    Math.random() < 0.65 ? COL.smoke : COL.smokeL, (13 + Math.random() * 13) * scale, 5 + Math.random() * 5, { grow: 11 * scale, drag: 0.9, alpha: 0.9, fadeIn: 0.1, heat: 0.9, spin: 0.35, grav: -1.5 });
  sparks.burst(p, Math.round(45 * scale), 150 * scale, bv);
  if (onGround) for (let i = 0; i < 16 * scale; i++) smoke.emit(p, V(rnd(10), 20 + Math.random() * 35, rnd(10)).multiplyScalar(scale), COL.dust, (10 + Math.random() * 8) * scale, 4 + Math.random() * 2, { grow: 9, drag: 1.2, grav: 6, alpha: 0.85, spin: 0.3 });
  if (water) {
    for (let i = 0; i < 45 * scale; i++) smoke.emit(p, V(rnd(10), 30 + Math.random() * 55, rnd(10)).multiplyScalar(scale), COL.white, (5 + Math.random() * 5) * scale, 1.8 + Math.random(), { grow: 9, drag: 0.7, grav: 32, alpha: 0.95 });
    for (let i = 0; i < 12 * scale; i++) smoke.emit(p, V(rnd(18), rnd(4) + 4, rnd(18)).multiplyScalar(scale), COL.white, 16 * scale, 3.5, { grow: 10, drag: 1, alpha: 0.45, fadeIn: 0.2 });
  }
  // shockwave shell
  const ring = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), new THREE.MeshBasicMaterial({ color: 0xffd8a0, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }));
  ring.position.copy(p); ring.layers.set(FX_LAYER); scene.add(ring); rings.push({ m: ring, t: 0, s: 60 * scale });
  // burning debris
  for (let i = 0; i < 6 * scale; i++) {
    const d = new THREE.Mesh(new THREE.BoxGeometry(1 + Math.random() * 2, 0.3, 1 + Math.random() * 2), new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.8 }));
    d.position.copy(p); d.castShadow = true; scene.add(d);
    debris.push({ m: d, v: V(rnd(70), rnd(50) + 25, rnd(70)).add(bv), s: V(rnd(8), rnd(8), rnd(8)), t: 2.5 + Math.random() * 2, burn: Math.random() < 0.6 });
  }
  lights.flash(p, 0xffa050, 9e4 * scale * scale, 900 * scale, 0.7 + scale * 0.2);
  const dist = p.distanceTo(camera.position);
  shake = Math.max(shake, clamp(1.6 - dist / 900, 0, 1.4) * scale);
  whiteFlash = Math.max(whiteFlash, clamp(0.35 - dist / 3000, 0, 0.25));
  sfx.boom(dist);
}
function splash(p, s = 1) { for (let i = 0; i < 10 * s; i++) smoke.emit(p, V(rnd(4), 12 + Math.random() * 20, rnd(4)), COL.white, 3 * s, 1.2, { grow: 5, grav: 25, alpha: 0.8 }); }
function flakBurst(p) {
  for (let i = 0; i < 12; i++) smoke.emit(p, V(rnd(12), rnd(12), rnd(12)), COL.flak, 14 + Math.random() * 8, 3, { grow: 9, drag: 1.5, alpha: 0.9, fadeIn: 0.04, heat: 0.4, spin: 0.5 });
  for (let i = 0; i < 6; i++) fire.emit(p, V(rnd(30), rnd(30), rnd(30)), COL.hot, 8, 0.12, { grow: 60, drag: 3, heat: 1 });
  sparks.burst(p, 18, 90);
  lights.flash(p, 0xffb060, 2e4, 400, 0.25);
  sfx.burst(250, 0.4, 0.25 * clamp(1 - p.distanceTo(P.pos) / 2500, 0.05, 1));
}

// ======================= entities =======================
function clearWorld() {
  for (const e of enemies) scene.remove(e.mesh);
  for (const g of grounds) scene.remove(g.mesh);
  for (const m of missiles) scene.remove(m.mesh);
  for (const d of debris) scene.remove(d.m);
  for (const r of rings) scene.remove(r.m);
  for (const i of islands) scene.remove(i);
  if (land) { scene.remove(land.group); land = null; }
  if (carrier) scene.remove(carrier.mesh); if (tanker) scene.remove(tanker.mesh);
  enemies = []; grounds = []; missiles = []; flares = []; debris = []; islands = []; rings = []; carrier = null; tanker = null;
  tracers.list = []; trails.forEach(t => t.clear());
}
function spawnEnemy() {
  const m = MISSIONS[missionIdx];
  const hf = _v.set(P.fwd.x, 0, P.fwd.z).normalize();
  const side = V(-hf.z, 0, hf.x);
  const dist = 4200 + Math.random() * 2500;
  const pos = P.pos.clone().addScaledVector(hf, dist).addScaledVector(side, rnd(2200));
  pos.y = clamp(P.pos.y + rnd(500), m.islands ? 500 : 300, 4500); pos.y = Math.max(pos.y, groundY(pos.x, pos.z) + 450);
  const mesh = newEnemyMesh(); scene.add(mesh);
  const fwd = P.pos.clone().sub(pos).normalize();
  const e = { mesh, pos, vel: V(), fwd, up: V(0, 1, 0), speed: 230, hp: 60, alive: true, state: 'attack', st: 0, gunCd: 2 + Math.random() * 2, burst: 0,
    mslCd: 6 + Math.random() * 8, mslLeft: Math.random() < 0.35 + m.aggr * 0.35 ? 1 : 0, jink: V(), smoke: 0, radius: 16, kind: 'air', retreat: false };
  e.vel.copy(fwd).multiplyScalar(e.speed);
  enemies.push(e);
}
function addGround(kind, pos, heading) {
  let mesh, hp, radius, h = 12;
  if (kind === 'ship') { mesh = makeShip(0x6a6258, 110); hp = 220; radius = 55; h = 10; }
  else if (kind === 'carrier') { mesh = newCarrierMesh(true); hp = 700; radius = 150; h = 20; }
  else if (kind === 'tank') { mesh = glbs.tank ? fromGlb('tank') : makeTank(); hp = 90; radius = 14; h = 2; }
  else if (kind === 'sam') { mesh = glbs.sam ? fromGlb('sam') : makeSamTruck(); hp = 110; radius = 16; h = 2.5; }
  else if (kind === 'tower') { mesh = glbs.tower ? fromGlb('tower') : makeRadioTower(); hp = 160; radius = 26; h = 22; }
  else { mesh = makeBase(); hp = 200; radius = 30; h = 8; }
  mesh.position.copy(pos); mesh.rotation.y = heading; shadowize(mesh); scene.add(mesh);
  const spd = (kind === 'ship') ? 7 : kind === 'carrier' ? 9 : 0;
  const t = { mesh, kind, hp, maxHp: hp, radius, alive: true, h, pos: pos.clone().add(V(0, h, 0)), vel: V(Math.sin(heading) * spd, 0, Math.cos(heading) * spd), flakCd: 3 + Math.random() * 3, samCd: 6 + Math.random() * 6, sinks: kind === 'ship' || kind === 'carrier' };
  grounds.push(t); return t;
}
function setupMission() {
  const m = MISSIONS[missionIdx];
  clearWorld(); setEnvironment(m);
  kills = 0; refueled = false; refuelProg = 0; phase = 'launch'; phaseT = 0; spawnT = 3;
  // friendly carrier for the catapult launch
  const cm = shadowize(newCarrierMesh(false)); scene.add(cm);
  carrier = { mesh: cm, speed: 12, heading: 0 };
  cm.position.set(0, 0, 0); cm.rotation.y = 0;
  // islands & bases
  const rng = (() => { let s = 7 + missionIdx * 13; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  for (let i = 0; i < m.islands; i++) {
    const r = 500 + rng() * 700, h = 180 + rng() * 260;
    const isl = makeIsland(r, h, i * 3.7 + 1);
    const a = rng() * Math.PI * 2, d = 5000 + rng() * 6000;
    isl.position.set(Math.cos(a) * d * 0.8, 0, 3000 + Math.sin(a) * d * 0.6 + d * 0.5); scene.add(isl); islands.push(isl);
  }
  for (let i = 0; i < m.bases; i++) {
    const isl = islands[i]; const y = isl.userData.heightAt(0, 0);
    addGround('base', V(isl.position.x, y - 1, isl.position.z), rng() * 6);
  }
  for (let i = 0; i < m.ships; i++) addGround('ship', V(rnd(1500), 0, 7500 + i * 900 + rnd(400)), Math.PI / 2 + rnd(0.4));
  if (m.ecarrier) addGround('carrier', V(1800, 0, 11000), Math.PI * 0.6);
  if (m.land) {
    land = m.land === 'city' ? makeCity(glbs, { near: MOBILE ? 550 : 1100 }) : makeMountains(); shadowize(land.group); scene.add(land.group);
    for (const p of land.sites.sam.slice(0, m.sams)) addGround('sam', p.clone().setY(land.groundAt(p.x, p.z)), rng() * 6);
    for (const p of land.sites.tower.slice(0, m.towers)) addGround('tower', p.clone().setY(land.groundAt(p.x, p.z)), rng() * 6);
    for (let i = 0; i < m.tanks; i++) {
      const path = land.paths[i % land.paths.length];
      const t = addGround('tank', path[0].clone(), 0);
      t.path = path; t.s = (i / m.tanks) * 0.6 + (land.kind === 'city' ? 0.2 : 0.05); t.dir = 1; t.speed = 7;
    }
  }
  // player on the catapult
  if (!P.mesh) { P.mesh = newPlayerMesh(); scene.add(P.mesh); }
  const L = LOADOUTS[loadIdx];
  Object.assign(P, { hp: 100, fuel: 1, missiles: L.count, ammo: 1200, flares: 24, gear: true, alive: true, speed: 0, throttle: 1, rp: 0, rr: 0, ry: 0, flameout: 0 });
  P.lock = { t: null, prog: 0, locked: false };
  P.mesh.visible = true;
  placeOnDeck(-120);
}
function placeOnDeck(z) {
  const cm = carrier.mesh; const d = cm.userData;
  P.pos.set(d.deckX, d.deckY + 2.2, z).applyMatrix4(cm.matrixWorld.identity().compose(cm.position, cm.quaternion, cm.scale));
  P.q.setFromEuler(new THREE.Euler(0, cm.rotation.y, 0)); basis();
}

// ======================= weapons =======================
function fireGun(dt) {
  P.gunT -= dt;
  if (P.gunT > 0 || P.ammo <= 0) return;
  P.gunT = 1 / 20; P.ammo = Math.max(0, P.ammo - 2);
  let dir = P.fwd.clone();
  // gentle aim assist toward the nearest target lead point within 4°
  let best = null, bd = 0.07;
  for (const e of enemies) {
    if (!e.alive) continue; const d = e.pos.distanceTo(P.pos); if (d > 1400) continue;
    const lead = e.pos.clone().addScaledVector(e.vel, d / 1150).sub(P.pos).normalize();
    const a = lead.angleTo(P.fwd); if (a < bd) { bd = a; best = lead; }
  }
  if (best) dir.lerp(best, 0.7).normalize();
  const muzzle = P.pos.clone().addScaledVector(P.fwd, 8).addScaledVector(P.right, -0.8 * P.rail);
  for (let i = 0; i < 2; i++) {
    const d = dir.clone().add(V(rnd(0.004), rnd(0.004), rnd(0.004))).normalize();
    tracers.fire(muzzle, d.multiplyScalar(1150).add(P.vel), 'player', i ? 0xffe9a8 : 0xffc060, 9);
  }
  fire.emit(muzzle, P.vel, COL.hot, 2.4, 0.05, { heat: 1 });
  muzzleFlash.position.copy(muzzle); muzzleFlash.material.rotation = Math.random() * 6.28; muzzleFlash.scale.setScalar(2.2 + Math.random() * 2); muzzleFlash.visible = true; muzzleT = 0.03;
  lights.flash(muzzle, 0xffc070, 2500, 80, 0.06, 0);
  if (Math.random() < 0.3) smoke.emit(muzzle, P.vel.clone().multiplyScalar(0.92), COL.smokeL, 1.6, 0.9, { grow: 5, alpha: 0.3, drag: 2 });
  sfx.gun();
}
function fireMissile() {
  if (!P.alive || phase === 'launch' || P.mslCd > 0 || P.missiles <= 0) { if (P.missiles <= 0) say('NO MISSILES', 1); return; }
  const L = LOADOUTS[loadIdx];
  P.mslCd = 0.35; P.missiles--; P.rail = -P.rail;
  const pos = P.pos.clone().addScaledVector(P.right, 2.2 * P.rail).addScaledVector(P.up, -1.2);
  const tgt = P.lock.locked ? P.lock.t : null;
  launchMissile(pos, P.fwd, P.speed, tgt, 'player', L.speed, L.turn, 0xeaeaea);
  sfx.missile();
}
function launchMissile(pos, dir, speed, target, owner, max, turn, color) {
  const mesh = makeMissile(color); mesh.position.copy(pos); scene.add(mesh);
  missiles.push({ mesh, pos: pos.clone(), vel: dir.clone().multiplyScalar(speed), speed, max, turn, target, owner, age: 0, life: owner === 'player' ? 9 : 12, alive: true });
}
function dropFlares() {
  if (!P.alive || P.flares <= 0) return;
  P.flares -= 2; sfx.flare();
  for (const s of [-1, 1]) {
    const f = { pos: P.pos.clone(), vel: P.vel.clone().multiplyScalar(0.5).addScaledVector(P.right, s * 30).addScaledVector(P.up, -25), alive: true, life: 3.5 };
    flares.push(f);
  }
  for (const m of missiles) if (m.owner === 'enemy' && m.target === P && m.pos.distanceTo(P.pos) < 2200 && Math.random() < 0.75) m.target = flares[flares.length - 1 - (Math.random() < 0.5 ? 1 : 0)];
}
function toggleGear() {
  if (phase === 'launch' || !P.alive) return;
  P.gear = !P.gear; sfx.blip(P.gear ? 520 : 760, 0.2);
  say(P.gear ? 'GEAR DOWN' : 'GEAR UP', 1);
}

// ======================= damage =======================
function damagePlayer(d) {
  if (!P.alive || phase === 'launch' || phase === 'landed') return;
  P.hp -= d; dmgFlash = Math.min(1, dmgFlash + d / 40); shake = Math.max(shake, 0.4); sfx.hit();
  if (P.hp <= 0) killPlayer('SHOT DOWN');
}
function damageEnemy(e, d, at) {
  if (!e.alive) return;
  e.hp -= d;
  fire.emit(at, e.vel.clone().multiplyScalar(0.5), COL.spark, 4, 0.2, { grow: 10 });
  if (e.hp <= 0) {
    e.alive = false; scene.remove(e.mesh); explode(e.pos, 1.2, e.vel);
    if (!e.retreat) { kills++; score += 500; }
    slowT = 0.22;
    say(['SPLASH ONE', 'BANDIT DOWN', 'GOOD KILL', 'SPLASH'][Math.floor(Math.random() * 4)], 1.4);
  }
}
function damageGround(t, d, at) {
  if (!t.alive) return;
  t.hp -= d; fire.emit(at, V(0, 10, 0), COL.spark, 5, 0.25, { grow: 10 });
  if (t.hp <= 0) {
    t.alive = false; explode(t.pos, t.kind === 'carrier' ? 3 : 2);
    score += { carrier: 5000, ship: 1500, base: 1200, tank: 800, sam: 1200, tower: 1500 }[t.kind] || 1000;
    say({ carrier: 'CARRIER DESTROYED', ship: 'SHIP SUNK', tank: 'TANK KILLED', sam: 'SAM DESTROYED', tower: 'TOWER DOWN' }[t.kind] || 'SITE DESTROYED', 2);
    t.sink = 0;
  }
}
function killPlayer(reason) {
  if (!P.alive) return;
  P.alive = false; P.mesh.visible = false; explode(P.pos, 1.6, P.vel, P.pos.y < 30 && groundY(P.pos.x, P.pos.z) <= 0);
  deathPos.copy(P.pos); respawnT = 3.2; lives--; say(reason, 3, '#ff6a50');
  trails.forEach(t => t.clear()); P.lock = { t: null, prog: 0, locked: false };
}
function respawn() {
  if (lives < 0) return gameOver();
  const L = LOADOUTS[loadIdx];
  Object.assign(P, { hp: 100, fuel: Math.max(P.fuel, 0.7), missiles: Math.max(P.missiles, Math.ceil(L.count / 2)), ammo: 1200, flares: 24, gear: false, alive: true, speed: 200, throttle: 0.6, rp: 0, rr: 0, ry: 0, flameout: 0 });
  P.mesh.visible = true;
  if (phase === 'rtb') {
    const cm = carrier.mesh; const back = V(0, 0, -1).applyQuaternion(cm.quaternion);
    P.pos.copy(cm.position).addScaledVector(back, 7000); P.pos.y = 600;
    P.q.setFromEuler(new THREE.Euler(0, cm.rotation.y, 0));
  } else {
    P.pos.set(deathPos.x, clamp(deathPos.y, 1200, 3000), deathPos.z); P.pos.y = Math.max(P.pos.y, groundY(P.pos.x, P.pos.z) + 700);
    P.q.setFromEuler(new THREE.Euler(0, Math.random() * 6.28, 0));
  }
  for (const m of missiles) if (m.owner === 'enemy') m.target = null;
  basis(); say('BACK IN THE FIGHT', 2);
}

// ======================= player flight =======================
function updatePlayer(dt, ctl) {
  const m = MISSIONS[missionIdx];
  if (phase === 'launch') {
    // catapult stroke along the deck
    phaseT += dt;
    const cm = carrier.mesh, d = cm.userData;
    P.ab = 1;
    if (phaseT < 1.2) { placeOnDeck(-120); P.speed = 0; P.throttle = 1; if (phaseT < 0.05) say('CATAPULT ARMED', 1.2); }
    else {
      const t = phaseT - 1.2; const z = -120 + 0.5 * 55 * t * t; P.speed = 55 * t;
      if (z < d.L / 2) placeOnDeck(z);
      else {
        phase = 'combat'; P.gear = false; P.throttle = 0.85; P.speed = Math.max(P.speed, 150);
        P.pos.addScaledVector(P.fwd, 14).y += 2; _q.setFromAxisAngle(AX, -0.2); P.q.multiply(_q); basis();
        say('AIRBORNE — GEAR UP', 2);
      }
      shake = Math.max(shake, 0.25);
    }
    P.vel.copy(P.fwd).multiplyScalar(P.speed);
    return;
  }
  if (phase === 'landed') return;
  // throttle & fuel
  if (P.flameout <= 0) P.throttle = clamp(P.throttle + ctl.thr * 0.7 * dt, 0, 1);
  P.ab = P.throttle > 0.85 && P.flameout <= 0 ? 1 : 0;
  P.fuel -= (0.0028 + P.throttle * 0.003 + P.ab * 0.006) * m.fuelMul * dt;
  if (P.fuel <= 0 && P.flameout <= 0) { P.fuel = 0; P.flameout = 6; P.throttle = 0; say('FLAMEOUT — EJECT IN 6 S', 6, '#ff6a50'); }
  if (P.flameout > 0) { P.flameout -= dt; P.throttle = 0; if (P.flameout <= 0) { killPlayer('OUT OF FUEL'); return; } }
  // rotation rates, smoothed
  const sp01 = clamp((P.speed - 60) / 220, 0.25, 1);
  const k = 1 - Math.exp(-dt * 7);
  P.rp += (ctl.pitch * 1.45 * sp01 - P.rp) * k;
  P.rr += (ctl.roll * 3.3 - P.rr) * k;
  P.ry += (ctl.yaw * 0.45 - P.ry) * k;
  _q.setFromAxisAngle(AX, -P.rp * dt); P.q.multiply(_q);
  _q.setFromAxisAngle(AZ, P.rr * dt); P.q.multiply(_q);
  _q.setFromAxisAngle(AY, -P.ry * dt); P.q.multiply(_q);
  basis();
  // arcade coordinated turn + auto-level
  P.bank = Math.asin(clamp(-P.right.y, -1, 1));
  if (Math.abs(P.fwd.y) < 0.9 && P.up.y > 0) {
    const turn = -Math.sin(P.bank) * 0.95 * sp01;
    _q.setFromAxisAngle(AY, turn * dt); P.q.premultiply(_q);
    if (Math.abs(ctl.roll) < 0.1) { _q.setFromAxisAngle(AZ, -P.bank * 1.8 * dt); P.q.multiply(_q); }
  }
  P.q.normalize(); basis();
  // speed
  let target = 90 + P.throttle * 190 + P.ab * 70;
  if (P.gear) target *= 0.62;
  P.speed += (target - P.speed) * 0.45 * dt - P.fwd.y * 9.8 * 0.9 * dt - Math.abs(P.rp) * P.speed * 0.05 * dt;
  P.speed = clamp(P.speed, P.gear ? 55 : 85, 370);
  // wings sweep with speed
  P.sweep += (clamp((P.speed - 140) / 160, 0, 1) * 0.95 + 0.25 - P.sweep) * dt * 1.5;
  setSweep(P.mesh, P.sweep);
  P.vel.copy(P.fwd).multiplyScalar(P.speed);
  P.pos.addScaledVector(P.vel, dt);
  P.vs = P.vel.y;
  P.g = 1 + (Math.abs(P.rp) * P.speed + Math.abs(Math.sin(P.bank)) * 0.95 * sp01 * P.speed) / 9.8 * 0.22;
  if (P.pos.y > 7000) P.pos.y = 7000;
  // weapons
  P.mslCd -= dt;
  if (ctl.gun) fireGun(dt);
  updateLock(dt);
  // collisions: sea, islands
  if (P.pos.y < 2.5) { killPlayer('SPLASHED INTO THE SEA'); return; }
  if (land && (land.solidAt ? land.solidAt(P.pos.x, P.pos.y - 2, P.pos.z) : P.pos.y < land.heightAt(P.pos.x, P.pos.z) + 3)) { killPlayer(land.kind === 'city' && land.heightAt(P.pos.x, P.pos.z) > land.groundAt(P.pos.x, P.pos.z) + 5 ? 'HIT A BUILDING' : 'CONTROLLED FLIGHT INTO TERRAIN'); return; }
  for (const isl of islands) {
    const lx = P.pos.x - isl.position.x, lz = P.pos.z - isl.position.z;
    if (lx * lx + lz * lz < isl.userData.radius ** 2 && P.pos.y < isl.userData.heightAt(lx, lz) + 3) { killPlayer('CONTROLLED FLIGHT INTO TERRAIN'); return; }
  }
  for (const t of grounds) if (t.alive && P.pos.distanceTo(t.pos) < t.radius * 0.6) { killPlayer('COLLISION'); return; }
  if (carrier && phase !== 'launch') checkDeck();
}
function updateLock(dt) {
  const L = LOADOUTS[loadIdx]; const cone = THREE.MathUtils.degToRad(L.cone);
  let best = null, bs = Infinity;
  const cands = enemies.filter(e => e.alive).concat(grounds.filter(g => g.alive));
  for (const t of cands) {
    const to = _v.copy(t.pos).sub(P.pos); const d = to.length(); if (d > L.range) continue;
    const a = to.normalize().angleTo(P.fwd); if (a > cone) continue;
    const s = a / cone + d / L.range * 0.5; if (s < bs) { bs = s; best = t; }
  }
  const lk = P.lock;
  if (best && best === lk.t) { lk.prog = Math.min(1, lk.prog + dt / L.lock); if (lk.prog >= 1 && !lk.locked) { lk.locked = true; sfx.blip(1400, 0.12); } }
  else if (lk.locked && lk.t && lk.t.alive && (() => { const to = _v.copy(lk.t.pos).sub(P.pos); return to.length() < L.range * 1.1 && to.normalize().angleTo(P.fwd) < cone * 1.6; })()) { /* keep lock */ }
  else { lk.t = best; lk.prog = 0; lk.locked = false; }
}
function checkDeck() {
  const cm = carrier.mesh, d = cm.userData;
  const local = cm.worldToLocal(P.pos.clone());
  const onFoot = Math.abs(local.x - d.deckX) < d.W / 2 && Math.abs(local.z) < d.L / 2;
  const hAt = d.prof ? d.prof.at(local.x, local.z) : -999;
  if (onFoot && local.y < d.deckY + 2.6) {
    const pitch = Math.asin(P.fwd.y) * 57.3, bank = Math.abs(P.bank) * 57.3;
    const inRtb = phase === 'rtb';
    if (inRtb && P.gear && P.speed < 110 && pitch > -9 && pitch < 16 && bank < 16 && P.vs > -22) return trap(local);
    if (!inRtb && P.gear && P.speed < 110 && bank < 16 && P.vs > -22) { P.pos.y += (d.deckY + 2.6 - local.y); return; } // touch & go
    return killPlayer(!P.gear ? 'BELLY LANDING — GEAR WAS UP' : P.speed >= 110 ? 'TOO FAST ON THE DECK' : 'HARD LANDING');
  }
  if (hAt > d.deckY + 3 && local.y < hAt + 1) return killPlayer('HIT THE ISLAND');
  if (hAt > -50 && local.y < hAt - 1) return killPlayer('RAMP STRIKE');
}
function trap() {
  phase = 'landed'; phaseT = 0; sfx.boom(2500); sfx.blip(660, 0.3, 0.1);
  P.gear = true;
  const bonus = 5000 + Math.round(P.fuel * 1000) + Math.round(P.hp * 10) + Math.max(0, lives) * 500;
  score += bonus; resultBonus = bonus;
  say('TRAP! WIRE CAUGHT', 3, '#8dffb4');
}
let resultBonus = 0;

// ======================= enemies AI =======================
function steer(e, desired, turnRate, dt) {
  const a = e.fwd.angleTo(desired);
  if (a > 1e-4) { const ax = _v2.crossVectors(e.fwd, desired).normalize(); e.fwd.applyAxisAngle(ax, Math.min(a, turnRate * dt)).normalize(); }
}
function orient(e, prevFwd, dt) {
  const lat = _v2.copy(e.fwd).sub(prevFwd).multiplyScalar(e.speed / Math.max(dt, 1e-3));
  const upT = _v3.set(0, 9.8, 0).add(lat).normalize();
  e.up.lerp(upT, 1 - Math.exp(-dt * 5)).normalize();
  const x = _v.crossVectors(e.up, e.fwd).normalize(), y = _v2.crossVectors(e.fwd, x);
  _m.makeBasis(x, y, e.fwd); e.mesh.quaternion.setFromRotationMatrix(_m); e.mesh.position.copy(e.pos);
}
function updateEnemies(dt) {
  const m = MISSIONS[missionIdx];
  const enemyMslInAir = missiles.filter(x => x.owner === 'enemy' && x.alive).length;
  for (const e of enemies) {
    if (!e.alive) continue;
    const prev = e.fwd.clone();
    const to = _v.copy(P.pos).sub(e.pos); const dist = to.length(); const dirTo = to.clone().normalize();
    e.st -= dt;
    let desired, turn = 0.8 + 0.45 * m.aggr, spd = 235;
    if (e.retreat || phase === 'rtb') {
      e.retreat = true; desired = dirTo.clone().negate().setY(0.15).normalize(); spd = 300;
      if (dist > 7000) { e.alive = false; scene.remove(e.mesh); continue; }
    } else if (!P.alive) { desired = e.fwd.clone().setY(0).normalize(); }
    else {
      const playerAim = P.fwd.dot(dirTo.clone().negate());
      if (e.state === 'attack' && dist < 240) { e.state = 'break'; e.st = 2.4; e.jink.crossVectors(e.fwd, AY).normalize().multiplyScalar(Math.random() < 0.5 ? 1 : -1).add(V(0, rnd(0.4), 0)).normalize(); }
      if (e.state === 'attack' && playerAim > 0.96 && dist < 1600 && Math.random() < dt * 0.6 * m.aggr) { e.state = 'evade'; e.st = 1.8 + Math.random() * 1.6; e.jink.set(rnd(1), rnd(0.5), rnd(1)).normalize(); }
      if (e.state !== 'attack' && e.st <= 0) e.state = 'attack';
      if (e.state === 'attack') {
        const lead = P.pos.clone().addScaledVector(P.vel, dist / 900 * 0.7);
        desired = lead.sub(e.pos).normalize();
      } else if (e.state === 'break') { desired = e.jink.clone(); spd = 280; turn *= 1.2; }
      else { desired = e.fwd.clone().add(e.jink.clone().multiplyScalar(1.2 + Math.sin(time * 3 + e.pos.x) * 0.8)).normalize(); spd = 275; turn *= 1.3; }
    }
    const floor = Math.max(groundY(e.pos.x, e.pos.z), groundY(e.pos.x + e.fwd.x * 900, e.pos.z + e.fwd.z * 900)) + (land ? 350 : 0);
    if (e.pos.y < (m.islands ? 600 : 260) + floor) desired.y += 0.9;
    if (land && e.pos.y < land.heightAt(e.pos.x, e.pos.z) + 2) { damageEnemy(e, 999, e.pos); continue; }
    if (e.pos.y > 5000) desired.y -= 0.5;
    desired.normalize();
    steer(e, desired, turn, dt);
    e.speed += (spd - e.speed) * dt * 0.8;
    e.vel.copy(e.fwd).multiplyScalar(e.speed);
    e.pos.addScaledVector(e.vel, dt);
    orient(e, prev, dt);
    // afterburner flames
    for (const f of e.mesh.userData.flames || []) { f.material.uniforms.uT.value = time; f.material.uniforms.uPow.value = 0.3; const fr = f.userData.r || 1; f.scale.set(fr, fr, 3 + Math.random()); }
    if (e.hp < 40) { e.smoke -= dt; if (e.smoke < 0) { e.smoke = 0.03; smoke.emit(e.pos, V(rnd(3), 4, rnd(3)), COL.smoke, 6, 2, { grow: 8, alpha: 0.7 }); fire.emit(e.pos, V(0, 0, 0), COL.fire, 5, 0.12); } }
    if (!P.alive || e.retreat || phase === 'landed') continue;
    // guns
    const angOff = e.fwd.angleTo(dirTo);
    e.gunCd -= dt;
    if (e.burst > 0) {
      e.burst -= dt;
      if ((time * 12 | 0) !== ((time - dt) * 12 | 0)) {
        const spread = 0.03 / m.aggr;
        const d = dirTo.clone().add(V(rnd(spread), rnd(spread), rnd(spread))).normalize();
        tracers.fire(e.pos.clone().addScaledVector(e.fwd, 9), d.multiplyScalar(950).add(e.vel), 'enemy', 0xff6a3a, 4);
        if (dist < 1500) sfx.burst(1600, 0.05, 0.08 * (1 - dist / 1500), 'bandpass');
      }
    } else if (e.gunCd <= 0 && angOff < 0.09 && dist < 950) { e.burst = 0.9; e.gunCd = 2.8 - m.aggr; }
    // missiles
    e.mslCd -= dt;
    if (e.mslLeft > 0 && e.mslCd <= 0 && dist > 900 && dist < 3600 && angOff < 0.35 && enemyMslInAir < 1 + Math.round(m.aggr)) {
      e.mslLeft--; e.mslCd = 12;
      launchMissile(e.pos.clone().addScaledVector(e.up, -1.5), e.fwd, e.speed, P, 'enemy', 470, 2.1, 0xd05040);
      say('MISSILE LAUNCH!', 1.6, '#ff6a50');
    }
    if (dist < 18) { damagePlayer(80); damageEnemy(e, 999, e.pos); }
    if (dist > 16000) { e.alive = false; scene.remove(e.mesh); }
  }
  enemies = enemies.filter(e => e.alive);
  // wave spawning
  if (phase === 'combat' && P.alive) {
    const aliveAir = enemies.filter(e => !e.retreat).length;
    const left = m.kills - kills - aliveAir;
    const maxAlive = Math.min(5, 2 + missionIdx) - (tanker && !refueled ? 1 : 0);
    spawnT -= dt;
    if (left > 0 && aliveAir < maxAlive && spawnT <= 0) {
      const n = Math.min(left, maxAlive - aliveAir, 1 + Math.floor(Math.random() * 2));
      for (let i = 0; i < n; i++) spawnEnemy();
      spawnT = 5 + Math.random() * 4;
      if (n > 1) say(`${n} BANDITS — 12 O'CLOCK`, 1.8);
    }
  }
}
function updateGrounds(dt) {
  const m = MISSIONS[missionIdx];
  for (const t of grounds) {
    if (!t.alive) {
      if (t.sink !== undefined && t.sinks) { t.sink += dt; t.mesh.position.y -= dt * 2.5; t.mesh.rotation.z += dt * 0.03; if (Math.random() < 0.5) smoke.emit(t.pos, V(rnd(4), 12, rnd(4)), COL.smoke, 30, 5, { grow: 20, alpha: 0.6 }); }
      else if (Math.random() < (t.kind === 'tank' ? 0.15 : 0.3)) smoke.emit(t.pos, V(rnd(4), 10, rnd(4)), COL.smoke, 25, 5, { grow: 16, alpha: 0.6 });
      continue;
    }
    if (t.path) moveOnPath(t, dt); else t.mesh.position.addScaledVector(t.vel, dt);
    t.pos.copy(t.mesh.position).y += t.h;
    if (t.mesh.userData.radar) t.mesh.userData.radar.rotation.y += dt * 2;
    if (t.sinks) { t.mesh.rotation.z = Math.sin(time * 0.6 + t.pos.x) * 0.012; if (Math.random() < 0.3) smoke.emit(t.mesh.position.clone().addScaledVector(t.vel, -8), V(rnd(2), 1, rnd(2)), COL.white, 6, 3, { grow: 4, alpha: 0.35 }); }
    if (!P.alive || phase !== 'combat') continue;
    const dist = t.pos.distanceTo(P.pos);
    // flak
    t.flakCd -= dt;
    if (t.kind !== 'tank' && dist < 3000 && P.pos.y - t.pos.y < 2800 && t.flakCd <= 0) {
      t.flakCd = (t.kind === 'carrier' ? 0.7 : 1.4) / m.aggr;
      const p = P.pos.clone().addScaledVector(P.vel, 0.6 + Math.random() * 0.4).add(V(rnd(1), rnd(1), rnd(1)).normalize().multiplyScalar(30 + Math.random() * 90 / m.aggr));
      flakBurst(p);
      const dd = p.distanceTo(P.pos); if (dd < 45) damagePlayer((45 - dd) * 0.5);
    }
    // SAMs from island sites and the carrier
    if (t.kind === 'base' || t.kind === 'carrier' || t.kind === 'sam') {
      t.samCd -= dt;
      if (t.samCd <= 0 && dist < 4500 && dist > 600) {
        t.samCd = 11 / m.aggr;
        launchMissile(t.pos.clone().add(V(0, 12, 0)), V(0, 1, 0), 80, P, 'enemy', 420, 1.9, 0xc8c8c0);
        say('SAM LAUNCH!', 1.6, '#ff6a50');
      }
    }
  }
}
function moveOnPath(t, dt) {
  const p = t.path; let seg = 0, total = 0; const L = [];
  for (let i = 1; i < p.length; i++) { const l = p[i].distanceTo(p[i - 1]); L.push(l); total += l; }
  t.s += t.dir * t.speed * dt / total; if (t.s > 1) { t.s = 1; t.dir = -1; } if (t.s < 0) { t.s = 0; t.dir = 1; }
  let d = t.s * total; while (seg < L.length - 1 && d > L[seg]) { d -= L[seg]; seg++; }
  const a = p[seg], b = p[seg + 1], f = d / L[seg];
  const x = a.x + (b.x - a.x) * f, z = a.z + (b.z - a.z) * f;
  t.mesh.position.set(x, land ? land.groundAt(x, z) : 0, z);
  const hx = (b.x - a.x) * t.dir, hz = (b.z - a.z) * t.dir;
  t.mesh.rotation.y = Math.atan2(hx, hz);
  t.vel.set(hx, 0, hz).normalize().multiplyScalar(t.speed);
  if (Math.random() < 0.25) smoke.emit(t.mesh.position.clone().add(V(0, 1, 0)), V(rnd(1), 2, rnd(1)), COL.smokeL, 4, 1.5, { grow: 5, alpha: 0.35 });
}
function updateMissiles(dt) {
  for (const m of missiles) {
    if (!m.alive) continue;
    m.age += dt; m.speed = Math.min(m.max, m.speed + 300 * dt);
    const dir = _v.copy(m.vel).normalize();
    const t = m.target;
    if (t && t.alive && m.age > 0.2) {
      const dist = m.pos.distanceTo(t.pos);
      const lead = _v2.copy(t.pos); if (t.vel) lead.addScaledVector(t.vel, dist / m.speed * 0.8);
      const des = lead.sub(m.pos).normalize();
      const a = dir.angleTo(des);
      if (a > 1.5 && m.age > 1) m.target = null; // overshot
      else if (a > 1e-4) dir.applyAxisAngle(_v3.crossVectors(dir, des).normalize(), Math.min(a, m.turn * dt));
      const fuse = m.owner === 'player' ? (t.radius || 18) : 13;
      if (dist < fuse) { detonate(m); continue; }
    }
    m.vel.copy(dir).multiplyScalar(m.speed);
    m.pos.addScaledVector(m.vel, dt);
    m.mesh.position.copy(m.pos); m.mesh.quaternion.setFromUnitVectors(AZ, dir);
    smoke.emit(_v2.copy(m.pos).addScaledVector(dir, -2), V(rnd(2), rnd(2), rnd(2)), COL.trail, 2.4, 2.2 + Math.random(), { grow: 5, drag: 1.2, alpha: 0.55 });
    fire.emit(m.pos.clone().addScaledVector(dir, -2.4), V(), COL.fire, 3.2, 0.06);
    if (m.pos.y < 0) { splash(m.pos, 2); detonate(m, true); continue; }
    if (land && m.pos.y < land.heightAt(m.pos.x, m.pos.z)) { detonate(m); continue; }
    if (m.age > m.life) detonate(m);
  }
  missiles = missiles.filter(m => m.alive);
}
function detonate(m, water = false) {
  m.alive = false; scene.remove(m.mesh);
  explode(m.pos, 0.7, null, water);
  if (m.owner === 'player') {
    for (const e of enemies) if (e.alive && e.pos.distanceTo(m.pos) < 32) damageEnemy(e, 100, m.pos);
    for (const g of grounds) if (g.alive && g.pos.distanceTo(m.pos) < g.radius + 20) damageGround(g, 100, m.pos);
  } else {
    const d = P.pos.distanceTo(m.pos); if (d < 30) damagePlayer(45 * (1 - d / 40));
  }
}

// ======================= tanker / refuel =======================
function updateTanker(dt) {
  const m = MISSIONS[missionIdx];
  if (m.refuel && !tanker && !refueled && phase === 'combat' && P.alive && P.fuel < 0.5) {
    const mesh = makeTanker(); scene.add(mesh);
    const hf = V(P.fwd.x, 0, P.fwd.z).normalize();
    const pos = P.pos.clone().addScaledVector(hf, 2600); pos.y = clamp(P.pos.y, 1400, 3500);
    tanker = { mesh, pos, fwd: hf.clone(), up: V(0, 1, 0), vel: V(), speed: 150, alive: true };
    say('TANKER ON STATION — TUCK IN BEHIND THE BASKET', 3.5, '#9fd8ff');
  }
  if (!tanker) return null;
  const T = tanker; const prev = T.fwd.clone();
  T.fwd.applyAxisAngle(AY, 0.022 * dt); // lazy orbit
  T.vel.copy(T.fwd).multiplyScalar(T.speed); T.pos.addScaledVector(T.vel, dt);
  orient(T, prev, dt);
  if (refueled) { if (T.pos.distanceTo(P.pos) > 12000) { scene.remove(T.mesh); tanker = null; } return null; }
  const drogue = T.mesh.localToWorld(T.mesh.userData.drogue.clone());
  const probe = P.pos.clone().addScaledVector(P.fwd, 8).addScaledVector(P.up, 1).addScaledVector(P.right, -0.8);
  const d = probe.distanceTo(drogue), dv = P.speed - T.speed;
  let info = { ok: false, prog: P.fuel, msg: '' };
  if (!P.alive) return null;
  if (d > 400) info.msg = `TANKER ${(d / 1000).toFixed(1)} KM`;
  else if (d > 30) {
    info.msg = Math.abs(dv) > 25 ? (dv > 0 ? `TOO FAST +${Math.round(dv * 1.94)} KT` : `TOO SLOW ${Math.round(dv * 1.94)} KT`) : 'CLOSE ON THE BASKET';
    // gentle magnetism in the last stretch
    if (d < 90 && Math.abs(dv) < 30) P.pos.lerp(P.pos.clone().add(drogue.clone().sub(probe)), 1 - Math.exp(-dt * 0.8));
  } else if (Math.abs(dv) < 30) {
    info.ok = true;
    P.pos.lerp(P.pos.clone().add(drogue.clone().sub(probe)), 1 - Math.exp(-dt * 3));
    P.fuel = Math.min(1, P.fuel + 0.16 * dt);
    if (Math.random() < 0.3) smoke.emit(drogue, V(rnd(1), rnd(1), rnd(1)), COL.white, 1, 0.4, { alpha: 0.3 });
    if (P.fuel >= 1) { refueled = true; P.missiles = Math.max(P.missiles, LOADOUTS[loadIdx].count); P.flares = 24; P.ammo = 1200; say('TANKS FULL — RE-ARMED', 2.5, '#9fd8ff'); sfx.blip(990, 0.3); }
  } else info.msg = dv > 0 ? 'EASE OFF THE THROTTLE' : 'ADD POWER';
  return info;
}

// ======================= mission flow =======================
function objectives() {
  const m = MISSIONS[missionIdx]; const list = [];
  list.push({ text: `Bandits ${Math.min(kills, m.kills)}/${m.kills}`, done: kills >= m.kills });
  const ships = grounds.filter(g => g.kind === 'ship'); if (ships.length) list.push({ text: `Frigates ${ships.filter(s => !s.alive).length}/${ships.length}`, done: ships.every(s => !s.alive) });
  const bases = grounds.filter(g => g.kind === 'base'); if (bases.length) list.push({ text: `Island sites ${bases.filter(s => !s.alive).length}/${bases.length}`, done: bases.every(s => !s.alive) });
  for (const [k, label] of [['tank', 'Tanks'], ['sam', 'SAM launchers'], ['tower', 'Radar towers']]) {
    const gs = grounds.filter(g => g.kind === k); if (gs.length) list.push({ text: `${label} ${gs.filter(s => !s.alive).length}/${gs.length}`, done: gs.every(s => !s.alive) });
  }
  const ec = grounds.find(g => g.kind === 'carrier'); if (ec) list.push({ text: `Enemy carrier ${ec.alive ? Math.round(ec.hp / ec.maxHp * 100) + '%' : 'sunk'}`, done: !ec.alive });
  if (m.refuel && tanker) list.push({ text: 'Refuel from tanker', done: refueled });
  if (phase === 'rtb' || phase === 'landed') list.push({ text: 'Land on the carrier (G = gear)', done: phase === 'landed' });
  return list;
}
function updateFlow(dt) {
  const m = MISSIONS[missionIdx];
  if (phase === 'combat' && kills >= m.kills && grounds.every(g => !g.alive)) {
    phase = 'rtb';
    const hf = V(P.fwd.x, 0, P.fwd.z).normalize();
    const cm = carrier.mesh; const pos = P.pos.clone().addScaledVector(hf, 8500); pos.y = 0;
    let head = Math.atan2(hf.x, hf.z);
    if (land) { pos.set(clamp(P.pos.x, -5000, 5000), 0, COAST - 6000); head = Math.PI; } // back out to sea, stern toward the coast
    cm.position.copy(pos); cm.rotation.y = head; cm.updateMatrixWorld();
    say('AREA CLEAR — RETURN TO CARRIER', 4, '#9fd8ff'); sfx.blip(660, 0.4, 0.1);
  }
  if (carrier) {
    const cm = carrier.mesh;
    if (phase !== 'launch') { cm.position.addScaledVector(V(Math.sin(cm.rotation.y), 0, Math.cos(cm.rotation.y)), carrier.speed * dt); }
    cm.updateMatrixWorld();
    if (cm.userData.radar) cm.userData.radar.rotation.y += dt * 1.5;
  }
  if (phase === 'landed') {
    phaseT += dt;
    const cm = carrier.mesh, d = cm.userData;
    const local = cm.worldToLocal(P.pos.clone());
    P.speed = Math.max(0, P.speed - 60 * dt);
    local.z += P.speed * dt; local.y = d.deckY + 2.2; local.x += (d.deckX - local.x) * dt;
    P.pos.copy(cm.localToWorld(local));
    const e = new THREE.Euler(0, cm.rotation.y, 0); _q.setFromEuler(e); P.q.slerp(_q, 1 - Math.exp(-dt * 4)); basis();
    P.throttle = 0; P.ab = 0;
    if (phaseT > 3.2 && state === 'play') showResult(true);
  }
}

// ======================= camera =======================
const camPos = V(0, 50, -60), camUp = V(0, 1, 0), camLook = V();
let orbitA = 0;
let debugCam = null;
function updateCamera(dt) {
  if (debugCam) { camera.position.copy(debugCam.p); camera.up.set(0, 1, 0); camera.lookAt(debugCam.t); camera.fov = debugCam.fov || 50; camera.updateProjectionMatrix(); return; }
  let fov = 62;
  if (state === 'title' || state === 'brief') {
    orbitA += dt * 0.12;
    const r = 34;
    camPos.copy(P.pos).add(V(Math.sin(orbitA) * r, 6 + Math.sin(orbitA * 0.7) * 5, Math.cos(orbitA) * r));
    camera.position.copy(camPos); camera.up.set(0, 1, 0); camera.lookAt(P.pos);
    fov = 50;
  } else if (!P.alive) {
    orbitA += dt * 0.3;
    camera.position.lerp(_v.copy(deathPos).add(V(Math.sin(orbitA) * 140, 60, Math.cos(orbitA) * 140)), 1 - Math.exp(-dt * 2));
    camera.up.set(0, 1, 0); camera.lookAt(deathPos);
  } else if (phase === 'landed') {
    orbitA += dt * 0.25;
    camera.position.lerp(_v.copy(P.pos).add(V(Math.sin(orbitA) * 45, 14, Math.cos(orbitA) * 45)), 1 - Math.exp(-dt * 2));
    camera.up.set(0, 1, 0); camera.lookAt(P.pos); fov = 55;
  } else if (camMode === 'cockpit') {
    camera.position.copy(P.pos).addScaledVector(P.up, 1.3).addScaledVector(P.fwd, 5.4);
    camera.quaternion.copy(P.q).multiply(_q.setFromAxisAngle(AY, Math.PI));
    fov = 68 + clamp((P.speed - 120) / 250, 0, 1) * 14;
  } else {
    const sp = clamp((P.speed - 100) / 260, 0, 1);
    const back = 24 + sp * 6 + P.ab * 3, upOff = 5.2 + (phase === 'launch' ? 2 : 0);
    const desired = _v.copy(P.pos).addScaledVector(P.fwd, -back).addScaledVector(P.up, upOff);
    camPos.lerp(desired, 1 - Math.exp(-dt * (phase === 'launch' ? 20 : 9)));
    camUp.lerp(_v2.copy(P.up).multiplyScalar(0.75).add(V(0, 0.25, 0)).normalize(), 1 - Math.exp(-dt * 6)).normalize();
    camLook.copy(P.pos).addScaledVector(P.fwd, 60).addScaledVector(P.up, 3);
    camera.position.copy(camPos); camera.up.copy(camUp); camera.lookAt(camLook);
    fov = 60 + sp * 16 + P.ab * 6;
  }
  // shake
  const sh = shake + P.ab * 0.05 * (P.alive ? 1 : 0);
  if (sh > 0.001) { camera.position.add(V(rnd(1), rnd(1), rnd(1)).multiplyScalar(sh * 0.8)); camera.rotateZ(rnd(sh * 0.01)); }
  shake *= Math.exp(-dt * 4);
  camera.fov += (fov - camera.fov) * (1 - Math.exp(-dt * 3));
  camera.updateProjectionMatrix();
  P.mesh.visible = P.alive && !(camMode === 'cockpit' && state === 'play' && phase !== 'landed');
}

// ======================= HUD =======================
function project(p, out) {
  _v.copy(p).applyMatrix4(camera.matrixWorldInverse);
  const behind = _v.z > 0;
  _v.copy(p).project(camera);
  let x = _v.x, y = _v.y;
  if (behind) { x = -x * 100; y = -y * 100; }
  out.on = !behind && Math.abs(x) < 1 && Math.abs(y) < 1;
  out.x = (x + 1) / 2 * W; out.y = (1 - y) / 2 * H; out.depth = -_v.z;
  return out;
}
function buildHud(refuelInfo) {
  const s = { show: state === 'play' && P.alive && phase !== 'landed', time, fovDeg: camera.fov };
  if (!s.show) return s;
  const bore = project(P.pos.clone().addScaledVector(P.fwd, 1500), {});
  s.bore = bore.on ? bore : null;
  s.pitch = Math.asin(clamp(P.fwd.y, -1, 1)); s.roll = P.bank; if (P.up.y < 0) s.roll = Math.PI - s.roll;
  s.heading = ((Math.atan2(-P.fwd.x, P.fwd.z) * 57.3) + 360) % 360;
  s.speedKts = P.speed * 1.944; s.alt = P.pos.y * 3.28; s.vs = P.vs * 196.9; s.g = P.g; s.throttle = P.throttle; s.ab = P.ab; s.gear = P.gear;
  const L = LOADOUTS[loadIdx];
  s.seekR = Math.tan(THREE.MathUtils.degToRad(L.cone)) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * H / 2;
  s.missileName = L.name; s.missiles = P.missiles; s.ammo = P.ammo; s.flares = P.flares; s.fuel = P.fuel; s.hp = P.hp / 100;
  s.score = score; s.lives = lives; s.objectives = objectives();
  s.safeTop = s.safeBot = s.safeL = s.safeR = 0; s.touch = isTouch;
  if (isTouch) { s.safeL = safeInsets.l; s.safeR = safeInsets.r; s.safeTop = safeInsets.t; s.safeBot = safeInsets.b; }
  // targets
  s.targets = [];
  const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const add = (t, extra) => {
    const pr = project(t.pos, {}); const dist = t.pos.distanceTo(P.pos);
    const size = (t.radius || 16) / Math.max(1, pr.depth) / tanH * H / 2;
    const lk = P.lock.t === t;
    const o = { ...pr, dist, size, locked: lk && P.lock.locked, lockProg: lk ? P.lock.prog : 0, arrow: dist < 9000, ...extra };
    if (!extra?.friendly && t.vel && dist < 1500 && pr.on) { const lp = project(t.pos.clone().addScaledVector(t.vel, dist / 1150).addScaledVector(P.vel, -dist / 1150 * 0), {}); if (lp.on) o.lead = lp; }
    s.targets.push(o);
  };
  for (const e of enemies) if (e.alive && !e.retreat) add(e);
  for (const g of grounds) if (g.alive && (g.pos.distanceTo(P.pos) < 7000 || P.lock.t === g)) add(g, { ground: true, arrow: false, label: P.lock.t === g ? undefined : '' });
  if (tanker && !refueled) add(tanker, { friendly: true, label: 'TANKER', arrow: true, radius: 30 });
  if (carrier && (phase === 'rtb')) add({ pos: carrier.mesh.position.clone().add(V(0, 25, 0)), radius: 120 }, { friendly: true, label: 'CARRIER', arrow: true });
  // threats
  s.threats = []; let warnMsl = false;
  for (const m of missiles) if (m.owner === 'enemy' && m.target === P) { s.threats.push(project(m.pos, {})); if (m.pos.distanceTo(P.pos) < 3500) warnMsl = true; }
  s.warnings = [];
  if (warnMsl) s.warnings.push('MISSILE — BREAK / FLARES (X)');
  const agl = P.pos.y - (land ? Math.max(0, land.heightAt(P.pos.x, P.pos.z), land.heightAt(P.pos.x + P.vel.x * 3, P.pos.z + P.vel.z * 3) - 60) : 0);
  if (agl < 180 && (P.vs < -15 || land) && !(phase === 'rtb' && P.gear)) s.warnings.push('PULL UP');
  if (P.fuel < 0.15) s.warnings.push('BINGO FUEL');
  if (P.hp < 30) s.warnings.push('HULL CRITICAL');
  // radar
  const hf = _v2.set(P.fwd.x, 0, P.fwd.z).normalize(); const rt = _v3.set(-hf.z, 0, hf.x);
  s.radar = []; s.radarRange = 9000;
  const rb = (p, c, big) => { const r = p.clone().sub(P.pos); s.radar.push({ x: r.dot(rt), y: -r.dot(hf), c, big }); };
  for (const e of enemies) if (e.alive) rb(e.pos, '#ff6a50');
  for (const g of grounds) if (g.alive) rb(g.pos, '#ffcf4a', true);
  for (const m of missiles) if (m.owner === 'enemy') rb(m.pos, '#ffffff');
  if (tanker) rb(tanker.pos, '#9fd8ff', true);
  if (carrier && phase === 'rtb') rb(carrier.mesh.position, '#9fd8ff', true);
  // landing guide
  if (phase === 'rtb' && carrier) {
    const cm = carrier.mesh, d = cm.userData; const local = cm.worldToLocal(P.pos.clone());
    const tdz = -d.L / 2 + 60; const dz = tdz - local.z;
    if (dz > -40 && dz < 7000) {
      const wantH = Math.max(0, dz) * Math.tan(THREE.MathUtils.degToRad(3.5)) + 4;
      s.land = { vDev: (local.y - d.deckY - wantH) / Math.max(12, dz * 0.05), hDev: -(local.x - d.deckX) / Math.max(10, dz * 0.04), dist: Math.max(0, dz), speedOk: P.speed < 110, gear: P.gear };
    }
  }
  if (refuelInfo) s.refuel = refuelInfo;
  if (msgT > 0) { s.msg = msg; s.msgCol = msgCol; }
  return s;
}

// ======================= UI =======================
function show(id) { for (const s of ['title', 'brief', 'result', 'pause']) $(s).hidden = s !== id; $('touch').hidden = !(isTouch && state === 'play'); }
function startCampaign(i = 0) {
  sfxInit(); missionIdx = typeof i === 'number' ? i : 0; lives = 3; score = 0; openBrief();
}
function openBrief() {
  state = 'brief'; const m = MISSIONS[missionIdx]; if (m.land === 'city') loadCity();
  $('bNum').textContent = `Sortie ${missionIdx + 1} of ${MISSIONS.length}`;
  $('bName').textContent = m.name; $('bTime').textContent = m.time; $('bText').textContent = m.brief;
  const obj = [`Splash ${m.kills} bandits`];
  if (m.ships) obj.push(`Sink ${m.ships} frigates`); if (m.bases) obj.push(`Destroy ${m.bases} island radar/SAM sites`); if (m.ecarrier) obj.push('Sink the enemy carrier');
  if (m.tanks) obj.push(`Destroy ${m.tanks} tanks`); if (m.sams) obj.push(`Destroy ${m.sams} SAM launchers`); if (m.towers) obj.push(`Bring down ${m.towers} radar towers`);
  if (m.refuel) obj.push('Fuel is tight — meet the tanker'); obj.push('Trap back aboard the carrier');
  $('bObj').innerHTML = obj.map(o => `<li>${o}</li>`).join('');
  pickLoadout(loadIdx); show('brief');
  // preview environment behind the briefing
  clearWorld(); setEnvironment(m); P.alive = true; P.gear = false; P.mesh.visible = true; P.pos.set(0, m.cloudAlt - 200, 0); P.q.identity(); basis(); P.speed = 180;
}
function pickLoadout(i) {
  loadIdx = i;
  document.querySelectorAll('.load').forEach((el, k) => el.setAttribute('aria-pressed', String(k === i)));
}
// the St Petersburg models (16 of them) load only when a city sortie needs them - quicker start on a phone
const CITY_KEYS = Object.keys(GLB).filter(k => k.startsWith('spb_'));
let cityLoad = null, cityReady = false;
function loadCity() { return cityLoad || (cityLoad = loadModels(CITY_KEYS).then(() => { cityReady = true; })); }
function launch() {
  sfxInit();
  if (MISSIONS[missionIdx].land === 'city' && !cityReady) {
    const b = $('launchBtn'); b.textContent = 'Loading city…'; b.disabled = true;
    loadCity().then(() => { b.textContent = 'Launch'; b.disabled = false; if (state === 'brief') launch(); });
    return;
  }
  state = 'play'; paused = false; setupMission(); show(null);
}
function setPause(p) {
  if (state !== 'play') return; paused = p; show(p ? 'pause' : null);
}
function showResult(win) {
  state = 'result';
  const last = missionIdx === MISSIONS.length - 1;
  $('rTitle').textContent = win ? (last ? 'Campaign complete' : 'Trap. Mission complete') : 'Game over';
  $('rText').textContent = win ? `${MISSIONS[missionIdx].name} cleared. Landing bonus +${resultBonus.toLocaleString()}.` : 'Your wing is out of aircraft.';
  $('rScore').textContent = score.toLocaleString();
  if (score > hiscore) { hiscore = score; try { localStorage.setItem('acewing-hi', String(hiscore)); } catch (e) { } }
  $('rHi').textContent = hiscore.toLocaleString(); $('hi').textContent = hiscore.toLocaleString();
  const btn = $('resultBtn');
  btn.textContent = win && !last ? 'Next sortie' : 'Back to title';
  btn.onclick = () => { if (win && !last) { missionIdx++; openBrief(); } else toTitle(); };
  show('result');
}
function gameOver() { showResult(false); }
function toTitle() {
  state = 'title'; clearWorld(); setEnvironment(MISSIONS[5]); P.pos.set(0, 900, 0); P.q.identity(); basis(); P.speed = 180; P.alive = true; P.gear = false;
  if (P.mesh) P.mesh.visible = true; show('title');
}
$('startBtn').onclick = () => startCampaign(0);
MISSIONS.forEach((m, i) => {
  const b = document.createElement('button'); b.className = 'lvl';
  b.innerHTML = `<strong>${i + 1} · ${m.name}</strong><span>${m.time}</span>`;
  b.onclick = () => startCampaign(i); $('levels').appendChild(b);
});
$('launchBtn').onclick = launch;
document.querySelectorAll('.load').forEach((el, k) => el.onclick = () => pickLoadout(k));
$('resumeBtn').onclick = () => setPause(false);
$('muteBtn').onclick = () => { setMute(!muted); $('muteBtn').blur(); }; setMute(muted);
$('quitBtn').onclick = () => { paused = false; toTitle(); };
$('hi').textContent = hiscore.toLocaleString();

// ======================= main loop =======================
const clock = new THREE.Clock();
const dbg = {};
let refuelInfo = null;
function frame() {
  requestAnimationFrame(frame);
  const rawDt = clock.getDelta();
  let dt = Math.min(rawDt, 0.05);
  if (!document.hidden && rawDt < 0.5) {                   // adaptive resolution, re-evaluated every ~1.5 s
    ftAcc += rawDt; ftN++;
    if (ftAcc > 1.5) {
      const ft = ftAcc / ftN; ftAcc = 0; ftN = 0;
      const q0 = quality;
      if (ft > 1 / 45) quality = Math.max(0.7, quality * 0.85); else if (ft < 1 / 58 && quality < 1) quality = Math.min(1, quality * 1.1);
      if (quality !== q0) resize();
    }
  }
  pollPad();
  if (paused) { composer.render(); return; }
  if (slowT > 0) { slowT -= dt; dt *= 0.35; }
  time += dt;

  if (state === 'play') {
    const ctl = readControls(); dbg.ctl = ctl;
    if (P.alive) updatePlayer(dt, ctl);
    else if ((respawnT -= dt) <= 0 && state === 'play') respawn();
    updateEnemies(dt); updateGrounds(dt); updateMissiles(dt);
    refuelInfo = updateTanker(dt);
    updateFlow(dt);
    const hits = tracers.update(dt, (b, prev) => {
      if (b.owner === 'player') {
        for (const e of enemies) if (e.alive && segSphere(prev, b.p, e.pos, 15)) { damageEnemy(e, b.dmg, b.p); return { p: b.p.clone() }; }
        for (const g of grounds) if (g.alive && segSphere(prev, b.p, g.pos, g.radius * 0.7)) { damageGround(g, b.dmg * 0.4, b.p); return { p: b.p.clone() }; }
      } else if (P.alive && segSphere(prev, b.p, P.pos, 9)) { damagePlayer(b.dmg); return { p: b.p.clone() }; }
      if (land && b.p.y < land.heightAt(b.p.x, b.p.z)) { smoke.emit(b.p, V(rnd(3), 6, rnd(3)), COL.smokeL, 5, 1.2, { grow: 8, alpha: 0.6 }); return { p: b.p.clone() }; }
      return null;
    });
    for (const h of hits) if (h.water) splash(h.p, 0.6); else { fire.emit(h.p, V(), COL.hot, 4, 0.1, { grow: 30, heat: 1 }); sparks.burst(h.p, 10, 70); }
  } else if (state === 'title' || state === 'brief') {
    // attract mode: cruise with a lazy bank
    P.q.setFromEuler(new THREE.Euler(Math.sin(time * 0.3) * 0.05, time * 0.02, Math.sin(time * 0.4) * 0.35)); basis();
    P.speed = 180; P.vel.copy(P.fwd).multiplyScalar(P.speed); P.pos.addScaledVector(P.vel, dt); P.throttle = 0.7; P.ab = 0;
    setSweep(P.mesh, 0.55);
    tracers.update(dt, () => null);
  }
  // flares
  for (const f of flares) { f.life -= dt; f.vel.y -= 9.8 * dt; f.pos.addScaledVector(f.vel, dt); f.alive = f.life > 0; fire.emit(f.pos, V(), COL.flare, 9, 0.12); smoke.emit(f.pos, V(), COL.smokeL, 3, 1.2, { grow: 4, alpha: 0.5 }); }
  flares = flares.filter(f => f.alive);
  // debris & rings
  for (const d of debris) { d.t -= dt; d.v.y -= 9.8 * dt; d.m.position.addScaledVector(d.v, dt); d.m.rotation.x += d.s.x * dt; d.m.rotation.y += d.s.y * dt; if (Math.random() < 0.6) smoke.emit(d.m.position, V(), COL.smoke, 3.5, 1.6, { grow: 5, alpha: 0.6, heat: d.burn ? 0.6 : 0 }); if (d.burn) fire.emit(d.m.position, V(), COL.fire, 3, 0.15, { heat: 1 }); if (d.m.position.y < 0 || d.t < 0) { if (d.m.position.y < 0) splash(d.m.position, 0.5); scene.remove(d.m); d.t = -1; } }
  debris = debris.filter(d => d.t > 0);
  for (const r of rings) { r.t += dt; r.m.scale.setScalar(1 + r.t * r.s * 4); r.m.material.opacity = 0.45 * Math.max(0, 1 - r.t * 3); if (r.t > 0.35) { scene.remove(r.m); r.dead = true; } }
  rings = rings.filter(r => !r.dead);

  // player visuals
  if (P.mesh) {
    P.mesh.position.copy(P.pos); P.mesh.quaternion.copy(P.q);
    if (P.mesh.userData.gear) P.mesh.userData.gear.visible = P.gear;
    const flick = 0.85 + Math.random() * 0.3;
    for (const f of P.mesh.userData.flames || []) {
      f.material.uniforms.uT.value = time; f.material.uniforms.uPow.value = P.ab ? 1 : P.throttle * 0.35;
      const l = P.flameout > 0 ? 0 : (0.8 + P.throttle * 3 + P.ab * 7) * flick; const fr = f.userData.r || 1; f.scale.set(fr * (1 + P.ab * 0.25), fr * (1 + P.ab * 0.25), l); f.visible = l > 0.01;
    }
    if (P.ab && state === 'play') fire.emit(P.pos.clone().addScaledVector(P.fwd, -14), P.vel.clone().multiplyScalar(0.2), COL.fire, 2.5, 0.08);
    if (P.hp < 40 && P.alive && state === 'play') smoke.emit(P.pos.clone().addScaledVector(P.fwd, -6), V(rnd(2), rnd(2), rnd(2)), COL.smoke, 4, 1.8, { grow: 6, alpha: 0.6 });
  }
  // wingtip vapour
  const vap = state === 'play' && P.alive && phase !== 'landed' ? clamp((P.g - 4.5) / 3, 0, 1) + (P.pos.y > 3500 ? 0.4 : 0) : 0;
  (P.mesh.userData.tips || []).forEach((tip, i) => {
    const wp = tip.getWorldPosition(V());
    const side = _v.crossVectors(P.fwd, _v2.copy(camera.position).sub(wp).normalize()).normalize();
    trails[i].push(wp, side, vap);
  });

  // world follow
  const cam = camera.position;
  ocean.position.set(Math.round(cam.x / 8) * 8, seaY, Math.round(cam.z / 8) * 8);
  ocean.material.uniforms.uTime.value = time; ocean.material.uniforms.uCam.value.copy(cam);
  sky.position.copy(cam);
  sun.position.copy(P.pos).addScaledVector(sunDir, 3000); sun.target.position.copy(P.pos); sun.target.updateMatrixWorld();
  fire.update(dt); smoke.update(dt); fireballs.update(dt); sparks.update(dt); lights.update(dt);
  if ((muzzleT -= dt) <= 0) muzzleFlash.visible = false;
  shared.sunView.value.copy(sunDir).transformDirection(camera.matrixWorldInverse);
  shared.sunCol.value.copy(sun.color).multiplyScalar(sun.intensity * 0.45);
  shared.amb.value.copy(hemi.color).multiplyScalar(hemi.intensity * 0.9);
  const inside = 0;
  cloudPass.uniforms.uCTime.value = ocean.material.uniforms.uCTime.value = time;
  const spd01 = state === 'play' && P.alive ? clamp((P.speed - 90) / 280, 0, 1) : 0;
  streaks.update(cam, P.vel, state === 'play' && P.alive ? spd01 * 1.2 + inside : 0.2);

  updateCamera(dt);
  if (land && land.update) land.update(camera.position);

  finalPass.uniforms.uSpeed.value = spd01 * (camMode === 'cockpit' ? 0.7 : 1) + P.ab * 0.25;
  dmgFlash *= Math.exp(-dt * 2.5); whiteFlash *= Math.exp(-dt * 6);
  finalPass.uniforms.uDamage.value = Math.max(dmgFlash, P.alive && state === 'play' ? clamp((40 - P.hp) / 60, 0, 0.5) : 0);
  finalPass.uniforms.uFlash.value = whiteFlash; finalPass.uniforms.uTime.value = time;

  // audio
  const tone = state === 'play' && P.alive ? (missiles.some(m => m.owner === 'enemy' && m.target === P && m.pos.distanceTo(P.pos) < 3500) ? 3 : P.lock.locked ? 2 : P.lock.prog > 0 ? 1 : 0) : 0;
  sfx.toneMode(tone, time);
  sfx.engine(P.throttle, spd01, P.ab, state === 'play' && P.alive && phase !== 'landed');

  msgT -= dt;
  composer.render();
  drawHud(hctx, W, H, buildHud(refuelInfo));
}
function segSphere(a, b, c, r) {
  const ab = _v2.subVectors(b, a); const l2 = ab.lengthSq();
  const t = l2 > 0 ? clamp(_v3.subVectors(c, a).dot(ab) / l2, 0, 1) : 0;
  return _v3.copy(a).addScaledVector(ab, t).distanceToSquared(c) < r * r;
}

// ======================= boot =======================
resize();
$('loading').textContent = 'Loading models…';
await loadModels(Object.keys(GLB).filter(k => !CITY_KEYS.includes(k)), true);
if (!MOBILE) loadCity();
P.mesh = newPlayerMesh(); scene.add(P.mesh);
toTitle();
$('loading').hidden = true;
frame();
window.__acewing = { cam: (p, t, fov) => { debugCam = p ? { p: V(...p), t: V(...t), fov } : null; }, grounds: () => grounds, explode, flakBurst, glbs, goto: i => { missionIdx = i; openBrief(); }, get carrier() { return carrier; }, camera, THREE, dbg, keys, touch, P, get state() { return state; }, get phase() { return phase; }, enemies: () => enemies, launch, startCampaign, setPhase: p => phase = p, kills: () => kills };

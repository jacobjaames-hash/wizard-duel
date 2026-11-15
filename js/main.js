import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';
import { CFG, WandTracker, Fight, Duel } from './logic.js';

const MP_VER = '0.10.14';
const MP_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VER}`;
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const COLORS = [0x66ddff, 0xffaa44];
const CSS = ['#66ddff', '#ffaa44'];
const NAMES = ['玩家一', '玩家二'];
const $ = s => document.querySelector(s);

// ---------- 3D 場景 ----------
const renderer = new THREE.WebGLRenderer({ canvas: $('#gl'), antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.25;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a1222); scene.fog = new THREE.FogExp2(0x0a1222, 0.05);
const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 120);
camera.position.set(0, 1.6, 6); camera.lookAt(0, 1.3, 0); scene.add(camera);
scene.add(new THREE.HemisphereLight(0x8fa4d8, 0x141c10, 0.75));
const moon = new THREE.DirectionalLight(0xb8c8ff, 1.9); moon.position.set(-6, 10, 5); moon.castShadow = true;
moon.shadow.mapSize.set(1024, 1024); Object.assign(moon.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 30 });
scene.add(moon);

function noiseTex(base, spots, n) {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < n; i++) { g.fillStyle = spots[i % spots.length]; g.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 2, 2 + Math.random() * 5); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}
function glowTex() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,.6)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c);
}
const GLOW = glowTex();
const glow = (color, size) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); s.scale.setScalar(size); return s; };

{ // 地面、樹、月亮
  const gt = noiseTex('#22331c', ['#2e4524', '#1a2815', '#3a5230', '#16210f'], 9000); gt.repeat.set(24, 24);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshStandardMaterial({ map: gt, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const bark = new THREE.MeshStandardMaterial({ map: noiseTex('#2b2118', ['#1c150f', '#3a2d21'], 4000), roughness: 1 });
  const leaf = new THREE.MeshStandardMaterial({ color: 0x14261a, roughness: 1 });
  for (let i = 0; i < 70; i++) {
    const a = Math.random() * Math.PI * 2, r = 5 + Math.random() * 32, x = Math.cos(a) * r, z = Math.sin(a) * r - 6;
    if ((Math.abs(x) < 3 && z > -5) || (z > 0.5 && Math.abs(x) < 7)) continue; // 不擋住視線
    const h = 5 + Math.random() * 5, tr = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.38, h, 7), bark);
    tr.position.set(x, h / 2, z); tr.castShadow = true; scene.add(tr);
    for (let k = 0; k < 3; k++) { const cone = new THREE.Mesh(new THREE.ConeGeometry(2.2 - k * 0.5, 3, 8), leaf); cone.position.set(x, h * 0.55 + k * 1.6, z); cone.castShadow = true; scene.add(cone); }
  }
  const m = new THREE.Mesh(new THREE.SphereGeometry(3, 24, 24), new THREE.MeshBasicMaterial({ color: 0xe8ecff, fog: false })); m.position.set(-18, 22, -60); scene.add(m);
  const halo = glow(0x9fb4ff, 30); halo.material.fog = false; halo.position.copy(m.position); scene.add(halo);
}

// 夜空環境光（CC0 HDRI）與地面霧氣（CC0 雲霧貼圖）；載入失敗就維持原樣
new EXRLoader().load('assets/night.exr', tex => {
  const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromEquirectangular(tex).texture; tex.dispose(); pm.dispose();
}, undefined, () => {});
const mist = [];
new THREE.TextureLoader().load('assets/cloud.webp', tex => {
  for (let i = 0; i < 14; i++) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0x9fb2d8, transparent: true, opacity: 0.1 + Math.random() * 0.08, depthWrite: false }));
    m.position.set((Math.random() - .5) * 16, 0.5 + Math.random() * 0.7, -6 + Math.random() * 8); m.scale.set(6 + Math.random() * 4, 2.2 + Math.random(), 1);
    m.userData.v = (Math.random() - .5) * 0.25; scene.add(m); mist.push(m);
  }
}, undefined, () => {});

// ---------- 狼人（暫用程式拼出的模型；放 models/werewolf.glb 就會自動換成真模型） ----------
const CHEST = new THREE.Vector3(0, 1.45, 0.3), THROW_FROM = new THREE.Vector3(0, 1.7, 0.7);
const monster = new THREE.Group(); scene.add(monster);
const mon = { mats: [], arms: [], attackT: 0, hitT: 0, dead: 0, mixer: null };
function buildWerewolf() {
  const fur = new THREE.MeshStandardMaterial({ map: noiseTex('#6e5d4c', ['#57483a', '#85705b', '#4a3d31'], 7000), roughness: 0.95 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a211b, roughness: 0.8 });
  const eye = new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xffb000, emissiveIntensity: 2.5 });
  const fang = new THREE.MeshStandardMaterial({ color: 0xf2ead8, roughness: 0.4 });
  mon.mats.push(fur, dark);
  const add = (geo, mat, p, r = [0, 0, 0], parent = monster) => { const m = new THREE.Mesh(geo, mat); m.position.set(...p); m.rotation.set(...r); m.castShadow = true; parent.add(m); return m; };
  add(new THREE.CapsuleGeometry(0.42, 0.7, 6, 14), fur, [0, 1.4, 0.05], [0.4, 0, 0]);
  add(new THREE.SphereGeometry(0.36, 14, 12), fur, [0, 0.92, -0.12]);
  add(new THREE.SphereGeometry(0.3, 16, 14), fur, [0, 2.02, 0.36]);
  add(new THREE.ConeGeometry(0.17, 0.46, 12), fur, [0, 1.95, 0.68], [Math.PI / 2, 0, 0]);
  add(new THREE.SphereGeometry(0.06, 8, 8), dark, [0, 1.96, 0.9]);
  for (const s of [-1, 1]) {
    add(new THREE.ConeGeometry(0.09, 0.28, 8), fur, [s * 0.18, 2.32, 0.28], [0, 0, -s * 0.25]);
    add(new THREE.SphereGeometry(0.045, 8, 8), eye, [s * 0.12, 2.09, 0.6]);
    add(new THREE.ConeGeometry(0.025, 0.1, 6), fang, [s * 0.07, 1.86, 0.78], [Math.PI, 0, 0]);
    const arm = new THREE.Group(); arm.position.set(s * 0.56, 1.72, 0.2); arm.rotation.set(-0.5, 0, s * 0.25); monster.add(arm); mon.arms.push(arm);
    add(new THREE.CapsuleGeometry(0.13, 0.55, 5, 10), fur, [0, -0.38, 0], [0, 0, 0], arm);
    add(new THREE.CapsuleGeometry(0.11, 0.5, 5, 10), fur, [0, -0.9, 0.18], [-0.7, 0, 0], arm);
    for (let k = -1; k <= 1; k++) add(new THREE.ConeGeometry(0.03, 0.2, 6), dark, [k * 0.07, -1.22, 0.42], [-2.2, 0, 0], arm);
    add(new THREE.CapsuleGeometry(0.17, 0.5, 5, 10), fur, [s * 0.26, 0.58, 0.08], [-0.45, 0, 0]);
    add(new THREE.CapsuleGeometry(0.12, 0.42, 5, 10), fur, [s * 0.26, 0.22, 0.02], [0.5, 0, 0]);
    add(new THREE.BoxGeometry(0.2, 0.1, 0.42), dark, [s * 0.26, 0.05, 0.22]);
  }
  monster.scale.setScalar(1.15);
}
buildWerewolf();
new GLTFLoader().load('models/werewolf.glb', g => {
  monster.clear(); mon.mats = []; mon.arms = []; monster.scale.setScalar(1);
  const box = new THREE.Box3().setFromObject(g.scene), size = box.getSize(new THREE.Vector3());
  g.scene.scale.setScalar(2.4 / (size.y || 1)); g.scene.position.y = -box.min.y * (2.4 / (size.y || 1));
  g.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; if (o.material && o.material.emissive) mon.mats.push(o.material); } });
  monster.add(g.scene);
  if (g.animations.length) { mon.mixer = new THREE.AnimationMixer(g.scene); mon.mixer.clipAction(g.animations[0]).play(); }
}, undefined, () => {});

// ---------- 魔杖 ----------
const wands = [];
function buildWands(n) {
  wands.forEach(w => { camera.remove(w.g); camera.remove(w.sh); }); wands.length = 0;
  for (let i = 0; i < n; i++) {
    const g = new THREE.Group(); camera.add(g);
    if (kind === 'pk') { g.position.set(i ? 2.5 : -2.5, -0.45, -3.2); g.scale.setScalar(1.7); }
    else g.position.set(n === 1 ? 0.3 : (i ? 0.6 : -0.6), -0.78, -1.5);
    const geo = new THREE.CylinderGeometry(0.011, 0.024, 0.95, 10); geo.rotateX(Math.PI / 2); geo.translate(0, 0, 0.475);
    const stick = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: noiseTex('#5a3a22', ['#3d2615', '#7a5232'], 2500), roughness: 0.6, emissive: 0x1a0f08 }));
    g.add(stick);
    const tip = new THREE.Group(); tip.position.set(0, 0, 0.95); g.add(tip);
    const spr = glow(COLORS[i], 0.28); tip.add(spr);
    const light = new THREE.PointLight(COLORS[i], 1.2, 5, 2); tip.add(light);
    const sh = new THREE.Group(); camera.add(sh);
    if (kind === 'pk') { sh.position.set(i ? 1.75 : -1.75, -0.2, -3.2); sh.scale.setScalar(1.25); } else { sh.position.set(g.position.x * 0.9, -0.35, -1.5); sh.scale.setScalar(0.6); }
    sh.add(new THREE.Mesh(new THREE.SphereGeometry(0.6, 32, 20), new THREE.MeshBasicMaterial({ color: COLORS[i], transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })));
    sh.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.62, 2), new THREE.MeshBasicMaterial({ color: COLORS[i], wireframe: true, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false })));
    sh.visible = false;
    wands.push({ g, tip, spr, light, sh, aim: new THREE.Vector3(0, 1.4, 0), flash: 0 });
  }
}
const impactPoint = i => camera.localToWorld(kind === 'pk' ? new THREE.Vector3(i ? 1.15 : -1.15, -0.1, -3.2) : new THREE.Vector3(wands[i].g.position.x, -0.22, -1.35));
const tipPos = i => wands[i].tip.getWorldPosition(new THREE.Vector3());

// ---------- 特效 ----------
const bolts = [], orbs = new Map(), sparks = [];
const boltMat = new THREE.MeshBasicMaterial({ color: 0xcfeaff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
function boltGeo(a, b, rad = 0.022) {
  const pts = []; const N = 9;
  for (let k = 0; k <= N; k++) { const p = a.clone().lerp(b, k / N); if (k && k < N) p.add(new THREE.Vector3((Math.random() - .5) * .35, (Math.random() - .5) * .35, (Math.random() - .5) * .2)); pts.push(p); }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, rad, 5);
}
function castBolt(i, power) {
  const rad = power ? 0.07 : 0.022, m = new THREE.Mesh(boltGeo(tipPos(i), CHEST, rad), boltMat); scene.add(m);
  bolts.push({ m, i, rad, life: power ? 0.35 : 0.2 }); wands[i].flash = 1; spark(CHEST, power ? 0xffffff : COLORS[i], power ? 3.2 : 1.6);
}
function spark(pos, color, size) { const s = glow(color, size); s.position.copy(pos); scene.add(s); const l = new THREE.PointLight(color, 6, 8, 2); l.position.copy(pos); scene.add(l); sparks.push({ s, l, life: 0.25, size }); }

// ---------- 音效 ----------
let actx;
function tone(type, f0, f1, dur, vol = 0.15) {
  if (!actx) return; const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime;
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(g).connect(actx.destination); o.start(t); o.stop(t + dur);
}
const sfx = {
  bolt: () => { tone('sawtooth', 1400, 180, 0.22); tone('square', 90, 40, 0.25, 0.12); },
  reflect: () => { tone('triangle', 600, 1800, 0.18, 0.25); },
  throw: () => tone('sawtooth', 160, 70, 0.5, 0.18),
  hit: () => tone('square', 140, 35, 0.4, 0.25),
  nomana: () => tone('sine', 220, 180, 0.12, 0.1),
  shield: () => { tone('sine', 300, 900, 0.4, 0.2); tone('triangle', 450, 1350, 0.4, 0.1); },
  blocked: () => tone('triangle', 900, 500, 0.25, 0.25),
  trip: () => { tone('square', 500, 120, 0.3, 0.15); setTimeout(() => tone('square', 90, 40, 0.3, 0.25), 200); },
  power: () => { tone('sawtooth', 2000, 120, 0.4, 0.2); tone('square', 70, 30, 0.45, 0.2); },
  monsterHit: () => tone('sawtooth', 300, 60, 0.35, 0.22),
  win: () => [523, 659, 784, 1047].forEach((f, k) => setTimeout(() => tone('triangle', f, f, 0.35, 0.2), k * 140)),
  lose: () => [392, 330, 262].forEach((f, k) => setTimeout(() => tone('triangle', f, f * .9, 0.45, 0.2), k * 220)),
};

// ---------- 遊戲狀態 ----------
let mode = 'menu', kind = 'story', pkOpts = [{}, {}], nPlayers = 1, fight = null, mouseMode = false, hurtSide = -1, banner = 0;
const isOver = st => st === 'win' || st === 'lose' || st === 'matchEnd';
const key2 = { swing: false, raised: false }; // 滑鼠模式下玩家二用鍵盤：Enter 揮杖、方向鍵上 回魔
let trackers = [], states = [], pending = [], hands = [], lostFor = [];
let readyT = 0, endHold = 0, hurt = 0, shake = 0, noMana = [0, 0];
const mouse = { x: 0, y: 0.2, raised: false };

function newFight() {
  fight = kind === 'pk' ? new Duel(pkOpts) : new Fight(nPlayers); orbs.forEach(o => scene.remove(o.s)); orbs.clear(); monster.visible = kind !== 'pk'; banner = 2;
  mon.dead = 0; mon.hitT = 0; mon.attackT = 0; monster.rotation.set(0, 0, 0); monster.position.set(0, 0, 0); endHold = 0; mode = 'play';
}
const notes = [{ s: '', t: 0 }, { s: '', t: 0 }];
function note(i, s) { notes[i] = { s, t: 1.2 }; }
function handle(ev) {
  for (const e of ev) {
    if (e.type === 'bolt') { castBolt(e.player, e.power); mon.hitT = e.power ? 0.6 : 0.3; e.power ? sfx.power() : sfx.bolt(); if (e.power) note(e.player, '強力閃電！'); }
    else if (e.type === 'shield') { sfx.shield(); note(e.player, '防護罩！'); }
    else if (e.type === 'blocked') { spark(impactPoint(e.player), COLORS[e.player], 2); sfx.blocked(); note(e.player, '擋住了！'); }
    else if (e.type === 'trip') { sfx.trip(); note(e.player, '絆倒咒！'); if (kind !== 'pk') spark(new THREE.Vector3(0, 0.3, 0.3), 0x7dff8a, 3); }
    else if (e.type === 'immune') { sfx.nomana(); note(e.player, '對方暫時不會再被絆倒'); }
    else if (e.type === 'nomana') { noMana[e.player] = 0.6; sfx.nomana(); }
    else if (e.type === 'throw') { const s = glow(0xff4466, 0.9); s.position.copy(THROW_FROM); scene.add(s); orbs.set(e.id, { s, from: THROW_FROM.clone() }); mon.attackT = 0.5; sfx.throw(); }
    else if (e.type === 'shoot') { if (e.power) note(e.player, '強力光球！'); const s = glow(e.power ? 0xffffff : COLORS[e.player], e.power ? 1.3 : 0.8); s.position.copy(tipPos(e.player)); scene.add(s); orbs.set(e.id, { s, from: s.position.clone() }); wands[e.player].flash = 1; e.power ? sfx.power() : sfx.bolt(); }
    else if (e.type === 'roundEnd') { sfx.win(); }
    else if (e.type === 'matchEnd') { sfx.win(); }
    else if (e.type === 'roundStart') { banner = 2; }
    else if (e.type === 'reflect') { const o = orbs.get(e.id); if (o) { o.from = o.s.position.clone(); o.s.material.color.set(COLORS[e.player]); spark(o.from, COLORS[e.player], 1.2); } wands[e.player].flash = 1; sfx.reflect(); }
    else if (e.type === 'monsterHit') { mon.hitT = 0.5; spark(CHEST, 0xffffff, 2.4); sfx.monsterHit(); }
    else if (e.type === 'hit') { hurt = 0.5; hurtSide = kind === 'pk' ? e.player : -1; shake = kind === 'pk' ? 0.15 : 0.35; if (kind === 'pk') spark(impactPoint(e.player), 0xff5555, 1.6); sfx.hit(); }
    else if (e.type === 'win') { mon.dead = 0.001; sfx.win(); }
    else if (e.type === 'lose') sfx.lose();
  }
}

// ---------- 鏡頭與姿勢追蹤 ----------
let landmarker = null, lastVT = -1; const video = $('#cam');
async function startCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
  video.srcObject = stream; await video.play();
  const mp = await import(`${MP_URL}/vision_bundle.mjs`);
  const fs = await mp.FilesetResolver.forVisionTasks(`${MP_URL}/wasm`);
  const opt = d => ({ baseOptions: { modelAssetPath: MODEL_URL, delegate: d }, runningMode: 'VIDEO', numPoses: 2 });
  try { landmarker = await mp.PoseLandmarker.createFromOptions(fs, opt('GPU')); }
  catch { landmarker = await mp.PoseLandmarker.createFromOptions(fs, opt('CPU')); }
}
function readPose(lm, i) {
  const a = video.videoWidth / video.videoHeight || 1.33;
  const P = k => ({ x: (1 - lm[k].x) * a, y: lm[k].y, v: lm[k].visibility ?? 1 }); // 左右鏡像
  const ls = P(11), rs = P(12), w = [P(15), P(16)];
  const sw = Math.hypot(ls.x - rs.x, ls.y - rs.y); if (sw < 0.02) return null;
  const ok = k => w[k].v > 0.5;
  let h = hands[i];
  if (h == null || !ok(h)) h = ok(0) && ok(1) ? (w[0].y < w[1].y ? 0 : 1) : ok(0) ? 0 : ok(1) ? 1 : null;
  else if (ok(1 - h) && w[1 - h].y < w[h].y - 0.3 * sw) h = 1 - h; // 另一隻手明顯舉得更高才換手
  if (h !== hands[i]) { hands[i] = h; trackers[i].reset(); }
  if (h == null) return null;
  return { wrist: w[h], nose: P(0), shoulderC: { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 }, sw };
}
function track(t) {
  if (mouseMode) {
    states[0] = { tracked: true, raised: mouse.raised, swing: false, aimX: mouse.x, aimY: mouse.y };
    if (nPlayers === 2) { states[1] = { tracked: true, raised: key2.raised, swing: false, aimX: 0, aimY: 0.2 }; if (key2.swing) { pending[1] = { swing: true }; key2.swing = false; } }
    return;
  }
  if (!landmarker || video.readyState < 2 || video.currentTime === lastVT) return;
  lastVT = video.currentTime;
  let res; try { res = landmarker.detectForVideo(video, performance.now()); } catch { return; }
  const a = video.videoWidth / video.videoHeight || 1.33;
  const poses = (res.landmarks || []).map(lm => ({ lm, cx: 1 - (lm[11].x + lm[12].x) / 2, w: Math.abs(lm[11].x - lm[12].x) }));
  const slot = [null, null];
  if (nPlayers === 1) slot[0] = poses.sort((p, q) => q.w - p.w)[0] || null; // 一人：取最靠近鏡頭的人
  else {
    poses.sort((p, q) => p.cx - q.cx);
    if (poses.length >= 2) { slot[0] = poses[0]; slot[1] = poses[poses.length - 1]; }
    else if (poses.length === 1) slot[poses[0].cx < 0.5 ? 0 : 1] = poses[0]; // 只看到一人：依站的那一側決定是誰
  }
  for (let i = 0; i < nPlayers; i++) {
    const s = trackers[i].update(t, slot[i] ? readPose(slot[i].lm, i) : null);
    if (s.swing || s.zigzag || s.circle) pending[i] = { ...(pending[i] || {}), swing: s.swing || (pending[i] || {}).swing, power: s.power || (pending[i] || {}).power, zigzag: s.zigzag || (pending[i] || {}).zigzag, circle: s.circle || (pending[i] || {}).circle };
    states[i] = s;
  }
}

// ---------- 畫面更新 ----------
const tmp = new THREE.Vector3();
function updateVisuals(t, dt) {
  // 魔杖
  wands.forEach((w, i) => {
    const s = states[i] || {}, p = fight && fight.players[i];
    const raised = s.raised && !(p && p.down), stunned = p && p.stunT > 0;
    w.sh.visible = !!(p && p.shieldT > 0); if (w.sh.visible) { w.sh.rotation.y = t * 1.5; w.sh.rotation.x = t * 0.7; const k = Math.min(1, p.shieldT) * (0.9 + 0.1 * Math.sin(t * 12)); w.sh.children[0].material.opacity = 0.16 * k; w.sh.children[1].material.opacity = 0.45 * k; }
    if (stunned) tmp.copy(camera.localToWorld(new THREE.Vector3(w.g.position.x * 0.6, -3, -3.2)));
    else if (kind === 'pk') tmp.copy(camera.localToWorld(raised ? new THREE.Vector3(w.g.position.x * 0.8, 3, -3.2) : new THREE.Vector3(0, -0.45 + THREE.MathUtils.clamp((s.aimY || 0) * 0.9, -0.8, 1.6), -3.2)));
    else if (raised) tmp.copy(camera.localToWorld(new THREE.Vector3(w.g.position.x * 0.6, 2.2, -1.6)));
    else tmp.set(THREE.MathUtils.clamp((s.aimX || 0) * 1.4, -3, 3), THREE.MathUtils.clamp(1.3 + (s.aimY || 0) * 1.0, 0.2, 3.2), 0.3);
    w.aim.lerp(tmp, 1 - Math.exp(-dt * 14)); w.g.lookAt(w.aim);
    w.flash = Math.max(0, w.flash - dt * 4);
    const charge = raised ? 0.6 + 0.4 * Math.sin(t * 18) : (s.charged && !stunned ? 0.45 + 0.1 * Math.sin(t * 8) : 0);
    w.spr.scale.setScalar(0.25 + w.flash * 0.6 + charge * 0.7); w.light.intensity = 1.2 + w.flash * 8 + charge * 6;
    w.g.visible = !(p && p.down);
  });
  // 閃電
  for (let k = bolts.length - 1; k >= 0; k--) {
    const b = bolts[k]; b.life -= dt; b.m.geometry.dispose();
    if (b.life <= 0) { scene.remove(b.m); bolts.splice(k, 1); } else b.m.geometry = boltGeo(tipPos(b.i), CHEST, b.rad);
  }
  for (let k = sparks.length - 1; k >= 0; k--) {
    const s = sparks[k]; s.life -= dt; const f = Math.max(0, s.life / 0.25);
    s.s.scale.setScalar(s.size * (1.4 - f * 0.4)); s.s.material.opacity = f; s.l.intensity = 6 * f;
    if (s.life <= 0) { scene.remove(s.s); scene.remove(s.l); sparks.splice(k, 1); }
  }
  // 敵方魔法光球
  if (fight) {
    const live = new Set();
    for (const q of fight.projs) {
      const o = orbs.get(q.id); if (!o) continue; live.add(q.id);
      if (kind === 'pk') { const k = 1 - q.t / q.total; o.s.position.lerpVectors(o.from, impactPoint(q.target), k); o.s.position.y += Math.sin(k * Math.PI) * 0.3; o.s.scale.setScalar(0.75 + Math.sin(t * 30) * 0.06 + q.bounces * 0.05); }
      else if (q.reflected) o.s.position.lerpVectors(o.from, CHEST, 1 - q.t / CFG.reflectReturn);
      else { const k = 1 - q.t / q.total; o.s.position.lerpVectors(o.from, impactPoint(q.target), k); o.s.position.y += Math.sin(k * Math.PI) * 0.5; o.s.scale.setScalar(0.5 + k * 0.5 + Math.sin(t * 30) * 0.05); }
    }
    orbs.forEach((o, id) => { if (!live.has(id)) { scene.remove(o.s); orbs.delete(id); } });
  }
  // 狼人
  mon.attackT = Math.max(0, mon.attackT - dt); mon.hitT = Math.max(0, mon.hitT - dt);
  if (mon.mixer) mon.mixer.update(dt);
  mist.forEach(m => { m.position.x += m.userData.v * dt; if (Math.abs(m.position.x) > 9) m.position.x *= -0.98; });
  const stun = fight && fight.monster && fight.monster.stunT > 0; mon.stun = THREE.MathUtils.lerp(mon.stun || 0, stun ? 1 : 0, 1 - Math.exp(-dt * 8));
  if (mon.dead) { mon.dead = Math.min(1, mon.dead + dt * 1.2); monster.rotation.x = -1.45 * mon.dead; monster.position.y = 0.25 * mon.dead; }
  else {
    monster.position.y = Math.sin(t * 2.2) * 0.03 + mon.stun * 0.15; monster.rotation.y = Math.sin(t * 0.8) * 0.18; monster.rotation.x = -1.2 * mon.stun; monster.rotation.z = Math.sin(t * 9) * 0.05 * mon.stun;
    monster.position.z = Math.sin(Math.min(1, mon.attackT * 2) * Math.PI) * 0.5 - mon.hitT * 0.4;
    mon.arms.forEach((a, k) => a.rotation.x = -0.5 + Math.sin(t * 2.2 + k) * 0.08 - Math.sin(Math.min(1, mon.attackT * 2) * Math.PI) * 1.3);
  }
  mon.mats.forEach(m => m.emissive && m.emissive.setRGB(mon.hitT * 1.6, mon.hitT * 0.2, mon.hitT * 0.2));
  // 被打中時畫面震動
  shake = Math.max(0, shake - dt); hurt = Math.max(0, hurt - dt);
  camera.position.set((Math.random() - .5) * shake * 0.25, 1.6 + (Math.random() - .5) * shake * 0.25, 6);
}

// ---------- HUD ----------
const hud = $('#hud'), g = hud.getContext('2d'); let W = 0, H = 0;
function resize() {
  W = innerWidth; H = innerHeight; const d = Math.min(devicePixelRatio, 2);
  renderer.setSize(W, H, false); camera.aspect = W / H; camera.updateProjectionMatrix();
  hud.width = W * d; hud.height = H * d; g.setTransform(d, 0, 0, d, 0, 0);
}
addEventListener('resize', resize); resize();
function bar(x, y, w, h, frac, color, label, right) {
  g.fillStyle = 'rgba(10,14,24,.7)'; g.fillRect(x, y, w, h);
  g.fillStyle = color; const fw = w * Math.max(0, Math.min(1, frac)); g.fillRect(right ? x + w - fw : x, y, fw, h);
  g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1.5; g.strokeRect(x, y, w, h);
  g.fillStyle = '#fff'; g.font = `600 ${h * 0.72}px sans-serif`; g.textBaseline = 'middle'; g.textAlign = right ? 'right' : 'left';
  g.fillText(label, right ? x + w - 8 : x + 8, y + h / 2 + 1);
}
function text(s, x, y, size, color, align = 'center') {
  g.font = `700 ${size}px -apple-system,"PingFang TC","Noto Sans TC",sans-serif`; g.textAlign = align; g.textBaseline = 'middle';
  g.lineWidth = size / 6; g.strokeStyle = 'rgba(0,0,0,.75)'; g.strokeText(s, x, y); g.fillStyle = color; g.fillText(s, x, y);
}
function drawHud(t, dt) {
  g.clearRect(0, 0, W, H); const u = Math.min(W, H) / 100;
  if (hurt > 0) { const r = g.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.8); r.addColorStop(0, 'rgba(255,0,0,0)'); r.addColorStop(1, `rgba(255,0,0,${hurt * 1.2})`); g.fillStyle = r; if (hurtSide < 0) g.fillRect(0, 0, W, H); else g.fillRect(hurtSide ? W / 2 : 0, 0, W / 2, H); }
  if (mode === 'setup') {
    text('請站到鏡頭前', W / 2, H * 0.3, u * 7, '#e9c46a');
    for (let i = 0; i < nPlayers; i++) text(`${NAMES[i]}　${states[i] && states[i].tracked ? '✓ 已找到' : '… 尋找中'}`, W / 2, H * 0.45 + i * u * 9, u * 5, CSS[i]);
    if (nPlayers === 2) text('左邊的人是玩家一，右邊是玩家二', W / 2, H * 0.72, u * 3.5, '#cdd6e6');
    return;
  }
  if (!fight) return;
  const bw = W * 0.34, bh = u * 4.5, pad = u * 3;
  const pk = kind === 'pk';
  if (pk) {
    fight.players.forEach((p, i) => {
      bar(i ? W - pad - bw : pad, pad + u * 4, bw, bh, p.hp / p.maxHp, '#2f9e44', `${Math.ceil(p.hp)}/${p.maxHp}`, !!i);
      text(NAMES[i], i ? W - pad : pad, pad + u * 1.5, u * 3.2, CSS[i], i ? 'right' : 'left');
      const stars = '★'.repeat(fight.wins[i]) + '☆'.repeat(CFG.winsNeeded - fight.wins[i]);
      text(stars, i ? W - pad : pad, pad + u * 11.5, u * 4, '#e9c46a', i ? 'right' : 'left');
    });
    text('VS', W / 2, pad + u * 6, u * 6, '#e9c46a'); text(`第 ${fight.round} 局`, W / 2, pad + u * 12, u * 3, '#fff');
  } else {
  fight.players.forEach((p, i) => {
      bar(pad, pad + u * 4 + i * (bh + u * 5.5), bw, bh, p.hp / CFG.maxHp, p.down ? '#666' : '#2f9e44', `${Math.ceil(p.hp)}/${CFG.maxHp}`);
      text(NAMES[i], pad, pad + u * 1.5 + i * (bh + u * 5.5), u * 3.2, CSS[i], 'left');
    });
    text('VS', W / 2, pad + u * 6, u * 6, '#e9c46a');
    bar(W - pad - bw, pad + u * 4, bw, bh, fight.monster.hp / CFG.monsterHp, '#c92a2a', `${Math.ceil(fight.monster.hp)}/${CFG.monsterHp}`, true);
    text('狼人', W - pad, pad + u * 1.5, u * 3.2, '#fff', 'right');
  }
  // 魔力
  fight.players.forEach((p, i) => {
    const right = nPlayers === 2 && i === 1, x = right ? W - pad - u * 6 : pad + u * 6, y = H - pad - u * 9;
    noMana[i] = Math.max(0, noMana[i] - dt);
    g.beginPath(); g.arc(x, y, u * 5, 0, Math.PI * 2); g.fillStyle = 'rgba(10,14,24,.6)'; g.fill();
    g.beginPath(); g.arc(x, y, u * 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p.mana / CFG.maxMana); g.strokeStyle = noMana[i] > 0 ? '#ff6b6b' : CSS[i]; g.lineWidth = u * 0.9; g.stroke();
    text('⚡', x, y, u * 5, '#fff'); text(`${Math.floor(p.mana)}/${CFG.maxMana}`, x, y + u * 8, u * 3.2, noMana[i] > 0 ? '#ff6b6b' : '#fff');
    const cx = right ? W * 0.75 : nPlayers === 2 ? W * 0.25 : W / 2;
    notes[i].t = Math.max(0, notes[i].t - dt);
    if (notes[i].t > 0) { g.globalAlpha = Math.min(1, notes[i].t * 2); text(notes[i].s, cx, H * 0.7, u * 5, CSS[i]); g.globalAlpha = 1; }
    if (p.stunT > 0) text(`被絆倒了！${Math.ceil(p.stunT)} 秒不能行動`, cx, H * 0.82, u * 3.6, '#ff8787');
    else if (p.down) text(`${NAMES[i]}倒下了　${Math.ceil(p.reviveT)} 秒後復活`, cx, H * 0.6, u * 4, '#ff8787');
    else if (p.raised && p.mana < CFG.maxMana) text('回復魔力中…', cx, H * 0.82, u * 3.6, CSS[i]);
    else if (noMana[i] > 0 || p.mana < CFG.attackCost) text('魔力不足！把魔杖舉高', cx, H * 0.82, u * 3.6, '#ff8787');
    else if (mode === 'play' && !mouseMode && states[i] && !states[i].tracked) text(`找不到${NAMES[i]}`, cx, H * 0.9, u * 3, '#ffd43b');
  });
  if (fight.monster && fight.monster.stunT > 0) text(`狼人被絆倒了！${Math.ceil(fight.monster.stunT)}`, W / 2, H * 0.3, u * 5, '#7dff8a');
  if (mode === 'play') text('畫圈＝防護罩　左右連揮＝絆倒　停住再揮＝強力', W / 2, H - u * 2.5, u * 2.4, 'rgba(255,255,255,.7)');
  // 反彈提示光圈
  for (const q of fight.projs) {
    if (q.reflected) continue;
    const v = impactPoint(q.target).project(camera), x = (v.x * .5 + .5) * W, y = (-v.y * .5 + .5) * H;
    const win = q.window || CFG.reflectWindow, hot = q.t <= win, r = u * 5 + u * 22 * Math.max(0, (q.t - win * 0.5) / q.total);
    g.beginPath(); g.arc(x, y, u * 5, 0, Math.PI * 2); g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = u * 0.4; g.stroke();
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.strokeStyle = hot ? '#ffe066' : CSS[q.target]; g.lineWidth = hot ? u * 1.2 : u * 0.7; g.stroke();
    if (hot) text('揮！', x, y - u * 9, u * 6, '#ffe066');
  }
  banner = Math.max(0, banner - dt);
  if (pk && fight.state === 'roundEnd') text(fight.roundWinner < 0 ? '平手！' : `${NAMES[fight.roundWinner]} 贏得這一局`, W / 2, H * 0.42, u * 9, fight.roundWinner < 0 ? '#fff' : CSS[fight.roundWinner]);
  else if (pk && mode === 'play' && banner > 0) text(`第 ${fight.round} 局　開始！`, W / 2, H * 0.42, u * 9, '#e9c46a');
  if (mode === 'end') {
    if (pk) text(`${NAMES[fight.winner]} 獲勝！`, W / 2, H * 0.42, u * 12, CSS[fight.winner]);
    else text(fight.state === 'win' ? '勝利！' : '失敗…', W / 2, H * 0.42, u * 14, fight.state === 'win' ? '#e9c46a' : '#ff8787');
    text(mouseMode ? '點一下再玩一次' : '把魔杖舉高 2 秒，再玩一次', W / 2, H * 0.6, u * 4.5, '#fff');
    if (endHold > 0) { g.fillStyle = '#e9c46a'; g.fillRect(W * 0.35, H * 0.67, W * 0.3 * Math.min(1, endHold / 2), u * 1.2); }
  }
}

// ---------- 主迴圈 ----------
let last = performance.now() / 1000;
function frame(now) {
  const t = now / 1000, dt = Math.min(0.05, t - last); last = t;
  if (mode !== 'menu') track(t);
  if (mode === 'setup') {
    const all = states.slice(0, nPlayers).every(s => s && s.tracked);
    readyT = all ? readyT + dt : 0; if (readyT > 1) newFight();
  } else if (mode === 'play') {
    const inputs = states.slice(0, nPlayers).map((s, i) => ({ raised: !!(s && s.raised), ...(pending[i] || {}) }));
    pending = [];
    handle(fight.step(dt, inputs));
    if (isOver(fight.state)) mode = 'end';
  } else if (mode === 'end') {
    pending = [];
    endHold = states.slice(0, nPlayers).some(s => s && s.raised) ? endHold + dt : 0;
    if (endHold >= 2) newFight();
  }
  if (mode !== 'menu') updateVisuals(t, dt);
  renderer.render(scene, camera); drawHud(t, dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------- 開始畫面與滑鼠備援 ----------
function begin(n, useMouse, k) {
  kind = k; nPlayers = k === 'pk' ? 2 : useMouse ? 1 : n; mouseMode = useMouse;
  pkOpts = [0, 1].map(i => ({ hp: +$(`#hp${i}`).value, regen: +$(`#rg${i}`).value }));
  trackers = Array.from({ length: nPlayers }, () => new WandTracker()); states = []; pending = []; hands = [];
  buildWands(nPlayers); $('#start').style.display = 'none'; readyT = 0; mode = 'setup';
  navigator.wakeLock?.request('screen').catch(() => {});
}
document.querySelectorAll('#start button').forEach(b => b.addEventListener('click', async () => {
  const n = +b.dataset.n, k = b.dataset.k || 'story', msg = $('#msg');
  try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); actx.resume(); } catch {}
  if (new URLSearchParams(location.search).has('mouse')) return begin(n, true, k);
  msg.textContent = '正在開啟鏡頭並載入追蹤模型…';
  try { await startCamera(); begin(n, false, k); }
  catch (e) { console.error(e); msg.textContent = '無法使用鏡頭，改用滑鼠試玩。'; setTimeout(() => begin(1, true, k), 900); }
}));
addEventListener('pointermove', e => { mouse.x = (e.clientX / W - 0.5) * 3; mouse.y = (0.55 - e.clientY / H) * 3; });
addEventListener('pointerdown', () => { if (!mouseMode) return; if (mode === 'end') newFight(); else pending[0] = { swing: true }; });
addEventListener('keydown', e => { if (e.code === 'Space') mouse.raised = true; if (e.code === 'ArrowUp') key2.raised = true; if (e.code === 'Enter' && !e.repeat) key2.swing = true;
  if (mouseMode && !e.repeat) { const a = { KeyS: { circle: true }, KeyT: { zigzag: true }, KeyP: { swing: true, power: true }, KeyK: { circle: true }, KeyL: { zigzag: true } }[e.code]; if (a) pending[e.code === 'KeyK' || e.code === 'KeyL' ? 1 : 0] = a; } });
addEventListener('keyup', e => { if (e.code === 'Space') mouse.raised = false; if (e.code === 'ArrowUp') key2.raised = false; });
if (new URLSearchParams(location.search).has('mouse')) window.__wiz = { get fight() { return fight; }, get mode() { return mode; } }; // 測試用

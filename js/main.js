import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';
import { CFG, ENEMIES, LEVELS, WandTracker, BodyTracker, Fight, Duel } from './logic.js';
import { noiseTex, glow, buildWorld, makeEnemy, makeProjectile } from './gfx.js';

const MP_VER = '0.10.14';
const MP_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VER}`;
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const COLORS = [0x66ddff, 0xffaa44];
const CSS = ['#66ddff', '#ffaa44'];
const NAMES = ['玩家一', '玩家二'];
const HINTS = ['狼人會到處走動，揮杖要對準牠', '小蜘蛛爬過來會咬人，先把牠們打掉', '巨魔的泥球又大又痛，記得往旁邊閃', '幽靈消失時打不到，等牠再冒出來',
  '骷髏分兩波，會一路往前逼近', '黑巫師有護盾，把他的魔法彈回去才能破盾'];
const STEP1 = 1.1, STEP2 = 0.45; // 往旁邊跨一步時，畫面／魔杖移動多少
const $ = s => document.querySelector(s);
const TEST = new URLSearchParams(location.search).has('mouse');

// ---------- 3D 場景 ----------
const renderer = new THREE.WebGLRenderer({ canvas: $('#gl'), antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.25;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 200);
const CAM0 = new THREE.Vector3(0, 1.6, 6);
camera.position.copy(CAM0); camera.lookAt(0, 1.3, 0); scene.add(camera);
const restCam = new THREE.Object3D(); restCam.position.copy(CAM0); restCam.lookAt(0, 1.3, 0); restCam.updateMatrixWorld();
const world = buildWorld(scene); world.set('forest');
new EXRLoader().load('assets/night.exr', tex => {
  const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromEquirectangular(tex).texture; tex.dispose(); pm.dispose();
}, undefined, () => {});
const assets = {};
new GLTFLoader().load('models/werewolf.glb', g => { assets.werewolf = g.scene; }, undefined, () => {});

// ---------- 魔杖 ----------
const wands = [];
function buildWands(n) {
  wands.forEach(w => { camera.remove(w.g); camera.remove(w.sh); }); wands.length = 0;
  for (let i = 0; i < n; i++) {
    const g = new THREE.Group(); camera.add(g);
    if (kind === 'pk') { g.position.set(i ? 2.5 : -2.5, -0.45, -3.2); g.scale.setScalar(1.7); }
    else g.position.set(n === 1 ? 0.3 : (i ? 0.6 : -0.6), -0.78, -1.5);
    g.userData.base = g.position.clone();
    const geo = new THREE.CylinderGeometry(0.011, 0.024, 0.95, 10); geo.rotateX(Math.PI / 2); geo.translate(0, 0, 0.475);
    g.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: noiseTex('#5a3a22', ['#3d2615', '#7a5232'], 2500), roughness: 0.6, emissive: 0x1a0f08 })));
    const tip = new THREE.Group(); tip.position.set(0, 0, 0.95); g.add(tip);
    const spr = glow(COLORS[i], 0.28); tip.add(spr);
    const light = new THREE.PointLight(COLORS[i], 1.2, 5, 2); tip.add(light);
    const sh = new THREE.Group(); camera.add(sh);
    if (kind === 'pk') { sh.position.set(i ? 1.75 : -1.75, -0.2, -3.2); sh.scale.setScalar(1.25); } else { sh.position.set(g.position.x * 0.9, -0.35, -1.5); sh.scale.setScalar(0.6); }
    sh.userData.base = sh.position.clone();
    sh.add(new THREE.Mesh(new THREE.SphereGeometry(0.6, 32, 20), new THREE.MeshBasicMaterial({ color: COLORS[i], transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })));
    sh.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.62, 2), new THREE.MeshBasicMaterial({ color: COLORS[i], wireframe: true, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false })));
    sh.visible = false;
    wands.push({ g, tip, spr, light, sh, aim: new THREE.Vector3(0, 1.4, 0), flash: 0 });
  }
}
const tipPos = i => wands[i].tip.getWorldPosition(new THREE.Vector3());
// 玩家 i 若站在 dodge 位置時，敵方魔法打到的點（以「沒移動的鏡頭」為準，所以玩家移開時魔法會從旁邊飛過）
function impactWorld(i, dodge = 0) {
  if (kind === 'pk') return camera.localToWorld(new THREE.Vector3(i ? 1.15 : -1.15, -0.1, -3.2));
  const bx = nPlayers === 1 ? 0 : (i ? 0.6 : -0.6), step = nPlayers === 1 ? STEP1 : STEP2;
  return restCam.localToWorld(new THREE.Vector3(bx + dodge * step, -0.15, -1.35));
}
const playerX = i => kind === 'pk' ? 0 : nPlayers === 1 ? camera.position.x : (i ? 0.6 : -0.6) + dodgeVis[i] * STEP2;

// ---------- 特效 ----------
const bolts = [], orbs = new Map(), sparks = [], flyers = [];
const boltMat = new THREE.MeshBasicMaterial({ color: 0xcfeaff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
function boltGeo(a, b, rad = 0.022) {
  const pts = []; const N = 9;
  for (let k = 0; k <= N; k++) { const p = a.clone().lerp(b, k / N); if (k && k < N) p.add(new THREE.Vector3((Math.random() - .5) * .35, (Math.random() - .5) * .35, (Math.random() - .5) * .2)); pts.push(p); }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, rad, 5);
}
function castBolt(i, to, power, color) {
  const rad = power ? 0.07 : 0.022, m = new THREE.Mesh(boltGeo(tipPos(i), to(), rad), boltMat); scene.add(m);
  bolts.push({ m, i, rad, to, life: power ? 0.35 : 0.2 }); wands[i].flash = 1; spark(to(), color ?? (power ? 0xffffff : COLORS[i]), power ? 3.2 : 1.6);
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
  reflect: () => tone('triangle', 600, 1800, 0.18, 0.25),
  throw: () => tone('sawtooth', 160, 70, 0.5, 0.18),
  hit: () => tone('square', 140, 35, 0.4, 0.25),
  nomana: () => tone('sine', 220, 180, 0.12, 0.1),
  shield: () => { tone('sine', 300, 900, 0.4, 0.2); tone('triangle', 450, 1350, 0.4, 0.1); },
  blocked: () => tone('triangle', 900, 500, 0.25, 0.25),
  trip: () => { tone('square', 500, 120, 0.3, 0.15); setTimeout(() => tone('square', 90, 40, 0.3, 0.25), 200); },
  power: () => { tone('sawtooth', 2000, 120, 0.4, 0.2); tone('square', 70, 30, 0.45, 0.2); },
  enemyHit: () => tone('sawtooth', 300, 60, 0.35, 0.22),
  dodge: () => tone('sine', 1100, 250, 0.3, 0.14),
  miss: () => tone('sine', 500, 300, 0.15, 0.08),
  clang: () => { tone('square', 1800, 1500, 0.2, 0.12); tone('triangle', 900, 700, 0.3, 0.12); },
  die: () => tone('sawtooth', 400, 40, 0.8, 0.2),
  spooky: () => tone('sine', 260, 520, 0.6, 0.1),
  bite: () => tone('square', 700, 200, 0.15, 0.2),
  win: () => [523, 659, 784, 1047].forEach((f, k) => setTimeout(() => tone('triangle', f, f, 0.35, 0.2), k * 140)),
  lose: () => [392, 330, 262].forEach((f, k) => setTimeout(() => tone('triangle', f, f * .9, 0.45, 0.2), k * 220)),
};

// ---------- 遊戲狀態 ----------
// mode：menu → setup（找人）→ play →（故事模式）clear 過關 → 下一關 … → end
let mode = 'menu', kind = 'story', pkOpts = [{}, {}], nPlayers = 1, fight = null, mouseMode = false, hurtSide = -1, banner = 0, levelIdx = 0, clearT = 0, allClear = false;
const isOver = st => st === 'win' || st === 'lose' || st === 'matchEnd';
let trackers = [], bodies = [], states = [], pending = [], hands = [];
let readyT = 0, endHold = 0, hurt = 0, shake = 0, noMana = [0, 0], dodgeVis = [0, 0], duckVis = [0, 0];
const mouse = { x: 0, y: 0.2, nx: 0, ny: 0, raised: false };
const keys = new Set();
const vis = new Map(); // 敵人 id → 3D 物件

const notes = [{ s: '', t: 0 }, { s: '', t: 0 }];
const note = (i, s) => { notes[i].s = s; notes[i].t = 1.2; };
function clearVisuals() {
  vis.forEach(o => scene.remove(o.g)); vis.clear();
  orbs.forEach(o => scene.remove(o.o.g)); orbs.clear();
  bolts.forEach(b => scene.remove(b.m)); bolts.length = 0;
  flyers.forEach(f => scene.remove(f.o.g)); flyers.length = 0;
}
function newFight(lv = levelIdx) {
  clearVisuals(); levelIdx = lv; allClear = false;
  if (kind === 'pk') { fight = new Duel(pkOpts); world.set('tower'); }
  else { fight = new Fight(nPlayers, lv); world.set(LEVELS[lv].scene); }
  bodies.forEach(b => b.reset()); notes.forEach(n => n.t = 0); hurt = 0; banner = kind === 'pk' ? 2 : 3.5; endHold = 0; mode = 'play';
  handle(fight.step(0, [])); // 開場生出的敵人
}
const enemyChest = id => { const o = vis.get(id); return o ? o.chest() : new THREE.Vector3(0, 1.5, 0); };
const aimPoint = x => new THREE.Vector3(x, 1.4, 0);
function handle(ev) {
  for (const e of ev) {
    switch (e.type) {
      case 'spawn': { const en = fight.enemies.find(o => o.id === e.id); if (en) { const o = makeEnemy(en.kind, assets); scene.add(o.g); vis.set(en.id, o); } break; }
      case 'bolt': castBolt(e.player, () => enemyChest(e.id), e.power); e.power ? sfx.power() : sfx.bolt(); if (e.power) note(e.player, '強力閃電！'); break;
      case 'miss': { const p = aimPoint(e.x); castBolt(e.player, () => p, e.power, 0x88aacc); sfx.miss(); note(e.player, '沒打中，對準一點！'); break; }
      case 'shielded': castBolt(e.player, () => enemyChest(e.id), e.power, 0xb24bff); sfx.clang(); note(e.player, '被護盾擋住！把魔法彈回去'); break;
      case 'shieldBreak': spark(enemyChest(e.id), 0xffffff, 4); sfx.power(); note(0, '護盾破了！快攻擊！'); break;
      case 'enemyHit': sfx.enemyHit(); break;
      case 'enemyDie': { const o = vis.get(e.id); if (o && !o.dying) { o.dying = 0.001; if (!e.bite) { spark(o.chest(), 0xffffff, 2.5); sfx.die(); } } break; }
      case 'vanish': sfx.spooky(); break;
      case 'appear': { const o = vis.get(e.id); if (o) o.snap = true; sfx.spooky(); break; }
      case 'wave': if (e.n > 1) { banner = 2.5; } break;
      case 'shield': sfx.shield(); note(e.player, '防護罩！'); break;
      case 'blocked': spark(impactWorld(e.player, fight.players[e.player].dodgeX || 0), COLORS[e.player], 2); sfx.blocked(); note(e.player, '擋住了！'); break;
      case 'dodged': { const o = orbs.get(e.id); if (o) { orbs.delete(e.id); flyers.push({ o: o.o, v: o.vel.clone(), life: 0.6 }); } sfx.dodge(); note(e.player, '閃過了！'); break; }
      case 'trip': sfx.trip(); note(e.player, '絆倒咒！'); if (kind !== 'pk') spark(enemyChest(e.id).setY(0.3), 0x7dff8a, 3); break;
      case 'immune': sfx.nomana(); note(e.player, '暫時不會再被絆倒'); break;
      case 'nomana': noMana[e.player] = 0.6; sfx.nomana(); break;
      case 'throw': { const q = fight.projs.find(o => o.id === e.id); const p = makeProjectile(q ? q.kind : 'werewolf'); const from = enemyChest(e.from).add(new THREE.Vector3(0, 0.25, 0.2)); p.g.position.copy(from); scene.add(p.g); orbs.set(e.id, { o: p, from, vel: new THREE.Vector3() }); sfx.throw(); break; }
      case 'shoot': { if (e.power) note(e.player, '強力光球！'); const s = { g: glow(e.power ? 0xffffff : COLORS[e.player], e.power ? 1.3 : 0.8), update() {} }; s.spr = s.g; s.g.position.copy(tipPos(e.player)); scene.add(s.g); orbs.set(e.id, { o: s, from: s.g.position.clone(), vel: new THREE.Vector3() }); wands[e.player].flash = 1; e.power ? sfx.power() : sfx.bolt(); break; }
      case 'roundEnd': case 'matchEnd': sfx.win(); break;
      case 'roundStart': banner = 2; break;
      case 'reflect': { const o = orbs.get(e.id); if (o) { o.from = o.o.g.position.clone(); o.o.spr.material.color.set(COLORS[e.player]); spark(o.from, COLORS[e.player], 1.2); } wands[e.player].flash = 1; sfx.reflect(); note(e.player, '彈回去了！'); break; }
      case 'reflectHit': spark(enemyChest(e.enemy), 0xffffff, 2.4); break;
      case 'hit': case 'bite': hurt = 0.5; hurtSide = kind === 'pk' ? e.player : (nPlayers === 2 ? e.player : -1); shake = kind === 'pk' ? 0.15 : 0.35; if (kind === 'pk') spark(impactWorld(e.player), 0xff5555, 1.6); e.type === 'bite' ? (sfx.bite(), note(e.player, '被小蜘蛛咬了！')) : sfx.hit(); break;
      case 'win': sfx.win(); break;
      case 'lose': sfx.lose(); break;
    }
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
  const sw = Math.hypot(ls.x - rs.x, ls.y - rs.y); if (sw < 0.02) return { wand: null, body: null };
  const body = { nose: P(0), shoulderC: { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 }, sw };
  const ok = k => w[k].v > 0.5;
  let h = hands[i];
  if (h == null || !ok(h)) h = ok(0) && ok(1) ? (w[0].y < w[1].y ? 0 : 1) : ok(0) ? 0 : ok(1) ? 1 : null;
  else if (ok(1 - h) && w[1 - h].y < w[h].y - 0.3 * sw) h = 1 - h; // 另一隻手明顯舉得更高才換手
  if (h !== hands[i]) { hands[i] = h; trackers[i].reset(); }
  // 瞄準以拿魔杖那一側的肩膀為準：手自然垂下＝瞄正前方
  return { wand: h == null ? null : { wrist: w[h], nose: body.nose, shoulderC: h === 0 ? ls : rs, sw }, body };
}
const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
function track(t) {
  if (mouseMode) {
    ray.setFromCamera(new THREE.Vector2(mouse.nx, mouse.ny), camera); const hit = new THREE.Vector3();
    const wx = ray.ray.intersectPlane(plane, hit) ? hit.x : 0;
    states[0] = { tracked: true, raised: mouse.raised, aimX: mouse.x, aimY: mouse.y, aimWorld: wx, dodgeX: (keys.has('KeyE') ? 1 : 0) - (keys.has('KeyQ') ? 1 : 0), duck: keys.has('KeyC') };
    if (nPlayers === 2) states[1] = { tracked: true, raised: keys.has('ArrowUp'), aimX: 0, aimY: 0.2, aimWorld: null, dodgeX: (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0), duck: keys.has('ArrowDown') };
    return;
  }
  if (!landmarker || video.readyState < 2 || video.currentTime === lastVT) return;
  lastVT = video.currentTime;
  let res; try { res = landmarker.detectForVideo(video, performance.now()); } catch { return; }
  const poses = (res.landmarks || []).map(lm => ({ lm, cx: 1 - (lm[11].x + lm[12].x) / 2, w: Math.abs(lm[11].x - lm[12].x) }));
  const slot = [null, null];
  if (nPlayers === 1) slot[0] = poses.sort((p, q) => q.w - p.w)[0] || null; // 一人：取最靠近鏡頭的人
  else {
    poses.sort((p, q) => p.cx - q.cx);
    if (poses.length >= 2) { slot[0] = poses[0]; slot[1] = poses[poses.length - 1]; }
    else if (poses.length === 1) slot[poses[0].cx < 0.5 ? 0 : 1] = poses[0]; // 只看到一人：依站的那一側決定是誰
  }
  for (let i = 0; i < nPlayers; i++) {
    const r = slot[i] ? readPose(slot[i].lm, i) : { wand: null, body: null };
    const s = trackers[i].update(t, r.wand), b = bodies[i].update(r.body);
    if (s.swing || s.zigzag || s.circle) { const p = pending[i] || {}; pending[i] = { swing: s.swing || p.swing, power: s.power || p.power, zigzag: s.zigzag || p.zigzag, circle: s.circle || p.circle }; }
    states[i] = { ...s, ...b, aimWorld: null };
  }
}
// 魔杖指向的世界 x 座標（敵人那一排）
function aimWorld(i) {
  const s = states[i] || {};
  if (s.aimWorld != null) return s.aimWorld;
  return THREE.MathUtils.clamp(playerX(i) + (s.aimX || 0) * 1.6, -3.6, 3.6);
}

// ---------- 畫面更新 ----------
const tmp = new THREE.Vector3();
function updateVisuals(t, dt) {
  world.update(t, dt);
  // 玩家位置（跨步、蹲下）
  for (let i = 0; i < nPlayers; i++) {
    const s = states[i] || {}, k = 1 - Math.exp(-dt * 10);
    dodgeVis[i] += ((kind === 'pk' ? 0 : s.dodgeX || 0) - dodgeVis[i]) * k; duckVis[i] += ((s.duck ? 1 : 0) - duckVis[i]) * k;
  }
  shake = Math.max(0, shake - dt); hurt = Math.max(0, hurt - dt);
  const one = kind !== 'pk' && nPlayers === 1;
  camera.position.set((one ? dodgeVis[0] * STEP1 : 0) + (Math.random() - .5) * shake * 0.25, 1.6 - (one ? duckVis[0] * 0.55 : 0) + (Math.random() - .5) * shake * 0.25, 6);
  // 魔杖
  wands.forEach((w, i) => {
    const s = states[i] || {}, p = fight && fight.players[i];
    const raised = s.raised && !(p && p.down), stunned = p && p.stunT > 0;
    if (!one) { w.g.position.copy(w.g.userData.base); w.sh.position.copy(w.sh.userData.base); const dx = kind === 'pk' ? 0 : dodgeVis[i] * STEP2, dy = -duckVis[i] * (kind === 'pk' ? 0.9 : 0.35); w.g.position.x += dx; w.g.position.y += dy; w.sh.position.x += dx; w.sh.position.y += dy; }
    w.sh.visible = !!(p && p.shieldT > 0); if (w.sh.visible) { w.sh.rotation.y = t * 1.5; w.sh.rotation.x = t * 0.7; const k = Math.min(1, p.shieldT) * (0.9 + 0.1 * Math.sin(t * 12)); w.sh.children[0].material.opacity = 0.16 * k; w.sh.children[1].material.opacity = 0.45 * k; }
    if (stunned) tmp.copy(camera.localToWorld(new THREE.Vector3(w.g.position.x * 0.6, -3, -3.2)));
    else if (kind === 'pk') tmp.copy(camera.localToWorld(raised ? new THREE.Vector3(w.g.position.x * 0.8, 3, -3.2) : new THREE.Vector3(0, -0.45 + THREE.MathUtils.clamp((s.aimY || 0) * 0.9, -0.8, 1.6), -3.2)));
    else if (raised) tmp.copy(camera.localToWorld(new THREE.Vector3(w.g.position.x * 0.6, 2.2, -1.6)));
    else tmp.set(aimWorld(i), THREE.MathUtils.clamp(1.3 + (s.aimY || 0) * 1.0, 0.2, 3.2), 0.3);
    w.aim.lerp(tmp, 1 - Math.exp(-dt * 14)); w.g.lookAt(w.aim);
    w.flash = Math.max(0, w.flash - dt * 4);
    const charge = raised ? 0.6 + 0.4 * Math.sin(t * 18) : (s.charged && !stunned ? 0.45 + 0.1 * Math.sin(t * 8) : 0);
    w.spr.scale.setScalar(0.25 + w.flash * 0.6 + charge * 0.7); w.light.intensity = 1.2 + w.flash * 8 + charge * 6;
    w.g.visible = !(p && p.down);
  });
  // 閃電與火花
  for (let k = bolts.length - 1; k >= 0; k--) {
    const b = bolts[k]; b.life -= dt; b.m.geometry.dispose();
    if (b.life <= 0) { scene.remove(b.m); bolts.splice(k, 1); } else b.m.geometry = boltGeo(tipPos(b.i), b.to(), b.rad);
  }
  for (let k = sparks.length - 1; k >= 0; k--) {
    const s = sparks[k]; s.life -= dt; const f = Math.max(0, s.life / 0.25);
    s.s.scale.setScalar(s.size * (1.4 - f * 0.4)); s.s.material.opacity = f; s.l.intensity = 6 * f;
    if (s.life <= 0) { scene.remove(s.s); scene.remove(s.l); sparks.splice(k, 1); }
  }
  // 敵人
  if (fight && fight.enemies) {
    const alive = new Set();
    for (const e of fight.enemies) {
      let o = vis.get(e.id);
      if (!o) { o = makeEnemy(e.kind, assets); scene.add(o.g); vis.set(e.id, o); }
      alive.add(e.id); o.update(t, dt, e, camera.position);
    }
    vis.forEach((o, id) => {
      if (alive.has(id)) return;
      if (!o.dying) o.dying = 0.001;
      o.update(t, dt, o.last || { x: o.g.position.x, z: o.g.position.z, attackT: 0, hitT: 0, stunT: 0, def: {} }, camera.position);
      if (o.dying > 1.6) { scene.remove(o.g); vis.delete(id); }
    });
    fight.enemies.forEach(e => { const o = vis.get(e.id); if (o) o.last = e; });
  }
  // 魔法彈
  if (fight) {
    const live = new Set();
    for (const q of fight.projs) {
      const o = orbs.get(q.id); if (!o) continue; live.add(q.id);
      const before = o.o.g.position.clone(), k = 1 - q.t / q.total;
      if (kind === 'pk') { o.o.g.position.lerpVectors(o.from, impactWorld(q.target), k); o.o.g.position.y += Math.sin(k * Math.PI) * 0.3; }
      else if (q.reflected) o.o.g.position.lerpVectors(o.from, enemyChest(q.from), 1 - q.t / CFG.reflectReturn);
      else { o.o.g.position.lerpVectors(o.from, impactWorld(q.target, q.aimX), k); o.o.g.position.y += Math.sin(k * Math.PI) * 0.5; }
      o.vel.copy(o.o.g.position).sub(before).divideScalar(Math.max(dt, 1e-3));
      o.o.update(t);
    }
    orbs.forEach((o, id) => { if (!live.has(id)) { scene.remove(o.o.g); orbs.delete(id); } });
  }
  for (let k = flyers.length - 1; k >= 0; k--) { // 被閃過的魔法繼續往後飛走
    const f = flyers[k]; f.life -= dt; f.o.g.position.addScaledVector(f.v, dt); f.o.update(t);
    if (f.life <= 0) { scene.remove(f.o.g); flyers.splice(k, 1); }
  }
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
  if (!label) return;
  g.fillStyle = '#fff'; g.font = `600 ${h * 0.72}px sans-serif`; g.textBaseline = 'middle'; g.textAlign = right ? 'right' : 'left';
  g.fillText(label, right ? x + w - 8 : x + 8, y + h / 2 + 1);
}
function text(s, x, y, size, color, align = 'center') {
  g.font = `700 ${size}px -apple-system,"PingFang TC","Noto Sans TC",sans-serif`; g.textAlign = align; g.textBaseline = 'middle';
  g.lineWidth = size / 6; g.strokeStyle = 'rgba(0,0,0,.75)'; g.strokeText(s, x, y); g.fillStyle = color; g.fillText(s, x, y);
}
const toScreen = v => { const p = v.clone().project(camera); return { x: (p.x * .5 + .5) * W, y: (-p.y * .5 + .5) * H, front: p.z < 1 }; };
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
  const bw = W * 0.34, bh = u * 4.5, pad = u * 3, pk = kind === 'pk';
  if (pk) {
    fight.players.forEach((p, i) => {
      bar(i ? W - pad - bw : pad, pad + u * 4, bw, bh, p.hp / p.maxHp, '#2f9e44', `${Math.ceil(p.hp)}/${p.maxHp}`, !!i);
      text(NAMES[i], i ? W - pad : pad, pad + u * 1.5, u * 3.2, CSS[i], i ? 'right' : 'left');
      text('★'.repeat(fight.wins[i]) + '☆'.repeat(CFG.winsNeeded - fight.wins[i]), i ? W - pad : pad, pad + u * 11.5, u * 4, '#e9c46a', i ? 'right' : 'left');
    });
    text('VS', W / 2, pad + u * 6, u * 6, '#e9c46a'); text(`第 ${fight.round} 局`, W / 2, pad + u * 12, u * 3, '#fff');
  } else {
    fight.players.forEach((p, i) => {
      bar(pad, pad + u * 4 + i * (bh + u * 5.5), bw, bh, p.hp / CFG.maxHp, p.down ? '#666' : '#2f9e44', `${Math.ceil(p.hp)}/${CFG.maxHp}`);
      text(NAMES[i], pad, pad + u * 1.5 + i * (bh + u * 5.5), u * 3.2, CSS[i], 'left');
    });
    text(`第 ${levelIdx + 1} 關`, W / 2, pad + u * 3, u * 3.2, '#e9c46a'); text(LEVELS[levelIdx].name, W / 2, pad + u * 7.5, u * 2.8, '#cdd6e6');
    const lv = LEVELS[levelIdx], boss = fight.boss;
    if (boss) { bar(W - pad - bw, pad + u * 4, bw, bh, boss.hp / boss.maxHp, '#c92a2a', `${Math.ceil(boss.hp)}/${boss.maxHp}`, true); text(boss.def.name + (boss.def.shield ? (boss.shieldDownT > 0 ? '　護盾破了！' : '　🛡 護盾') : ''), W - pad, pad + u * 1.5, u * 3.2, '#fff', 'right'); }
    else if (lv.waves) {
      const left = fight.enemies.filter(e => !e.dead), hp = left.reduce((a, e) => a + e.hp, 0), max = lv.waves[fight.waveIdx].length * ENEMIES.skeleton.hp;
      bar(W - pad - bw, pad + u * 4, bw, bh, hp / max, '#c92a2a', `剩 ${left.length} 隻`, true);
      text(`骷髏　第 ${fight.waveIdx + 1}/${lv.waves.length} 波`, W - pad, pad + u * 1.5, u * 3.2, '#fff', 'right');
    }
    // 小怪頭上的血條、被絆倒提示
    for (const e of fight.enemies) {
      if (e.dead || e.hidden) continue; const o = vis.get(e.id); if (!o) continue;
      const s = toScreen(o.g.position.clone().setY(o.chestY + (e.kind === 'spiderling' ? 0.5 : 1.3))); if (!s.front) continue;
      if (!e.boss) bar(s.x - u * 4, s.y, u * 8, u * 1, e.hp / e.maxHp, '#ff6b6b');
      if (e.stunT > 0) text(`絆倒！${Math.ceil(e.stunT)}`, s.x, s.y - u * 3, u * 3.5, '#7dff8a');
    }
  }
  // 魔力、提示、站位
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
    // 站位指示：小點顯示你現在往左／右跨了多少，蹲下時變成「蹲」
    if (mode === 'play') {
      const tx = cx, ty = H - u * 7, tw = u * 14;
      g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = u * 0.5; g.beginPath(); g.moveTo(tx - tw / 2, ty); g.lineTo(tx + tw / 2, ty); g.stroke();
      if (!pk) for (const m of [-1, 0, 1]) { g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(tx + m * tw / 2 - 1, ty - u, 2, u * 2); }
      const dx = pk ? 0 : dodgeVis[i];
      g.beginPath(); g.arc(tx + dx * tw / 2, ty, u * 1.3, 0, Math.PI * 2); g.fillStyle = CSS[i]; g.fill();
      if (duckVis[i] > 0.5) text('蹲', tx + dx * tw / 2, ty - u * 3, u * 2.8, CSS[i]);
    }
  });
  if (mode === 'play') text(pk ? '蹲下＝閃躲　畫圈＝防護罩　左右連揮＝絆倒　停住再揮＝強力' : '跨一步／蹲下＝閃躲　畫圈＝防護罩　左右連揮＝絆倒　停住再揮＝強力', W / 2, H - u * 2.2, u * 2.3, 'rgba(255,255,255,.7)');
  // 反彈提示光圈（畫在魔法會打到的位置；你移開了，光圈就不在你面前）
  for (const q of fight.projs) {
    if (q.reflected) continue;
    const s = toScreen(impactWorld(q.target, q.aimX ?? 0));
    const win = q.window || CFG.reflectWindow, hot = q.t <= win, r = u * 5 + u * 22 * Math.max(0, (q.t - win * 0.5) / q.total);
    const mine = pk || nPlayers === 2 || Math.abs((fight.players[q.target].dodgeX || 0) - (q.aimX ?? 0)) < CFG.dodgeHit;
    g.globalAlpha = mine ? 1 : 0.35;
    g.beginPath(); g.arc(s.x, s.y, u * 5, 0, Math.PI * 2); g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = u * 0.4; g.stroke();
    g.beginPath(); g.arc(s.x, s.y, r, 0, Math.PI * 2); g.strokeStyle = hot ? '#ffe066' : CSS[q.target]; g.lineWidth = hot ? u * 1.2 : u * 0.7; g.stroke();
    if (hot && mine) text('揮！', s.x, s.y - u * 9, u * 6, '#ffe066');
    g.globalAlpha = 1;
  }
  banner = Math.max(0, banner - dt);
  if (pk && fight.state === 'roundEnd') text(fight.roundWinner < 0 ? '平手！' : `${NAMES[fight.roundWinner]} 贏得這一局`, W / 2, H * 0.42, u * 9, fight.roundWinner < 0 ? '#fff' : CSS[fight.roundWinner]);
  else if (pk && mode === 'play' && banner > 0) text(`第 ${fight.round} 局　開始！`, W / 2, H * 0.42, u * 9, '#e9c46a');
  else if (!pk && mode === 'play' && banner > 0) {
    g.globalAlpha = Math.min(1, banner * 1.5);
    if (fight.level.waves && fight.waveIdx > 0) text(`第 ${fight.waveIdx + 1} 波來了！`, W / 2, H * 0.4, u * 9, '#ff8787');
    else { text(`第 ${levelIdx + 1} 關　${LEVELS[levelIdx].name}`, W / 2, H * 0.38, u * 9, '#e9c46a'); text(HINTS[levelIdx], W / 2, H * 0.5, u * 4, '#fff'); }
    g.globalAlpha = 1;
  }
  if (mode === 'clear') { text(`第 ${levelIdx + 1} 關完成！`, W / 2, H * 0.4, u * 11, '#e9c46a'); text(`下一關：${LEVELS[levelIdx + 1].name}`, W / 2, H * 0.55, u * 5, '#fff'); }
  if (mode === 'end') {
    if (pk) text(`${NAMES[fight.winner]} 獲勝！`, W / 2, H * 0.42, u * 12, CSS[fight.winner]);
    else if (allClear) { text('全部通關！', W / 2, H * 0.36, u * 13, '#e9c46a'); text('你們是真正的大巫師！', W / 2, H * 0.5, u * 5.5, '#fff'); }
    else text('失敗…', W / 2, H * 0.42, u * 14, '#ff8787');
    const what = pk || allClear ? '再玩一次' : '重試這一關';
    text(mouseMode ? `點一下${what}` : `把魔杖舉高 2 秒，${what}`, W / 2, H * 0.62, u * 4.5, '#fff');
    if (endHold > 0) { g.fillStyle = '#e9c46a'; g.fillRect(W * 0.35, H * 0.68, W * 0.3 * Math.min(1, endHold / 2), u * 1.2); }
  }
}

// ---------- 主迴圈 ----------
let last = performance.now() / 1000;
function inputsNow() {
  return states.slice(0, nPlayers).map((s, i) => ({ raised: !!(s && s.raised), dodgeX: (s && s.dodgeX) || 0, duck: !!(s && s.duck), aim: kind === 'pk' ? null : aimWorld(i), ...(pending[i] || {}) }));
}
function replay() { if (kind === 'pk' || !allClear) newFight(levelIdx); else newFight(0); }
function frame(now) {
  const t = now / 1000, dt = Math.min(0.05, t - last); last = t;
  if (mode !== 'menu') track(t);
  if (mode === 'setup') {
    const all = states.slice(0, nPlayers).every(s => s && s.tracked);
    readyT = all ? readyT + dt : 0; if (readyT > 1) newFight(levelIdx);
  } else if (mode === 'play') {
    const inputs = inputsNow(); pending = [];
    handle(fight.step(dt, inputs));
    if (isOver(fight.state)) {
      if (kind !== 'pk' && fight.state === 'win' && levelIdx + 1 < LEVELS.length) { mode = 'clear'; clearT = 4; }
      else { mode = 'end'; allClear = kind !== 'pk' && fight.state === 'win'; }
    }
  } else if (mode === 'clear') {
    pending = []; clearT -= dt; if (clearT <= 0) newFight(levelIdx + 1);
  } else if (mode === 'end') {
    pending = [];
    endHold = states.slice(0, nPlayers).some(s => s && s.raised) ? endHold + dt : 0;
    if (endHold >= 2) replay();
  }
  if (mode !== 'menu') updateVisuals(t, dt);
  renderer.render(scene, camera); drawHud(t, dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------- 開始畫面與滑鼠鍵盤備援 ----------
function begin(n, useMouse, k) {
  kind = k; nPlayers = k === 'pk' ? 2 : n; mouseMode = useMouse;
  if (useMouse && k !== 'pk') nPlayers = Math.min(n, 2);
  levelIdx = +($('#lv')?.value || 0);
  pkOpts = [0, 1].map(i => ({ hp: +$(`#hp${i}`).value, regen: +$(`#rg${i}`).value }));
  trackers = Array.from({ length: nPlayers }, () => new WandTracker()); bodies = Array.from({ length: nPlayers }, () => new BodyTracker());
  states = []; pending = []; hands = []; dodgeVis = [0, 0]; duckVis = [0, 0];
  buildWands(nPlayers); $('#start').style.display = 'none'; readyT = 0; mode = 'setup';
  navigator.wakeLock?.request('screen').catch(() => {});
}
document.querySelectorAll('#start button').forEach(b => b.addEventListener('click', async () => {
  const n = +b.dataset.n, k = b.dataset.k || 'story', msg = $('#msg');
  try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); actx.resume(); } catch {}
  if (TEST) return begin(n, true, k);
  msg.textContent = '正在開啟鏡頭並載入追蹤模型…';
  try { await startCamera(); begin(n, false, k); }
  catch (e) { console.error(e); msg.textContent = '無法使用鏡頭，改用滑鼠和鍵盤試玩。'; setTimeout(() => begin(n, true, k), 900); }
}));
addEventListener('pointermove', e => { mouse.x = (e.clientX / W - 0.5) * 3; mouse.y = (0.55 - e.clientY / H) * 3; mouse.nx = e.clientX / W * 2 - 1; mouse.ny = -(e.clientY / H * 2 - 1); });
addEventListener('pointerdown', () => { if (!mouseMode) return; if (mode === 'end') replay(); else pending[0] = { swing: true }; });
addEventListener('keydown', e => {
  keys.add(e.code);
  if (e.code === 'Space') mouse.raised = true;
  if (!mouseMode || e.repeat) return;
  const a = { KeyS: [0, { circle: true }], KeyT: [0, { zigzag: true }], KeyP: [0, { swing: true, power: true }], Enter: [1, { swing: true }], KeyK: [1, { circle: true }], KeyL: [1, { zigzag: true }] }[e.code];
  if (a && a[0] < nPlayers) pending[a[0]] = a[1];
});
addEventListener('keyup', e => { keys.delete(e.code); if (e.code === 'Space') mouse.raised = false; });
if (TEST) window.__wiz = { get fight() { return fight; }, get mode() { return mode; }, get level() { return levelIdx; }, go: lv => newFight(lv), vis, orbs, scene, camera, THREE }; // 測試用

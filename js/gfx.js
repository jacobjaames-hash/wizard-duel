// 畫面：六個場景、各種怪物的 3D 模型（程式產生）與動畫、魔法彈外觀
import * as THREE from 'three';

const R = Math.random;
export function noiseTex(base, spots, n, size = 256) {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, size, size);
  for (let i = 0; i < n; i++) { g.fillStyle = spots[i % spots.length]; g.fillRect(R() * size, R() * size, 1 + R() * 2, 2 + R() * 5); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}
// 石磚／石板貼圖
function brickTex(base, mortar, rows = 8, cols = 4, jitter = ['#00000022', '#ffffff10']) {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  g.fillStyle = mortar; g.fillRect(0, 0, 256, 256);
  const h = 256 / rows, w = 256 / cols;
  for (let r = 0; r < rows; r++) for (let k = -1; k <= cols; k++) {
    const x = k * w + (r % 2 ? w / 2 : 0);
    g.fillStyle = base; g.fillRect(x + 2, r * h + 2, w - 4, h - 4);
    g.fillStyle = jitter[(r + k + 9) % jitter.length]; g.fillRect(x + 2, r * h + 2, w - 4, h - 4);
    for (let s = 0; s < 40; s++) { g.fillStyle = R() < .5 ? '#00000018' : '#ffffff0c'; g.fillRect(x + 2 + R() * (w - 6), r * h + 2 + R() * (h - 6), 2, 2); }
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}
function glowTex() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,.6)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c);
}
export const GLOW = glowTex();
export const glow = (color, size) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); s.scale.setScalar(size); return s; };
const std = o => new THREE.MeshStandardMaterial(o);
function add(parent, geo, mat, p = [0, 0, 0], r = [0, 0, 0], s = null, shadow = true) {
  const m = new THREE.Mesh(geo, mat); m.position.set(...p); m.rotation.set(...r); if (s) m.scale.set(...s);
  m.castShadow = shadow; m.receiveShadow = shadow; parent.add(m); return m;
}
const clearOfPlay = (x, z) => !(Math.abs(x) < 4.5 && z > -6) && !(z > 1 && Math.abs(x) < 8); // 不要擋住戰鬥區和鏡頭

// ================= 場景 =================
export function buildWorld(scene) {
  scene.background = new THREE.Color(0x0a1222); scene.fog = new THREE.FogExp2(0x0a1222, 0.05);
  const hemi = new THREE.HemisphereLight(0x8fa4d8, 0x141c10, 0.75); scene.add(hemi);
  const moon = new THREE.DirectionalLight(0xb8c8ff, 1.9); moon.position.set(-6, 10, 5); moon.castShadow = true;
  moon.shadow.mapSize.set(1024, 1024); Object.assign(moon.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 30 });
  scene.add(moon);
  const S = {}, mistAll = [];
  const mist = (group, color, n, opacity = 0.14) => {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ color, transparent: true, opacity: opacity * (0.7 + R() * 0.6), depthWrite: false }));
      m.position.set((R() - .5) * 18, 0.4 + R() * 0.8, -7 + R() * 9); m.scale.set(6 + R() * 4, 2 + R(), 1);
      m.userData.v = (R() - .5) * 0.25; m.visible = false; group.add(m); mistAll.push(m);
    }
  };
  new THREE.TextureLoader().load('assets/cloud.webp', tex => mistAll.forEach(m => { m.material.map = tex; m.material.needsUpdate = true; m.visible = true; }), undefined, () => {});
  const ground = (group, tex, rep, size = 120) => { tex.repeat.set(rep, rep); const m = add(group, new THREE.PlaneGeometry(size, size), std({ map: tex, roughness: 1 }), [0, 0, 0], [-Math.PI / 2, 0, 0], null, false); m.receiveShadow = true; return m; };
  const moonDisc = (group, color, haloColor, pos) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(3, 24, 24), new THREE.MeshBasicMaterial({ color, fog: false })); m.position.set(...pos); group.add(m);
    const h = glow(haloColor, 30); h.material.fog = false; h.position.copy(m.position); group.add(h);
  };
  const deadTree = (group, x, z, mat, h = 4 + R() * 3) => {
    const t = new THREE.Group(); t.position.set(x, 0, z); t.rotation.y = R() * 6; group.add(t);
    add(t, new THREE.CylinderGeometry(0.1, 0.3, h, 6), mat, [0, h / 2, 0], [(R() - .5) * 0.2, 0, (R() - .5) * 0.2]);
    for (let k = 0; k < 4; k++) { const y = h * (0.45 + k * 0.13), len = 1 + R() * 1.4, a = R() * 6; add(t, new THREE.CylinderGeometry(0.03, 0.08, len, 5), mat, [Math.cos(a) * len * 0.35, y + len * 0.3, Math.sin(a) * len * 0.35], [Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9]); }
  };

  { // 1 黑森林
    const g = new THREE.Group(); scene.add(g);
    ground(g, noiseTex('#22331c', ['#2e4524', '#1a2815', '#3a5230', '#16210f'], 9000), 24);
    const bark = std({ map: noiseTex('#2b2118', ['#1c150f', '#3a2d21'], 4000), roughness: 1 }), leaf = std({ color: 0x14261a, roughness: 1 });
    for (let i = 0; i < 70; i++) {
      const a = R() * Math.PI * 2, r = 5 + R() * 32, x = Math.cos(a) * r, z = Math.sin(a) * r - 6;
      if (!clearOfPlay(x, z)) continue;
      const h = 5 + R() * 5; add(g, new THREE.CylinderGeometry(0.18, 0.38, h, 7), bark, [x, h / 2, z]);
      for (let k = 0; k < 3; k++) add(g, new THREE.ConeGeometry(2.2 - k * 0.5, 3, 8), leaf, [x, h * 0.55 + k * 1.6, z]);
    }
    moonDisc(g, 0xe8ecff, 0x9fb4ff, [-18, 22, -60]); mist(g, 0x9fb2d8, 14);
    S.forest = { g, bg: 0x0a1222, fog: [0x0a1222, 0.05], hemi: [0x8fa4d8, 0x141c10, 0.75], moon: [0xb8c8ff, 1.9] };
  }
  { // 2 蜘蛛洞穴
    const g = new THREE.Group(); scene.add(g);
    const rockTex = noiseTex('#2a2630', ['#1d1a22', '#37323d', '#14121a', '#433b4a'], 9000);
    ground(g, rockTex.clone(), 14);
    const wallTex = rockTex.clone(); wallTex.repeat.set(10, 3); wallTex.needsUpdate = true;
    const rock = std({ map: wallTex, roughness: 1, side: THREE.BackSide });
    add(g, new THREE.CylinderGeometry(15, 15, 16, 40, 1, true), rock, [0, 7, -3], [0, 0, 0], null, false);
    add(g, new THREE.CircleGeometry(15, 40), std({ color: 0x0c0a10, roughness: 1 }), [0, 12, -3], [Math.PI / 2, 0, 0], null, false);
    const stone = std({ map: rockTex, roughness: 0.95 });
    for (let i = 0; i < 60; i++) {
      const x = (R() - .5) * 26, z = -14 + R() * 18; if (!clearOfPlay(x, z)) continue;
      const h = 0.6 + R() * 2.6; add(g, new THREE.ConeGeometry(0.25 + R() * 0.5, h, 7), stone, [x, h / 2, z]);
    }
    for (let i = 0; i < 50; i++) { const h = 0.8 + R() * 2.5; add(g, new THREE.ConeGeometry(0.2 + R() * 0.4, h, 7), stone, [(R() - .5) * 26, 12 - h / 2, -14 + R() * 18], [Math.PI, 0, 0], null, false); }
    const crystals = [];
    [[-6, -6, 0xb26bff], [6.5, -4, 0x4fe0ff], [-4, -11, 0x4fe0ff], [5, -11, 0xb26bff]].forEach(([x, z, col]) => {
      const mat = std({ color: col, emissive: col, emissiveIntensity: 1.6, roughness: 0.2, transparent: true, opacity: 0.9 });
      for (let k = 0; k < 6; k++) { const h = 0.5 + R() * 1.4; add(g, new THREE.OctahedronGeometry(0.25, 0), mat, [x + (R() - .5) * 1.2, h * 0.4, z + (R() - .5) * 1.2], [R(), R(), R()], [0.6, h * 2, 0.6], false); }
      const l = new THREE.PointLight(col, 6, 12, 2); l.position.set(x, 1.2, z); g.add(l); crystals.push({ l, mat, ph: R() * 6 });
    });
    const web = new THREE.LineBasicMaterial({ color: 0xdfe6ee, transparent: true, opacity: 0.35 });
    [[-7, 4, -5], [7, 5, -6], [-5, 6, -10], [4, 7, -12]].forEach(([x, y, z]) => {
      const pts = [];
      for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; pts.push(new THREE.Vector3(0, 0, 0), new THREE.Vector3(Math.cos(a) * 2, Math.sin(a) * 2, 0)); }
      for (let ring = 1; ring <= 4; ring++) for (let k = 0; k < 10; k++) { const a0 = k / 10 * Math.PI * 2, a1 = (k + 1) / 10 * Math.PI * 2, r = ring * 0.45; pts.push(new THREE.Vector3(Math.cos(a0) * r, Math.sin(a0) * r, 0), new THREE.Vector3(Math.cos(a1) * r, Math.sin(a1) * r, 0)); }
      const ls = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), web); ls.position.set(x, y, z); ls.lookAt(0, 2, 6); g.add(ls);
    });
    S.cave = { g, bg: 0x05040a, fog: [0x0b0814, 0.06], hemi: [0x6a5a8a, 0x0a0810, 0.55], moon: [0x9f8cff, 0.7],
      update(t) { crystals.forEach(c => { const k = 0.8 + 0.2 * Math.sin(t * 2 + c.ph); c.l.intensity = 6 * k; c.mat.emissiveIntensity = 1.6 * k; }); } };
  }
  { // 3 沼澤
    const g = new THREE.Group(); scene.add(g);
    add(g, new THREE.PlaneGeometry(120, 120), std({ color: 0x14231a, roughness: 0.08, metalness: 0.6 }), [0, -0.02, 0], [-Math.PI / 2, 0, 0], null, false).receiveShadow = true;
    const mudTex = noiseTex('#3a3a24', ['#2c2d1a', '#4a4a2c', '#2f3d22', '#56502f'], 8000); mudTex.repeat.set(6, 6);
    const mud = std({ map: mudTex, roughness: 1 });
    add(g, new THREE.CylinderGeometry(6.5, 7, 0.12, 40), mud, [0, 0.0, 0.5], [0, 0, 0], [1, 1, 0.75], false).receiveShadow = true;
    for (let i = 0; i < 12; i++) { const x = (R() - .5) * 30, z = -18 + R() * 16; if (!clearOfPlay(x, z)) continue; add(g, new THREE.CylinderGeometry(1 + R() * 2, 1.2 + R() * 2, 0.1, 20), mud, [x, 0, z], [0, 0, 0], null, false); }
    const bark = std({ map: noiseTex('#3a372c', ['#26241c', '#4a4636', '#2f3a26'], 4000), roughness: 1 });
    for (let i = 0; i < 26; i++) { const x = (R() - .5) * 36, z = -20 + R() * 20; if (clearOfPlay(x, z)) deadTree(g, x, z, bark); }
    const reed = std({ color: 0x3f5a2c, roughness: 1 }), pad = std({ color: 0x2d5a2a, roughness: 0.6 });
    for (let i = 0; i < 40; i++) { const x = (R() - .5) * 24, z = -12 + R() * 15; if (!clearOfPlay(x, z) && !(Math.abs(x) > 6.5)) continue; add(g, new THREE.ConeGeometry(0.03, 1 + R(), 4), reed, [x, 0.5, z], [(R() - .5) * .3, 0, (R() - .5) * .3], null, false); }
    for (let i = 0; i < 20; i++) { const x = (R() - .5) * 24, z = -14 + R() * 18; if (Math.hypot(x, (z - 0.5) / 0.75) < 7.2 || z > 2) continue; add(g, new THREE.CylinderGeometry(0.3 + R() * 0.25, 0.3, 0.02, 12, 1, false, 0, Math.PI * 1.8), pad, [x, 0.01, z], [0, R() * 6, 0], null, false); }
    const flies = [];
    for (let i = 0; i < 30; i++) { const f = glow(0xd8ff6a, 0.18); f.userData = { x: (R() - .5) * 16, y: 0.5 + R() * 2.5, z: -10 + R() * 12, p: R() * 6 }; g.add(f); flies.push(f); }
    mist(g, 0x7fb08a, 18, 0.18);
    S.swamp = { g, bg: 0x0a140f, fog: [0x13261b, 0.065], hemi: [0x6f9a7a, 0x10180f, 0.6], moon: [0xc8f0d0, 1.2],
      update(t) { flies.forEach(f => { const u = f.userData; f.position.set(u.x + Math.sin(t * 0.7 + u.p) * 0.8, u.y + Math.sin(t * 1.3 + u.p) * 0.3, u.z + Math.cos(t * 0.5 + u.p) * 0.8); f.material.opacity = 0.5 + 0.5 * Math.sin(t * 3 + u.p); }); } };
  }
  { // 4 城堡走廊
    const g = new THREE.Group(); scene.add(g);
    const floorTex = brickTex('#4a4440', '#2a2522', 4, 4, ['#00000020', '#ffffff08', '#00000035']); floorTex.repeat.set(4, 14);
    add(g, new THREE.PlaneGeometry(13, 48), std({ map: floorTex, roughness: 0.85 }), [0, 0, -12], [-Math.PI / 2, 0, 0], null, false).receiveShadow = true;
    add(g, new THREE.PlaneGeometry(2.4, 48), std({ color: 0x5a1218, roughness: 0.95 }), [0, 0.01, -12], [-Math.PI / 2, 0, 0], null, false).receiveShadow = true;
    const wallTex = brickTex('#5a524a', '#2c2723', 10, 5); wallTex.repeat.set(10, 2.5);
    const wall = std({ map: wallTex, roughness: 0.9 });
    for (const s of [-1, 1]) add(g, new THREE.PlaneGeometry(48, 9), wall, [s * 6.5, 4.5, -12], [0, -s * Math.PI / 2, 0], null, false).receiveShadow = true;
    const backTex = wallTex.clone(); backTex.repeat.set(3, 2.5); backTex.needsUpdate = true;
    add(g, new THREE.PlaneGeometry(13, 9), std({ map: backTex, roughness: 0.9 }), [0, 4.5, -24], [0, 0, 0], null, false);
    add(g, new THREE.PlaneGeometry(3, 4.2), std({ color: 0x0a0605, roughness: 1 }), [0, 2.1, -23.95], [0, 0, 0], null, false);
    add(g, new THREE.CircleGeometry(1.5, 24, 0, Math.PI), std({ color: 0x0a0605, roughness: 1 }), [0, 4.2, -23.95], [0, 0, 0], null, false);
    add(g, new THREE.PlaneGeometry(13, 48), std({ color: 0x120d0b, roughness: 1 }), [0, 9, -12], [Math.PI / 2, 0, 0], null, false);
    const pillar = std({ map: brickTex('#625a50', '#302a25', 6, 2), roughness: 0.9 });
    const banner = std({ color: 0x7a1020, roughness: 0.9, side: THREE.DoubleSide }), gold = std({ color: 0xc9a04a, metalness: 0.7, roughness: 0.4 });
    const torches = [];
    for (let k = 0; k < 6; k++) for (const s of [-1, 1]) {
      const z = 2 - k * 4.5;
      add(g, new THREE.BoxGeometry(0.9, 9, 0.9), pillar, [s * 6, 4.5, z]);
      if (k < 5) { add(g, new THREE.PlaneGeometry(1.4, 3.2), banner, [s * 6.45, 5, z - 2.25], [0, -s * Math.PI / 2, 0], null, false); add(g, new THREE.BoxGeometry(0.05, 0.1, 1.6), gold, [s * 6.42, 6.65, z - 2.25]); }
      add(g, new THREE.CylinderGeometry(0.06, 0.04, 0.5, 6), std({ color: 0x3a2a1a }), [s * 5.45, 2.8, z], [0, 0, s * 0.4]);
      const fl = glow(0xffa040, 0.7); fl.position.set(s * 5.35, 3.15, z); g.add(fl);
      const l = k % 2 === 0 ? new THREE.PointLight(0xff9a40, 7, 9, 2) : null; if (l) { l.position.set(s * 5.2, 3.2, z); g.add(l); }
      torches.push({ fl, l, ph: R() * 6 });
    }
    S.castle = { g, bg: 0x070505, fog: [0x140c09, 0.045], hemi: [0x6b5a4a, 0x100a08, 0.35], moon: [0xffd2a0, 0.5],
      update(t) { torches.forEach(c => { const k = 0.8 + 0.12 * Math.sin(t * 13 + c.ph) + 0.08 * Math.sin(t * 29 + c.ph * 2); c.fl.scale.setScalar(0.7 * k); if (c.l) c.l.intensity = 7 * k; }); } };
  }
  { // 5 墓園
    const g = new THREE.Group(); scene.add(g);
    ground(g, noiseTex('#1c2622', ['#24302a', '#151d1a', '#2c3a32', '#1a1f24'], 9000), 24);
    const stoneTex = noiseTex('#6a6e70', ['#5a5e60', '#7a7e80', '#4f5355', '#3c4a40'], 5000);
    const stone = std({ map: stoneTex, roughness: 0.95 });
    for (let i = 0; i < 70; i++) {
      const x = (R() - .5) * 30, z = -22 + R() * 22; if (!clearOfPlay(x, z) && !(Math.abs(x) > 5.5 && z < 0)) continue;
      const t = new THREE.Group(); t.position.set(x, 0, z); t.rotation.set((R() - .5) * 0.15, (R() - .5) * 0.5, (R() - .5) * 0.2); g.add(t);
      if (R() < 0.25) { add(t, new THREE.BoxGeometry(0.14, 1.3, 0.14), stone, [0, 0.65, 0]); add(t, new THREE.BoxGeometry(0.7, 0.14, 0.14), stone, [0, 0.95, 0]); }
      else { const w = 0.6 + R() * 0.3, h = 0.7 + R() * 0.5; add(t, new THREE.BoxGeometry(w, h, 0.16), stone, [0, h / 2, 0]); add(t, new THREE.CylinderGeometry(w / 2, w / 2, 0.16, 16, 1, false, 0, Math.PI), stone, [0, h, 0], [Math.PI / 2, 0, Math.PI / 2]); }
    }
    const iron = std({ color: 0x1a1c20, metalness: 0.8, roughness: 0.5 });
    for (let x = -16; x <= 16; x += 0.5) add(g, new THREE.CylinderGeometry(0.03, 0.03, 1.8, 5), iron, [x, 0.9, -12]);
    for (const y of [0.4, 1.5]) add(g, new THREE.BoxGeometry(32, 0.06, 0.06), iron, [0, y, -12]);
    const bark = std({ map: noiseTex('#2a2826', ['#1c1a18', '#3a3632'], 4000), roughness: 1 });
    for (let i = 0; i < 14; i++) { const x = (R() - .5) * 36, z = -26 + R() * 14; if (clearOfPlay(x, z)) deadTree(g, x, z, bark, 5 + R() * 3); }
    moonDisc(g, 0xf4f0d8, 0xc8d8ff, [14, 18, -55]); mist(g, 0xa8b8d8, 22, 0.2);
    S.graveyard = { g, bg: 0x0a0f1a, fog: [0x151d2e, 0.055], hemi: [0x8090c0, 0x101418, 0.65], moon: [0xc0d0ff, 1.6] };
  }
  { // 6 高塔
    const g = new THREE.Group(); scene.add(g);
    const tileTex = brickTex('#504a5a', '#2a2630', 6, 6, ['#00000025', '#ffffff08']); tileTex.repeat.set(4, 4);
    const tile = std({ map: tileTex, roughness: 0.85 });
    add(g, new THREE.CylinderGeometry(9, 9, 0.6, 48), tile, [0, -0.3, 0], [0, 0, 0], null, false).receiveShadow = true;
    for (let k = 0; k < 32; k++) { const a = k / 32 * Math.PI * 2, x = Math.cos(a) * 8.6, z = Math.sin(a) * 8.6; if (k % 2) add(g, new THREE.BoxGeometry(1.2, 1.1, 0.7), tile, [x, 0.55, z], [0, -a + Math.PI / 2, 0]); else add(g, new THREE.BoxGeometry(1.6, 0.5, 0.7), tile, [x, 0.25, z], [0, -a + Math.PI / 2, 0]); }
    const rune = new THREE.MeshBasicMaterial({ color: 0xb26bff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const rings = [add(g, new THREE.RingGeometry(3.2, 3.35, 64), rune, [0, 0.02, -0.2], [-Math.PI / 2, 0, 0], null, false), add(g, new THREE.RingGeometry(2.3, 2.38, 6), rune, [0, 0.02, -0.2], [-Math.PI / 2, 0, 0], null, false)];
    const skyC = document.createElement('canvas'); skyC.width = 4; skyC.height = 256; const sg = skyC.getContext('2d');
    const grd = sg.createLinearGradient(0, 0, 0, 256); grd.addColorStop(0, '#05030a'); grd.addColorStop(0.45, '#1c1030'); grd.addColorStop(0.6, '#3a1f4a'); grd.addColorStop(1, '#0a0610');
    sg.fillStyle = grd; sg.fillRect(0, 0, 4, 256); const skyT = new THREE.CanvasTexture(skyC); skyT.colorSpace = THREE.SRGBColorSpace;
    const skyMat = new THREE.MeshBasicMaterial({ map: skyT, side: THREE.BackSide, fog: false });
    add(g, new THREE.SphereGeometry(90, 32, 16), skyMat, [0, 0, 0], [0, 0, 0], null, false);
    const mtn = std({ color: 0x120c1a, roughness: 1, fog: false });
    for (let k = 0; k < 26; k++) { const a = k / 26 * Math.PI * 2 + R() * 0.2, r = 60 + R() * 15, h = 12 + R() * 16; add(g, new THREE.ConeGeometry(6 + R() * 6, h, 6), mtn, [Math.cos(a) * r, -22 + h / 2, Math.sin(a) * r], [0, R() * 3, 0], null, false); }
    const clouds = new THREE.Group(); g.add(clouds); const cloudMats = [];
    new THREE.TextureLoader().load('assets/cloud.webp', tex => {
      for (let k = 0; k < 18; k++) { const m = new THREE.SpriteMaterial({ map: tex, color: 0x6a4a8a, transparent: true, opacity: 0.5, depthWrite: false, fog: false }); cloudMats.push(m); const s = new THREE.Sprite(m); const a = R() * 6.28, r = 25 + R() * 30; s.position.set(Math.cos(a) * r, 14 + R() * 10, Math.sin(a) * r - 10); s.scale.set(30, 12, 1); clouds.add(s); }
    }, undefined, () => {});
    const boltMat = new THREE.MeshBasicMaterial({ color: 0xe8dcff, fog: false });
    let flashT = 0, nextFlash = 3, sky = null;
    S.tower = { g, bg: 0x120a1f, fog: [0x1a1028, 0.03], hemi: [0x8a7ab0, 0x140c1c, 0.6], moon: [0xb0a0ff, 1.3],
      update(t, dt) {
        clouds.rotation.y += dt * 0.01; rings[0].rotation.z += dt * 0.2; rings[1].rotation.z -= dt * 0.35; rune.opacity = 0.45 + 0.15 * Math.sin(t * 2);
        nextFlash -= dt;
        if (nextFlash <= 0) { // 閃電
          nextFlash = 4 + R() * 6; flashT = 0.25;
          if (sky) g.remove(sky);
          const a = R() * 6.28, x = Math.cos(a) * 45, z = -Math.abs(Math.sin(a)) * 45 - 10, pts = [];
          for (let k = 0; k <= 10; k++) pts.push(new THREE.Vector3(x + (R() - .5) * 5, 30 - k * 4.5, z + (R() - .5) * 3));
          sky = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 30, 0.25, 4), boltMat); g.add(sky);
        }
        flashT = Math.max(0, flashT - dt);
        const f = flashT > 0 ? (Math.sin(flashT * 60) > 0 ? 1 : 0.4) : 0;
        if (sky) sky.visible = flashT > 0;
        hemi.intensity = 0.6 + f * 1.4; cloudMats.forEach(m => m.color.setHex(f ? 0xc8b0ff : 0x6a4a8a));
      } };
  }

  let cur = null;
  return {
    names: Object.keys(S),
    set(name) {
      for (const k in S) S[k].g.visible = k === name;
      const d = S[name]; cur = d;
      scene.background.setHex(d.bg); scene.fog.color.setHex(d.fog[0]); scene.fog.density = d.fog[1];
      hemi.color.setHex(d.hemi[0]); hemi.groundColor.setHex(d.hemi[1]); hemi.intensity = d.hemi[2];
      moon.color.setHex(d.moon[0]); moon.intensity = d.moon[1];
    },
    update(t, dt) {
      if (cur && cur.update) cur.update(t, dt);
      for (const m of mistAll) if (m.parent && m.parent.visible) { m.position.x += m.userData.v * dt; if (Math.abs(m.position.x) > 10) m.position.x *= -0.98; }
    },
  };
}

// ================= 怪物 =================
// 每隻怪物：g（放在場上的位置）→ root（傾倒、浮動）→ 各部位。chestY：胸口高度（瞄準與魔法出手點）
function base(chestY) { const g = new THREE.Group(), root = new THREE.Group(); g.add(root); return { g, root, chestY, mats: [], walk: 0, stun: 0, alpha: 1, dying: 0, prev: null, lean: 0 }; }
function track(o, ...mats) { for (const m of mats) { o.mats.push(m); if (m.emissive) m.userData.baseEm = m.emissive.clone(); if (m.transparent) m.userData.baseOp = m.opacity; } return mats[0]; }

function buildWerewolf(assets) {
  const o = base(1.75);
  if (assets.werewolf) { // 下載的寫實模型
    const m = assets.werewolf.clone(true), box = new THREE.Box3().setFromObject(m), h = box.getSize(new THREE.Vector3()).y || 1, k = 2.6 / h;
    m.scale.setScalar(k); m.position.y = -box.min.y * k;
    m.traverse(n => { if (n.isMesh) { n.castShadow = true; n.material = n.material.clone(); if (n.material.emissive) track(o, n.material); } });
    o.root.add(m); o.pose = (t, e) => { o.root.position.z = Math.sin(Math.min(1, e.attackT * 2) * Math.PI) * 0.6; };
    return o;
  }
  const r = o.root;
  const fur = track(o, std({ map: noiseTex('#6e5d4c', ['#57483a', '#85705b', '#4a3d31'], 7000), roughness: 0.95 })), dark = track(o, std({ color: 0x2a211b, roughness: 0.8 }));
  const eye = std({ color: 0xffd23f, emissive: 0xffb000, emissiveIntensity: 2.5 }), fang = std({ color: 0xf2ead8, roughness: 0.4 });
  add(r, new THREE.CapsuleGeometry(0.42, 0.7, 6, 14), fur, [0, 1.4, 0.05], [0.4, 0, 0]);
  add(r, new THREE.SphereGeometry(0.36, 14, 12), fur, [0, 0.92, -0.12]);
  add(r, new THREE.SphereGeometry(0.3, 16, 14), fur, [0, 2.02, 0.36]);
  add(r, new THREE.ConeGeometry(0.17, 0.46, 12), fur, [0, 1.95, 0.68], [Math.PI / 2, 0, 0]);
  add(r, new THREE.SphereGeometry(0.06, 8, 8), dark, [0, 1.96, 0.9]);
  const arms = [], legs = [];
  for (const s of [-1, 1]) {
    add(r, new THREE.ConeGeometry(0.09, 0.28, 8), fur, [s * 0.18, 2.32, 0.28], [0, 0, -s * 0.25]);
    add(r, new THREE.SphereGeometry(0.045, 8, 8), eye, [s * 0.12, 2.09, 0.6]);
    add(r, new THREE.ConeGeometry(0.025, 0.1, 6), fang, [s * 0.07, 1.86, 0.78], [Math.PI, 0, 0]);
    const arm = new THREE.Group(); arm.position.set(s * 0.56, 1.72, 0.2); arm.rotation.set(-0.5, 0, s * 0.25); r.add(arm); arms.push(arm);
    add(arm, new THREE.CapsuleGeometry(0.13, 0.55, 5, 10), fur, [0, -0.38, 0]);
    add(arm, new THREE.CapsuleGeometry(0.11, 0.5, 5, 10), fur, [0, -0.9, 0.18], [-0.7, 0, 0]);
    for (let k = -1; k <= 1; k++) add(arm, new THREE.ConeGeometry(0.03, 0.2, 6), dark, [k * 0.07, -1.22, 0.42], [-2.2, 0, 0]);
    const leg = new THREE.Group(); leg.position.set(s * 0.26, 0.85, 0.05); r.add(leg); legs.push(leg);
    add(leg, new THREE.CapsuleGeometry(0.17, 0.5, 5, 10), fur, [0, -0.27, 0.03], [-0.45, 0, 0]);
    add(leg, new THREE.CapsuleGeometry(0.12, 0.42, 5, 10), fur, [0, -0.63, -0.03], [0.5, 0, 0]);
    add(leg, new THREE.BoxGeometry(0.2, 0.1, 0.42), dark, [0, -0.8, 0.17]);
  }
  r.scale.setScalar(1.15);
  o.pose = (t, e) => {
    const atk = Math.sin(Math.min(1, e.attackT * 2) * Math.PI);
    o.root.position.z = atk * 0.6;
    arms.forEach((a, k) => a.rotation.x = -0.5 + Math.sin(o.walk + k * Math.PI) * 0.35 + Math.sin(t * 2.2 + k) * 0.06 - atk * 1.3);
    legs.forEach((l, k) => l.rotation.x = Math.sin(o.walk + k * Math.PI) * 0.45);
  };
  return o;
}

function buildSpider(scale) {
  const o = base(0.75 * scale), r = o.root;
  const body = track(o, std({ map: noiseTex('#2a1f1a', ['#1a120e', '#3b2c22', '#4a3526'], 6000), roughness: 0.7 }));
  const legM = track(o, std({ color: 0x1c1410, roughness: 0.6 }));
  const eye = std({ color: 0xff2020, emissive: 0xff1010, emissiveIntensity: 2.2 });
  add(r, new THREE.SphereGeometry(0.55, 20, 16), body, [0, 0.78, -0.6], [0, 0, 0], [1, 0.85, 1.25]);
  add(r, new THREE.SphereGeometry(0.2, 12, 8), track(o, std({ color: 0x8a1010, emissive: 0x400000 })), [0, 1.2, -0.6], [0, 0, 0], [1, 0.3, 1.5]);
  add(r, new THREE.SphereGeometry(0.32, 16, 12), body, [0, 0.68, 0.12], [0, 0, 0], [1, 0.8, 1.1]);
  [[-0.07, 0.8, 0.42, 0.055], [0.07, 0.8, 0.42, 0.055], [-0.15, 0.78, 0.37, 0.035], [0.15, 0.78, 0.37, 0.035], [-0.04, 0.88, 0.38, 0.03], [0.04, 0.88, 0.38, 0.03], [-0.19, 0.72, 0.33, 0.025], [0.19, 0.72, 0.33, 0.025]]
    .forEach(([x, y, z, s]) => add(r, new THREE.SphereGeometry(s, 8, 6), eye, [x, y, z], [0, 0, 0], null, false));
  for (const s of [-1, 1]) add(r, new THREE.ConeGeometry(0.04, 0.2, 6), legM, [s * 0.07, 0.52, 0.42], [Math.PI * 0.85, 0, 0]);
  const legs = [], F = [0.75, 0.25, -0.25, -0.75];
  for (const s of [-1, 1]) for (let k = 0; k < 4; k++) {
    const hip = new THREE.Group(); hip.position.set(s * 0.22, 0.68, 0.28 - k * 0.15); hip.rotation.y = -s * F[k]; r.add(hip);
    const thigh = new THREE.Group(); thigh.rotation.z = s * 0.8; hip.add(thigh);
    const g1 = new THREE.CylinderGeometry(0.03, 0.045, 0.62, 6); g1.rotateZ(Math.PI / 2); g1.translate(s * 0.31, 0, 0); add(thigh, g1, legM);
    const knee = new THREE.Group(); knee.position.set(s * 0.62, 0, 0); knee.rotation.z = -s * 2.1; thigh.add(knee);
    const g2 = new THREE.CylinderGeometry(0.012, 0.03, 0.85, 6); g2.rotateZ(Math.PI / 2); g2.translate(s * 0.42, 0, 0); add(knee, g2, legM);
    legs.push({ hip, thigh, s, k, yaw: -s * F[k] });
  }
  r.scale.setScalar(scale);
  o.pose = (t, e) => {
    const atk = Math.sin(Math.min(1, e.attackT * 2) * Math.PI);
    o.root.rotation.x = -atk * 0.35; o.root.position.y = Math.abs(Math.sin(o.walk * 2)) * 0.03 * scale;
    legs.forEach(L => { const ph = o.walk * 2 + (L.k % 2 ? Math.PI : 0) + (L.s > 0 ? Math.PI : 0); L.hip.rotation.y = L.yaw + Math.sin(ph) * 0.3; L.thigh.rotation.z = L.s * (0.8 + Math.max(0, Math.cos(ph)) * 0.35); });
  };
  return o;
}

function buildTroll() {
  const o = base(2.0), r = o.root;
  const skin = track(o, std({ map: noiseTex('#5d6b4a', ['#4a573b', '#6f7d58', '#3f4a33', '#7a6a4a'], 8000), roughness: 0.9 }));
  const cloth = track(o, std({ color: 0x4a3420, roughness: 1 })), wood = track(o, std({ map: noiseTex('#4a3320', ['#3a2616', '#5c4128'], 3000), roughness: 1 }));
  const tusk = std({ color: 0xe8dcc0, roughness: 0.5 }), eye = std({ color: 0xffe066, emissive: 0xffc000, emissiveIntensity: 2 }), moss = std({ color: 0x3f6a2a, roughness: 1 });
  add(r, new THREE.SphereGeometry(0.75, 20, 16), skin, [0, 1.35, 0.05], [0, 0, 0], [1.05, 0.95, 0.9]);
  add(r, new THREE.SphereGeometry(0.72, 20, 16), skin, [0, 1.95, -0.2], [0, 0, 0], [1.2, 0.85, 0.9]);
  add(r, new THREE.BoxGeometry(1.2, 0.45, 0.9), cloth, [0, 0.82, 0.02]);
  const head = new THREE.Group(); head.position.set(0, 2.25, 0.45); r.add(head);
  add(head, new THREE.SphereGeometry(0.28, 14, 12), skin, [0, 0.08, 0]);
  add(head, new THREE.BoxGeometry(0.42, 0.18, 0.3), skin, [0, -0.1, 0.1]);
  add(head, new THREE.SphereGeometry(0.08, 8, 8), skin, [0, 0.05, 0.27]);
  for (const s of [-1, 1]) {
    add(head, new THREE.ConeGeometry(0.04, 0.18, 6), tusk, [s * 0.14, 0.02, 0.24], [-0.3, 0, s * 0.2]);
    add(head, new THREE.SphereGeometry(0.04, 8, 8), eye, [s * 0.1, 0.14, 0.24], [0, 0, 0], null, false);
    add(head, new THREE.ConeGeometry(0.07, 0.22, 6), skin, [s * 0.28, 0.12, -0.02], [0, 0, -s * 1.3]);
    add(r, new THREE.SphereGeometry(0.16, 8, 8), moss, [s * 0.7, 2.3, -0.2], [0, 0, 0], [1, 0.5, 1]);
  }
  const arms = [], legs = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(s * 0.85, 2.05, 0.05); r.add(sh); arms.push(sh);
    add(sh, new THREE.CapsuleGeometry(0.2, 0.6, 5, 10), skin, [0, -0.4, 0]);
    add(sh, new THREE.CapsuleGeometry(0.22, 0.6, 5, 10), skin, [0, -1.05, 0.12], [-0.25, 0, 0]);
    add(sh, new THREE.SphereGeometry(0.28, 12, 10), skin, [0, -1.5, 0.25]);
    if (s > 0) { const club = new THREE.Group(); club.position.set(0, -1.5, 0.25); club.rotation.x = 1.3; sh.add(club); add(club, new THREE.CylinderGeometry(0.2, 0.08, 1.4, 8), wood, [0, 0.7, 0]); }
    const leg = new THREE.Group(); leg.position.set(s * 0.38, 0.75, 0); r.add(leg); legs.push(leg);
    add(leg, new THREE.CapsuleGeometry(0.26, 0.4, 5, 10), skin, [0, -0.35, 0]);
    add(leg, new THREE.BoxGeometry(0.4, 0.15, 0.55), skin, [0, -0.68, 0.1]);
  }
  r.scale.setScalar(1.15);
  o.pose = (t, e) => {
    const atk = Math.sin(Math.min(1, e.attackT * 2) * Math.PI);
    o.root.position.y = Math.abs(Math.sin(o.walk)) * 0.06; o.root.rotation.z = Math.sin(o.walk) * 0.05;
    arms[0].rotation.x = Math.sin(o.walk) * 0.25; arms[1].rotation.x = -Math.sin(o.walk) * 0.25 - atk * 2.2;
    legs.forEach((l, k) => l.rotation.x = Math.sin(o.walk + k * Math.PI) * 0.35);
    head.rotation.x = Math.sin(t * 1.3) * 0.08;
  };
  return o;
}

function buildGhost() {
  const o = base(1.9), r = o.root;
  const mat = track(o, std({ color: 0xd8f4ff, emissive: 0x5fc8ff, emissiveIntensity: 0.55, transparent: true, opacity: 0.62, roughness: 0.4, side: THREE.DoubleSide, depthWrite: false }));
  const pts = [[0.001, 2.45], [0.18, 2.42], [0.28, 2.3], [0.3, 2.1], [0.26, 1.95], [0.36, 1.8], [0.42, 1.5], [0.5, 1.1], [0.6, 0.75], [0.72, 0.45], [0.78, 0.3]].map(([x, y]) => new THREE.Vector2(x, y));
  add(r, new THREE.LatheGeometry(pts, 28), mat, [0, 0, 0], [0, 0, 0], null, false);
  const tails = [];
  for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; tails.push(add(r, new THREE.ConeGeometry(0.16, 0.6, 6), mat, [Math.cos(a) * 0.62, 0.05, Math.sin(a) * 0.62], [Math.PI, 0, 0], null, false)); }
  const hole = track(o, new THREE.MeshBasicMaterial({ color: 0x02060a, transparent: true, opacity: 0.95 }));
  for (const s of [-1, 1]) { add(r, new THREE.SphereGeometry(0.06, 10, 8), hole, [s * 0.1, 2.18, 0.25], [0, 0, 0], [1, 1.35, 0.6], false); const e = glow(0x9ff0ff, 0.12); e.position.set(s * 0.1, 2.18, 0.29); r.add(e); }
  add(r, new THREE.SphereGeometry(0.07, 10, 8), hole, [0, 1.98, 0.27], [0, 0, 0], [1.1, 1.6, 0.5], false);
  const arms = [];
  for (const s of [-1, 1]) { const a = new THREE.Group(); a.position.set(s * 0.4, 1.75, 0.05); r.add(a); arms.push(a); add(a, new THREE.ConeGeometry(0.12, 0.9, 8), mat, [0, -0.35, 0.15], [-0.9, 0, s * 0.3], null, false); }
  const light = new THREE.PointLight(0x7fe0ff, 3, 7, 2); light.position.set(0, 1.8, 0.4); r.add(light);
  o.light = light; o.float = true;
  o.pose = (t, e) => {
    const atk = Math.sin(Math.min(1, e.attackT * 2) * Math.PI);
    o.root.position.y = 0.45 + Math.sin(t * 1.6) * 0.15; o.root.rotation.z = Math.sin(t * 1.1) * 0.06;
    tails.forEach((c, k) => { c.rotation.z = Math.sin(t * 3 + k) * 0.25; c.scale.y = 1 + Math.sin(t * 2.5 + k * 1.3) * 0.2; });
    arms.forEach((a, k) => a.rotation.x = Math.sin(t * 1.4 + k) * 0.15 - atk * 1.0);
    light.intensity = 3 * o.alpha;
  };
  return o;
}

function buildSkeleton() {
  const o = base(1.45), r = o.root;
  const bone = track(o, std({ map: noiseTex('#e6dcc4', ['#cfc3a6', '#f2ead8', '#bfb08f'], 3000), roughness: 0.75 }));
  const black = new THREE.MeshBasicMaterial({ color: 0x050403 }), red = std({ color: 0xff3020, emissive: 0xff2000, emissiveIntensity: 2.5 });
  const rust = track(o, std({ color: 0x6a5a4a, metalness: 0.6, roughness: 0.6 }));
  const head = new THREE.Group(); head.position.set(0, 1.85, 0); r.add(head);
  add(head, new THREE.SphereGeometry(0.16, 14, 12), bone, [0, 0, 0], [0, 0, 0], [1, 1.1, 1.05]);
  const jaw = new THREE.Group(); jaw.position.set(0, -0.1, 0.02); head.add(jaw); add(jaw, new THREE.BoxGeometry(0.17, 0.05, 0.14), bone, [0, -0.03, 0.04]);
  for (const s of [-1, 1]) { add(head, new THREE.SphereGeometry(0.045, 8, 8), black, [s * 0.06, 0.02, 0.13], [0, 0, 0], null, false); add(head, new THREE.SphereGeometry(0.016, 6, 6), red, [s * 0.06, 0.02, 0.165], [0, 0, 0], null, false); }
  add(head, new THREE.ConeGeometry(0.025, 0.05, 3), black, [0, -0.04, 0.16], [Math.PI, 0, 0], null, false);
  for (let k = 0; k < 7; k++) add(r, new THREE.CylinderGeometry(0.035, 0.035, 0.06, 8), bone, [0, 1.62 - k * 0.09, -0.05]);
  for (let k = 0; k < 4; k++) { const g = new THREE.TorusGeometry(0.17 - k * 0.015, 0.017, 6, 16, Math.PI * 1.4); g.rotateZ(-0.2 * Math.PI); add(r, g, bone, [0, 1.52 - k * 0.08, 0.02], [Math.PI / 2, 0, 0]); }
  add(r, new THREE.TorusGeometry(0.12, 0.03, 6, 14), bone, [0, 0.98, 0], [Math.PI / 2, 0, 0]);
  const arms = [], legs = [];
  for (const s of [-1, 1]) {
    add(r, new THREE.CylinderGeometry(0.02, 0.02, 0.22, 6), bone, [s * 0.12, 1.6, 0], [0, 0, Math.PI / 2]);
    const sh = new THREE.Group(); sh.position.set(s * 0.24, 1.58, 0); r.add(sh); arms.push(sh);
    add(sh, new THREE.CylinderGeometry(0.024, 0.02, 0.38, 6), bone, [0, -0.19, 0]);
    add(sh, new THREE.CylinderGeometry(0.018, 0.015, 0.36, 6), bone, [0, -0.5, 0.1], [-0.5, 0, 0]);
    if (s > 0) { const sw = new THREE.Group(); sw.position.set(0, -0.66, 0.2); sw.rotation.x = 1.2; sh.add(sw); add(sw, new THREE.BoxGeometry(0.05, 0.75, 0.012), rust, [0, 0.38, 0]); add(sw, new THREE.BoxGeometry(0.18, 0.03, 0.03), rust, [0, 0.02, 0]); }
    const leg = new THREE.Group(); leg.position.set(s * 0.1, 0.95, 0); r.add(leg); legs.push(leg);
    add(leg, new THREE.CylinderGeometry(0.028, 0.022, 0.45, 6), bone, [0, -0.23, 0]);
    add(leg, new THREE.CylinderGeometry(0.022, 0.018, 0.45, 6), bone, [0, -0.68, 0]);
    add(leg, new THREE.BoxGeometry(0.07, 0.03, 0.16), bone, [0, -0.92, 0.05]);
  }
  r.scale.setScalar(1.08);
  o.pose = (t, e) => {
    const atk = Math.sin(Math.min(1, e.attackT * 2) * Math.PI);
    arms[0].rotation.x = Math.sin(o.walk) * 0.4; arms[1].rotation.x = -Math.sin(o.walk) * 0.4 - atk * 2.0;
    legs.forEach((l, k) => l.rotation.x = Math.sin(o.walk + k * Math.PI) * 0.5);
    jaw.rotation.x = Math.max(0, Math.sin(t * 9)) * 0.25; o.root.rotation.z = Math.sin(o.walk) * 0.04 + Math.sin(t * 17) * 0.01;
  };
  return o;
}

function buildWizard() {
  const o = base(1.7), r = o.root;
  const robe = track(o, std({ map: noiseTex('#1d1030', ['#2a1845', '#140a22', '#331d52'], 6000), roughness: 0.9, side: THREE.DoubleSide }));
  const gold = track(o, std({ color: 0xc9a04a, metalness: 0.8, roughness: 0.35 })), wood = track(o, std({ color: 0x2a1a10, roughness: 0.8 }));
  const black = new THREE.MeshBasicMaterial({ color: 0x020104 }), eye = std({ color: 0xd080ff, emissive: 0xb24bff, emissiveIntensity: 3 }), hand = track(o, std({ color: 0x9a96a8, roughness: 0.7 }));
  add(r, new THREE.ConeGeometry(0.85, 2.1, 28, 1, true), robe, [0, 1.05, 0]);
  add(r, new THREE.TorusGeometry(0.84, 0.035, 6, 32), gold, [0, 0.03, 0], [Math.PI / 2, 0, 0]);
  add(r, new THREE.SphereGeometry(0.42, 16, 12), robe, [0, 2.0, 0], [0, 0, 0], [1.2, 0.6, 0.9]);
  add(r, new THREE.SphereGeometry(0.34, 20, 16, Math.PI * 0.7, Math.PI * 1.6, 0, Math.PI * 0.75), robe, [0, 2.35, 0]);
  add(r, new THREE.ConeGeometry(0.2, 0.55, 12), robe, [0, 2.62, -0.18], [-0.7, 0, 0]);
  add(r, new THREE.SphereGeometry(0.26, 14, 12), black, [0, 2.33, 0.02], [0, 0, 0], null, false);
  for (const s of [-1, 1]) { add(r, new THREE.SphereGeometry(0.035, 8, 8), eye, [s * 0.08, 2.38, 0.24], [0, 0, 0], null, false); const gl = glow(0xb24bff, 0.18); gl.position.set(s * 0.08, 2.38, 0.27); r.add(gl); }
  const arms = [];
  for (const s of [-1, 1]) {
    const a = new THREE.Group(); a.position.set(s * 0.45, 2.0, 0.05); r.add(a); arms.push(a);
    add(a, new THREE.ConeGeometry(0.2, 0.9, 12, 1, true), robe, [0, -0.35, 0.12], [-0.35, 0, s * 0.15]);
    add(a, new THREE.SphereGeometry(0.08, 8, 8), hand, [0, -0.78, 0.3]);
  }
  const staff = new THREE.Group(); staff.position.set(0, -0.78, 0.3); arms[1].add(staff);
  add(staff, new THREE.CylinderGeometry(0.03, 0.04, 2.5, 8), wood, [0, 0.3, 0]);
  const orbM = std({ color: 0xe0b0ff, emissive: 0xb24bff, emissiveIntensity: 2.5, roughness: 0.2 });
  add(staff, new THREE.SphereGeometry(0.12, 16, 12), orbM, [0, 1.6, 0], [0, 0, 0], null, false);
  const og = glow(0xb24bff, 0.9); og.position.set(0, 1.6, 0); staff.add(og);
  const light = new THREE.PointLight(0xb24bff, 4, 8, 2); light.position.set(0, 1.6, 0); staff.add(light);
  const shield = new THREE.Group(); shield.position.set(0, 1.35, 0); o.g.add(shield);
  const shM = new THREE.MeshBasicMaterial({ color: 0xb24bff, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const shW = new THREE.MeshBasicMaterial({ color: 0xd8a0ff, wireframe: true, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false });
  shM.userData.noFade = shW.userData.noFade = true;
  shield.add(new THREE.Mesh(new THREE.SphereGeometry(1.55, 32, 20), shM), new THREE.Mesh(new THREE.IcosahedronGeometry(1.58, 1), shW));
  o.float = true;
  o.pose = (t, e) => {
    const atk = Math.sin(Math.min(1, e.attackT * 2) * Math.PI);
    o.root.position.y = 0.12 + Math.sin(t * 1.5) * 0.08;
    arms[1].rotation.x = -atk * 1.4; arms[0].rotation.x = -0.3 - Math.sin(t * 1.2) * 0.1 - atk * 0.6;
    og.scale.setScalar(0.9 + Math.sin(t * 6) * 0.15 + atk * 0.8); light.intensity = 4 + atk * 8;
    const up = e.def.shield && e.shieldDownT <= 0;
    o.shieldK = THREE.MathUtils.lerp(o.shieldK ?? 1, up ? 1 : 0, 0.15);
    shield.visible = o.shieldK > 0.02; shield.rotation.y = t * 0.6; shield.rotation.x = t * 0.3;
    shM.opacity = 0.14 * o.shieldK * o.alpha * (0.85 + 0.15 * Math.sin(t * 7)); shW.opacity = 0.45 * o.shieldK * o.alpha;
  };
  return o;
}

export function makeEnemy(kind, assets = {}) {
  const o = kind === 'werewolf' ? buildWerewolf(assets) : kind === 'spider' ? buildSpider(1.5) : kind === 'spiderling' ? buildSpider(0.4)
    : kind === 'troll' ? buildTroll() : kind === 'ghost' ? buildGhost() : kind === 'skeleton' ? buildSkeleton() : buildWizard();
  o.kind = kind;
  // 每一幀：跟著規則裡的位置移動、面向玩家、走路擺動、受擊閃紅、被絆倒、消失／倒下
  o.update = (t, dt, e, cam) => {
    const k = 1 - Math.exp(-dt * 10);
    if (o.prev == null) o.g.position.set(e.x, 0, e.z);
    const px = o.g.position.x, pz = o.g.position.z;
    if (!o.dying) { o.g.position.x += (e.x - px) * k; o.g.position.z += (e.z - pz) * k; }
    if (o.snap) { o.g.position.set(e.x, 0, e.z); o.snap = false; }
    const sp = o.prev == null ? 0 : Math.hypot(o.g.position.x - px, o.g.position.z - pz) / Math.max(dt, 1e-3); o.prev = 1;
    o.walk += Math.min(sp, 4) * dt * 3.2;
    o.g.rotation.y = Math.atan2(cam.x - o.g.position.x, cam.z - o.g.position.z);
    o.pose(t, e);
    o.stun = THREE.MathUtils.lerp(o.stun, e.stunT > 0 && !o.dying ? 1 : 0, 1 - Math.exp(-dt * 8));
    if (o.stun > 0.01) { o.root.rotation.x = -1.1 * o.stun; o.root.position.y += 0.12 * o.stun; o.root.rotation.z += Math.sin(t * 9) * 0.05 * o.stun; }
    const hit = Math.max(0, e.hitT || 0);
    for (const m of o.mats) if (m.userData.baseEm) m.emissive.copy(m.userData.baseEm).add(new THREE.Color(hit * 1.6, hit * 0.2, hit * 0.2));
    const target = o.dying ? 0 : e.hidden ? 0 : 1;
    o.alpha = THREE.MathUtils.lerp(o.alpha, target, 1 - Math.exp(-dt * (o.dying ? 2.5 : 6)));
    if (o.dying) { o.dying += dt; o.root.rotation.x = -Math.min(1, o.dying * 1.5) * (o.float ? 0.3 : 1.45); o.root.position.y = (o.float ? 0.5 + o.dying : 0.2 * Math.min(1, o.dying * 1.5)); }
    const fade = o.float || o.dying;
    o.g.traverse(n => { if (n.material && fade && !n.material.userData.noFade) { const m = n.material; if (!m.transparent) { m.transparent = true; m.userData.baseOp = m.opacity; } m.opacity = (m.userData.baseOp ?? 1) * o.alpha; } });
    o.g.visible = o.alpha > 0.02;
  };
  o.chest = () => o.g.localToWorld(new THREE.Vector3(0, o.chestY, 0.3));
  return o;
}

// ================= 敵方魔法彈外觀 =================
const ORB = { werewolf: [0xff4466, 0.9], spider: [0x7dff6a, 0.8], troll: [0xa07a4a, 0.7], ghost: [0xbff6ff, 0.9], skeleton: [0xfff4d8, 0.5], wizard: [0xb24bff, 1.0], spiderling: [0x7dff6a, 0.6] };
export function makeProjectile(kind) {
  const [col, size] = ORB[kind] || [0xff4466, 0.9], g = new THREE.Group();
  const spr = glow(col, size); g.add(spr);
  if (kind === 'troll') add(g, new THREE.SphereGeometry(0.26, 12, 10), std({ map: noiseTex('#4a3a24', ['#3a2a18', '#5a4a30', '#2f2416'], 2000), roughness: 1 }), [0, 0, 0], [0, 0, 0], null, false);
  else if (kind === 'skeleton') { const b = new THREE.Group(); g.add(b); const m = std({ color: 0xe6dcc4, roughness: 0.7 }); add(b, new THREE.CylinderGeometry(0.035, 0.035, 0.45, 6), m, [0, 0, 0], [0, 0, Math.PI / 2], null, false); for (const s of [-1, 1]) add(b, new THREE.SphereGeometry(0.06, 8, 6), m, [s * 0.24, 0, 0], [0, 0, 0], null, false); }
  else { const core = glow(0xffffff, size * 0.35); g.add(core); }
  return { g, spr, update(t) { g.rotation.z = t * 8; g.rotation.x = t * 5; spr.scale.setScalar(size * (1 + Math.sin(t * 30) * 0.06)); } };
}

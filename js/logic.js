// 純邏輯：手勢判定與戰鬥規則（不碰 DOM，可用 node 測試）
export const CFG = {
  maxHp: 100, maxMana: 100, attackCost: 10, attackCooldown: 0.4, manaRegen: 25,
  boltDamage: 10, reflectDamage: 30, reflectWindow: 0.5, reflectReturn: 0.6,
  swingSpeed: 5, swingRefractory: 0.35, raiseOn: 0.5, raiseOff: 0.2, afterRaiseLock: 0.3,
  duelFlight: 1.5, duelDamage: 15, duelSpeedup: 1.15, duelMinFlight: 0.6, roundPause: 3, winsNeeded: 2, fastRegen: 40,
  shieldCost: 20, shieldTime: 4, tripCost: 30, stunTime: 3, tripImmune: 6, powerCost: 25, powerDamage: 30, chargeTime: 1.2,
  reviveTime: 10, firstAttack: 3, aimTol: 1.8, dodgeHit: 0.5, biteZ: 3.4, shieldBreak: 5, volleySpread: 0.75, waveDelay: 2,
  calibFrames: 15, stepWidth: 1.0, duckOn: 0.8, duckOff: 0.5,
};

// 追蹤一位玩家的魔杖手。座標單位：已做長寬比修正的影像座標；內部以肩寬為 1 做正規化。
export class WandTracker {
  constructor(cfg = CFG) { this.cfg = cfg; this.reset(); this.aimX = 0; this.aimY = 0; this.lastSwing = -1e9; this.raiseEnd = -1e9; }
  reset() { this.samples = []; this.hist = []; this.raised = false; this.stillT = 0; this.lastDir = 0; this.prevT = null; this.wasCharged = false; }
  // pose: {wrist:{x,y}, nose:{x,y}, shoulderC:{x,y}, sw} 或 null（追蹤遺失）
  update(t, pose) {
    const c = this.cfg;
    if (!pose || !(pose.sw > 0)) { this.reset(); return { tracked: false, raised: false, swing: false, power: false, zigzag: false, circle: false, charged: false, aimX: this.aimX, aimY: this.aimY }; }
    const sw = pose.sw;
    this.samples.push({ t, x: pose.wrist.x / sw, y: pose.wrist.y / sw });
    while (this.samples.length > 2 && t - this.samples[0].t > 0.12) this.samples.shift();
    const a = this.samples[0], b = this.samples[this.samples.length - 1];
    let vx = 0, vy = 0;
    if (b.t - a.t >= 0.03) { vx = (b.x - a.x) / (b.t - a.t); vy = (b.y - a.y) / (b.t - a.t); }
    const h = (pose.nose.y - pose.wrist.y) / sw; // 手腕高過鼻子多少
    if (!this.raised && h > c.raiseOn) this.raised = true;
    else if (this.raised && h < c.raiseOff) { this.raised = false; this.raiseEnd = t; }
    const upward = vy < 0 && -vy > Math.abs(vx); // 往上的快速動作是在舉杖，不算揮杖
    const speed = Math.hypot(vx, vy), dtu = this.prevT == null ? 0 : Math.min(0.2, t - this.prevT); this.prevT = t;
    // 蓄力：魔杖停住不動一段時間，下一次揮杖變成強力閃電
    this.stillT = (speed < 0.8 && !this.raised) ? this.stillT + dtu : (speed > c.swingSpeed || this.raised ? 0 : this.stillT);
    const charged = this.stillT >= c.chargeTime;
    let swing = false, power = false, zigzag = false, circle = false;
    if (speed > c.swingSpeed && !this.raised && !upward &&
        t - this.lastSwing >= c.swingRefractory && t - this.raiseEnd >= c.afterRaiseLock) {
      const dir = Math.abs(vx) > Math.abs(vy) ? Math.sign(vx) : 0;
      // 左右連揮：0.8 秒內往反方向再橫揮一次
      if (dir && this.lastDir === -dir && t - this.lastSwing <= 0.8) { zigzag = true; this.lastDir = 0; }
      else { swing = true; power = this.wasCharged; this.lastDir = dir; }
      this.lastSwing = t; this.hist = [];
    }
    this.wasCharged = charged; // 揮杖那一刻手已經在加速，所以看前一刻是否蓄滿
    // 畫圓圈：最近 1.3 秒的軌跡繞著中心轉滿一圈
    if (this.raised) this.hist = [];
    else {
      this.hist.push(b);
      while (this.hist.length && t - this.hist[0].t > 1.3) this.hist.shift();
      const H = this.hist;
      if (H.length >= 8) {
        let cx = 0, cy = 0; for (const q of H) { cx += q.x; cy += q.y; } cx /= H.length; cy /= H.length;
        let sum = 0, rs = 0, rmin = 1e9, prev = null;
        for (const q of H) {
          const r = Math.hypot(q.x - cx, q.y - cy), a = Math.atan2(q.y - cy, q.x - cx); rs += r; rmin = Math.min(rmin, r);
          if (prev != null) { let d = a - prev; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; sum += d; }
          prev = a;
        }
        const rmean = rs / H.length;
        if (Math.abs(sum) >= 2 * Math.PI * 0.95 && rmean >= 0.18 && rmin > rmean * 0.4) { circle = true; this.hist = []; this.lastDir = 0; }
      }
    }
    this.aimX = (pose.wrist.x - pose.shoulderC.x) / sw;
    this.aimY = (pose.shoulderC.y - pose.wrist.y) / sw;
    return { tracked: true, raised: this.raised, swing, power, zigzag, circle, charged, aimX: this.aimX, aimY: this.aimY };
  }
}

// ---------- 敵人與關卡 ----------
// xr/zr：活動範圍（世界座標，z 越大越靠近玩家）；atk：出手間隔（秒）；flight：魔法飛行時間
export const ENEMIES = {
  werewolf:   { name: '狼人', hp: 200, speed: 1.4, xr: [-2.6, 2.6], zr: [-0.6, 1.0], atk: [2.4, 3.8], dmg: 15, flight: 1.8 },
  spider:     { name: '巨蜘蛛', hp: 220, speed: 2.6, xr: [-3, 3], zr: [-1, 0.6], atk: [2.2, 3.4], dmg: 12, flight: 1.5 },
  spiderling: { name: '小蜘蛛', hp: 10, speed: 0.8, xr: [-2.6, 2.6], crawl: true, bite: 10 },
  troll:      { name: '沼澤巨魔', hp: 320, speed: 0.7, xr: [-2.2, 2.2], zr: [-0.8, 0.6], atk: [3.4, 4.8], dmg: 25, flight: 2.4 },
  ghost:      { name: '幽靈', hp: 200, speed: 1.8, xr: [-3, 3], zr: [-0.8, 1.2], atk: [2.0, 3.0], dmg: 12, flight: 1.6, phase: { show: [3.5, 5.5], hide: 1.6 } },
  skeleton:   { name: '骷髏', hp: 60, speed: 0.9, xr: [-3, 3], zr: [-4, 1.6], approach: true, atk: [3.0, 4.6], dmg: 10, flight: 1.7 },
  wizard:     { name: '黑巫師', hp: 300, speed: 2.2, xr: [-2.8, 2.8], zr: [-1, 0.6], atk: [1.8, 2.8], dmg: 15, flight: 1.4, shield: true, volleyEvery: 3 },
};
export const LEVELS = [
  { name: '黑森林', scene: 'forest', boss: 'werewolf' },
  { name: '蜘蛛洞穴', scene: 'cave', boss: 'spider', minions: { kind: 'spiderling', every: [3.5, 5.5], max: 3 } },
  { name: '沼澤', scene: 'swamp', boss: 'troll' },
  { name: '城堡走廊', scene: 'castle', boss: 'ghost' },
  { name: '墓園', scene: 'graveyard', waves: [['skeleton', 'skeleton', 'skeleton'], ['skeleton', 'skeleton', 'skeleton', 'skeleton']] },
  { name: '高塔', scene: 'tower', boss: 'wizard' },
];
const rnd = (rng, [a, b]) => a + rng() * (b - a);

// 身體位置：開局先記下站的位置，之後算出往左右跨了多少（-1~1）以及有沒有蹲下
export class BodyTracker {
  constructor(cfg = CFG) { this.cfg = cfg; this.reset(); }
  reset() { this.base = null; this.calib = []; this.duck = false; this.dodgeX = 0; }
  update(pose) {
    const c = this.cfg;
    if (!pose || !(pose.sw > 0)) return { dodgeX: this.dodgeX, duck: this.duck };
    const sw = pose.sw, cx = pose.shoulderC.x, ny = pose.nose.y;
    if (!this.base) {
      this.calib.push({ x: cx, y: ny });
      if (this.calib.length < c.calibFrames) return { dodgeX: 0, duck: false };
      const med = k => this.calib.map(p => p[k]).sort((a, b) => a - b)[this.calib.length >> 1];
      this.base = { x: med('x'), y: med('y') };
    }
    this.dodgeX = Math.max(-1, Math.min(1, (cx - this.base.x) / (c.stepWidth * sw)));
    const d = (ny - this.base.y) / sw; // 頭往下掉了幾個肩寬
    if (!this.duck && d > c.duckOn) this.duck = true;
    else if (this.duck && d < c.duckOff) this.duck = false;
    if (!this.duck) this.base.y += (ny - this.base.y) * 0.01; // 站著時慢慢校正，避免慢慢走動造成誤判
    return { dodgeX: this.dodgeX, duck: this.duck };
  }
}

// 故事模式的一關（1–2 人合作）。inputs[i] = {raised, swing, power, zigzag, circle, aim, dodgeX, duck}
export class Fight {
  constructor(nPlayers, levelIdx = 0, cfg = CFG, rng = Math.random) {
    this.cfg = cfg; this.rng = rng; this.state = 'play'; this.nextId = 1; this.levelIdx = levelIdx;
    this.level = LEVELS[levelIdx];
    this.players = Array.from({ length: nPlayers }, () => ({ hp: cfg.maxHp, mana: cfg.maxMana, cooldown: 0, down: false, reviveT: 0, raised: false, shieldT: 0, dodgeX: 0, duck: false }));
    this.enemies = []; this.projs = []; this.pending = []; this.waveIdx = 0; this.waveT = 0;
    this.minionT = this.level.minions ? rnd(rng, this.level.minions.every) : 0;
    if (this.level.boss) { const b = this.spawn(this.level.boss, 0, 0, this.pending); b.boss = true; }
    else this.spawnWave(0, this.pending);
  }
  get boss() { return this.enemies.find(e => e.boss); }
  spawn(kind, x, z, ev) {
    const d = ENEMIES[kind], e = { id: this.nextId++, kind, def: d, x, z, gx: x, gz: z, hp: d.hp, maxHp: d.hp, retargetT: 0,
      nextAttack: this.cfg.firstAttack + this.rng(), stunT: 0, immuneT: 0, hidden: false, phaseT: d.phase ? rnd(this.rng, d.phase.show) : 0,
      shieldDownT: 0, attacks: 0, dead: false, target: 0, attackT: 0, hitT: 0 };
    this.enemies.push(e); ev.push({ type: 'spawn', id: e.id }); return e;
  }
  spawnWave(n, ev) {
    const w = this.level.waves[n];
    w.forEach((k, j) => { const d = ENEMIES[k], x = d.xr[0] + (d.xr[1] - d.xr[0]) * (j + 0.5) / w.length; this.spawn(k, x, d.zr[0] - this.rng(), ev); });
    this.waveIdx = n; ev.push({ type: 'wave', n: n + 1, total: this.level.waves.length });
  }
  alivePlayers() { return this.players.map((p, i) => i).filter(i => !this.players[i].down); }
  pickTarget(aim) {
    const cand = this.enemies.filter(e => !e.dead && !e.hidden);
    if (!cand.length) return null;
    if (aim == null) return cand.find(e => e.boss) || cand[0];
    let best = null; for (const e of cand) if (!best || Math.abs(e.x - aim) < Math.abs(best.x - aim)) best = e;
    return Math.abs(best.x - aim) <= this.cfg.aimTol ? best : null;
  }
  hurt(e, dmg, ev) {
    if (e.dead) return;
    e.hp = Math.max(0, e.hp - dmg); e.hitT = 0.4; ev.push({ type: 'enemyHit', id: e.id, dmg });
    if (e.hp > 0) return;
    e.dead = true; ev.push({ type: 'enemyDie', id: e.id });
    if (e.boss) for (const o of this.enemies) if (!o.dead) { o.dead = true; ev.push({ type: 'enemyDie', id: o.id }); } // 頭目倒下，小怪一起逃散
  }
  damagePlayer(i, dmg, ev, why) {
    const p = this.players[i], c = this.cfg; if (p.down) return;
    if (p.shieldT > 0) { ev.push({ type: 'blocked', player: i }); return; }
    p.hp = Math.max(0, p.hp - dmg); ev.push({ type: why, player: i });
    if (p.hp <= 0) { p.down = true; p.reviveT = c.reviveTime; ev.push({ type: 'down', player: i }); }
  }
  moveEnemy(e, dt, ev) {
    const d = e.def, c = this.cfg, r = this.rng;
    e.attackT = Math.max(0, e.attackT - dt); e.hitT = Math.max(0, e.hitT - dt); e.immuneT = Math.max(0, e.immuneT - dt);
    if (e.stunT > 0) { e.stunT -= dt; if (e.stunT <= 0) { e.stunT = 0; e.immuneT = c.tripImmune; ev.push({ type: 'recover', id: e.id }); } return; }
    if (d.shield && e.shieldDownT > 0) { e.shieldDownT -= dt; if (e.shieldDownT <= 0) { e.shieldDownT = 0; ev.push({ type: 'shieldUp', id: e.id }); } }
    if (d.phase) {
      e.phaseT -= dt;
      if (e.phaseT <= 0) {
        e.hidden = !e.hidden;
        if (e.hidden) { e.phaseT = d.phase.hide; ev.push({ type: 'vanish', id: e.id }); }
        else { e.x = e.gx = rnd(r, d.xr); e.z = e.gz = rnd(r, d.zr); e.phaseT = rnd(r, d.phase.show); ev.push({ type: 'appear', id: e.id }); }
      }
      if (e.hidden) return;
    }
    if (d.crawl) { // 小怪：直直爬向玩家，爬到面前就咬一口
      e.z += d.speed * dt; e.retargetT -= dt;
      if (e.retargetT <= 0) { e.gx = rnd(r, d.xr); e.retargetT = 1 + r(); }
      e.x += Math.sign(e.gx - e.x) * Math.min(Math.abs(e.gx - e.x), 1.2 * dt);
      if (e.z >= c.biteZ) { e.dead = true; ev.push({ type: 'enemyDie', id: e.id, bite: true }); this.damagePlayer(e.target, d.bite, ev, 'bite'); }
      return;
    }
    e.retargetT -= dt;
    const dx = e.gx - e.x, dz = e.gz - e.z, dist = Math.hypot(dx, dz);
    if (dist < 0.1 || e.retargetT <= 0) {
      e.gx = rnd(r, d.xr);
      e.gz = d.approach ? Math.min(d.zr[1], e.z + 0.8 + r() * 1.2) : rnd(r, d.zr);
      e.retargetT = 1.5 + r() * 2;
    } else { const s = Math.min(dist, d.speed * dt); e.x += dx / dist * s; e.z += dz / dist * s; }
    if (!d.atk) return;
    e.nextAttack -= dt;
    if (e.nextAttack > 0) return;
    e.nextAttack = rnd(r, d.atk);
    const alive = this.alivePlayers(); if (!alive.length) return;
    const target = alive[Math.floor(r() * alive.length) % alive.length], p = this.players[target];
    e.attacks++; e.attackT = 0.5;
    const offs = d.volleyEvery && e.attacks % d.volleyEvery === 0 ? [-c.volleySpread, 0, c.volleySpread] : [0];
    for (const o of offs) { // 魔法飛向玩家「出手當下」站的位置
      const q = { id: this.nextId++, from: e.id, kind: e.kind, target, aimX: p.dodgeX + o, t: d.flight, total: d.flight, dmg: d.dmg, reflected: false };
      this.projs.push(q); ev.push({ type: 'throw', id: q.id, from: e.id, target });
    }
  }
  step(dt, inputs) {
    const c = this.cfg, ev = this.pending; this.pending = [];
    if (this.state !== 'play') return ev;
    this.players.forEach((p, i) => {
      const inp = inputs[i] || {};
      p.dodgeX = inp.dodgeX || 0; p.duck = !!inp.duck;
      if (p.down) {
        p.raised = false; p.reviveT -= dt;
        if (p.reviveT <= 0) { p.down = false; p.hp = c.maxHp / 2; ev.push({ type: 'revive', player: i }); }
        return;
      }
      p.cooldown = Math.max(0, p.cooldown - dt);
      p.raised = !!inp.raised;
      if (p.raised) p.mana = Math.min(c.maxMana, p.mana + c.manaRegen * dt);
      p.shieldT = Math.max(0, p.shieldT - dt);
      if (p.raised) return;
      const inc = this.projs.filter(q => q.target === i && !q.reflected && q.t <= c.reflectWindow).sort((x, y) => x.t - y.t)[0];
      if (inp.circle) { // 畫圈：防護罩
        if (p.mana >= c.shieldCost) { p.mana -= c.shieldCost; p.shieldT = c.shieldTime; ev.push({ type: 'shield', player: i }); }
        else ev.push({ type: 'nomana', player: i });
      }
      if (inp.zigzag && !inc) { // 左右連揮：絆倒瞄準的敵人
        const e = this.pickTarget(inp.aim);
        if (!e) ev.push({ type: 'miss', player: i, x: inp.aim ?? 0 });
        else if (e.stunT > 0 || e.immuneT > 0) ev.push({ type: 'immune', player: i });
        else if (p.mana >= c.tripCost) { p.mana -= c.tripCost; e.stunT = c.stunTime; ev.push({ type: 'trip', player: i, id: e.id }); }
        else ev.push({ type: 'nomana', player: i });
      } else if (inp.swing || inp.zigzag) {
        if (inc) { inc.reflected = true; inc.t = c.reflectReturn; inc.by = i; ev.push({ type: 'reflect', player: i, id: inc.id }); }
        else if (p.cooldown <= 0) {
          const power = !!inp.power && p.mana >= c.powerCost;
          if (power || p.mana >= c.attackCost) {
            p.mana -= power ? c.powerCost : c.attackCost; p.cooldown = c.attackCooldown;
            const e = this.pickTarget(inp.aim);
            if (!e) ev.push({ type: 'miss', player: i, x: inp.aim ?? 0, power });
            else if (e.def.shield && e.shieldDownT <= 0) ev.push({ type: 'shielded', player: i, id: e.id, power });
            else { ev.push({ type: 'bolt', player: i, id: e.id, power }); this.hurt(e, power ? c.powerDamage : c.boltDamage, ev); }
          } else ev.push({ type: 'nomana', player: i });
        }
      }
    });
    for (const q of this.projs) {
      q.t -= dt;
      if (q.t > 0) continue;
      q.done = true;
      if (q.reflected) {
        const e = this.enemies.find(o => o.id === q.from);
        ev.push({ type: 'reflectHit', id: q.id, enemy: q.from });
        if (e && !e.dead) {
          if (e.def.shield) { const was = e.shieldDownT > 0; e.shieldDownT = c.shieldBreak; if (!was) ev.push({ type: 'shieldBreak', id: e.id }); }
          this.hurt(e, c.reflectDamage, ev);
        }
        continue;
      }
      const p = this.players[q.target];
      if (p.down) continue;
      if (p.shieldT <= 0 && (p.duck || Math.abs(p.dodgeX - q.aimX) >= c.dodgeHit)) { ev.push({ type: 'dodged', player: q.target, id: q.id }); continue; }
      this.damagePlayer(q.target, q.dmg, ev, 'hit');
    }
    this.projs = this.projs.filter(q => !q.done);
    for (const e of this.enemies) if (!e.dead) this.moveEnemy(e, dt, ev);
    // 小怪：頭目活著時陸續生出來
    const mn = this.level.minions, boss = this.boss;
    if (mn && boss && !boss.dead) {
      this.minionT -= dt;
      if (this.minionT <= 0) {
        this.minionT = rnd(this.rng, mn.every);
        const alive = this.alivePlayers(), n = this.enemies.filter(e => !e.dead && e.kind === mn.kind).length;
        if (n < mn.max && alive.length) { const m = this.spawn(mn.kind, boss.x, boss.z + 0.5, ev); m.target = alive[Math.floor(this.rng() * alive.length) % alive.length]; }
      }
    }
    this.enemies = this.enemies.filter(e => !e.dead || this.projs.some(q => q.from === e.id));
    // 勝負
    if (this.level.boss ? boss && boss.dead : !this.enemies.some(e => !e.dead)) {
      const more = this.level.waves && this.waveIdx + 1 < this.level.waves.length;
      if (more) { this.waveT += dt; if (this.waveT >= c.waveDelay) { this.waveT = 0; this.spawnWave(this.waveIdx + 1, ev); } }
      else { this.state = 'win'; ev.push({ type: 'win' }); }
    } else if (this.players.every(p => p.down)) { this.state = 'lose'; ev.push({ type: 'lose' }); }
    return ev;
  }
}

// 雙人 PK：左右對射，三戰兩勝。opts[i] = {hp, regen} 是每位玩家的讓分設定
export class Duel {
  constructor(opts = [{}, {}], cfg = CFG) {
    this.cfg = cfg; this.opts = [0, 1].map(i => ({ hp: cfg.maxHp, regen: cfg.manaRegen, ...(opts[i] || {}) }));
    this.wins = [0, 0]; this.round = 0; this.nextId = 1; this.winner = -1; this.roundWinner = -1; this.startRound();
  }
  startRound() {
    const c = this.cfg; this.round++; this.state = 'play'; this.projs = []; this.pause = 0;
    this.players = this.opts.map(o => ({ hp: o.hp, maxHp: o.hp, mana: c.maxMana, regen: o.regen, cooldown: 0, raised: false, down: false, shieldT: 0, stunT: 0, immuneT: 0 }));
  }
  step(dt, inputs) {
    const c = this.cfg, ev = [];
    if (this.state === 'matchEnd') return ev;
    if (this.state === 'roundEnd') { this.pause -= dt; if (this.pause <= 0) { this.startRound(); ev.push({ type: 'roundStart' }); } return ev; }
    this.players.forEach((p, i) => {
      const inp = inputs[i] || {}, o = this.players[1 - i];
      p.duck = !!inp.duck;
      p.cooldown = Math.max(0, p.cooldown - dt); p.shieldT = Math.max(0, p.shieldT - dt); p.immuneT = Math.max(0, p.immuneT - dt);
      if (p.stunT > 0) { p.raised = false; p.stunT -= dt; if (p.stunT <= 0) { p.stunT = 0; p.immuneT = c.tripImmune; } return; } // 被絆倒：不能行動
      p.raised = !!inp.raised;
      if (p.raised) { p.mana = Math.min(c.maxMana, p.mana + p.regen * dt); return; }
      const inc = this.projs.filter(q => q.target === i && q.t <= q.window).sort((a, b) => a.t - b.t)[0];
      if (inp.circle) {
        if (p.mana >= c.shieldCost) { p.mana -= c.shieldCost; p.shieldT = c.shieldTime; ev.push({ type: 'shield', player: i }); }
        else ev.push({ type: 'nomana', player: i });
      }
      if (inp.zigzag && !inc) {
        if (o.stunT > 0 || o.immuneT > 0) ev.push({ type: 'immune', player: i });
        else if (p.mana >= c.tripCost) { p.mana -= c.tripCost; o.stunT = c.stunTime; o.raised = false; ev.push({ type: 'trip', player: i }); }
        else ev.push({ type: 'nomana', player: i });
        return;
      }
      if (!inp.swing && !inp.zigzag) return;
      if (inc) { // 反彈：每彈一次加快 15%
        inc.target = 1 - i; inc.bounces++;
        inc.total = Math.max(c.duelMinFlight, c.duelFlight / Math.pow(c.duelSpeedup, inc.bounces));
        inc.t = inc.total; inc.window = Math.min(c.reflectWindow, inc.total * 0.4);
        ev.push({ type: 'reflect', player: i, id: inc.id });
      } else if (p.cooldown <= 0) {
        const power = !!inp.power && p.mana >= c.powerCost;
        if (power || p.mana >= c.attackCost) {
          p.mana -= power ? c.powerCost : c.attackCost; p.cooldown = c.attackCooldown;
          const total = power ? c.duelFlight * 0.75 : c.duelFlight; // 強力光球：更快、更痛
          const q = { id: this.nextId++, target: 1 - i, t: total, total, bounces: 0, window: Math.min(c.reflectWindow, total * 0.4), power };
          this.projs.push(q); ev.push({ type: 'shoot', player: i, id: q.id, power });
        } else ev.push({ type: 'nomana', player: i });
      }
    });
    for (const q of this.projs) {
      q.t -= dt; if (q.t > 0) continue;
      q.done = true; const p = this.players[q.target];
      if (p.shieldT > 0) { ev.push({ type: 'blocked', player: q.target }); continue; }
      if (p.duck) { ev.push({ type: 'dodged', player: q.target, id: q.id }); continue; } // PK：蹲下閃過
      p.hp = Math.max(0, p.hp - (q.power ? c.powerDamage : c.duelDamage)); ev.push({ type: 'hit', player: q.target });
    }
    this.projs = this.projs.filter(q => !q.done);
    const d0 = this.players[0].hp <= 0, d1 = this.players[1].hp <= 0;
    if (d0 || d1) {
      const w = d0 && d1 ? -1 : d0 ? 1 : 0; // 同時歸零算平手，這一局不計分
      if (w >= 0) this.wins[w]++;
      this.projs = [];
      if (w >= 0 && this.wins[w] >= c.winsNeeded) { this.state = 'matchEnd'; this.winner = w; ev.push({ type: 'matchEnd', winner: w }); }
      else { this.state = 'roundEnd'; this.roundWinner = w; this.pause = c.roundPause; ev.push({ type: 'roundEnd', winner: w }); }
    }
    return ev;
  }
}

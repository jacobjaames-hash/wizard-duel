// 純邏輯：手勢判定與戰鬥規則（不碰 DOM，可用 node 測試）
export const CFG = {
  maxHp: 100, maxMana: 100, attackCost: 10, attackCooldown: 0.4, manaRegen: 25,
  boltDamage: 10, reflectDamage: 30, reflectWindow: 0.5, reflectReturn: 0.6,
  swingSpeed: 5, swingRefractory: 0.35, raiseOn: 0.5, raiseOff: 0.2, afterRaiseLock: 0.3,
  duelFlight: 1.5, duelDamage: 15, duelSpeedup: 1.15, duelMinFlight: 0.6, roundPause: 3, winsNeeded: 2, fastRegen: 40,
  shieldCost: 20, shieldTime: 4, tripCost: 30, stunTime: 3, tripImmune: 6, powerCost: 25, powerDamage: 30, chargeTime: 1.2,
  monsterHp: 200, monsterDamage: 15, projFlight: 1.8, monsterInterval: [2.5, 4], reviveTime: 10,
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

// 一場對怪物的戰鬥（1–2 人合作）
export class Fight {
  constructor(nPlayers, cfg = CFG, rng = Math.random) {
    this.cfg = cfg; this.rng = rng; this.state = 'play'; this.nextId = 1;
    this.players = Array.from({ length: nPlayers }, () => ({ hp: cfg.maxHp, mana: cfg.maxMana, cooldown: 0, down: false, reviveT: 0, raised: false, shieldT: 0 }));
    this.monster = { hp: cfg.monsterHp, nextAttack: 3, stunT: 0, immuneT: 0 };
    this.projs = [];
  }
  step(dt, inputs) {
    const c = this.cfg, ev = [];
    if (this.state !== 'play') return ev;
    this.players.forEach((p, i) => {
      const inp = inputs[i] || {};
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
      if (inp.zigzag && !inc) { // 左右連揮：絆倒
        const m = this.monster;
        if (m.stunT > 0 || m.immuneT > 0) ev.push({ type: 'immune', player: i });
        else if (p.mana >= c.tripCost) { p.mana -= c.tripCost; m.stunT = c.stunTime; ev.push({ type: 'trip', player: i }); }
        else ev.push({ type: 'nomana', player: i });
      } else if (inp.swing || inp.zigzag) {
        if (inc) { inc.reflected = true; inc.t = c.reflectReturn; ev.push({ type: 'reflect', player: i, id: inc.id }); }
        else if (p.cooldown <= 0) {
          const power = !!inp.power && p.mana >= c.powerCost;
          if (power || p.mana >= c.attackCost) {
            p.mana -= power ? c.powerCost : c.attackCost; p.cooldown = c.attackCooldown; this.monster.hp -= power ? c.powerDamage : c.boltDamage;
            ev.push({ type: 'bolt', player: i, power });
          } else ev.push({ type: 'nomana', player: i });
        }
      }
    });
    for (const q of this.projs) {
      q.t -= dt;
      if (q.t > 0) continue;
      q.done = true;
      if (q.reflected) { this.monster.hp -= c.reflectDamage; ev.push({ type: 'monsterHit', id: q.id }); }
      else {
        const p = this.players[q.target];
        if (!p.down && p.shieldT > 0) ev.push({ type: 'blocked', player: q.target });
        else if (!p.down) {
          p.hp = Math.max(0, p.hp - c.monsterDamage); ev.push({ type: 'hit', player: q.target });
          if (p.hp <= 0) { p.down = true; p.reviveT = c.reviveTime; ev.push({ type: 'down', player: q.target }); }
        }
      }
    }
    this.projs = this.projs.filter(q => !q.done);
    const m = this.monster; m.immuneT = Math.max(0, m.immuneT - dt);
    if (m.stunT > 0) { m.stunT -= dt; if (m.stunT <= 0) { m.stunT = 0; m.immuneT = c.tripImmune; ev.push({ type: 'recover' }); } }
    else m.nextAttack -= dt;
    if (m.stunT <= 0 && m.nextAttack <= 0 && m.hp > 0) {
      const alive = this.players.map((p, i) => i).filter(i => !this.players[i].down);
      if (alive.length) {
        const target = alive[Math.floor(this.rng() * alive.length) % alive.length];
        const q = { id: this.nextId++, target, t: c.projFlight, total: c.projFlight, reflected: false };
        this.projs.push(q); ev.push({ type: 'throw', id: q.id, target });
      }
      this.monster.nextAttack = c.monsterInterval[0] + this.rng() * (c.monsterInterval[1] - c.monsterInterval[0]);
    }
    if (this.monster.hp <= 0) { this.monster.hp = 0; this.state = 'win'; ev.push({ type: 'win' }); }
    else if (this.players.every(p => p.down)) { this.state = 'lose'; ev.push({ type: 'lose' }); }
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

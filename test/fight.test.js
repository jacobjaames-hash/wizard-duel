import test from 'node:test';
import assert from 'node:assert/strict';
import { CFG, ENEMIES, LEVELS, Fight, BodyTracker } from '../js/logic.js';

const fight = (level = 0, n = 1, r = 0.5) => new Fight(n, level, CFG, () => r);
const boss = f => f.enemies.find(e => e.boss);
// 讓頭目馬上出手一次，回傳那一發魔法
function forceThrow(f, e = boss(f), inputs = []) { e.nextAttack = 0; f.step(0.001, inputs); e.nextAttack = 99; return f.projs[f.projs.length - 1]; }

test('六個關卡依序是森林、洞穴、沼澤、城堡、墓園、高塔', () => {
  assert.deepEqual(LEVELS.map(l => l.scene), ['forest', 'cave', 'swamp', 'castle', 'graveyard', 'tower']);
  LEVELS.forEach((l, i) => { const f = fight(i); assert.ok(f.enemies.length >= 1, l.name); });
});
test('攻擊耗 10 魔力打 10 血、有冷卻、魔力不足不能施法', () => {
  const f = fight(); const b = boss(f);
  let ev = f.step(0.01, [{ swing: true }]);
  assert.ok(ev.some(e => e.type === 'bolt')); assert.equal(f.players[0].mana, 90); assert.equal(b.hp, 190);
  f.step(0.01, [{ swing: true }]); assert.equal(f.players[0].mana, 90);
  f.players[0].mana = 5; f.players[0].cooldown = 0;
  ev = f.step(0.01, [{ swing: true }]); assert.ok(ev.some(e => e.type === 'nomana')); assert.equal(b.hp, 190);
});
test('舉杖每秒回 25 魔力，舉著時不能攻擊', () => {
  const f = fight(); f.players[0].mana = 0; boss(f).nextAttack = 99;
  f.step(1, [{ raised: true, swing: true }]); assert.equal(f.players[0].mana, 25); assert.equal(boss(f).hp, 200);
});
test('敵人會在活動範圍內走動，不會停在原地', () => {
  const f = fight(0, 1, 0); const b = boss(f), d = ENEMIES.werewolf; b.nextAttack = 1e9;
  let r = 0.13; f.rng = () => (r = (r * 9301 + 0.4927) % 1);
  const xs = new Set();
  for (let k = 0; k < 600; k++) {
    f.step(0.05, []); xs.add(b.x.toFixed(1));
    assert.ok(b.x >= d.xr[0] - 1e-9 && b.x <= d.xr[1] + 1e-9 && b.z >= Math.min(0, d.zr[0]) - 1e-9 && b.z <= d.zr[1] + 1e-9);
  }
  assert.ok(xs.size > 10, `只走到 ${xs.size} 個位置`);
});
test('瞄準：魔杖指的方向離敵人太遠就打不中（魔力照扣）', () => {
  const f = fight(); const b = boss(f); b.x = 2.5;
  let ev = f.step(0.001, [{ swing: true, aim: -1.5 }]);
  assert.ok(ev.some(e => e.type === 'miss')); assert.equal(b.hp, 200); assert.equal(f.players[0].mana, 90);
  f.players[0].cooldown = 0; b.x = 2.5;
  ev = f.step(0.001, [{ swing: true, aim: 1.2 }]); assert.ok(ev.some(e => e.type === 'bolt')); assert.equal(b.hp, 190);
});
test('沒閃沒擋扣 15 血；出手後往旁邊跨一步或蹲下就閃過', () => {
  let f = fight(); let q = forceThrow(f, boss(f), [{ dodgeX: 0 }]);
  assert.equal(q.aimX, 0); f.step(CFG.projFlight || ENEMIES.werewolf.flight, [{ dodgeX: 0 }]); assert.equal(f.players[0].hp, 85);
  f = fight(); q = forceThrow(f);
  let ev = f.step(ENEMIES.werewolf.flight, [{ dodgeX: 0.8 }]);
  assert.ok(ev.some(e => e.type === 'dodged')); assert.equal(f.players[0].hp, 100);
  f = fight(); q = forceThrow(f, boss(f), [{ dodgeX: -1 }]); assert.equal(q.aimX, -1);
  ev = f.step(ENEMIES.werewolf.flight, [{ dodgeX: -1 }]); assert.equal(f.players[0].hp, 85); // 站在原地被瞄準的位置
  f = fight(); forceThrow(f);
  ev = f.step(ENEMIES.werewolf.flight, [{ duck: true }]); assert.ok(ev.some(e => e.type === 'dodged')); assert.equal(f.players[0].hp, 100);
});
test('魔法飛到面前時揮杖反彈（不耗魔力），彈回去打中敵人 30 血', () => {
  const f = fight(); const b = boss(f); forceThrow(f);
  f.step(ENEMIES.werewolf.flight - 0.4, []);
  const ev = f.step(0.01, [{ swing: true }]);
  assert.ok(ev.some(e => e.type === 'reflect')); assert.equal(f.players[0].mana, 100);
  f.step(1, []); assert.equal(b.hp, 170); assert.equal(f.players[0].hp, 100);
});
test('防護罩耗 20 魔力，擋下攻擊（不用閃）', () => {
  const f = fight(); forceThrow(f);
  f.step(0.01, [{ circle: true }]); assert.equal(f.players[0].mana, 80);
  const ev = f.step(2, []); assert.ok(ev.some(e => e.type === 'blocked')); assert.equal(f.players[0].hp, 100);
});
test('絆倒：敵人 3 秒不能動也不能出手，起來後 6 秒內免疫', () => {
  const f = fight(); const b = boss(f); b.nextAttack = 0.5;
  let ev = f.step(0.01, [{ zigzag: true }]); assert.ok(ev.some(e => e.type === 'trip'));
  const x = b.x, z = b.z; f.step(2.9, []); assert.equal(f.projs.length, 0); assert.equal(b.x, x); assert.equal(b.z, z);
  f.step(0.2, []); ev = f.step(0.01, [{ zigzag: true }]); assert.ok(ev.some(e => e.type === 'immune')); assert.equal(f.players[0].mana, 70);
});
test('強力閃電耗 25 魔力打 30 血', () => {
  const f = fight(); f.step(0.01, [{ swing: true, power: true }]); assert.equal(f.players[0].mana, 75); assert.equal(boss(f).hp, 170);
});
test('兩人都倒才失敗，倒下 10 秒後半血復活；頭目歸零就過關', () => {
  let f = fight(0, 2); boss(f).nextAttack = 99;
  f.players[0].hp = 0; f.players[0].down = true; f.players[0].reviveT = 10;
  f.step(9.9, []); assert.equal(f.state, 'play'); f.step(0.2, []); assert.equal(f.players[0].hp, 50);
  f.players.forEach(p => { p.down = true; p.reviveT = 5; }); f.step(0.01, []); assert.equal(f.state, 'lose');
  f = fight(); boss(f).hp = 10; const ev = f.step(0.01, [{ swing: true }]); assert.equal(f.state, 'win'); assert.ok(ev.some(e => e.type === 'win'));
});
test('蜘蛛洞穴：會生小蜘蛛（最多 3 隻），爬到面前咬 10 血；一下就打掉；巨蜘蛛死了小蜘蛛一起散', () => {
  const f = fight(1); const b = boss(f); b.nextAttack = 1e9;
  for (let k = 0; k < 400; k++) { f.step(0.05, []); b.nextAttack = 1e9; }
  const kids = () => f.enemies.filter(e => !e.dead && e.kind === 'spiderling');
  assert.ok(f.players[0].hp < 100, '小蜘蛛應該咬到人'); assert.ok(kids().length <= 3);
  while (!kids().length) f.step(0.05, []);
  const s = kids()[0]; f.players[0].cooldown = 0; f.players[0].mana = 100;
  f.step(0.001, [{ swing: true, aim: s.x }]);
  assert.ok(s.dead || kids().length === 0 || s.hp <= 0 || b.hp < ENEMIES.spider.hp);
  while (!kids().length) f.step(0.05, []);
  b.hp = 5; f.players[0].cooldown = 0; f.players[0].mana = 100;
  f.step(0.001, [{ swing: true, aim: b.x }]); assert.equal(f.state, 'win'); assert.equal(kids().length, 0);
});
test('城堡幽靈：消失時打不到也不出手，之後換個位置出現', () => {
  const f = fight(3, 1, 0.9); const g = boss(f); g.phaseT = 0.001; g.nextAttack = 0.5;
  let ev = f.step(0.01, []); assert.ok(ev.some(e => e.type === 'vanish')); assert.ok(g.hidden);
  ev = f.step(0.01, [{ swing: true }]); assert.ok(ev.some(e => e.type === 'miss')); assert.equal(g.hp, 200);
  f.step(1, []); assert.equal(f.projs.length, 0);
  ev = f.step(1, []); assert.ok(ev.some(e => e.type === 'appear')); assert.ok(!g.hidden);
});
test('墓園：兩波骷髏，第一波打完 2 秒後出第二波，全部打完才過關', () => {
  const f = fight(4); assert.equal(f.enemies.length, 3);
  const killAll = () => f.enemies.forEach(e => { if (!e.dead) f.hurt(e, 999, []); });
  killAll(); let ev = f.step(1, []); assert.equal(f.state, 'play');
  ev = f.step(1.1, []); assert.ok(ev.some(e => e.type === 'wave' && e.n === 2)); assert.equal(f.enemies.filter(e => !e.dead).length, 4);
  killAll(); f.step(0.01, []); assert.equal(f.state, 'win');
});
test('骷髏會一路往前逼近', () => {
  const f = fight(4, 1, 0.5); const s = f.enemies[0], z0 = s.z;
  for (let k = 0; k < 200; k++) { f.step(0.05, []); f.enemies.forEach(e => e.nextAttack = 99); }
  assert.ok(s.z > z0 + 2, `z ${z0} -> ${s.z}`);
});
test('黑巫師：護盾擋住普通閃電；把他的魔法反彈回去才能破盾，破盾後閃電有效', () => {
  const f = fight(5); const w = boss(f);
  let ev = f.step(0.01, [{ swing: true }]); assert.ok(ev.some(e => e.type === 'shielded')); assert.equal(w.hp, 300);
  forceThrow(f); f.step(ENEMIES.wizard.flight - 0.3, []); f.step(0.01, [{ swing: true }]);
  ev = f.step(1, []); assert.ok(ev.some(e => e.type === 'shieldBreak')); assert.equal(w.hp, 270);
  f.players[0].cooldown = 0; ev = f.step(0.01, [{ swing: true }]); assert.ok(ev.some(e => e.type === 'bolt')); assert.equal(w.hp, 260);
  f.step(CFG.shieldBreak, []); ev = f.step(0.01, []);
  f.players[0].cooldown = 0; ev = f.step(0.01, [{ swing: true }]); assert.ok(ev.some(e => e.type === 'shielded'));
});
test('黑巫師每第 3 次出手放 3 發散開的魔法，站中間只會被中間那發打中', () => {
  const f = fight(5); const w = boss(f); w.attacks = 2;
  forceThrow(f); assert.equal(f.projs.length, 3);
  assert.deepEqual(f.projs.map(q => q.aimX).sort((a, b) => a - b), [-0.75, 0, 0.75]);
  f.step(ENEMIES.wizard.flight, []); assert.equal(f.players[0].hp, 85);
});
test('身體追蹤：先校正站位，往旁邊跨一步得到約 ±1，頭往下掉一個肩寬算蹲下', () => {
  const bt = new BodyTracker(); const P = (x, ny) => ({ shoulderC: { x, y: 0.45 }, nose: { x, y: ny }, sw: 0.2 });
  for (let k = 0; k < CFG.calibFrames; k++) assert.equal(bt.update(P(0.5, 0.3)).dodgeX, 0);
  assert.ok(Math.abs(bt.update(P(0.7, 0.3)).dodgeX - 1) < 1e-9);
  assert.ok(Math.abs(bt.update(P(0.4, 0.3)).dodgeX + 0.5) < 1e-9);
  assert.equal(bt.update(P(0.5, 0.36)).duck, false); // 只低一點點不算
  assert.equal(bt.update(P(0.5, 0.5)).duck, true);
  assert.equal(bt.update(null).duck, true); // 追蹤遺失：保留上一個狀態
  assert.equal(bt.update(P(0.5, 0.31)).duck, false);
});

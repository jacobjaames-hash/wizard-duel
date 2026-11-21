import test from 'node:test';
import assert from 'node:assert/strict';
import { CFG, WandTracker, Duel } from '../js/logic.js';

const pose = (wx, wy) => ({ wrist: { x: wx, y: wy }, nose: { x: 0.5, y: 0.3 }, shoulderC: { x: 0.5, y: 0.45 }, sw: 0.2 });
function run(tr, path, dt = 1 / 30, t0 = 0) { let n = 0, last; path.forEach((p, i) => { last = tr.update(t0 + i * dt, p); if (last.swing) n++; }); return { n, last }; }

test('快速橫揮觸發一次揮杖，慢慢移動不觸發', () => {
  const fast = Array.from({ length: 6 }, (_, i) => pose(0.3 + i * 0.06, 0.5)); // 9 肩寬/秒
  assert.equal(run(new WandTracker(), fast).n, 1);
  const slow = Array.from({ length: 30 }, (_, i) => pose(0.3 + i * 0.004, 0.5));
  assert.equal(run(new WandTracker(), slow).n, 0);
});
test('快速往上舉不算揮杖，舉過頭判定為回魔', () => {
  const up = Array.from({ length: 8 }, (_, i) => pose(0.6, 0.6 - i * 0.07));
  const r = run(new WandTracker(), up);
  assert.equal(r.n, 0); assert.equal(r.last.raised, true);
});
test('放下手的那一下不誤觸攻擊', () => {
  const tr = new WandTracker();
  run(tr, Array.from({ length: 8 }, (_, i) => pose(0.6, 0.6 - i * 0.07)));
  const down = Array.from({ length: 5 }, (_, i) => pose(0.6, 0.11 + i * 0.08));
  assert.equal(run(tr, down, 1 / 30, 8 / 30).n, 0);
});
test('追蹤遺失不當機也不觸發', () => {
  const tr = new WandTracker();
  const r = tr.update(0, null);
  assert.deepEqual([r.tracked, r.swing, r.raised], [false, false, false]);
  tr.update(0.1, pose(0.1, 0.5)); // 遺失後重新出現在很遠的位置，不該算揮杖
  assert.equal(tr.update(0.13, pose(0.1, 0.5)).swing, false);
});
test('PK：揮杖射出光球耗 10 魔力，1.5 秒後沒擋到扣 15 血', () => {
  const d = new Duel();
  const ev = d.step(0.01, [{ swing: true }, {}]);
  assert.equal(ev[0].type, 'shoot'); assert.equal(d.players[0].mana, 90); assert.equal(d.projs[0].target, 1);
  d.step(1.4, [{}, {}]); assert.equal(d.players[1].hp, 100);
  d.step(0.2, [{}, {}]); assert.equal(d.players[1].hp, 85); assert.equal(d.projs.length, 0);
});
test('PK：光球到面前時揮杖反彈回去，每次加快 15%，不耗魔力；舉杖時不能反彈', () => {
  const d = new Duel(); d.step(0.01, [{ swing: true }, {}]); d.step(1.2, [{}, {}]);
  const ev = d.step(0.01, [{}, { swing: true }]);
  assert.equal(ev[0].type, 'reflect'); assert.equal(d.players[1].mana, 100); assert.equal(d.projs[0].target, 0);
  assert.ok(Math.abs(d.projs[0].total - 1.5 / 1.15) < 1e-9);
  d.step(d.projs[0].total - 0.1, [{}, {}]);
  d.step(0.01, [{ swing: true, raised: true }, {}]); assert.equal(d.projs[0].target, 0); // 舉著擋不了
  d.step(0.2, [{}, {}]); assert.equal(d.players[0].hp, 85);
});
test('PK：太早揮不算反彈而是自己也射一發', () => {
  const d = new Duel(); d.step(0.01, [{ swing: true }, {}]);
  d.step(0.01, [{}, { swing: true }]); assert.equal(d.projs.length, 2); assert.equal(d.players[1].mana, 90);
});
test('PK：讓分設定生效（血量、回魔速度）', () => {
  const d = new Duel([{ hp: 100 }, { hp: 200, regen: CFG.fastRegen }]);
  assert.equal(d.players[1].hp, 200); d.players[1].mana = 0; d.step(1, [{}, { raised: true }]); assert.equal(d.players[1].mana, 40);
});
test('PK：三戰兩勝，局間暫停 3 秒後血量魔力重置', () => {
  const d = new Duel(); d.players[1].hp = 15; d.players[0].mana = 50;
  d.step(0.01, [{ swing: true }, {}]); let ev = d.step(1.6, [{}, {}]);
  assert.equal(d.state, 'roundEnd'); assert.deepEqual(d.wins, [1, 0]); assert.ok(ev.some(e => e.type === 'roundEnd' && e.winner === 0));
  d.step(1, [{ swing: true }, {}]); assert.equal(d.state, 'roundEnd');
  d.step(2.1, [{}, {}]); assert.equal(d.state, 'play'); assert.equal(d.players[1].hp, 100); assert.equal(d.players[0].mana, 100); assert.equal(d.round, 2);
  d.players[1].hp = 15; d.step(0.01, [{ swing: true }, {}]); ev = d.step(1.6, [{}, {}]);
  assert.equal(d.state, 'matchEnd'); assert.equal(d.winner, 0); assert.deepEqual(d.step(1, [{ swing: true }, {}]), []);
});
test('PK：兩人同時歸零算平手，不計分', () => {
  const d = new Duel(); d.players[0].hp = 15; d.players[1].hp = 15;
  d.step(0.01, [{ swing: true }, { swing: true }]); d.step(1.6, [{}, {}]);
  assert.equal(d.state, 'roundEnd'); assert.deepEqual(d.wins, [0, 0]);
});

// ---------- 新魔杖動作 ----------
const circlePath = (turns, n, r = 0.08) => Array.from({ length: n }, (_, i) => { const a = turns * 2 * Math.PI * i / (n - 1); return pose(0.5 + r * Math.cos(a), 0.55 + r * Math.sin(a)); });
function runAll(tr, path, dt = 1 / 30, t0 = 0) { const out = { swing: 0, zigzag: 0, circle: 0, power: 0 }; path.forEach((p, i) => { const r = tr.update(t0 + i * dt, p); for (const k in out) if (r[k]) out[k]++; }); return out; }
test('連續畫一圈觸發防護罩手勢，且不會被當成揮杖', () => {
  const r = runAll(new WandTracker(), circlePath(1.2, 34)); // 約 1.1 秒畫 1.2 圈
  assert.equal(r.circle, 1); assert.equal(r.swing, 0);
});
test('來回直線揮動、半圈都不算畫圈', () => {
  const line = Array.from({ length: 36 }, (_, i) => pose(0.5 + 0.06 * Math.sin(i / 3), 0.55));
  assert.equal(runAll(new WandTracker(), line).circle, 0);
  assert.equal(runAll(new WandTracker(), circlePath(0.5, 20)).circle, 0);
});
test('快速左右連揮觸發絆倒手勢：第一下是揮杖，反方向第二下是連揮', () => {
  const right = Array.from({ length: 6 }, (_, i) => pose(0.3 + i * 0.06, 0.5));
  const left = Array.from({ length: 6 }, (_, i) => pose(0.6 - i * 0.06, 0.5));
  const hold = Array.from({ length: 8 }, () => pose(0.6, 0.5));
  const r = runAll(new WandTracker(), [...right, ...hold, ...left]);
  assert.equal(r.swing, 1); assert.equal(r.zigzag, 1);
  const same = runAll(new WandTracker(), [...right, ...hold.map(() => pose(0.6, 0.5)), ...Array.from({ length: 6 }, (_, i) => pose(0.6 + i * 0.06, 0.5))]);
  assert.equal(same.zigzag, 0);
});
test('魔杖停住 1.2 秒後再揮是強力閃電，沒停夠就是普通閃電', () => {
  const still = n => Array.from({ length: n }, () => pose(0.3, 0.5));
  const swing = Array.from({ length: 6 }, (_, i) => pose(0.3 + i * 0.06, 0.5));
  assert.equal(runAll(new WandTracker(), [...still(45), ...swing]).power, 1);
  assert.equal(runAll(new WandTracker(), [...still(10), ...swing]).power, 0);
});
test('PK：防護罩擋下光球；絆倒讓對手 3 秒不能行動且之後免疫', () => {
  const d = new Duel(); d.step(0.01, [{ swing: true }, { circle: true }]);
  assert.equal(d.players[1].mana, 80); const ev = d.step(1.6, [{}, {}]);
  assert.ok(ev.some(e => e.type === 'blocked')); assert.equal(d.players[1].hp, 100);
  d.step(0.01, [{ zigzag: true }, {}]); assert.ok(d.players[1].stunT > 0);
  d.step(0.5, [{}, { swing: true }]); assert.equal(d.projs.length, 0); // 被絆倒，射不出去
  d.step(3, [{}, {}]); assert.equal(d.players[1].stunT, 0);
  const ev2 = d.step(0.01, [{ zigzag: true }, {}]); assert.equal(ev2[0].type, 'immune');
});
test('PK：強力光球飛得更快、扣 30 血', () => {
  const d = new Duel(); d.step(0.01, [{ swing: true, power: true }, {}]);
  assert.equal(d.players[0].mana, 75); assert.ok(d.projs[0].total < CFG.duelFlight);
  d.step(1.2, [{}, {}]); assert.equal(d.players[1].hp, 70);
});

test('PK：光球到面前時蹲下就能閃過', () => {
  const d = new Duel(); d.step(0.01, [{ swing: true }, {}]);
  const ev = d.step(1.6, [{}, { duck: true }]);
  assert.ok(ev.some(e => e.type === 'dodged')); assert.equal(d.players[1].hp, 100);
});

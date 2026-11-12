/**
 * 搜打撤配平模拟：不同「撤离深度」与装备档位下的存活率与期望净得。
 * 目的：确认「越深越好」不成立——否则选择就没有意义。
 *
 * 运行： node tools/balance.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..', 'web', 'js');
const sandbox = { Math, console, JSON, Object, Array, Number, String };
sandbox.window = sandbox; sandbox.global = sandbox;
vm.createContext(sandbox);
for (const f of ['data-hexagrams.js', 'data-tarot.js', 'engine.js', 'raid-data.js']) {
  vm.runInContext(readFileSync(join(web, f), 'utf8'), sandbox, { filename: f });
}
const { RAID } = sandbox;

// 判定等级分布（取 tests 实测值）
const VERDICT_DIST = [
  ['上吉', 0.197], ['中吉', 0.434], ['中平', 0.112], ['下', 0.242], ['下下', 0.015],
];

function normalDist(rng) {
  // Box-Muller
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function mulberry32(a) {
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rollVerdict(rng) {
  const r = rng();
  let acc = 0;
  for (const [name, p] of VERDICT_DIST) { acc += p; if (r <= acc) return name; }
  return '中吉';
}

function payout({ vol, depth, completeness, factor, dirDown }) {
  const base = 44 * vol;
  const depthF = 1 + 0.35 * (depth - 1);
  const completeF = 0.4 + 0.6 * completeness;
  const dirF = dirDown ? 1.15 : 1;
  return Math.round(base * completeF * depthF * factor * dirF);
}

function simulate({ extractAt, deck, charm, vol = 1.0, trials = 20000, seed = 7 }) {
  const rng = mulberry32(seed);
  let surv = 0, sumNet = 0, maxNet = 0, minNet = 0, wins = 0;

  for (let t = 0; t < trials; t++) {
    let depth = 0, dead = false;
    const got = [];
    const dirDown = rng() < 0.5;

    for (let d = 1; d <= extractAt; d++) {
      if (d >= 2) {
        const risk = Math.max(0.02, (RAID.RISK[d] || 0.5) - charm * 0.03);
        if (rng() < risk) { dead = true; depth = d; break; }
      }
      // 情报层：每层 1 + 牌材 维，动爻另加一维；受「深处才见」门槛限制
      const moving = rng() < 0.25; // 动爻概率 2/8
      const gain = 1 + deck + (moving ? 1 : 0);
      const avail = RAID.DIMS.filter((x) => !got.includes(x.key) && d >= x.minDepth);
      for (let i = 0; i < gain && i < avail.length; i++) got.push(avail[i].key);
      depth = d;
    }

    const revealed = got.length;

    let net;
    if (dead) {
      net = charm * 6 - RAID.CONFIG.entryCost;
    } else {
      const completeness = revealed / 4;
      const factor = depth >= 6 ? RAID.VERDICT_FACTOR[rollVerdict(rng)] : RAID.UNVERIFIED;
      net = payout({ vol, depth, completeness, factor, dirDown }) - RAID.CONFIG.entryCost;
    }

    if (!dead) surv++;
    if (net > 0) wins++;
    sumNet += net;
    maxNet = Math.max(maxNet, net);
    minNet = Math.min(minNet, net);
  }

  return {
    extractAt, deck, charm,
    survival: surv / trials,
    ev: sumNet / trials,
    winRate: wins / trials,
    maxNet,
  };
}

console.log('=== 裸装（铜钱 0 / 牌材 0 / 法器 0），标的价值 44 ===');
console.log('撤离深度  存活率   期望净得   正收益局占比   最高单局');
const bare = [];
for (let d = 1; d <= 6; d++) {
  const r = simulate({ extractAt: d, deck: 0, charm: 0 });
  bare.push(r);
  console.log(
    `  第 ${d} 层   ${(r.survival * 100).toFixed(1).padStart(5)}%  `
    + `${r.ev.toFixed(2).padStart(8)}  ${(r.winRate * 100).toFixed(1).padStart(10)}%  `
    + `${String(r.maxNet).padStart(8)}`,
  );
}
const best = bare.reduce((a, b) => (b.ev > a.ev ? b : a));
console.log(`  → 裸装最优撤离点：第 ${best.extractAt} 层（期望 ${best.ev.toFixed(2)}）`);

console.log('\n=== 满配（牌材 3 / 法器 3），标的价值 44 ===');
console.log('撤离深度  存活率   期望净得');
const full = [];
for (let d = 1; d <= 6; d++) {
  const r = simulate({ extractAt: d, deck: 3, charm: 3 });
  full.push(r);
  console.log(`  第 ${d} 层   ${(r.survival * 100).toFixed(1).padStart(5)}%  ${r.ev.toFixed(2).padStart(8)}`);
}
const bestFull = full.reduce((a, b) => (b.ev > a.ev ? b : a));
console.log(`  → 满配最优撤离点：第 ${bestFull.extractAt} 层（期望 ${bestFull.ev.toFixed(2)}）`);

console.log('\n=== 三种标的下，裸装第 6 层 vs 第 3 层（浮动一下） ===');
for (const t of RAID.TARGETS) {
  const d3 = simulate({ extractAt: 3, deck: 0, charm: 0, vol: t.vol });
  const d6 = simulate({ extractAt: 6, deck: 0, charm: 0, vol: t.vol });
  console.log(`  ${t.name}（波动 ${t.vol}）：第 3 层 期望 ${d3.ev.toFixed(2)}　第 6 层 期望 ${d6.ev.toFixed(2)}`);
}

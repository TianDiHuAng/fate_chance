/**
 * 验证：按卦说的走，真的稳赢吗？
 * 三种打法各跑 4000 世，比较人生价值与死亡率。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..', 'web', 'js');
const sandbox = { Math, console, JSON, Object, Array, Number, String, Set };
sandbox.window = sandbox; sandbox.global = sandbox;
vm.createContext(sandbox);
for (const f of ['data-hexagrams.js', 'data-tarot.js', 'engine.js', 'epoch-data.js']) {
  vm.runInContext(readFileSync(join(web, f), 'utf8'), sandbox, { filename: f });
}
const E = sandbox.Engine;
const EP = sandbox.EPOCH;
const SHENG = E.SHENG, KE = E.KE;

function mulberry32(a) {
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fitOf(bornEl, careerEl) {
  if (SHENG[careerEl] === bornEl) return 'born';
  if (careerEl === bornEl) return 'same';
  if (SHENG[bornEl] === careerEl) return 'give';
  if (KE[bornEl] === careerEl) return 'control';
  return 'against';
}
function laneRel(yong, laneEl) {
  if (SHENG[yong] === laneEl) return 'feed';
  if (yong === laneEl) return 'same';
  if (SHENG[laneEl] === yong) return 'give';
  if (KE[yong] === laneEl) return 'hold';
  return 'clash';
}
function yearRel(yearEl, yong) {
  if (SHENG[yearEl] === yong) return 'born';
  if (yearEl === yong) return 'same';
  if (SHENG[yong] === yearEl) return 'give';
  if (KE[yong] === yearEl) return 'control';
  return 'against';
}
function imperativeOf(built, fateKey) {
  const k = EP.readImperative(built.hex.judgment);
  if (k !== 'even') return k;
  if (fateKey === '上上' || fateKey === '上吉') return 'advance';
  if (fateKey === '下' || fateKey === '下下') return 'hold';
  return 'even';
}
function stakeFit(impKey, stakeKey, bondF) {
  return EP.riskMultOf(impKey, stakeKey, bondF).mult;
}

function castOnce(rng) {
  const lines = [];
  for (let i = 0; i < 6; i++) lines.push(E.tossCoins(rng));
  const built = E.buildHexagram(lines);
  const card = sandbox.TAROT[Math.floor(rng() * sandbox.TAROT.length)];
  const rule = E.makeRule(built, [card], '木');
  rule.legal = [0];
  const res = E.judge({ built, rule, hand: [card], index: 0, domainElement: '木' });
  const fateKey = res.level.name;
  return {
    built, fateKey,
    imp: imperativeOf(built, fateKey),
    moving: built.movingCount,
    rel: EP.reliabilityOf(built.movingCount),
  };
}

function playLife(seed, strategy) {
  const rng = mulberry32(seed);
  const birth = castOnce(rng);
  const yong = birth.built.hex.lower ? E.TRIGRAMS[Object.keys(E.TRIGRAMS).find((k) => E.TRIGRAMS[k].name === birth.built.hex.lower)].element : '木';

  let stats = { cash: 0, fame: 0, bond: 0, hurt: 0 };
  let quota = EP.CONFIG.startQuota;
  const laneF = {};
  EP.LANES.forEach((l) => { laneF[l.key] = EP.LANE_REL[laneRel(yong, l.el)].f; });

  for (let s = 0; s < EP.SECTIONS.length; s++) {
    const yf = EP.YEAR_REL[yearRel(EP.YEARS[s], yong)];

    // 选行当
    let career;
    if (strategy !== 'reckless') {
      // 按产出 × 命盘挑最赚的
      career = EP.CAREERS.map((c) => {
        const val = c.out.cash * laneF.cash + c.out.fame * laneF.fame * 0.5 + c.out.bond * laneF.bond * 0.5;
        const rev = c.risky && (birth.fateKey === '下' || birth.fateKey === '下下');
        return { c, v: val * EP.FIT[fitOf(yong, c.el)].f * (rev ? 1.4 : 1) };
      }).sort((a, b) => b.v - a.v)[0].c;
    } else {
      career = EP.CAREERS[Math.floor(rng() * EP.CAREERS.length)];
    }

    // 选注
    let stakeKey;
    const omen = castOnce(rng);
    let seen = false;

    if (strategy === 'obey' || strategy === 'smart' || strategy === 'skeptic') {
      if (quota > 0) { quota -= 1; seen = true; }
      // 服从卦意：宜进押重，宜守押轻，其余中注
      if (seen) stakeKey = omen.imp === 'advance' ? 'heavy' : (omen.imp === 'hold' ? 'light' : 'mid');
      else stakeKey = 'mid';
      // 懂命的人：伤高了就不敢造次，哪怕卦说宜进
      if (strategy === 'smart') {
        if (stats.hurt >= 6) stakeKey = 'light';
        else if (stats.hurt >= 4 && stakeKey === 'heavy') stakeKey = 'mid';
      }
      // 谨慎者：卦乱（动爻过半）就不信
      if (strategy === 'skeptic' && seen && omen.rel.tone === 'bad') stakeKey = 'mid';
    } else if (strategy === 'light') {
      stakeKey = 'light';
    } else {
      stakeKey = 'heavy';
    }

    const stake = EP.STAKES.find((x) => x.key === stakeKey);

    // 结算
    let fateKey = omen.fateKey;
    let impKey = omen.imp;
    let misfired = false;
    if (seen && rng() > omen.rel.rate) {
      misfired = true;
      fateKey = EP.INVERT_FATE[fateKey] || fateKey;
      impKey = EP.INVERT_IMP[impKey] || impKey;
    }

    let fitF = EP.FIT[fitOf(yong, career.el)].f;
    const rev = (fateKey === '下' || fateKey === '下下') && career.risky;
    const waste = (fateKey === '上上' || fateKey === '上吉') && career.risky;
    if (rev) fitF = EP.REVERSAL.f;
    if (waste) fitF *= EP.WASTE.f;

    const fateF = EP.FATE[fateKey].f;
    const rm = stakeFit(impKey, stakeKey, laneF.bond);
    const energy = EP.BASE * fitF * yf.f * fateF * stake.mult;

    let gain = { cash: 0, fame: 0, bond: 0, hurt: 0 };
    const flop = rng() < Math.min(0.85, stake.risk * rm);
    if (flop) {
      gain.hurt = 2;
    } else {
      gain.cash = Math.round(energy * career.out.cash * laneF.cash * 0.6);
      gain.fame = Math.round(energy * career.out.fame * laneF.fame * 0.32);
      gain.bond = Math.round(energy * career.out.bond * laneF.bond * 0.32);
    }
    if (EP.IMPERATIVES[impKey].heavyHurt && stakeKey === 'heavy') gain.hurt += 1;
    if (laneF.safe < 0.9) gain.hurt += 1;
    else if (laneF.safe > 1.1 && gain.hurt > 0) gain.hurt -= 1;
    if (rev && gain.hurt > 0) gain.hurt -= 1;

    stats.cash += gain.cash;
    stats.fame += gain.fame;
    stats.bond += gain.bond;
    stats.hurt += gain.hurt;

    if (stats.hurt >= EP.CONFIG.deathHurt) {
      return { value: Math.max(0, Math.round(stats.cash + stats.fame * 2 + stats.bond * 2 - stats.hurt * 5)), died: true, hurt: stats.hurt, stats };
    }
  }
  return { value: Math.max(0, Math.round(stats.cash + stats.fame * 2 + stats.bond * 2 - stats.hurt * 5)), died: false, hurt: stats.hurt, stats };
}

const N = 4000;
const strategies = [
  ['按卦走（问卦并服从）', 'obey'],
  ['不问卦、全押轻注', 'light'],
  ['不问卦、全押重注', 'reckless'],
  ['按卦走，但看自己的伤（懂命）', 'smart'],
  ['按卦走，但卦乱就不信（多疑）', 'skeptic'],
];

console.log('每种打法各跑 ' + N + ' 世\n');
console.log('打法'.padEnd(24, '　') + '  平均价值   中位   死亡率   平均残伤');
for (const [label, key] of strategies) {
  const vals = [], deaths = [], hurts = [];
  for (let i = 0; i < N; i++) {
    const r = playLife(1000 + i, key);
    vals.push(r.value); deaths.push(r.died ? 1 : 0); hurts.push(r.hurt);
  }
  vals.sort((a, b) => a - b);
  const avg = vals.reduce((a, b) => a + b, 0) / N;
  const med = vals[Math.floor(N / 2)];
  const dr = deaths.reduce((a, b) => a + b, 0) / N;
  const ah = hurts.reduce((a, b) => a + b, 0) / N;
  console.log(label.padEnd(22, '　') + String(Math.round(avg)).padStart(8) + String(med).padStart(7)
    + (dr * 100).toFixed(1).padStart(8) + '%' + ah.toFixed(1).padStart(8));
}

// 结局分布
function endingOf(r) {
  const s = r.stats;
  const value = r.value;
  return EP.ENDINGS.filter((e) => e.cond({ cash: s.cash, fame: s.fame, bond: s.bond, hurt: s.hurt, value }))[0].name;
}
console.log('\n结局分布（各 2000 世）：');
for (const k of ['obey', 'light', 'smart']) {
  const tally = {};
  for (let i = 0; i < 2000; i++) {
    const n = endingOf(playLife(5000 + i, k));
    tally[n] = (tally[n] || 0) + 1;
  }
  const parts = Object.entries(tally).sort((a, b) => b[1] - a[1])
    .map(([n, c]) => n + ' ' + (c / 20).toFixed(1) + '%').join('　');
  console.log('  ' + k.padEnd(8) + parts);
}

// 按卦走的详细分布
const obeyVals = [];
for (let i = 0; i < N; i++) obeyVals.push(playLife(1000 + i, 'obey').value);
obeyVals.sort((a, b) => a - b);
const p = (q) => obeyVals[Math.floor(N * q)];
console.log('\n「按卦走」的分位：最低 10% = ' + p(0.1) + '　中位 = ' + p(0.5) + '　最高 10% = ' + p(0.9));




// —— 属性分位（用于定结局阈值）——
const rows = [];
for (let i = 0; i < 4000; i++) rows.push(playLife(9000 + i, 'obey'));
function pct(key, q) { const a = rows.map((r) => key === 'value' ? r.value : r.stats[key]).sort((x, y) => x - y); return a[Math.floor(a.length * q)]; }
console.log('\n「按卦走」属性分位：');
for (const k of ['cash', 'fame', 'bond', 'hurt', 'value']) {
  console.log('  ' + k.padEnd(6) + ' p50=' + String(pct(k, 0.5)).padStart(5)
    + '  p75=' + String(pct(k, 0.75)).padStart(5)
    + '  p90=' + String(pct(k, 0.9)).padStart(5)
    + '  p97=' + String(pct(k, 0.97)).padStart(5));
}

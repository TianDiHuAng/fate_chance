/**
 * 引擎自检：数据完整性 + 全卦遍历 + 越规/复盘一致性 + 分布合理性
 * 运行： node tests/engine.test.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..', 'web', 'js');

const sandbox = { Math, console, JSON, Object, Array, Number, String };
sandbox.window = sandbox;
sandbox.global = sandbox;
vm.createContext(sandbox);
for (const f of ['data-hexagrams.js', 'data-tarot.js', 'engine.js']) {
  vm.runInContext(readFileSync(join(web, f), 'utf8'), sandbox, { filename: f });
}

const { HEXAGRAMS, HEXAGRAM_BY_CODE, TAROT, DOMAINS, Engine } = sandbox;

let pass = 0;
const fails = [];
function check(name, cond, detail) {
  if (cond) pass++;
  else fails.push(`${name}${detail ? ' :: ' + detail : ''}`);
}

// ---------- 1. 数据完整性 ----------
check('64 卦', HEXAGRAMS.length === 64, `实得 ${HEXAGRAMS.length}`);
check('64 卦码', Object.keys(HEXAGRAM_BY_CODE).length === 64);
check('22 张大牌', TAROT.length === 22, `实得 ${TAROT.length}`);

const TRI = { 乾: '111', 兑: '110', 离: '101', 震: '100', 巽: '011', 坎: '010', 艮: '001', 坤: '000' };
const ELEM = { 金: 1, 木: 1, 水: 1, 火: 1, 土: 1 };

for (const h of HEXAGRAMS) {
  check(`卦码长度 ${h.name}`, /^[01]{6}$/.test(h.code), h.code);
  check(`下卦一致 ${h.name}`, TRI[h.lower] === h.code.slice(0, 3), `${h.lower} vs ${h.code.slice(0, 3)}`);
  check(`上卦一致 ${h.name}`, TRI[h.upper] === h.code.slice(3, 6), `${h.upper} vs ${h.code.slice(3, 6)}`);
  check(`卦辞存在 ${h.name}`, typeof h.judgment === 'string' && h.judgment.length > 0);
  check(`白话存在 ${h.name}`, typeof h.meaning === 'string' && h.meaning.length > 0);
}

const elemCount = { 金: 0, 木: 0, 水: 0, 火: 0, 土: 0 };
for (const c of TAROT) {
  check(`牌 ${c.name} 有五行`, !!ELEM[c.element], c.element);
  elemCount[c.element]++;
  if (c.attrType === 'sign') check(`牌 ${c.name} 有地支`, !!c.branch, c.branch);
  if (c.attrType === 'planet') check(`牌 ${c.name} 无地支`, c.branch === null);
}
check('星体牌 10 张', TAROT.filter((c) => c.attrType === 'planet').length === 10);
check('星座牌 12 张', TAROT.filter((c) => c.attrType === 'sign').length === 12);
check('地支不重复', new Set(TAROT.filter((c) => c.branch).map((c) => c.branch)).size === 12);

// ---------- 2. 六十四卦 × 随机手牌 全遍历 ----------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const levelCount = {};        // 守规取牌的等级分布
const overLevelCount = {};    // 越规取牌的等级分布
const legalCountDist = { 0: 0, 1: 0, 2: 0, 3: 0 };
let totalHands = 0;
let overruleJudged = 0;
let analysed = 0;
let overBetter = 0;
let sample = 0;

for (const hex of HEXAGRAMS) {
  for (let k = 0; k < 40; k++) {
    const rng = mulberry32(hex.id * 1000 + k);
    const lines = [];
    for (let i = 0; i < 6; i++) lines.push(Engine.tossCoins(rng));
    const rolled = Engine.buildHexagram(lines);
    // 用数据里每一卦逐一覆盖，动爻与变卦沿用随机结果
    const built = {
      code: hex.code,
      changedCode: rolled.changedCode,
      hex,
      changed: rolled.changed,
      movingCount: rolled.movingCount,
      movingIdx: rolled.movingIdx,
      isStatic: rolled.isStatic,
    };
    const domain = DOMAINS[k % DOMAINS.length];
    const hand = Engine.drawHand(rng);
    const rule = Engine.makeRule(built, hand, domain.element);

    totalHands++;
    legalCountDist[rule.legal.length]++;
    check('合法位数不超过 3', rule.legal.length <= 3, String(rule.legal.length));

    // 三张牌全部判一遍（含越规），验证不抛错、分数自洽
    for (let idx = 0; idx < 3; idx++) {
      const res = Engine.judge({
        built, rule, hand, index: idx, domainElement: domain.element,
      });
      check(`判定有等级 ${hex.name}`, !!res.level);
      if (!res.level) continue;

      const stepSum = res.steps.reduce((a, s) => a + s.delta, 0);
      check(`步骤合计 ${hex.name}`, stepSum === res.score, `${stepSum} != ${res.score}`);

      const isOver = rule.legal.indexOf(idx) < 0;
      const overStep = res.steps.find((s) => s.label === '越规');
      check(`越规标记一致 ${hex.name}`, isOver === !!overStep, `isOver=${isOver} step=${!!overStep}`);

      if (isOver) {
        overruleJudged++;
        overLevelCount[res.level.name] = (overLevelCount[res.level.name] || 0) + 1;
      } else {
        levelCount[res.level.name] = (levelCount[res.level.name] || 0) + 1;
      }

      if (sample < 1 && hex.id === 42) {
        sample++;
        console.log('\n--- 样例：风雷益 ---');
        console.log(`用神 ${rule.yongshen}　局规：${rule.inner.rule.text}`);
        console.log('手牌：' + hand.map((c, i) => `[${i}]${c.name}(${c.element})`).join('  '));
        console.log(`取[${idx}] 越规=${isOver} → ${res.relation.label} 分 ${res.score} → ${res.level.name}`);
        console.log('步骤：' + res.steps.map((s) => `${s.label}${s.delta >= 0 ? '+' : ''}${s.delta}`).join(' / ') + '\n');
      }
    }

    // 复盘：最优解必须真的最优
    const a = Engine.analyze({ built, rule, hand, domainElement: domain.element });
    analysed++;
    check('复盘给出最优', !!a.bestOverall);
    const maxScore = Math.max.apply(null, a.options.map((o) => o.result.score));
    check('复盘最优=实际最高', a.bestOverall.result.score === maxScore,
      `${a.bestOverall.result.score} vs ${maxScore}`);
    if (a.hasLegal) {
      const maxLegal = Math.max.apply(null, a.options
        .filter((o) => rule.legal.indexOf(o.index) >= 0)
        .map((o) => o.result.score));
      check('守规最优=守规内最高', a.bestLegal.result.score === maxLegal,
        `${a.bestLegal.result.score} vs ${maxLegal}`);
      check('越规最优≥守规最优', a.bestOverall.result.score >= a.bestLegal.result.score,
        `${a.bestOverall.result.score} vs ${a.bestLegal.result.score}`);
      if (a.bestOverall.result.score > a.bestLegal.result.score) overBetter++;
    } else {
      check('无合法位时无守规最优', a.bestLegal === null);
    }
  }
}

check('遍历覆盖', totalHands === 64 * 40, String(totalHands));
check('复盘点数量', analysed === totalHands, String(analysed));

// ---------- 3. 分布 ----------
function pct(map) {
  const t = Object.values(map).reduce((a, b) => a + b, 0) || 1;
  return ['上上', '上吉', '中吉', '中平', '下', '下下']
    .map((k) => `${k} ${(((map[k] || 0) / t) * 100).toFixed(1)}%`).join('  ');
}

console.log('卦限分布（每局可取的牌数）：');
for (const n of [0, 1, 2, 3]) {
  console.log(`  可取 ${n} 张： ${((legalCountDist[n] / totalHands) * 100).toFixed(1)}%`);
}
console.log('守规取牌等级：' + pct(levelCount));
console.log('越规取牌等级：' + pct(overLevelCount));
console.log(`守规判定 ${Object.values(levelCount).reduce((a, b) => a + b, 0)} 次，越规判定 ${overruleJudged} 次`);
console.log(`越规比守规更优的局：${((overBetter / totalHands) * 100).toFixed(1)}%（这些局里「破戒」才是正解）`);
console.log(`五行手牌张数：${Object.entries(elemCount).map(([k, v]) => k + v).join(' ')}`);

console.log(`\n通过 ${pass} 项检查，失败 ${fails.length} 项`);
if (fails.length) {
  console.log(fails.slice(0, 20).join('\n'));
  process.exit(1);
}

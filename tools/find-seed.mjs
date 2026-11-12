/**
 * 找一个能验证「交换 / 重抽」分支的随机种子。
 * 复现 app.js 的随机消耗顺序：先洗牌（21 次），再六次掷钱（各 3 次）。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const jsDir = join(here, '..', 'js');

const sandbox = { Math, console, JSON, Object, Array, Number, String };
sandbox.window = sandbox; sandbox.global = sandbox;
vm.createContext(sandbox);
for (const f of ['data-hexagrams.js', 'data-tarot.js', 'engine.js']) {
  vm.runInContext(readFileSync(join(jsDir, f), 'utf8'), sandbox, { filename: f });
}
const { Engine, DOMAINS } = sandbox;

function mulberry32(a) {
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function simulate(seed) {
  const rng = mulberry32(seed);
  const deck = Engine.shuffle(rng);
  const hand = deck.slice(0, 3);
  const lines = [];
  for (let i = 0; i < 6; i++) lines.push(Engine.tossCoins(rng));
  const built = Engine.buildHexagram(lines);
  const rule = Engine.makeRule(built, hand, DOMAINS[0].element);
  return { deck, hand, lines, built, rule };
}

const wanted = { swap: null, redraw: null, violated: null, wide: null };

for (let seed = 1; seed <= 4000; seed++) {
  const s = simulate(seed);
  if (!wanted.swap && s.rule.grants.swap > 0) wanted.swap = seed;
  if (!wanted.redraw && s.rule.grants.redraw > 0) wanted.redraw = seed;
  if (!wanted.violated && s.rule.violated) wanted.violated = seed;
  if (!wanted.wide && s.rule.legal.length === 3) wanted.wide = seed;
  if (wanted.swap && wanted.redraw && wanted.violated && wanted.wide) break;
}

for (const [k, seed] of Object.entries(wanted)) {
  if (!seed) { console.log(`${k}: 未找到`); continue; }
  const s = simulate(seed);
  console.log(`${k}: seed=${seed}  ${s.built.hex.sub}(${s.built.hex.name}) 内${s.built.hex.lower} 外${s.built.hex.upper} 动${s.built.movingCount}`);
  console.log(`   可用位 ${JSON.stringify(s.rule.legal)}  授予 swap=${s.rule.grants.swap} redraw=${s.rule.grants.redraw} 违卦=${s.rule.violated}`);
  console.log(`   手牌 ${s.hand.map((c) => c.name + '(' + c.element + ')').join(' ')}`);
}

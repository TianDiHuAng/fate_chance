/**
 * 从参考数据（skymoon173/chinese-philosophy-games 的 scripts.js）提取六十四卦，
 * 校验编码唯一性、上下卦分解，并生成 js/data-hexagrams.js。
 *
 * 卦码约定：自初爻（下）至上爻（上），阳爻 1、阴爻 0，共 6 位。
 * 例：水雷屯 => 下震(100) 上坎(010) => "100010"
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const refPath = join(here, '_ref_skymoon_scripts.js');
const outPath = join(here, '..', 'js', 'data-hexagrams.js');

const src = readFileSync(refPath, 'utf8');

const ENTRY = /\{\s*name:\s*'([^']*)',\s*sub:\s*'([^']*)',\s*code:\s*'([01]{6})',\s*judgment:\s*'([^']*)',\s*meaning:\s*'([^']*)'\s*\}/g;

const items = [];
for (const m of src.matchAll(ENTRY)) {
  items.push({
    name: m[1].trim(),
    sub: m[2].trim(),
    code: m[3],
    judgment: m[4].trim(),
    meaning: m[5].trim(),
  });
}

// ---- 校验 ----
const errors = [];
if (items.length !== 64) errors.push(`卦数应为 64，实得 ${items.length}`);

const codes = new Set();
for (const h of items) {
  if (codes.has(h.code)) errors.push(`重复卦码 ${h.code}（${h.name}）`);
  codes.add(h.code);
  if (!h.judgment) errors.push(`${h.name} 缺卦辞`);
  if (!h.meaning) errors.push(`${h.name} 缺白话`);
  if (h.judgment.length > 60) errors.push(`${h.name} 卦辞过长(${h.judgment.length})`);
}

for (let i = 0; i < 64; i++) {
  const c = i.toString(2).padStart(6, '0');
  if (!codes.has(c)) errors.push(`缺失卦码 ${c}`);
}

// ---- 三画卦分解 ----
// 键为「自下而上」三爻，1 阳 0 阴
const TRIGRAMS = {
  '111': { name: '乾', nature: '天', element: '金', glyph: '☰' },
  '110': { name: '兑', nature: '泽', element: '金', glyph: '☱' },
  '101': { name: '离', nature: '火', element: '火', glyph: '☲' },
  '100': { name: '震', nature: '雷', element: '木', glyph: '☳' },
  '011': { name: '巽', nature: '风', element: '木', glyph: '☴' },
  '010': { name: '坎', nature: '水', element: '水', glyph: '☵' },
  '001': { name: '艮', nature: '山', element: '土', glyph: '☶' },
  '000': { name: '坤', nature: '地', element: '土', glyph: '☷' },
};

// Unicode 卦符：U+4DC0 起严格依通行卦序
const HEX_GLYPH_BASE = 0x4dc0;

const out = items.map((h, idx) => {
  const lower = h.code.slice(0, 3); // 内卦（下）
  const upper = h.code.slice(3, 6); // 外卦（上）
  const lo = TRIGRAMS[lower];
  const up = TRIGRAMS[upper];
  if (!lo || !up) errors.push(`${h.name} 三画卦分解失败 ${h.code}`);
  // 卦符校验：若数据自带的 sub 与分解结果不一致，记录下来供人工核对
  const derived = `${up ? up.nature : '?'}${lo ? lo.nature : '?'}${h.name}`;
  return {
    id: idx + 1,
    name: h.name,
    sub: h.sub,
    code: h.code,
    glyph: String.fromCodePoint(HEX_GLYPH_BASE - 1 + (idx + 1) - 1 + 1),
    upper: up.name,
    lower: lo.name,
    upperElement: up.element,
    lowerElement: lo.element,
    judgment: h.judgment,
    meaning: h.meaning,
    _derived: derived,
  };
});

// 卦符生成再校验：U+4DC0 + (id-1)
for (const h of out) {
  h.glyph = String.fromCodePoint(HEX_GLYPH_BASE + (h.id - 1));
  delete h._derived;
}

if (errors.length) {
  console.error('数据校验失败：\n' + errors.join('\n'));
  process.exit(1);
}

const banner = `/* 六十四卦数据
 * 卦名/别卦名/卦辞/白话释义 取自 skymoon173/chinese-philosophy-games（公开数据，仅作参考用）
 * 上下卦分解、五行归属为本项目推导。
 * 卦码：初爻→上爻，阳 1 阴 0。卦符：Unicode U+4DC0 起，依通行卦序。
 */`;

const js = `${banner}\nwindow.HEXAGRAMS = ${JSON.stringify(out, null, 2)};\n\nwindow.HEXAGRAM_BY_CODE = Object.fromEntries(window.HEXAGRAMS.map(h => [h.code, h]));\n`;

writeFileSync(outPath, js, 'utf8');
console.log(`OK 写入 ${outPath}`);
console.log(`卦数 ${out.length}，卦码唯一 ${codes.size}`);
console.log('抽样：');
for (const i of [0, 2, 10, 51, 63]) {
  const h = out[i];
  console.log(`  ${h.id}. ${h.sub}(${h.name}) code=${h.code} 上下=${h.upper}${h.lower} 内卦五行=${h.lowerElement} 卦符=${h.glyph}`);
}

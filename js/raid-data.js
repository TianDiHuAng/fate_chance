/* 「命市下潜」· 数据层
 * 全部标的、商号、传闻均为虚构，与任何真实公司、证券、行业无关。
 * 本作不提供投资建议，也不预测任何真实市场。
 */

window.RAID = {};

/** 三件可升级的装备。与提案对应：铜钱等级 / 卡牌材质 / 装饰法器。 */
window.RAID.GEAR = {
  coin: {
    key: 'coin',
    name: '铜钱',
    glyph: '◉',
    tagline: '问得准',
    desc: '每级 +1 次「重掷一爻」——把不合意的那一爻重来。',
    levels: [
      { name: '市铸', note: '重掷 0 次' },
      { name: '官铸', note: '重掷 1 次' },
      { name: '母钱', note: '重掷 2 次' },
      { name: '宫赐', note: '重掷 3 次' },
    ],
    costs: [8, 22, 48],
  },
  deck: {
    key: 'deck',
    name: '牌材',
    glyph: '❖',
    tagline: '看得清',
    desc: '每级让每一层多读出 1 维情报——这是「投入换信息」的正解。',
    levels: [
      { name: '竹纸', note: '每层读 1 维' },
      { name: '棉纸', note: '每层读 2 维' },
      { name: '宣纸', note: '每层读 3 维' },
      { name: '澄心堂', note: '每层读 4 维' },
    ],
    costs: [10, 26, 56],
  },
  charm: {
    key: 'charm',
    name: '法器',
    glyph: '✦',
    tagline: '扛得住',
    desc: '每级 −3% 反噬，并提高「击穿时保住的部分」。',
    levels: [
      { name: '无', note: '无反噬减免' },
      { name: '桃木牌', note: '−3% 反噬' },
      { name: '雷纹镜', note: '−6% 反噬' },
      { name: '镇命鼎', note: '−9% 反噬' },
    ],
    costs: [6, 18, 40],
  },
};

/** 虚构标的。vol 为波动系数；rumor 是你进场前唯一知道的东西。 */
window.RAID.TARGETS = [
  {
    key: 'copper',
    name: '九曜铜业',
    kind: '冶铸',
    vol: 1.0,
    rumor: '西厂停炉，炉工已三日未归，坊间说「气未散」。',
  },
  {
    key: 'herb',
    name: '青囊药行',
    kind: '药石',
    vol: 1.35,
    rumor: '新方将出，药肆彻夜灯火；亦有人说方子抄错了三味。',
  },
  {
    key: 'canal',
    name: '漕运联运',
    kind: '漕运',
    vol: 0.8,
    rumor: '河道淤塞，粮价已动；押船的都说「这一趟稳」。',
  },
];

/** 情报四维。真实值在开局时抽定，读数永远不作假——只是不全。
 *  minDepth：这一维要潜到多深才读得出来。牌材再好，也读不出还没发生的事。
 */
window.RAID.DIMS = [
  { key: 'dir', name: '向', values: ['盛', '衰'], minDepth: 1, hint: '此气向何处走' },
  { key: 'mag', name: '势', values: ['小', '中', '大'], minDepth: 1, hint: '气有多厚' },
  { key: 'timing', name: '时', values: ['初', '中', '末'], minDepth: 2, hint: '何时发' },
  { key: 'risk', name: '险', values: ['稳', '危'], minDepth: 3, hint: '有无回撤之虞' },
];

/** 逐层反噬概率（下标 = 将要进入的深度）。深度 1 不设险。 */
window.RAID.RISK = [0, 0, 0.06, 0.12, 0.20, 0.30, 0.40, 0.50];

/** 卦成后的判定系数 */
window.RAID.VERDICT_FACTOR = {
  上上: 1.8, 上吉: 1.8, 中吉: 1.3, 中平: 1.0, 下: 0.7, 下下: 0.4,
};

/** 未成卦即撤离时的情报折价（未经卦验） */
window.RAID.UNVERIFIED = 0.9;

/** 签的品阶：由判定等级决定。 */
window.RAID.SIGN_GRADE = {
  上上: { grade: '金签', cls: 'g-gold' },
  上吉: { grade: '银签', cls: 'g-silver' },
  中吉: { grade: '铜签', cls: 'g-bronze' },
  中平: { grade: '木签', cls: 'g-wood' },
  下: { grade: '纸签', cls: 'g-paper' },
  下下: { grade: '灰签', cls: 'g-ash' },
};

/** 稀有度：由动爻数（变数）与判定共同决定。 */
window.RAID.RARITY = { 常: 1, 稀: 2, 珍: 3, 绝: 4 };

/** 八宫：按上卦分组，每宫八卦。集齐一宫，兑现 +2%。 */
window.RAID.PALACES = [
  { key: '乾', name: '乾宫' }, { key: '兑', name: '兑宫' },
  { key: '离', name: '离宫' }, { key: '震', name: '震宫' },
  { key: '巽', name: '巽宫' }, { key: '坎', name: '坎宫' },
  { key: '艮', name: '艮宫' }, { key: '坤', name: '坤宫' },
];

/** 碎签：击穿到此深度以上，会留下痕迹 */
window.RAID.SHARD_MIN_DEPTH = 3;

/** 战利品：四类东西，各接一个不同系统。
 *  consumable 带入下一局、在局内消耗；material 只能带出去、用于画符；
 *  slip 是图鉴（在 endRun 里生成）；card 进牌册。
 */
window.RAID.ITEMS = {
  talisman: {
    key: 'talisman', name: '护身符', glyph: '符', kind: 'consumable', rarity: '珍',
    desc: '击穿时替你受一次，用掉即无。带进去没用掉，可以再带出来。',
  },
  lamp: {
    key: 'lamp', name: '长明灯', glyph: '灯', kind: 'consumable', rarity: '稀',
    desc: '点起后，本局每一层多读一维情报。灯灭即止。',
  },
  ink: {
    key: 'ink', name: '朱砂', glyph: '砂', kind: 'material', rarity: '常',
    desc: '画符要它。三份朱砂配一张纸，可成一道护身符。',
  },
  paper: {
    key: 'paper', name: '澄心纸', glyph: '纸', kind: 'material', rarity: '常',
    desc: '画符的底子。带得出去才有用，死了就烂在里头。',
  },
};

/** 画符配方 */
window.RAID.CRAFT = {
  talisman: { out: 'talisman', need: { ink: 3, paper: 1 } },
};

/** 每层掉落表：[物品, 权重]。空手也算一种结果。 */
window.RAID.LOOT = {
  1: [['ink', 40], ['paper', 40], ['talisman', 3], ['lamp', 2], ['none', 15]],
  2: [['ink', 38], ['paper', 36], ['talisman', 4], ['lamp', 3], ['none', 19]],
  3: [['ink', 34], ['paper', 30], ['talisman', 6], ['lamp', 8], ['none', 22]],
  4: [['ink', 30], ['paper', 26], ['talisman', 8], ['lamp', 12], ['none', 24]],
  5: [['ink', 28], ['paper', 22], ['talisman', 10], ['lamp', 14], ['none', 26]],
  6: [['ink', 26], ['paper', 20], ['talisman', 12], ['lamp', 16], ['none', 26]],
};

/** 标的波动越高，稀有掉落（符/灯）越容易出 */
window.RAID.RARE_SOURCES = ['talisman', 'lamp'];

window.RAID.CONFIG = {
  entryCost: 1,
  maxDepth: 6,
  saveKey: 'wenyigua.raid.v2',
  startCoin: 3,
  maxSlips: 240,
  palaceBonus: 0.02,
  loadoutSlots: 2,
};

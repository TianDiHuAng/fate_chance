/* 《一世》· 出生问卦，六节人生，死而后结算
 * 全部人物、商号、价格均为虚构。
 */

window.EPOCH = {};

/** 五个行当：五行 + 产出偏向 + 是否险行 */
window.EPOCH.CAREERS = [
  {
    key: 'relic', name: '古玩', glyph: '鼎', el: '金', risky: false,
    tagline: '看假易，看真难',
    out: { cash: 1.2, fame: 1.0, bond: 0.5 },
    blurb: '摊上一件东西，你只有眼力和几句传闻。',
  },
  {
    key: 'tomb', name: '摸金', glyph: '铲', el: '土', risky: true,
    tagline: '命硬的活，命软的埋',
    out: { cash: 1.7, fame: 0.6, bond: 0.3 },
    blurb: '土里有东西，也有别的东西。',
  },
  {
    key: 'trade', name: '经商', glyph: '算', el: '水', risky: true,
    tagline: '风口上，猪也能飞',
    out: { cash: 1.5, fame: 0.9, bond: 0.4 },
    blurb: '一批货，一个价。胆子大的人赚两遍。',
  },
  {
    key: 'love', name: '攀亲', glyph: '缘', el: '火', risky: false,
    tagline: '人心比行情难读',
    out: { cash: 0.6, fame: 1.1, bond: 2.0 },
    blurb: '门第、性情、心意，都要一层层看。',
  },
  {
    key: 'study', name: '科研', glyph: '究', el: '木', risky: false,
    tagline: '方向错了，越久越远',
    out: { cash: 0.5, fame: 2.0, bond: 0.4 },
    blurb: '一个题，一条经费线。',
  },
];
window.EPOCH.BY_KEY = Object.fromEntries(window.EPOCH.CAREERS.map((c) => [c.key, c]));

/** 六节人生 */
window.EPOCH.SECTIONS = [
  { age: 17, name: '学徒', note: '先学一门手艺' },
  { age: 24, name: '入行', note: '头一回自己拿主意' },
  { age: 31, name: '立身', note: '该有个名分了' },
  { age: 38, name: '转运', note: '赌命的年纪' },
  { age: 47, name: '翻身', note: '还能再来一次' },
  { age: 56, name: '收摊', note: '这一世的账，认不认' },
];

/** 卦判 → 系数 */
window.EPOCH.FATE = {
  上上: { f: 1.6, label: '大运', tone: 'good' },
  上吉: { f: 1.45, label: '运顺', tone: 'good' },
  中吉: { f: 1.2, label: '平顺', tone: 'mid' },
  中平: { f: 1.0, label: '平平', tone: 'mid' },
  下: { f: 0.75, label: '有阻', tone: 'bad' },
  下下: { f: 0.55, label: '大阻', tone: 'bad' },
};

/** 四路（四维）：各有五行。用神只有一个，四路必然旺衰不均——这是生克图的结构，不是数值调出来的。 */
window.EPOCH.LANES = [
  { key: 'cash', name: '财', el: '金', hint: '银钱、家底' },
  { key: 'fame', name: '名', el: '火', hint: '名声、体面' },
  { key: 'bond', name: '缘', el: '木', hint: '人缘、亲眷' },
  { key: 'safe', name: '安', el: '土', hint: '身体、无灾' },
];

/** 用神与某路五行的关系 → 该路的旺衰 */
window.EPOCH.LANE_REL = {
  feed: { f: 1.4, label: '旺', note: '用神生它，气都往这里走' },
  same: { f: 1.25, label: '旺', note: '同气，顺手' },
  give: { f: 1.0, label: '平', note: '它生用神，出得多、留得少' },
  hold: { f: 0.85, label: '弱', note: '用神克它，你能压住，但压住就不是你的' },
  clash: { f: 0.5, label: '衰', note: '它克用神，这一路与你相争', hurt: 1 },
};

/** 岁运：六节各有一个五行，与用神生克，决定当节的旺衰基调 */
window.EPOCH.YEARS = ['木', '火', '土', '金', '水', '土'];
window.EPOCH.YEAR_REL = {
  born: { f: 1.15, label: '运来生你' },
  same: { f: 1.25, label: '当运' },
  give: { f: 0.9, label: '你泄于运' },
  control: { f: 1.0, label: '你制住了运' },
  against: { f: 0.85, label: '运来克你' },
};

/** 卦辞的命令句 → 宜/忌。从六十四卦原文里按字面判定，不是另编的。
 *  关键：命令句只改「折损率」，不改「收益」——
 *  卦告诉你这一步该迈多大，不告诉你结果好不好。结果要落定才知道。
 */
window.EPOCH.IMPERATIVES = {
  advance: {
    key: 'advance', label: '宜进',
    note: '此卦劝你动——张时折损大减，缩时也难得利。',
    rule: '利涉大川 / 利有攸往 / 利建侯',
    riskMult: 0.55,
    byStake: { light: 1.0, mid: 1.0, heavy: 1.0 },
  },
  hold: {
    key: 'hold', label: '宜守',
    note: '此卦劝你守——缩时折损可免，张时折损骤增。',
    rule: '勿用有攸往 / 无攸利 / 不利',
    riskMult: 1.85,
    heavyHurt: 1,
    byStake: { light: 1.0, mid: 1.0, heavy: 1.0 },
  },
  borrow: {
    key: 'borrow', label: '宜借',
    note: '此卦劝你借力——缘旺则折损大减，缘衰则白求。',
    rule: '利见大人',
    riskMult: 1.0,
    byStake: { light: 1.0, mid: 1.0, heavy: 1.0 },
  },
  even: {
    key: 'even', label: '宜常',
    note: '此卦无偏——按常理走即可。',
    rule: '元亨利贞（无特别嘱托）',
    riskMult: 1.0,
    byStake: { light: 1.0, mid: 1.0, heavy: 1.0 },
  },
};

/** 命令句对折损率的影响（宜借看缘） */
window.EPOCH.riskMultOf = function (impKey, stakeKey, bondF) {
  if (impKey === 'borrow') {
    return { mult: bondF >= 1.1 ? 0.6 : 1.4, note: bondF >= 1.1 ? '缘旺，借得到力' : '缘衰，求也没用' };
  }
  var imp = window.EPOCH.IMPERATIVES[impKey];
  // 宜进只对「张」有效，宜守只对「张」加重；轻注本身风险就低
  if (impKey === 'advance') {
    return { mult: stakeKey === 'heavy' ? 0.55 : (stakeKey === 'light' ? 1.15 : 1.0), note: '' };
  }
  if (impKey === 'hold') {
    return { mult: stakeKey === 'heavy' ? 1.85 : (stakeKey === 'light' ? 0.8 : 1.0), note: '' };
  }
  return { mult: imp.riskMult, note: '' };
};

/** 按卦辞原文判定 commanding tone（负面词优先：卦里既说「利涉大川」又说「无攸利」时，以勿进为准） */
window.EPOCH.readImperative = function (judgment) {
  var t = String(judgment || '');
  if (/勿用|无攸利|不利有攸往|不利涉大川|征凶|终凶|终乱|不宜上|不可大事|贞凶/.test(t)) return 'hold';
  if (/利见大人|用见大人|见大人/.test(t)) return 'borrow';
  if (/利涉大川|利有攸往|利建侯|行师|征吉|南征|宜日中|小利有攸往/.test(t)) return 'advance';
  return 'even';
};
/** 应验率：爻动得多，卦在自变，说的话就不作数。
 *  不应验时，卦判与命令句整个反过来——照它走反而错。
 */
window.EPOCH.RELIABILITY = [
  { maxMoving: 0, rate: 0.88, label: '此卦静，语可信', tone: 'good' },
  { maxMoving: 2, rate: 0.68, label: '两爻以内动，信七分', tone: 'mid' },
  { maxMoving: 6, rate: 0.45, label: '动爻过半，卦乱，未必作数', tone: 'bad' },
];

/** 不应验时的反转 */
window.EPOCH.INVERT_FATE = {
  上上: '下下', 下下: '上上',
  上吉: '下', 下: '上吉',
  中吉: '中平', 中平: '中吉',
};
window.EPOCH.INVERT_IMP = {
  advance: 'hold', hold: 'advance', borrow: 'borrow', even: 'even',
};

window.EPOCH.reliabilityOf = function (movingCount) {
  var R = window.EPOCH.RELIABILITY;
  for (var i = 0; i < R.length; i++) {
    if (movingCount <= R[i].maxMoving) return R[i];
  }
  return R[R.length - 1];
};

window.EPOCH.FIT = {
  born: { f: 1.12, label: '行当生你', note: '它来助你' },
  same: { f: 1.08, label: '本命', note: '同气相求' },
  give: { f: 1.02, label: '你生行当', note: '顺，但耗你' },
  control: { f: 0.96, label: '你克行当', note: '勉强做得来' },
  against: { f: 0.9, label: '行当克你', note: '处处掣肘' },
};

/** 负负得正：凶命入险行 */
window.EPOCH.REVERSAL = { f: 1.4, hurtRelief: 1, text: '命硬的人，走险路才不浪费。' };
/** 吉命入险行：白瞎 */
window.EPOCH.WASTE = { f: 0.9, text: '好命去走险路，白瞎了。' };

/** 注码 */
window.EPOCH.STAKES = [
  { key: 'light', name: '轻', mult: 0.6, risk: 0.08, note: '小试，稳' },
  { key: 'mid', name: '中', mult: 1.0, risk: 0.20, note: '平常一注' },
  { key: 'heavy', name: '重', mult: 1.6, risk: 0.38, note: '一把押上' },
];

/** 每节基础产出 */
window.EPOCH.BASE = 42;

/** 事件：flip 为负负得正（仅在「坏判 + 对应行当」时触发） */
window.EPOCH.EVENTS = [
  { key: 'relic-flip', career: 'relic', flip: true, text: '那件被当成赝品的，竟是旧藏真迹。', add: { cash: 60 } },
  { key: 'tomb-flip', career: 'tomb', flip: true, text: '墓道塌了一半，别人没敢拿的东西归了你。', add: { cash: 75, hurt: 1 } },
  { key: 'trade-flip', career: 'trade', flip: true, text: '对手先跑了，你接了那个没人要的盘。', add: { cash: 66 } },
  { key: 'love-flip', career: 'love', flip: true, text: '她父亲失了势，反倒愿意了。', add: { bond: 40 } },
  { key: 'study-flip', career: 'study', flip: true, text: '走岔的那条路，意外通了。', add: { fame: 45 } },

  { key: 'gift', text: '旧友提携，替你说了句话。', add: { fame: 14 } },
  { key: 'sick', text: '一场病，躺了三个月。', add: { hurt: 2 } },
  { key: 'family', text: '父母之命，替你定了一门亲。', add: { bond: 16 } },
  { key: 'windfall', text: '一笔意外之财，来路说不清。', add: { cash: 22 } },
  { key: 'silent', text: '这一年，什么都没发生。', add: {} },
];

/** 结局：按主导项判定（从上往下取第一个成立的）
 *  阈值按「按卦走」4000 世的分位定：财 p90≈435、名 p90≈122、缘 p90≈201、价值 p97≈819
 */
window.EPOCH.ENDINGS = [
  { key: 'sage', name: '半仙', cond: (s) => s.value >= 780, text: '钱名缘伤俱全，你活成了别人嘴里的故事。' },
  { key: 'broken', name: '落魄先生', cond: (s) => s.hurt >= 8 && s.value < 450, text: '伤在身上，也落在账上。' },
  { key: 'master', name: '一代宗师', cond: (s) => s.fame >= 110, text: '你的名字，被写进了别人的注脚里。' },
  { key: 'warm', name: '儿孙满堂', cond: (s) => s.bond >= 180, text: '没什么钱，但屋里一直有人说话。' },
  { key: 'rich', name: '富家翁', cond: (s) => s.cash >= 430, text: '账上是实的，名声是虚的，你不在乎。' },
  { key: 'nobody', name: '无名之人', cond: () => true, text: '这一世，也就这样过去了。' },
];

/** 场外升级（花资财，永久） */
window.EPOCH.UPGRADES = [
  { key: 'memory', name: '前世记忆', desc: '每世问卦额度 +1', costs: [30, 45], max: 2 },
  { key: 'fate', name: '改运', desc: '每世起始改运 +1', costs: [25, 40], max: 2 },
  { key: 'heritage', name: '家学', desc: '起始财 +20', costs: [20, 32], max: 2 },
  { key: 'ancestor', name: '祖上积德', desc: '出生卦可重掷一次', costs: [35], max: 1 },
];

window.EPOCH.CONFIG = {
  sections: 6,
  startQuota: 4,     // 问卦额度（六节只有四次，得挑着问）
  startFate: 1,      // 改运次数
  deathHurt: 10,     // 伤到此即亡
  saveKey: 'wenyigua.epoch.v1',
  valueDivisor: 12,
};


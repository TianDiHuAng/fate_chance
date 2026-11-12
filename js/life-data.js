/* 「三百六十行」· 职业配置
 * 一套循环，五份配置。每个职业共享「问事—逐层下注—收手/翻车」的结构，
 * 差在命脉、风险曲线、专属机制与登峰条件。
 *
 * 全部标的、商号、人物、价格均为虚构，与真实公司、证券、行业无关。
 */

window.LIFE = {};

/** 判定系数（与《问一卦》同一套） */
window.LIFE.VERDICT_FACTOR = {
  上上: 1.8, 上吉: 1.8, 中吉: 1.3, 中平: 1.0, 下: 0.7, 下下: 0.4,
};
window.LIFE.UNVERIFIED = 0.9;

/** 四维情报通用骨架：key / name / values / minDepth */
function dims(a, b, c, d) {
  return [
    { key: 'a', name: a[0], values: a[1], minDepth: 1 },
    { key: 'b', name: b[0], values: b[1], minDepth: 1 },
    { key: 'c', name: c[0], values: c[1], minDepth: 2 },
    { key: 'd', name: d[0], values: d[1], minDepth: 3 },
  ];
}

window.LIFE.CAREERS = [
  {
    key: 'relic',
    name: '古玩',
    glyph: '鼎',
    verb: '掌眼',
    tagline: '看假易，看真难',
    blurb: '摊上一件东西，开价不高不低。你只有眼力和几句传闻——买到赝品，这一趟白走。',
    res: { name: '眼力', start: 5, perLayer: 0 },
    flop: 'end',
    risk: [0, 0, 0.05, 0.10, 0.16, 0.24, 0.34],
    base: 44,
    dims: dims(
      ['真伪', ['真', '赝']],
      ['年份', ['近', '中', '远']],
      ['来路', ['清', '杂', '黑']],
      ['行情', ['冷', '平', '热']],
    ),
    fakeDim: 'a',           // 这一维读到「赝」，就是提醒你该早撤
    fakePenalty: 0.1,       // 赝品成交只值一成
    subjects: [
      { key: 'ding', name: '青铜小鼎', rumor: '摊主说是南边出的，可铜锈匀得不像话。' },
      { key: 'scroll', name: '残卷', rumor: '纸脆墨浮，开价却低得可疑——他在急。' },
      { key: 'jade', name: '旧玉佩', rumor: '温润，边角有旧磕，据说是陪嫁带来的。' },
    ],
    peak: { cond: 'cash', value: 200, text: '单局成交 ≥ 200' },
    win: '一屋子真品，且你从没打过眼。',
    lose: '摊主收了钱，回头看你一眼——那眼神你熟。',
  },
  {
    key: 'tomb',
    name: '摸金',
    glyph: '铲',
    verb: '下铲',
    tagline: '阳气就是时间',
    blurb: '土里有东西，也有别的东西。每下一层耗一分阳气，阳气尽时不管你愿不愿意都得走。',
    res: { name: '阳气', start: 7, perLayer: 1 },
    flop: 'end',
    risk: [0, 0, 0.08, 0.15, 0.24, 0.34, 0.45],
    base: 60,
    dims: dims(
      ['吉凶', ['吉', '凶']],
      ['深浅', ['浅', '中', '深']],
      ['机关', ['无', '有']],
      ['尸气', ['无', '有']],
    ),
    subjects: [
      { key: 'mound', name: '无名封土', rumor: '当地人说这块地“夜里不打露水”。' },
      { key: 'temple', name: '废寺地宫', rumor: '佛像被搬空了，地基却没动过。' },
      { key: 'cliff', name: '崖墓三口', rumor: '三口并排，中间那口的封门是新补的。' },
    ],
    peak: { cond: 'depth', value: 6, text: '活着走完六层' },
    win: '开了一座没人动过的墓，且你自己走了出来。',
    lose: '阳气尽了。你听见土落下来的声音。',
  },
  {
    key: 'trade',
    name: '经商',
    glyph: '算',
    verb: '吃进',
    tagline: '杠杆放大一切，包括错',
    blurb: '一批货，一个价。你可以加杠杆——赚得翻倍，翻车也翻倍。',
    res: { name: '信用', start: 3, perLayer: 0 },
    flop: 'half',
    risk: [0, 0, 0.06, 0.12, 0.19, 0.27, 0.36],
    base: 40,
    leverage: { mult: 2, riskMult: 1.6 },
    dims: dims(
      ['行情', ['涨', '跌']],
      ['时机', ['早', '中', '晚']],
      ['对手', ['弱', '强']],
      ['政策', ['松', '紧']],
    ),
    subjects: [
      { key: 'tea', name: '一船茶', rumor: '雨季要来了，码头上的茶价还没动。' },
      { key: 'silk', name: '生丝三担', rumor: '织户停了工，丝价却有人在高价收。' },
      { key: 'grain', name: '秋粮', rumor: '漕运堵着，仓里的人都说不急。' },
    ],
    peak: { cond: 'cash', value: 300, text: '杠杆局单局 ≥ 300' },
    win: '一船货翻成三船，账房连夜加了把锁。',
    lose: '信用见底。铺子还开着，人已经不算数了。',
  },
  {
    key: 'love',
    name: '攀亲',
    glyph: '缘',
    verb: '相看',
    tagline: '人心比行情难读',
    blurb: '门第、性情、心意，都要一层层看。翻车只是丢脸，不丢命——但脸丢光了，也就没戏了。',
    res: { name: '颜面', start: 3, perLayer: 0 },
    flop: 'charm',
    risk: [0, 0, 0.07, 0.13, 0.18, 0.24, 0.30],
    base: 34,
    favor: { perLayer: 1, mult: 0.3 },
    dims: dims(
      ['心意', ['冷', '温', '热']],
      ['门第', ['近', '远']],
      ['性情', ['刚', '柔']],
      ['时机', ['早', '中', '晚']],
    ),
    subjects: [
      { key: 'teahouse', name: '茶楼东家', rumor: '她算账不用算盘，抬眼看人只要一眼。' },
      { key: 'bookshop', name: '旧书店主', rumor: '店里从不打折，却总留一本书在窗边。' },
      { key: 'banker', name: '银号千金', rumor: '她父亲的账，比她的脾气好看得多。' },
    ],
    peak: { cond: 'favor', value: 5, text: '单局好感 ≥ 5' },
    win: '门当户对，且她真的愿意。',
    lose: '颜面尽了。此后茶楼再见，她只当你是熟客。',
  },
  {
    key: 'research',
    name: '科研',
    glyph: '究',
    verb: '验',
    tagline: '方向错了，努力越久越远',
    blurb: '一个题，一条经费线。栽了不必重来，只损一半经费——但方向若偏，走得再深也是白走。',
    res: { name: '经费', start: 6, perLayer: 1 },
    flop: 'half',
    risk: [0, 0, 0.05, 0.09, 0.14, 0.20, 0.27],
    base: 30,
    dims: dims(
      ['方向', ['正', '偏']],
      ['数据', ['足', '缺']],
      ['同行', ['后', '先']],
      ['经费', ['足', '缺']],
    ),
    wrongDim: 'a',
    wrongPenalty: 0.35,     // 方向偏：成果只值三成半
    subjects: [
      { key: 'moon', name: '月轨异动', rumor: '三代人记的星表里，有一次谁都解释不了。' },
      { key: 'ore', name: '西山矿脉', rumor: '老矿师说这条脉“像是被人接上的”。' },
      { key: 'ink', name: '古法造纸', rumor: '同一道工序，两个师傅抄出两种纸。' },
    ],
    peak: { cond: 'depth', value: 5, text: '单局走到第五层且未栽' },
    win: '一篇没人能反驳的论文，署你的名字。',
    lose: '经费断了。六年的记录，装了两只木箱。',
  },
];

window.LIFE.BY_KEY = Object.fromEntries(window.LIFE.CAREERS.map((c) => [c.key, c]));
window.LIFE.PEAKS_TO_WIN = 3;
window.LIFE.SAVE_KEY = 'wenyigua.life.v1';

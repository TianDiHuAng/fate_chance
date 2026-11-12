/* 塔罗二十二大牌 · 中西双钥
 *
 * 归属依据（不是随便编的）：
 * 1. 星座/星体归属采用 Rider–Waite 与 Golden Dawn 的通行对应（8 力量=狮子、11 正义=天秤）。
 * 2. 十二星座 → 十二地支，采用中国七政四余（果老星宗）固有的「黄道十二宫」命名：
 *    戌白羊、酉金牛、申双子、未巨蟹、午狮子、巳室女、辰天秤、卯天蝎、寅人马、丑摩羯、子宝瓶、亥双鱼。
 *    也就是说，这一列不是我为游戏发明的，而是中国传统星命学本来就有的对照。
 * 3. 星体 → 五行，依七政（日月五星）固有归属：木星=木、火星=火、土星=土、金星=金、水星=水、太阳=火、太阴=水；
 *    三王星（天王/海王/冥王）按五行性质类推：天王=金（革新如金之断）、海王=水、冥王=火。
 * 4. 风象（双子/天秤/宝瓶）在五行中归「木」：风主生发、条达，与木同德。
 *
 * 于是每张牌同时带有：西式的象（星体/星座）+ 中式的五行与地支（应期）。
 * 十星体 + 十二星座 = 二十二张，恰好等于十干 + 十二支之数——这是本项目选它作牌组的原因。
 */

window.TAROT = [
  {
    id: 0, num: '0', name: '愚者', en: 'The Fool', glyph: '♅',
    attr: '天王星', attrType: 'planet', element: '金', branch: null,
    keyword: '跃', meaning: '未定之始。一步踏空，或一步登天，全看你敢不敢把行囊放下。',
  },
  {
    id: 1, num: 'I', name: '魔术师', en: 'The Magician', glyph: '☿',
    attr: '水星', attrType: 'planet', element: '水', branch: null,
    keyword: '通', meaning: '万物皆备于我。不是没有资源，是你还没把手上的东西连起来。',
  },
  {
    id: 2, num: 'II', name: '女祭司', en: 'The High Priestess', glyph: '☽',
    attr: '太阴', attrType: 'planet', element: '水', branch: null,
    keyword: '藏', meaning: '未说出口的那句最重。静下来听，答案在帘幕后。',
  },
  {
    id: 3, num: 'III', name: '皇后', en: 'The Empress', glyph: '♀',
    attr: '金星', attrType: 'planet', element: '金', branch: null,
    keyword: '育', meaning: '丰饶待熟。以柔养之，不可拔苗。',
  },
  {
    id: 4, num: 'IV', name: '皇帝', en: 'The Emperor', glyph: '♈',
    attr: '白羊座', attrType: 'sign', element: '火', branch: '戌',
    keyword: '立', meaning: '立规矩者得势。先划界，再谈事。',
  },
  {
    id: 5, num: 'V', name: '教皇', en: 'The Hierophant', glyph: '♉',
    attr: '金牛座', attrType: 'sign', element: '土', branch: '酉',
    keyword: '授', meaning: '承旧法、问师者。这条路有人走过，去问。',
  },
  {
    id: 6, num: 'VI', name: '恋人', en: 'The Lovers', glyph: '♊',
    attr: '双子座', attrType: 'sign', element: '木', branch: '申',
    keyword: '择', meaning: '二选一，择即是命。拖着不选，也是一种选。',
  },
  {
    id: 7, num: 'VII', name: '战车', en: 'The Chariot', glyph: '♋',
    attr: '巨蟹座', attrType: 'sign', element: '水', branch: '未',
    keyword: '行', meaning: '执辔者进。两匹马拉车，分心则覆。',
  },
  {
    id: 8, num: 'VIII', name: '力量', en: 'Strength', glyph: '♌',
    attr: '狮子座', attrType: 'sign', element: '火', branch: '午',
    keyword: '制', meaning: '不以力胜，以柔伏刚。按住它，不必杀它。',
  },
  {
    id: 9, num: 'IX', name: '隐者', en: 'The Hermit', glyph: '♍',
    attr: '处女座', attrType: 'sign', element: '土', branch: '巳',
    keyword: '独', meaning: '退一步自照。灯在你手上，不在人群里。',
  },
  {
    id: 10, num: 'X', name: '命运之轮', en: 'Wheel of Fortune', glyph: '♃',
    attr: '木星', attrType: 'planet', element: '木', branch: null,
    keyword: '转', meaning: '势已动，非人力可止。顺着转，别逆着扛。',
  },
  {
    id: 11, num: 'XI', name: '正义', en: 'Justice', glyph: '♎',
    attr: '天秤座', attrType: 'sign', element: '木', branch: '辰',
    keyword: '衡', meaning: '秤在你手，亦在你心。该给的，一分不能少。',
  },
  {
    id: 12, num: 'XII', name: '倒吊人', en: 'The Hanged Man', glyph: '♆',
    attr: '海王星', attrType: 'planet', element: '水', branch: null,
    keyword: '逆', meaning: '倒看则通。舍掉一点，才换得那一点。',
  },
  {
    id: 13, num: 'XIII', name: '死神', en: 'Death', glyph: '♏',
    attr: '天蝎座', attrType: 'sign', element: '水', branch: '卯',
    keyword: '革', meaning: '旧者必去。不是凶，是换。',
  },
  {
    id: 14, num: 'XIV', name: '节制', en: 'Temperance', glyph: '♐',
    attr: '人马座', attrType: 'sign', element: '火', branch: '寅',
    keyword: '调', meaning: '两物相济。火候在中间，一味则伤。',
  },
  {
    id: 15, num: 'XV', name: '恶魔', en: 'The Devil', glyph: '♑',
    attr: '摩羯座', attrType: 'sign', element: '土', branch: '丑',
    keyword: '缚', meaning: '绳结自系，亦可自解。你看清是谁在拉那根绳。',
  },
  {
    id: 16, num: 'XVI', name: '塔', en: 'The Tower', glyph: '♂',
    attr: '火星', attrType: 'planet', element: '火', branch: null,
    keyword: '破', meaning: '崩者本已空。碎掉的那部分，原就不是你的。',
  },
  {
    id: 17, num: 'XVII', name: '星星', en: 'The Star', glyph: '♒',
    attr: '宝瓶座', attrType: 'sign', element: '木', branch: '子',
    keyword: '望', meaning: '远水可饮。先信，然后才见。',
  },
  {
    id: 18, num: 'XVIII', name: '月亮', en: 'The Moon', glyph: '♓',
    attr: '双鱼座', attrType: 'sign', element: '水', branch: '亥',
    keyword: '惑', meaning: '雾中之声，半真半妄。别在下雾时定终身。',
  },
  {
    id: 19, num: 'XIX', name: '太阳', en: 'The Sun', glyph: '☉',
    attr: '太阳', attrType: 'planet', element: '火', branch: null,
    keyword: '明', meaning: '无所蔽，事在明处。可以说了。',
  },
  {
    id: 20, num: 'XX', name: '审判', en: 'Judgement', glyph: '♇',
    attr: '冥王星', attrType: 'planet', element: '火', branch: null,
    keyword: '唤', meaning: '旧事重提，一声而醒。该结的账，现在结。',
  },
  {
    id: 21, num: 'XXI', name: '世界', en: 'The World', glyph: '♄',
    attr: '土星', attrType: 'planet', element: '土', branch: null,
    keyword: '成', meaning: '环闭则满，满则复始。这一圈走完了，收好，再开一圈。',
  },
];

/* 五域（所问之事）→ 象。此为游戏设定，用于「同象」类卦规与判词措辞。 */
window.DOMAINS = [
  { key: 'career', name: '事业', element: '木', hint: '进退、去留、成事之期' },
  { key: 'love', name: '感情', element: '火', hint: '亲疏、聚散、是否有缘' },
  { key: 'wealth', name: '财运', element: '金', hint: '得失、来路、可否下注' },
  { key: 'health', name: '身心', element: '土', hint: '劳逸、元气、如何将养' },
  { key: 'self', name: '自身', element: '水', hint: '我该成为什么、往哪里去' },
];

window.TAROT_BY_ID = Object.fromEntries(window.TAROT.map((c) => [c.id, c]));

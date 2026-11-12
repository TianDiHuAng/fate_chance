/* 《问一卦，抽一张》核心引擎
 * 纯函数、无 DOM 依赖，可在浏览器（window.Engine）与 Node（module.exports）下运行。
 *
 * 判定链：应牌五行 × 用神五行（生克） → 外卦扭转 → 动爻乘数 → 等级
 * 用神 = 内卦（下卦）五行。内卦定「你能取哪张」，外卦定「取到之后如何」，动爻定「这一局稳不稳」。
 */
(function (root) {
  'use strict';

  // ---------- 五行 ----------
  var SHENG = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' }; // 我生者
  var KE = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' }; // 我克者
  var ELEMENTS = ['金', '木', '水', '火', '土'];

  // 三画卦：键为「自下而上」三爻（1 阳 0 阴）
  var TRIGRAMS = {
    '111': { name: '乾', nature: '天', element: '金', glyph: '☰' },
    '110': { name: '兑', nature: '泽', element: '金', glyph: '☱' },
    '101': { name: '离', nature: '火', element: '火', glyph: '☲' },
    '100': { name: '震', nature: '雷', element: '木', glyph: '☳' },
    '011': { name: '巽', nature: '风', element: '木', glyph: '☴' },
    '010': { name: '坎', nature: '水', element: '水', glyph: '☵' },
    '001': { name: '艮', nature: '山', element: '土', glyph: '☶' },
    '000': { name: '坤', nature: '地', element: '土', glyph: '☷' },
  };

  // 「三才」位名：第一张为天（时），第二张为地（势），第三张为人（事）
  var POSITIONS = [
    { key: '天', label: '天 · 时机', ask: '此刻的天时如何' },
    { key: '地', label: '地 · 处境', ask: '你所处的局势如何' },
    { key: '人', label: '人 · 可为', ask: '你能做什么' },
  ];

  // ---------- 起卦 ----------
  // 三枚铜钱：背为阳(3)、字为阴(2)。和数 6 老阴 / 7 少阳 / 8 少阴 / 9 老阳。
  function tossCoins(rng) {
    rng = rng || Math.random;
    var coins = [0, 0, 0].map(function () {
      return rng() < 0.5 ? 2 : 3; // 2=字(阴) 3=背(阳)
    });
    var sum = coins.reduce(function (a, b) { return a + b; }, 0);
    var table = {
      6: { name: '老阴', yang: false, moving: true, mark: '×' },
      7: { name: '少阳', yang: true, moving: false, mark: '' },
      8: { name: '少阴', yang: false, moving: false, mark: '' },
      9: { name: '老阳', yang: true, moving: true, mark: '○' },
    };
    var t = table[sum];
    return {
      coins: coins,
      sum: sum,
      name: t.name,
      yang: t.yang,
      moving: t.moving,
      mark: t.mark,
    };
  }

  // lines: 自初爻至上的六个 toss 结果（数组顺序即下→上）
  function buildHexagram(lines) {
    var code = lines.map(function (l) { return l.yang ? '1' : '0'; }).join('');
    var changedCode = lines
      .map(function (l) {
        if (!l.moving) return l.yang ? '1' : '0';
        return l.yang ? '0' : '1';
      })
      .join('');
    var hex = root.HEXAGRAM_BY_CODE[code];
    var changed = root.HEXAGRAM_BY_CODE[changedCode];
    var movingIdx = [];
    lines.forEach(function (l, i) { if (l.moving) movingIdx.push(i); });
    return {
      code: code,
      changedCode: changedCode,
      hex: hex,
      changed: changed,
      movingCount: movingIdx.length,
      movingIdx: movingIdx,
      isStatic: movingIdx.length === 0,
    };
  }

  // ---------- 局规 ----------
  // 内卦：你能取哪一张（合法性）
  var INNER_RULES = {
    乾: {
      key: 'all',
      text: '三才皆可取——天行健，取舍在你。',
      legal: function () { return [0, 1, 2]; },
    },
    坤: {
      key: 'pos-human',
      text: '只可取「人」——地势顺承，成事在人。',
      legal: function () { return [2]; },
    },
    震: {
      key: 'pos-heaven',
      text: '只可取「天」——雷动之初，先觉者先动。',
      legal: function () { return [0]; },
    },
    巽: {
      key: 'pos-earth',
      text: '只可取「地」——风行草偃，入乎其中。',
      legal: function () { return [1]; },
    },
    坎: {
      key: 'elem-metal-water',
      text: '只可取水、金之牌——险中求，取润下与从革。',
      legal: function (hand) {
        return pick(hand, function (c) { return c.element === '水' || c.element === '金'; });
      },
    },
    离: {
      key: 'elem-wood-fire',
      text: '只可取火、木之牌——明两作，取炎上与生发。',
      legal: function (hand) {
        return pick(hand, function (c) { return c.element === '火' || c.element === '木'; });
      },
    },
    艮: {
      key: 'not-earth',
      text: '不可取「地」——艮止于中，中位不宜。',
      legal: function () { return [0, 2]; },
    },
    兑: {
      key: 'same-elem',
      text: '须取与所问同象之牌，或生其所问之象者——同气相求。',
      legal: function (hand, ctx) {
        var d = ctx.domainElement;
        var born = Object.keys(SHENG).filter(function (k) { return SHENG[k] === d; })[0];
        return pick(hand, function (c) { return c.element === d || c.element === born; });
      },
    },
  };

  // 外卦：取到之后如何（扭转与授予）
  var OUTER_RULES = {
    乾: {
      key: 'gift',
      title: '天予',
      text: '若判为上吉以上，再进一等（天之所与）。',
      score: function (s) { if (s.score >= 3) s.score += 1; },
    },
    坤: {
      key: 'bear',
      title: '承载',
      text: '得分减半，但永不落凶（地势承载）。',
      score: function (s) { s.score = s.score > 0 ? Math.ceil(s.score / 2) : 0; },
    },
    震: {
      key: 'redraw',
      title: '雷动',
      text: '你可重抽手中一张牌（雷动而变）。',
      grants: { redraw: 1 },
    },
    巽: {
      key: 'swap',
      title: '风行',
      text: '你可交换任意两张牌的位置（风行而顺）。',
      grants: { swap: 1 },
    },
    坎: {
      key: 'peril',
      title: '水险',
      text: '应牌既定，再折一分（水在险中）。',
      score: function (s) { s.score -= 1; },
    },
    离: {
      key: 'illume',
      title: '照见',
      text: '若应牌与所问同象，加二分（明两作，照见其实）。',
      score: function (s) { if (s.card.element === s.domainElement) s.score += 2; },
    },
    艮: {
      key: 'limit',
      title: '止限',
      text: '只能在一、二张中取（艮止于前）。',
      legalFilter: function (legal) {
        return legal.filter(function (i) { return i <= 1; });
      },
    },
    兑: {
      key: 'joy-end',
      title: '悦终',
      text: '若应牌为第三张，加二分（泽，悦于终）。',
      score: function (s) { if (s.index === 2) s.score += 2; },
    },
  };

  function pick(hand, fn) {
    var out = [];
    hand.forEach(function (c, i) { if (fn(c, i)) out.push(i); });
    return out;
  }

  /**
   * 生成此卦之规。
   * @param {object} built buildHexagram 的返回
   * @param {Array}  hand  手中三张牌
   * @param {string} domainElement 所问之事五行
   */
  function makeRule(built, hand, domainElement) {
    var hex = built.hex;
    var innerName = hex.lower;
    var outerName = hex.upper;
    var inner = INNER_RULES[innerName];
    var outer = OUTER_RULES[outerName];

    var legal = inner.legal(hand, { domainElement: domainElement });
    var notes = [];
    var violated = false;

    if (outer.legalFilter) {
      var filtered = outer.legalFilter(legal);
      if (filtered.length) {
        legal = filtered;
      } else {
        notes.push('「' + outer.title + '」与内卦之限相违。');
      }
    }

    if (!legal.length) {
      // 卦不许，手中无一可应：不替你兜底，把「越规」的选择交给你。
      violated = true;
      notes.push('卦不許，手中无一可应——只能越规取牌，记一越规。');
    }

    var grants = { redraw: 0, swap: 0 };
    if (outer.grants) {
      grants.redraw += outer.grants.redraw || 0;
      grants.swap += outer.grants.swap || 0;
    }

    // 动爻：定数 / 微转 / 大变
    var moving = { count: built.movingCount, key: 'steady', title: '气机微转', text: '动爻一二，气机微转，此局略有余地。' };
    if (built.movingCount === 0) {
      moving = { count: 0, key: 'still', title: '六爻皆静', text: '六爻皆静，此为定数：得分加二成，但无从改易。', multiplier: 1.2 };
    } else if (built.movingCount >= 3) {
      moving = { count: built.movingCount, key: 'surge', title: '动爻过半', text: '动爻过半，局势未定：可重抽一张，但得分折二成。', multiplier: 0.8 };
      grants.redraw += 1;
    }

    return {
      inner: {
        name: innerName,
        element: TRIGRAMS[codeOfTrigram(innerName)].element,
        nature: TRIGRAMS[codeOfTrigram(innerName)].nature,
        rule: inner,
      },
      outer: {
        name: outerName,
        element: TRIGRAMS[codeOfTrigram(outerName)].element,
        nature: TRIGRAMS[codeOfTrigram(outerName)].nature,
        rule: outer,
      },
      moving: moving,
      legal: legal,
      grants: grants,
      violated: violated,
      notes: notes,
      /** 用神：内卦五行 */
      yongshen: TRIGRAMS[codeOfTrigram(innerName)].element,
    };
  }

  var TRIGRAM_CODE = {
    乾: '111', 兑: '110', 离: '101', 震: '100',
    巽: '011', 坎: '010', 艮: '001', 坤: '000',
  };
  function codeOfTrigram(name) { return TRIGRAM_CODE[name]; }

  // ---------- 生克 ----------
  // 以「应牌」对「用神」：
  //   应生用 = 得助 +3 ／ 比和 +1 ／ 我克应（制）+1 ／ 用生应（泄）-1 ／ 应克用（伤）-2
  function relationOf(cardElement, yongshen) {
    if (SHENG[cardElement] === yongshen) {
      return { key: 'help', label: '应生用神', short: '得助', score: 3, note: cardElement + '生' + yongshen + '，此牌来助你。' };
    }
    if (cardElement === yongshen) {
      return { key: 'same', label: '比和', short: '同气', score: 1, note: '同属' + yongshen + '，同气相求，不增不减。' };
    }
    if (SHENG[yongshen] === cardElement) {
      return { key: 'drain', label: '用神生应', short: '走泄', score: -1, note: yongshen + '生' + cardElement + '，你在向外耗。' };
    }
    if (KE[cardElement] === yongshen) {
      return { key: 'harm', label: '应克用神', short: '受制', score: -2, note: cardElement + '克' + yongshen + '，此牌与你相争。' };
    }
    return { key: 'control', label: '用神克应', short: '可制', score: 1, note: yongshen + '克' + cardElement + '，你能制住它。' };
  }

  var LEVELS = [
    { min: 5, key: 'shangshang', name: '上上', seal: '大吉', line: '此机已现，宜快不宜全——先动一寸，胜过想透十分。' },
    { min: 3, key: 'shang', name: '上吉', seal: '吉', line: '可进，但留一分退路。把话说在事前。' },
    { min: 1, key: 'zhong', name: '中吉', seal: '吉', line: '宜守成，借他人之力；此事可缓半月再看。' },
    { min: 0, key: 'ping', name: '中平', seal: '平', line: '两可之间。先弄清自己真正要什么，再问结果。' },
    { min: -2, key: 'xia', name: '下', seal: '阻', line: '此时不宜动，动则耗。把力气收回来，先养一件事。' },
    { min: -Infinity, name: '下下', key: 'xiaxia', seal: '凶', line: '卦已言阻，止损是上策。换一条路，别与势争。' },
  ];

  var ELEMENT_HINT = {
    金: '断与舍：该切的切干净，别拖着。',
    木: '生与求：去找人、去起头，别独自酝酿。',
    水: '待与流：等它自己动，你只顺着走。',
    火: '明与说：摊在桌面上谈，藏则更乱。',
    土: '实与置：落到具体的事、具体的钱、具体的地方。',
  };

  /**
   * 判定。
   * @param {object} p { built, rule, hand, index, domainElement }
   * 越规（取卦所不许之位）由 rule.legal 判定，另扣二分——但有时越规反而更高，
   * 这正是这一局要你算的事。
   */
  function judge(p) {
    var card = p.hand[p.index];
    var rel = relationOf(card.element, p.rule.yongshen);
    var steps = [];
    var score = rel.score;
    var overrule = p.rule.legal.indexOf(p.index) < 0;

    steps.push({
      label: '生克',
      detail: rel.label + '（' + rel.note + '）',
      delta: rel.score,
    });

    if (overrule) {
      score -= 2;
      steps.push({
        label: '越规',
        detail: '卦不许此位，你偏取之（越规，折二分）。',
        delta: -2,
      });
    }

    var outerRule = p.rule.outer.rule;
    if (outerRule.score) {
      var before = score;
      // 外卦的计分钩子只操作这个上下文对象，避免副作用外溢
      var s = { score: before, card: card, index: p.index, domainElement: p.domainElement };
      outerRule.score(s);
      score = s.score;
      if (score !== before) {
        steps.push({ label: outerRule.title, detail: outerRule.text, delta: score - before });
      }
    }

    if (p.rule.moving.multiplier && p.rule.moving.multiplier !== 1) {
      var prev = score;
      score = Math.round(score * p.rule.moving.multiplier);
      steps.push({
        label: p.rule.moving.title,
        detail: p.rule.moving.text,
        delta: score - prev,
      });
    }

    var level = LEVELS.filter(function (l) { return score >= l.min; })[0];

    return {
      card: card,
      index: p.index,
      relation: rel,
      steps: steps,
      score: score,
      level: level,
      yongshen: p.rule.yongshen,
      advice: level.line,
      elementHint: ELEMENT_HINT[p.rule.yongshen],
    };
  }

  /**
   * 复盘：把三张牌全部按同一卦规算一遍，找出「守规最优」与「含越规最优」。
   * 这是把隐藏的生克技巧露给玩家的关键——没有复盘，玩家永远学不会。
   */
  function analyze(p) {
    var options = p.hand.map(function (c, i) {
      return {
        index: i,
        result: judge({
          built: p.built,
          rule: p.rule,
          hand: p.hand,
          index: i,
          domainElement: p.domainElement,
        }),
      };
    });

    function bestOf(list) {
      if (!list.length) return null;
      return list.reduce(function (b, o) {
        return o.result.score > b.result.score ? o : b;
      });
    }

    var legalOpts = options.filter(function (o) {
      return p.rule.legal.indexOf(o.index) >= 0;
    });

    return {
      options: options,
      bestLegal: bestOf(legalOpts),
      bestOverall: bestOf(options),
      legalCount: p.rule.legal.length,
      hasLegal: legalOpts.length > 0,
    };
  }

  /** 供测试与界面使用的牌堆工具 */  function shuffle(rng) {
    rng = rng || Math.random;
    var deck = root.TAROT.slice();
    for (var i = deck.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = deck[i]; deck[i] = deck[j]; deck[j] = t;
    }
    return deck;
  }

  function drawHand(rng) { return shuffle(rng).slice(0, 3); }

  var api = {
    SHENG: SHENG,
    KE: KE,
    ELEMENTS: ELEMENTS,
    TRIGRAMS: TRIGRAMS,
    POSITIONS: POSITIONS,
    INNER_RULES: INNER_RULES,
    OUTER_RULES: OUTER_RULES,
    LEVELS: LEVELS,
    ELEMENT_HINT: ELEMENT_HINT,
    tossCoins: tossCoins,
    buildHexagram: buildHexagram,
    makeRule: makeRule,
    relationOf: relationOf,
    judge: judge,
    analyze: analyze,
    shuffle: shuffle,
    drawHand: drawHand,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Engine = api;
})(typeof window !== 'undefined' ? window : global);

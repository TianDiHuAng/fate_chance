/* 《一世》· 出生问卦 → 六节人生 → 终局结算 → 场外升级
 *
 * 核心：卦不给「吉凶」一个数，给的是四条线（财/名/缘/安）各不相同的旺衰。
 * 用神只有一个，四路必然不均——这是生克图的结构性后果，不是数值调出来的。
 * 同一条命，走过不同岁运，读法又不同。
 */
(function () {
  'use strict';

  var E = window.Engine;
  var EP = window.EPOCH;
  var $ = function (s) { return document.querySelector(s); };
  var SHENG = E.SHENG, KE = E.KE;
  var POS = ['初', '二', '三', '四', '五', '上'];
  // 三画卦「自下而上」的三爻
  var TRI = { 乾: '111', 兑: '110', 离: '101', 震: '100', 巽: '011', 坎: '010', 艮: '001', 坤: '000' };

  // ---------- 随机 ----------
  var seeded = (function () {
    var m = /[?&]seed=(\d+)/.exec(window.location.search);
    if (!m) return null;
    var a = Number(m[1]) >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  })();
  function rng() {
    if (seeded) return seeded();
    if (window.crypto && window.crypto.getRandomValues) {
      var a = new Uint32Array(1);
      window.crypto.getRandomValues(a);
      return a[0] / 4294967296;
    }
    return Math.random();
  }
  function pick(arr) { return arr[Math.floor(rng() * arr.length)]; }

  // ---------- 存档 ----------
  var SAVE;
  function defaultSave() {
    return {
      wealth: 0, lives: 0,
      upg: { memory: 0, fate: 0, heritage: 0, ancestor: 0 },
      endings: {}, ach: {},
    };
  }
  function load() {
    try {
      var raw = localStorage.getItem(EP.CONFIG.saveKey);
      if (!raw) return defaultSave();
      var s = JSON.parse(raw);
      if (!s || typeof s !== 'object') return defaultSave();
      s.upg = Object.assign({ memory: 0, fate: 0, heritage: 0, ancestor: 0 }, s.upg || {});
      s.endings = s.endings || {};
      s.ach = s.ach || {};
      return s;
    } catch (e) { return defaultSave(); }
  }
  function persist() {
    try { localStorage.setItem(EP.CONFIG.saveKey, JSON.stringify(SAVE)); } catch (e) { /* 忽略 */ }
  }

  var RUN = null;
  var toastTimer = null;
  function toast(msg) {
    var el = $('#toast');
    el.textContent = msg;
    el.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('is-on'); }, 2200);
  }
  function show(phase) {
    document.querySelectorAll('.screen').forEach(function (el) {
      el.classList.toggle('is-active', el.dataset.screen === phase);
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ---------- 生克 ----------
  function fitOf(bornEl, careerEl) {
    if (SHENG[careerEl] === bornEl) return 'born';
    if (careerEl === bornEl) return 'same';
    if (SHENG[bornEl] === careerEl) return 'give';
    if (KE[bornEl] === careerEl) return 'control';
    return 'against';
  }
  /** 用神与某路的生克 → 该路旺衰 */
  function laneRel(yong, laneEl) {
    if (SHENG[yong] === laneEl) return 'feed';
    if (yong === laneEl) return 'same';
    if (SHENG[laneEl] === yong) return 'give';
    if (KE[yong] === laneEl) return 'hold';
    return 'clash';
  }
  /** 岁运与用神 → 当节基调 */
  function yearRel(yearEl, yong) {
    if (SHENG[yearEl] === yong) return 'born';
    if (yearEl === yong) return 'same';
    if (SHENG[yong] === yearEl) return 'give';
    if (KE[yong] === yearEl) return 'control';
    return 'against';
  }
  function isBadFate(k) { return k === '下' || k === '下下'; }
  function isGoodFate(k) { return k === '上上' || k === '上吉'; }

  /** 卦辞有明示就用明示；没有明示，则由卦判的强弱自然推出去向 */
  function imperativeOf(built, fateKey) {
    var k = EP.readImperative(built.hex.judgment);
    if (k !== 'even') return k;
    if (isGoodFate(fateKey)) return 'advance';
    if (isBadFate(fateKey)) return 'hold';
    return 'even';
  }

  /** 卦意只改折损率——不改收益。收益要落定才知道。 */
  function stakeFit(impKey, stakeKey, bondF) {
    return EP.riskMultOf(impKey, stakeKey, bondF);
  }

  /** 生克 → 强弱：卦给你「缺什么」，牌给你「手里是什么」 */
  var REL_TO_FATE = { '3': '上吉', '1': '中吉', '-1': '中平', '-2': '下' };
  var REL_NAME = {
    help: '应生用', same: '比和', drain: '用生应', harm: '应克用', control: '用克应',
  };

  /** 中西合参：中式答「该不该动」，西式答「动不动得动」 */
  function crossRead(impKey, rel) {
    var shouldMove = impKey === 'advance' || impKey === 'borrow';
    var hasPower = rel.score >= 1;
    var cn = impKey === 'advance' ? '该动'
      : impKey === 'hold' ? '宜守'
        : impKey === 'borrow' ? '该借' : '宜常';
    var en = rel.score >= 3 ? '有力'
      : rel.score >= 1 ? '尚可' : '无力';

    var verdict, tone;
    if (shouldMove && hasPower) { verdict = '天时在手，牌也有力——可押重'; tone = 'good'; }
    else if (shouldMove && !hasPower) { verdict = '天时对，手里却没牌——押了也白押'; tone = 'mid'; }
    else if (!shouldMove && hasPower) { verdict = '有牌，但天时不与——留着，别急'; tone = 'mid'; }
    else { verdict = '天时不与，手里也没牌——别动'; tone = 'bad'; }

    return { cn: cn, en: en, verdict: verdict, tone: tone };
  }

  function readingOf(cast) {
    var card = cast.hand[cast.cardIdx] || cast.hand[0];
    var side = cast.pick === 'late' ? cast.late : cast.early;
    var rel = E.relationOf(card.element, side.yong);
    var fateKey = REL_TO_FATE[String(rel.score)] || '中平';
    return {
      card: card, side: side, relation: rel,
      relName: REL_NAME[rel.key] || rel.label,
      fateKey: fateKey,
      imp: imperativeOf({ hex: side.hex }, fateKey),
    };
  }

  /** 一次完整的中西合参：六爻中式成卦，三张西式塔罗择一为「应」 */
  function castOnce() {
    var lines = [];
    for (var i = 0; i < 6; i++) lines.push(E.tossCoins(rng));
    var built = E.buildHexagram(lines);

    var hand = [];
    var used = {};
    while (hand.length < 3) {
      var c = window.TAROT[Math.floor(rng() * window.TAROT.length)];
      if (!used[c.id]) { used[c.id] = 1; hand.push(c); }
    }

    function sideOf(hex) {
      return {
        hex: hex,
        yong: E.TRIGRAMS[TRI[hex.lower]].element,
        judgment: hex.judgment,
      };
    }

    var early = sideOf(built.hex);
    var hasChanged = built.changedCode !== built.code;
    var late = hasChanged ? sideOf(built.changed) : early;

    return {
      lines: lines, built: built, hand: hand,
      early: early, late: late, hasChanged: hasChanged,
      moving: built.movingCount, rel: EP.reliabilityOf(built.movingCount),
      cardIdx: 0,
      pick: 'early',
    };
  }

  function paintHex(box, lines) {
    var rows = [];
    for (var i = 0; i < 6; i++) {
      var l = lines[i];
      if (!l) {
        rows.push('<div class="hline is-ghost"><span class="pos">' + POS[i] + '</span>'
          + '<span class="mark"></span><span class="bars"><span class="bar"></span></span></div>');
        continue;
      }
      var cls = 'hline' + (l.yang ? '' : ' is-yin') + (l.moving ? ' moving' : '');
      var bars = '<span class="bars">'
        + (l.yang ? '<span class="bar"></span>' : '<span class="bar"></span><span class="bar"></span>')
        + '</span>';
      rows.push('<div class="' + cls + '"><span class="pos">' + POS[i] + '</span>'
        + '<span class="mark">' + (l.mark || '') + '</span>' + bars + '</div>');
    }
    box.innerHTML = rows.join('');
  }

  // ---------- 出生 ----------
  function newLife() {
    RUN = {
      birth: null,
      sectionIdx: 0,
      stats: { cash: SAVE.upg.heritage * 20, fame: 0, bond: 0, hurt: 0 },
      careerKey: null,
      cast: null,
      hidden: null,
      hiddenSection: -1,
      stakeKey: null,
      quota: EP.CONFIG.startQuota + SAVE.upg.memory,
      quotaMax: EP.CONFIG.startQuota + SAVE.upg.memory,
      fateLeft: EP.CONFIG.startFate + SAVE.upg.fate,
      birthRerolls: SAVE.upg.ancestor,
      log: [],
      over: false,
    };
    $('#birth-card').innerHTML = '';
    $('#btn-begin').classList.add('is-hidden');
    var b = $('#btn-birth');
    b.classList.remove('is-hidden');
    b.disabled = false;
    b.textContent = '掷出生卦';
    paintHex($('#birth-hex'), []);
    show('birth');
  }

  function laneTableHtml(yong) {
    return '<div class="lanes">' + EP.LANES.map(function (lane) {
      var k = laneRel(yong, lane.el);
      var r = EP.LANE_REL[k];
      var cls = r.f > 1.1 ? 'good' : (r.f < 0.9 ? 'bad' : '');
      return '<div class="lane ' + cls + '">'
        + '<div class="ln">' + lane.name + '<span class="le">' + lane.el + '</span></div>'
        + '<div class="lv">' + r.label + '</div>'
        + '<div class="lf">×' + r.f.toFixed(2) + '</div>'
        + '<div class="ld">' + r.note + '</div>'
        + '</div>';
    }).join('') + '</div>';
  }

  function castBirth() {
    RUN.birth = castOnce();
    // 出生只论本卦：那时还没有「以后」可言
    RUN.birth.pick = 'early';
    var read = readingOf(RUN.birth);
    RUN.birth.fateKey = read.fateKey;
    RUN.birth.impKey = read.imp;
    var yong = RUN.birth.early.yong;
    RUN.birth.judge = { yongshen: yong, relation: { label: read.relName } };
    RUN.birth.yong = yong;
    RUN.birth.card = read.card;

    var tone = EP.FATE[RUN.birth.fateKey].tone;
    var rows = EP.CAREERS.map(function (c) {
      var k = fitOf(yong, c.el);
      var fit = EP.FIT[k];
      var rev = isBadFate(RUN.birth.fateKey) && c.risky;
      var waste = isGoodFate(RUN.birth.fateKey) && c.risky;
      var eff = rev ? EP.REVERSAL.f : (waste ? fit.f * EP.WASTE.f : fit.f);
      return '<div class="fit-row ' + (rev ? 'good' : '') + '">'
        + '<span class="fn">' + c.name + '</span>'
        + '<span class="fd">' + (rev ? '负负得正' : EP.FIT[k].label)
        + '　财' + c.out.cash.toFixed(1) + ' 名' + c.out.fame.toFixed(1) + ' 缘' + c.out.bond.toFixed(1) + '</span>'
        + '<span class="ff">×' + eff.toFixed(2) + '</span></div>';
    }).join('');

    var best = EP.CAREERS
      .map(function (c) { return { c: c, f: EP.FIT[fitOf(yong, c.el)].f }; })
      .sort(function (a, b) { return b.f - a.f; })[0];

    var note;
    if (isBadFate(RUN.birth.fateKey)) {
      note = '<div class="reversal-note">' + EP.REVERSAL.text + '<br>此命走「摸金」「经商」两险行，系数拉到 ×'
        + EP.REVERSAL.f + '，且免一分伤——坏卦不是重开的理由，是换了条路。</div>';
    } else if (isGoodFate(RUN.birth.fateKey)) {
      note = '<div class="reversal-note" style="border-color:var(--gold);background:rgba(178,141,51,.08);color:var(--ink-soft)">'
        + '此命好。走险行反而白瞎（×' + EP.WASTE.f + '）——把好运用在阴处，不划算。</div>';
    } else {
      note = '<div class="reversal-note" style="border-color:var(--ink-faint);background:rgba(26,22,19,.04);color:var(--ink-soft)">'
        + '此命平平——险路不罚，顺路不赏。走哪条都看你自己，也都要自己付账。</div>';
    }

    $('#birth-card').innerHTML = '<div class="fate-card">'
      + '<div class="fate-head">'
      + '  <span class="fate-glyph">' + RUN.birth.built.hex.glyph + '</span>'
      + '  <span><span class="fate-name">' + RUN.birth.built.hex.sub + '</span>'
      + '    <span class="fate-sub">用神 ' + yong + '　应《' + RUN.birth.card.name + '》　'
      + RUN.birth.judge.relation.label + '</span></span>'
      + '  <span class="fate-badge ' + tone + '">' + EP.FATE[RUN.birth.fateKey].label + '</span>'
      + '</div>'
      + '<p class="lane-title">命盘 · 四路旺衰（用神 ' + yong + '，故四路必不均）</p>'
      + laneTableHtml(yong)
      + '<p class="lane-title">行当 · 方向（只作小幅修正，主戏在四路）</p>'
      + '<div class="fit-list">' + rows + '</div>'
      + '<p class="fate-sub" style="margin-top:12px">产出偏向 财/名/缘　·　最合命的方向：' + best.c.name + '</p>'
      + note
      + '</div>';

    paintHex($('#birth-hex'), RUN.birth.lines);

    var b = $('#btn-birth');
    var canReroll = RUN.fateLeft > 0 || RUN.birthRerolls > 0;
    b.textContent = canReroll
      ? '改运重掷（改运 ' + RUN.fateLeft + ' · 祖荫 ' + RUN.birthRerolls + '）'
      : '命已定，改不了';
    b.disabled = !canReroll;
    b.onclick = function () {
      if (RUN.birthRerolls > 0) RUN.birthRerolls -= 1;
      else if (RUN.fateLeft > 0) RUN.fateLeft -= 1;
      else return;
      castBirth();
      toast('改了一次运');
    };

    $('#btn-begin').classList.remove('is-hidden');
  }

  function laneFbond() {
    return EP.LANE_REL[laneRel(RUN.birth.yong, '木')].f;
  }

  // ---------- 人生 ----------
  function yearOf(i) { return EP.YEARS[i % EP.YEARS.length]; }
  function yearFOf(i) {
    var rel = yearRel(yearOf(i), RUN.birth.yong);
    return { key: rel, f: EP.YEAR_REL[rel].f, label: EP.YEAR_REL[rel].label };
  }

  /** 每一节的卦本来就存在——问不问，它都在。不问只是你看不见它。 */
  function ensureOmen() {
    if (RUN.hiddenSection === RUN.sectionIdx && RUN.hidden) return;
    RUN.hidden = castOnce();
    RUN.hiddenSection = RUN.sectionIdx;
  }

  function renderLife() {
    var sec = EP.SECTIONS[RUN.sectionIdx];
    var done = RUN.sectionIdx;

    $('#timeline').innerHTML = EP.SECTIONS.map(function (s, i) {
      var cls = i < done ? 'done' : (i === done && !RUN.over ? 'now' : '');
      if (RUN.over && i >= done) cls = 'dead';
      var nm = i < done && RUN.log[i] ? RUN.log[i].careerName : s.name;
      return '<div class="tl ' + cls + '"><div class="age">' + s.age + ' 岁</div>'
        + '<div class="nm">' + nm + '</div></div>';
    }).join('');

    var st = RUN.stats;
    $('#stats').innerHTML = '<div class="st"><div class="k">财</div><div class="v">' + Math.round(st.cash) + '</div></div>'
      + '<div class="st"><div class="k">名</div><div class="v">' + Math.round(st.fame) + '</div></div>'
      + '<div class="st"><div class="k">缘</div><div class="v">' + Math.round(st.bond) + '</div></div>'
      + '<div class="st hurt' + (st.hurt >= 7 ? ' warn' : '') + '"><div class="k">伤</div>'
      + '<div class="v">' + st.hurt + ' / ' + EP.CONFIG.deathHurt + '</div></div>';

    if (RUN.over) return;

    ensureOmen();

    var yf = yearFOf(RUN.sectionIdx);
    $('#sec-title').textContent = '第 ' + (RUN.sectionIdx + 1) + ' 节 · ' + sec.name + '（' + sec.age + ' 岁）';
    $('#sec-note').textContent = sec.note
      + '　·　岁运 ' + yearOf(RUN.sectionIdx) + '（' + yf.label + ' ×' + yf.f.toFixed(2) + '）'
      + '　·　问卦 ' + RUN.quota + '/' + RUN.quotaMax
      + '　·　改运 ' + RUN.fateLeft;

    // 步骤条：永远告诉你下一步点哪儿
    var stepDefs = ['选行当', '问卦（可选）', '定注码', '落定'];
    var stepIdx;
    if (!RUN.careerKey) stepIdx = 0;
    else if (!RUN.stakeKey) stepIdx = (RUN.cast || RUN.quota === 0) ? 2 : 1;
    else stepIdx = 3;
    $('#steps-hint').innerHTML = stepDefs.map(function (name, i) {
      var cls = i < stepIdx ? 'done' : (i === stepIdx ? 'now' : '');
      // 问卦是可选的：已经问过（或没额度了）就算跳过
      if (i === 1 && stepIdx >= 2) cls = 'done';
      return '<span class="sh ' + cls + '"><i>' + (i + 1) + '</i>' + name + '</span>';
    }).join('');

    $('#career-pick').innerHTML = EP.CAREERS.map(function (c) {
      var k = RUN.birth ? fitOf(RUN.birth.yong, c.el) : 'same';
      var fit = EP.FIT[k];
      var rev = RUN.birth && isBadFate(RUN.birth.fateKey) && c.risky;
      var waste = RUN.birth && isGoodFate(RUN.birth.fateKey) && c.risky;
      var eff = rev ? EP.REVERSAL.f : (waste ? fit.f * EP.WASTE.f : fit.f);
      return '<button class="pick' + (RUN.careerKey === c.key ? ' on' : '') + (c.risky ? ' risky' : '') + '" '
        + 'type="button" data-career="' + c.key + '">'
        + '<span class="pn">' + c.name + '</span>'
        + '<span class="pd">' + (rev ? '负负得正' : fit.label) + ' ×' + eff.toFixed(2) + '</span>'
        + '</button>';
    }).join('');

    $('#career-pick').querySelectorAll('[data-career]').forEach(function (btn) {
      btn.onclick = function () {
        RUN.careerKey = btn.dataset.career;
        renderLife();
      };
    });

    // 先用卦，再定注码：卦只说这一步该怎么走，不说结果好不好
    if (RUN.careerKey) {
      if (RUN.cast) {
        var cst = RUN.cast;
        var card = cst.hand[cst.cardIdx] || cst.hand[0];

        function xiangHtml(side, active, label, key, canPick) {
          var rel = E.relationOf(card.element, side.yong);
          var imp = imperativeOf({ hex: side.hex }, REL_TO_FATE[String(rel.score)] || '中平');
          var cr = crossRead(imp, rel);
          return '<button class="xiang' + (active ? ' on' : '') + (canPick ? '' : ' locked') + '" '
            + 'type="button" data-pick="' + key + '" ' + (canPick ? '' : 'disabled') + '>'
            + '<span class="xh">' + side.hex.glyph + '</span>'
            + '<span class="xn">' + side.hex.sub + '</span>'
            + '<span class="xl">' + label + '</span>'
            + '<span class="xj">「' + side.judgment + '」</span>'
            + '<span class="xi">用神 <b>' + side.yong + '</b>　应牌 ' + card.element
            + ' → <b>' + (REL_NAME[rel.key] || rel.label) + '</b></span>'
            + '<span class="xc ' + cr.tone + '">'
            + '<em>中</em>' + cr.cn + '　<em>西</em>' + cr.en
            + '<i>' + cr.verdict + '</i></span>'
            + '</button>';
        }

        var handHtml = cst.hand.map(function (c, i) {
          return '<button class="tcard' + (cst.cardIdx === i ? ' on' : '') + '" type="button" data-card="' + i + '">'
            + '<span class="tg">' + c.glyph + '</span>'
            + '<span class="tn">' + c.name + '</span>'
            + '<span class="te">' + c.element + (c.branch ? '·' + c.branch : '') + '</span></button>';
        }).join('');

        $('#cast-row').innerHTML = '<div class="cast-block">'
          + '<p class="pick-title">其一 · 起卦成两象</p>'
          + '<div class="xiang-wrap">'
          + xiangHtml(cst.early, cst.pick === 'early', '本卦 · 现在的局势', 'early', true)
          + xiangHtml(cst.late, cst.pick === 'late', '变卦 · 事态会变成的样子', 'late', cst.hasChanged)
          + '</div>'
          + '<p class="pick-title">其二 · 从三张塔罗里择一张为「应」</p>'
          + '<div class="tcards">' + handHtml + '</div>'
          + '<p class="sec-note" style="margin:10px 0 0">'
          + '卦给你「缺什么」，牌给你「手里是什么」——<b>生克决定这一象的强弱</b>。'
          + (cst.hasChanged
            ? '同一张牌对本卦、变卦往往一利一害：<b>自己读，自己裁决</b>。'
            : '<b>六爻皆静，无变卦</b>，数已定。')
          + '</p>'
          + '<p class="sec-note" style="margin:6px 0 0;color:var(--ink-faint)">'
          + '动爻 ' + cst.moving + ' · ' + cst.rel.label + '。卦辞只告这一步该怎么走，吉凶要落定才见。</p>'
          + '</div>'
          + (RUN.fateLeft > 0
            ? '<button class="ghost" id="btn-recast" type="button">改运重掷此卦（余 ' + RUN.fateLeft + '）</button>'
            : '');

        $('#cast-row').querySelectorAll('[data-pick]').forEach(function (btn) {
          btn.onclick = function () { RUN.cast.pick = btn.dataset.pick; renderLife(); };
        });
        $('#cast-row').querySelectorAll('[data-card]').forEach(function (btn) {
          btn.onclick = function () { RUN.cast.cardIdx = Number(btn.dataset.card); renderLife(); };
        });
      } else if (RUN.quota > 0) {
        $('#cast-row').innerHTML = '<button class="ghost" id="btn-cast" type="button">'
          + '问一卦（额度 ' + RUN.quota + '）</button>'
          + '<span class="sec-note" style="margin:0;align-self:center">卦给两象，不告吉凶</span>';
      } else {
        $('#cast-row').innerHTML = '<span class="sec-note" style="margin:0">额度已尽——这一节只能盲走。</span>';
      }

      var cb = $('#cast-row').querySelector('#btn-cast');
      if (cb) cb.onclick = function () { RUN.quota -= 1; RUN.cast = RUN.hidden; renderLife(); };
      var rb = $('#cast-row').querySelector('#btn-recast');
      if (rb) rb.onclick = function () {
        RUN.fateLeft -= 1;
        RUN.hidden = castOnce();
        RUN.cast = RUN.hidden;
        renderLife();
        toast('改了一次运');
      };

      // 注码：看到两象之后再定
      var impNow = RUN.cast ? readingOf(RUN.cast).imp : null;
      $('#stake-row').innerHTML = EP.STAKES.map(function (s) {
        var m = impNow ? EP.riskMultOf(impNow, s.key, laneFbond()).mult : 1;
        var eff = Math.min(0.85, s.risk * m);
        var tag = '';
        if (impNow && Math.abs(m - 1) > 0.01) {
          tag = '　→ 折损 ' + Math.round(eff * 100) + '%（卦' + (m < 1 ? '减' : '增') + '）';
        }
        return '<button class="pick' + (RUN.stakeKey === s.key ? ' on' : '') + '" type="button" data-stake="' + s.key + '">'
          + '<span class="pn">' + s.name + '注</span>'
          + '<span class="pd">×' + s.mult + '　折损 ' + Math.round(s.risk * 100) + '%' + tag + '</span></button>';
      }).join('');
      $('#stake-row').querySelectorAll('[data-stake]').forEach(function (btn) {
        btn.onclick = function () { RUN.stakeKey = btn.dataset.stake; renderLife(); };
      });
    } else {
      $('#cast-row').innerHTML = '';
      $('#stake-row').innerHTML = '';
    }

    var ready = RUN.careerKey && RUN.stakeKey;
    $('#btn-commit').disabled = !ready;
    $('#btn-commit').textContent = ready ? '落定这一节' : '先选行当与注码';

    var p = $('#prompt');
    if (!RUN.careerKey) {
      p.textContent = '选一个行当。注意四路：你这一世的命旺在哪一路，就该往哪一路走。';
    } else {
      var c2 = EP.BY_KEY[RUN.careerKey];
      var k2 = fitOf(RUN.birth.yong, c2.el);
      var rev2 = isBadFate(RUN.birth.fateKey) && c2.risky;
      var waste = isGoodFate(RUN.birth.fateKey) && c2.risky;
      var bestLane = EP.LANES.map(function (l) {
        return { l: l, f: EP.LANE_REL[laneRel(RUN.birth.yong, l.el)].f };
      }).sort(function (a, b) { return b.f - a.f; })[0];
      p.textContent = c2.name + ' · ' + EP.FIT[k2].label
        + (rev2 ? '　负负得正 ×' + EP.REVERSAL.f : '')
        + (waste ? '　好命入险行 ×' + EP.WASTE.f : '')
        + '　｜　此命最旺在「' + bestLane.l.name + '」（×' + bestLane.f.toFixed(2) + '）'
        + (RUN.cast
          ? '　信' + (RUN.cast.pick === 'late' ? '变卦' : '本卦')
            + (RUN.cast.hasChanged ? '（两象可选）' : '（无变卦）')
          : '　未问卦——两象都在，只是你看不见')
        + (RUN.stakeKey ? '' : '　还要选一个注码。');
    }
  }

  function commitSection() {
    var c = EP.BY_KEY[RUN.careerKey];
    var stake = EP.STAKES.filter(function (s) { return s.key === RUN.stakeKey; })[0];
    var omen = readingOf(RUN.cast || RUN.hidden);
    var seen = !!RUN.cast;

    var fateKey = omen.fateKey;
    var impKey = omen.imp;
    var misfired = false;
    if (seen) {
      var rel = EP.reliabilityOf((RUN.cast || RUN.hidden).moving);
      if (rng() > rel.rate) {
        misfired = true;
        fateKey = EP.INVERT_FATE[fateKey] || fateKey;
        impKey = EP.INVERT_IMP[impKey] || impKey;
      }
    }

    var fitKey = fitOf(RUN.birth.yong, c.el);
    var fitF = EP.FIT[fitKey].f;
    var rev = isBadFate(fateKey) && c.risky;
    var waste = isGoodFate(fateKey) && c.risky;
    if (rev) fitF = EP.REVERSAL.f;
    if (waste) fitF *= EP.WASTE.f;

    var yf = yearFOf(RUN.sectionIdx);
    var fateF = EP.FATE[fateKey].f;

    var laneF = {};
    EP.LANES.forEach(function (l) {
      laneF[l.key] = EP.LANE_REL[laneRel(RUN.birth.yong, l.el)].f;
    });

    // 卦意只改折损率，不改收益 —— 收益由命、运、行当决定
    var rm = stakeFit(impKey, RUN.stakeKey, laneF.bond);
    var effRisk = Math.min(0.85, stake.risk * rm.mult);

    var energy = EP.BASE * fitF * yf.f * fateF * stake.mult;
    var gain = { cash: 0, fame: 0, bond: 0, hurt: 0 };
    var flop = rng() < effRisk;
    var note = '';

    if (flop) {
      gain.hurt = 2;
      note = '折损了——这一节白走，还搭上一身伤。';
    } else {
      gain.cash = Math.round(energy * c.out.cash * laneF.cash * 0.6);
      gain.fame = Math.round(energy * c.out.fame * laneF.fame * 0.32);
      gain.bond = Math.round(energy * c.out.bond * laneF.bond * 0.32);
      note = '这一节走通了。';
    }

    if (misfired) {
      note = '卦不应验——你照着卦走，走的却是反方向。　' + note;
    }

    if (EP.IMPERATIVES[impKey].heavyHurt && RUN.stakeKey === 'heavy') {
      gain.hurt += EP.IMPERATIVES[impKey].heavyHurt;
      note += '　卦言宜守，你却押了重注。';
    }

    RUN.lastSection = {
      fate: fateKey, imp: impKey, misfired: misfired, seen: seen,
      risk: effRisk, flop: flop,
    };

    // 安：旺则减伤，衰则添伤
    if (laneF.safe < 0.9) { gain.hurt += 1; note += '　“安”衰，添一分伤。'; }
    else if (laneF.safe > 1.1 && gain.hurt > 0) { gain.hurt = Math.max(0, gain.hurt - 1); note += '　“安”旺，少受一分伤。'; }
    if (rev && gain.hurt > 0) { gain.hurt = Math.max(0, gain.hurt - EP.REVERSAL.hurtRelief); }

    // 事件
    var ev = null;
    if (rev && !flop) {
      ev = EP.EVENTS.filter(function (e) { return e.flip && e.career === c.key; })[0];
    } else if (rng() < 0.34) {
      ev = pick(EP.EVENTS.filter(function (e) { return !e.flip; }));
    }
    if (ev) {
      if (ev.add.cash) gain.cash += ev.add.cash;
      if (ev.add.fame) gain.fame += ev.add.fame;
      if (ev.add.bond) gain.bond += ev.add.bond;
      if (ev.add.hurt) gain.hurt += ev.add.hurt;
    }

    RUN.stats.cash += gain.cash;
    RUN.stats.fame += gain.fame;
    RUN.stats.bond += gain.bond;
    RUN.stats.hurt += gain.hurt;

    if (rev && !SAVE.ach.reversal) { SAVE.ach.reversal = true; persist(); }

    RUN.log.push({
      section: RUN.sectionIdx,
      careerName: c.name,
      fate: omen.fateKey,
      seen: seen,
      imp: omen.imp,
      misfired: misfired,
      moving: RUN.cast ? RUN.cast.moving : (RUN.hidden ? RUN.hidden.moving : 0),
      pick: RUN.cast ? RUN.cast.pick : null,
      pickLost: seen && RUN.cast && RUN.cast.hasChanged
        ? (RUN.cast.pick === 'early' ? RUN.cast.late.fateKey : RUN.cast.early.fateKey)
        : null,
      year: yearOf(RUN.sectionIdx),
      lanes: laneF,
      gain: gain,
      note: note,
      event: ev ? ev.text : null,
      flip: !!(rev && ev && ev.flip),
    });

    RUN.sectionIdx += 1;
    RUN.careerKey = null;
    RUN.cast = null;
    RUN.hidden = null;
    RUN.hiddenSection = -1;
    RUN.stakeKey = null;

    if (RUN.stats.hurt >= EP.CONFIG.deathHurt) { endLife('死亡'); return; }
    if (RUN.sectionIdx >= EP.SECTIONS.length) { endLife('收摊'); return; }
    renderLife();
    renderLog();
  }

  function laneTag(f) {
    if (f >= 1.25) return '<span class="gain">旺</span>';
    if (f >= 1.05) return '<span class="gain">平</span>';
    if (f >= 0.8) return '<span class="loss">弱</span>';
    return '<span class="loss">衰</span>';
  }

  function renderLog() {
    $('#log').innerHTML = RUN.log.map(function (l) {
      var g = [];
      if (l.gain.cash) g.push('<span class="' + (l.gain.cash > 0 ? 'gain' : 'loss') + '">财 ' + fmt(l.gain.cash) + '</span>');
      if (l.gain.fame) g.push('<span class="gain">名 ' + fmt(l.gain.fame) + '</span>');
      if (l.gain.bond) g.push('<span class="gain">缘 ' + fmt(l.gain.bond) + '</span>');
      if (l.gain.hurt) g.push('<span class="loss">伤 ' + fmt(l.gain.hurt) + '</span>');
      var lanes = EP.LANES.map(function (x) {
        return x.name + laneTag(l.lanes[x.key]);
      }).join(' ');
      var picks = '';
      if (l.seen && l.pick) {
        var pickName = l.pick === 'early' ? '本卦' : '变卦';
        var lostName = l.pick === 'early' ? '变卦' : '本卦';
        picks = '　信' + pickName;
        if (l.pickLost && l.pickLost !== l.fate) picks += '（另一象是' + lostName + '·' + l.pickLost + '）';
      }
      return '<div class="log-item' + (l.flip ? ' flip' : '') + '">'
        + '<b>' + EP.SECTIONS[l.section].age + ' 岁 · ' + l.careerName + '</b>'
        + '（岁运' + l.year + ' · ' + (l.seen ? l.fate + '·动' + l.moving : '未问·' + l.fate)
        + ' · ' + EP.IMPERATIVES[l.imp].label + (l.misfired ? '·<span class="loss">不应验</span>' : '') + picks + '）　'
        + lanes + '<br>'
        + l.note + '　' + g.join('　')
        + (l.event ? '<br>事件：' + l.event : '')
        + '</div>';
    }).join('');
  }
  function fmt(n) { return (n > 0 ? '+' : '') + n; }

  // ---------- 终局 ----------
  function endLife(reason) {
    RUN.over = true;
    var s = RUN.stats;
    var value = Math.round(s.cash + s.fame * 2 + s.bond * 2 - s.hurt * 5);
    value = Math.max(0, value);
    var ending = EP.ENDINGS.filter(function (e) {
      return e.cond({ cash: s.cash, fame: s.fame, bond: s.bond, hurt: s.hurt, value: value });
    })[0];

    var reward = Math.floor(value / EP.CONFIG.valueDivisor) + 3;
    SAVE.wealth += reward;
    SAVE.lives += 1;
    var isNew = !SAVE.endings[ending.key];
    SAVE.endings[ending.key] = (SAVE.endings[ending.key] || 0) + 1;
    persist();

    $('#end-seal').textContent = ending.name.slice(0, 1);
    $('#end-seal').classList.toggle('grey', ending.key === 'broken' || ending.key === 'nobody');
    $('#end-name').textContent = ending.name;
    $('#end-sub').textContent = (reason === '死亡' ? '伤重而亡' : '六十岁收摊')
      + '　·　第 ' + Math.min(RUN.sectionIdx, EP.SECTIONS.length) + ' 节'
      + '　·　' + (RUN.birth ? RUN.birth.built.hex.sub + '（' + RUN.birth.yong + '命·' + RUN.birth.fateKey + '）' : '');
    $('#end-text').textContent = ending.text;

    $('#end-ledger').innerHTML =
      '<div class="row"><span class="k">财</span><span class="v">银钱</span><span class="n plus">' + Math.round(s.cash) + '</span></div>'
      + '<div class="row"><span class="k">名</span><span class="v">名声（×2）</span><span class="n plus">' + Math.round(s.fame) + '</span></div>'
      + '<div class="row"><span class="k">缘</span><span class="v">人缘（×2）</span><span class="n plus">' + Math.round(s.bond) + '</span></div>'
      + '<div class="row"><span class="k">伤</span><span class="v">损耗（×5）</span><span class="n minus">−' + (s.hurt * 5) + '</span></div>'
      + '<div class="row total"><span class="k">人生价值</span><span class="v">财 + 名×2 + 缘×2 − 伤×5</span>'
      + '<span class="n">' + value + '</span></div>';

    $('#end-loot').innerHTML = '换成 <b>资财 +' + reward + '</b>，留给下一世。'
      + (isNew ? '　<em>新结局：「' + ending.name + '」</em>' : '')
      + (Object.keys(SAVE.endings).length > 1 ? '　已见结局 ' + Object.keys(SAVE.endings).length + ' 种' : '');

    renderUpgrades();
    $('#wealth').textContent = SAVE.wealth;
    show('end');
  }

  function renderUpgrades() {
    $('#upgrades').innerHTML = EP.UPGRADES.map(function (u) {
      var lv = SAVE.upg[u.key] || 0;
      var maxed = lv >= u.max;
      var cost = maxed ? null : u.costs[lv];
      var can = cost !== null && SAVE.wealth >= cost;
      var btn = maxed
        ? '<button type="button" disabled>已满</button>'
        : '<button type="button" data-up="' + u.key + '" ' + (can ? '' : 'disabled') + '>'
          + cost + ' 资财</button>';
      return '<div class="up' + (maxed ? ' maxed' : '') + '">'
        + '<div><div class="un">' + u.name + '　<span style="color:var(--gold);font-size:11px">'
        + lv + ' / ' + u.max + '</span></div>'
        + '<div class="ud">' + u.desc + '</div></div>'
        + btn + '</div>';
    }).join('');

    $('#upgrades').querySelectorAll('[data-up]').forEach(function (btn) {
      btn.onclick = function () {
        var key = btn.dataset.up;
        var u = EP.UPGRADES.filter(function (x) { return x.key === key; })[0];
        var lv = SAVE.upg[key] || 0;
        if (lv >= u.max) return;
        var cost = u.costs[lv];
        if (SAVE.wealth < cost) { toast('资财不足'); return; }
        SAVE.wealth -= cost;
        SAVE.upg[key] = lv + 1;
        persist();
        $('#wealth').textContent = SAVE.wealth;
        renderUpgrades();
        toast(u.name + ' 提升');
      };
    });
  }

  // ---------- 绑定 ----------
  document.addEventListener('DOMContentLoaded', function () {
    SAVE = load();
    $('#wealth').textContent = SAVE.wealth;

    $('#btn-birth').onclick = castBirth;
    $('#btn-begin').onclick = function () { renderLife(); renderLog(); show('life'); };
    $('#btn-commit').onclick = commitSection;
    $('#btn-next-life').onclick = function () { newLife(); };

    var dlg = $('#dlg-about');
    $('#btn-about').onclick = function () {
      if (typeof dlg.showModal === 'function') dlg.showModal();
      else dlg.setAttribute('open', '');
    };
    $('#btn-close-about').onclick = function () { dlg.close(); };
    dlg.addEventListener('click', function (ev) { if (ev.target === dlg) dlg.close(); });

    newLife();
  });
})();


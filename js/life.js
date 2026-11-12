/* 「三百六十行」· 一套循环，五份配置 */
(function () {
  'use strict';

  var E = window.Engine;
  var LIFE = window.LIFE;
  var TAROT = window.TAROT;
  var $ = function (s) { return document.querySelector(s); };
  var MAX = 6;
  var POS = ['初', '二', '三', '四', '五', '上'];
  var TRI = { 乾: '111', 兑: '110', 离: '101', 震: '100', 巽: '011', 坎: '010', 艮: '001', 坤: '000' };

  // ---------- 随机（?seed= 可复现） ----------
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
    return { peaks: {}, runs: 0, best: {}, ended: false };
  }
  function load() {
    try {
      var raw = localStorage.getItem(LIFE.SAVE_KEY);
      if (!raw) return defaultSave();
      var s = JSON.parse(raw);
      if (!s || typeof s !== 'object') return defaultSave();
      s.peaks = s.peaks || {};
      s.best = s.best || {};
      return s;
    } catch (e) { return defaultSave(); }
  }
  function persist() {
    try { localStorage.setItem(LIFE.SAVE_KEY, JSON.stringify(SAVE)); } catch (e) { /* 忽略 */ }
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
  function peakCount() {
    return Object.keys(SAVE.peaks).filter(function (k) { return SAVE.peaks[k]; }).length;
  }

  // ---------- 行当 ----------
  function renderHub() {
    $('#peak-count').textContent = peakCount() + '/' + LIFE.CAREERS.length;

    $('#careers').innerHTML = LIFE.CAREERS.map(function (c) {
      var done = !!SAVE.peaks[c.key];
      var best = SAVE.best[c.key];
      return '<button class="career' + (done ? ' is-peak' : '') + '" type="button" data-career="' + c.key + '">'
        + '<span class="career-glyph">' + c.glyph + '</span>'
        + '<span class="career-body">'
        + '  <span class="career-top"><span class="career-name">' + c.name + '</span>'
        + '    <span class="career-verb">' + c.verb + '</span>'
        + '    <span class="career-tag">' + c.tagline + '</span></span>'
        + '  <span class="career-blurb">' + c.blurb + '</span>'
        + '  <span class="career-meta">命脉 <b>' + c.res.name + '</b>　降的是 <b>' + c.dims[0].name + '</b>'
        + (best !== undefined ? '　最佳 <b>' + best + '</b>' : '')
        + '　登峰 ' + c.peak.text + '</span>'
        + '  <span class="career-go">' + (done ? '已登峰 · 再走一遍' : '走这一行 →') + '</span>'
        + '</span>'
        + '</button>';
    }).join('');

    $('#careers').querySelectorAll('[data-career]').forEach(function (btn) {
      btn.onclick = function () { startRun(btn.dataset.career); };
    });

    $('#peaks').innerHTML = LIFE.CAREERS.map(function (c) {
      var done = !!SAVE.peaks[c.key];
      return '<div class="peak' + (done ? ' done' : '') + '">'
        + '<div class="pn">' + c.name + (done ? ' · 成' : '') + '</div>'
        + '<div class="pd">' + c.peak.text + '</div></div>';
    }).join('');
  }

  // ---------- 开局 ----------
  function startRun(key) {
    var c = LIFE.BY_KEY[key];
    if (!c) return;

    var truth = {};
    c.dims.forEach(function (d) { truth[d.key] = pick(d.values); });

    RUN = {
      career: c,
      subject: pick(c.subjects),
      truth: truth,
      depth: 0,
      lines: [],
      cards: [],
      deck: E.shuffle(rng).slice(),
      intel: {},
      res: c.res.start,
      favor: 0,
      leverOn: false,
      lastToss: null,
      selected: null,
      lostAll: false,
    };

    $('#run-name').textContent = c.name + ' · ' + RUN.subject.name;
    $('#run-kind').textContent = c.tagline + ' · 虚构';
    $('#res-name').textContent = c.res.name;
    $('#prompt').className = 'prompt';
    $('#prompt').textContent = '传闻：' + RUN.subject.rumor + '　第一层不设险。';
    show('run');
    renderRun();
  }

  // ---------- 下注一局 ----------
  function riskFor(depth) {
    var c = RUN.career;
    var base = c.risk[depth] || 0.45;
    if (c.leverage && RUN.leverOn) base *= c.leverage.riskMult;
    return Math.min(0.85, base);
  }

  function paintHex() {
    var rows = [];
    for (var i = 0; i < MAX; i++) {
      var l = RUN.lines[i];
      if (!l) {
        rows.push('<div class="hline is-ghost"><span class="pos">' + POS[i] + '</span>'
          + '<span class="mark"></span><span class="bars"><span class="bar"></span></span></div>');
        continue;
      }
      var cls = 'hline' + (l.yang ? '' : ' is-yin') + (l.moving ? ' moving' : '');
      if (i === RUN.lines.length - 1) cls += ' is-new';
      var bars = '<span class="bars">'
        + (l.yang ? '<span class="bar"></span>' : '<span class="bar"></span><span class="bar"></span>')
        + '</span>';
      rows.push('<div class="' + cls + '"><span class="pos">' + POS[i] + '</span>'
        + '<span class="mark">' + (l.mark || '') + '</span>' + bars + '</div>');
    }
    $('#hexcolumn').innerHTML = rows.join('');
  }

  function paintDepth() {
    $('#depth-track').innerHTML = Array.from({ length: MAX }, function (_, i) {
      var n = i + 1;
      var cls = n <= RUN.depth ? 'on' : (n === RUN.depth + 1 ? 'now' : '');
      return '<i class="' + cls + '">' + n + '</i>';
    }).join('');
  }

  function paintIntel() {
    var c = RUN.career;
    var got = Object.keys(RUN.intel).length;
    $('#intel-count').textContent = got + ' / 4';
    $('#intel').innerHTML = c.dims.map(function (d) {
      var v = RUN.intel[d.key];
      return '<li><span class="dim">' + d.name + '</span>'
        + (v ? '<span class="val">' + v.value + '</span><span class="src">第 ' + v.at + ' 层</span>'
          : '<span class="val unknown">· · ·</span><span class="src"></span>')
        + '</li>';
    }).join('');
  }

  function paintRes() {
    var c = RUN.career;
    var max = c.res.start;
    var pct = Math.max(0, Math.min(1, RUN.res / max)) * 100;
    $('#res-val').textContent = RUN.res + ' / ' + max;
    var fill = $('#res-fill');
    fill.style.width = pct + '%';
    fill.classList.toggle('is-low', pct <= 40);
    $('#res-note').textContent = c.res.perLayer
      ? '每下一层耗 ' + c.res.perLayer + ' 点' + c.res.name + '，尽了便由不得你。'
      : c.res.name + '只在翻车时折损。';
  }

  function paintRisk() {
    var next = RUN.depth + 1;
    if (next > MAX) { $('#risk-val').textContent = '已至底'; $('#risk-fill').style.width = '100%'; return; }
    var r = riskFor(next);
    $('#risk-val').textContent = next === 1 ? '不设险' : Math.round(r * 100) + '%';
    $('#risk-fill').style.width = Math.min(100, (r / 0.6) * 100) + '%';
    var notes = {
      end: '翻车即出局，随身之物尽失。',
      half: '翻车损一半，还能继续。',
      charm: '翻车只丢脸、清好感，不掉命。',
    };
    $('#risk-note').textContent = notes[RUN.career.flop];
  }

  function paintLever() {
    var c = RUN.career;
    var box = $('#lever');
    if (!c.leverage) { box.innerHTML = ''; return; }
    box.innerHTML = '<button class="lever-btn' + (RUN.leverOn ? ' on' : '') + '" id="btn-lever" type="button">'
      + (RUN.leverOn ? '杠杆已开：收益 ×' + c.leverage.mult + '　反噬 ×' + c.leverage.riskMult + '（点此关掉）'
        : '开杠杆：收益 ×' + c.leverage.mult + '，反噬 ×' + c.leverage.riskMult)
      + '</button>';
    $('#btn-lever').onclick = function () {
      RUN.leverOn = !RUN.leverOn;
      renderRun();
      toast(RUN.leverOn ? '加了杠杆' : '杠杆已收');
    };
  }

  function renderRun() {
    paintHex(); paintDepth(); paintIntel(); paintRes(); paintRisk(); paintLever();

    var next = RUN.depth + 1;
    var btn = $('#btn-deepen');
    btn.textContent = RUN.depth === 0 ? '出手' : (next > MAX ? '六爻已成' : '再下一层');
    btn.disabled = next > MAX;
    $('#btn-stop').disabled = RUN.depth === 0;

    var carry = '';
    if (RUN.career.favor) carry += '<span class="chip-in">好感 ' + RUN.favor + '</span>';
    if (RUN.lostAll) carry += '<span class="chip-in">随身已失</span>';
    $('#carry').innerHTML = carry;
  }

  function deepen() {
    var next = RUN.depth + 1;
    if (next > MAX) return;

    // 先过反噬
    var r = riskFor(next);
    if (r > 0 && rng() < r) {
      var flop = RUN.career.flop;
      if (flop === 'end') {
        RUN.depth = next;
        RUN.lostAll = true;
        endRun('flop');
        return;
      }
      RUN.res -= 1;
      if (flop === 'charm') { RUN.favor = 0; }
      RUN.favorLost = true;
      toast(flop === 'charm'
        ? '翻车：颜面折一分，好感清零'
        : '栽了一跤：折一半随身');
      if (RUN.res <= 0) { RUN.depth = next; endRun('flop'); return; }
    }

    var toss = E.tossCoins(rng);
    RUN.lines.push(toss);
    RUN.lastToss = toss;
    RUN.cards.push(RUN.deck[RUN.cards.length] || pick(TAROT));

    // 情报
    var gain = 1 + (toss.moving ? 1 : 0);
    var unknown = RUN.career.dims.filter(function (d) {
      return !RUN.intel[d.key] && next >= d.minDepth;
    });
    for (var i = 0; i < gain && i < unknown.length; i++) {
      RUN.intel[unknown[i].key] = { value: RUN.truth[unknown[i].key], at: next };
    }

    // 好感
    if (RUN.career.favor) RUN.favor += RUN.career.favor.perLayer;

    // 命脉消耗
    if (RUN.career.res.perLayer) {
      RUN.res -= RUN.career.res.perLayer;
    }

    RUN.depth = next;

    if (RUN.res <= 0) {
      RUN.depth = next;
      endRun('exhausted');
      return;
    }

    if (next >= MAX) {
      renderRun();
      setTimeout(goResolve, 400);
      return;
    }

    $('#prompt').textContent = '第 ' + next + ' 层已过。' + (gain > 0 ? '读到情报。' : '')
      + '　再下一层反噬 ' + Math.round(riskFor(next + 1) * 100) + '%。';
    renderRun();
  }

  // ---------- 成卦受判 ----------
  function goResolve() {
    var built = E.buildHexagram(RUN.lines);
    RUN.built = built;
    var yong = E.TRIGRAMS[TRI[built.hex.lower]].element;
    RUN.rule = E.makeRule(built, RUN.cards, '木');
    RUN.rule.legal = RUN.cards.map(function (_, i) { return i; });

    $('#res-glyph').textContent = built.hex.glyph;
    $('#res-name').textContent = built.hex.sub;
    $('#res-sub').textContent = '上' + built.hex.upper + ' · 下' + built.hex.lower
      + (built.movingCount ? '　动爻 ' + built.movingCount : '　六爻皆静') + '　用神 ' + yong;
    $('#res-meaning').textContent = built.hex.judgment + '　' + built.hex.meaning;

    $('#res-cards').innerHTML = RUN.cards.map(function (c, i) {
      return '<button class="card" type="button" data-card="' + i + '">'
        + '<span class="dp">' + POS[i] + ' 层</span>'
        + '<span class="glyph">' + c.glyph + '</span>'
        + '<span class="nm">' + c.name + '</span>'
        + '<span class="el">' + c.element + '</span></button>';
    }).join('');

    $('#res-cards').querySelectorAll('[data-card]').forEach(function (btn) {
      btn.onclick = function () {
        RUN.selected = Number(btn.dataset.card);
        $('#res-cards').querySelectorAll('.card').forEach(function (el) {
          el.classList.toggle('on', Number(el.dataset.card) === RUN.selected);
        });
        $('#btn-judge').disabled = false;
        var c = RUN.cards[RUN.selected];
        $('#res-prompt').textContent = '你取「' + POS[RUN.selected] + '」层之《' + c.name + '》（' + c.element + '）为应。';
      };
    });

    $('#btn-judge').disabled = true;
    $('#res-prompt').className = 'prompt';
    $('#res-prompt').textContent = '用神取内卦五行。判吉则兑现更高，判凶则大打折扣。';
    show('resolve');
  }

  function judge() {
    if (RUN.selected === null) return;
    var res = E.judge({
      built: RUN.built, rule: RUN.rule, hand: RUN.cards,
      index: RUN.selected, domainElement: '木',
    });
    RUN.result = res;
    endRun('verdict', res.level);
  }

  // ---------- 兑现 ----------
  function valueOf(depth, completeness, factor) {
    var c = RUN.career;
    var v = c.base * (0.4 + 0.6 * completeness) * (1 + 0.35 * (depth - 1)) * factor;
    if (c.leverage && RUN.leverOn) v *= c.leverage.mult;
    if (c.favor) v *= (1 + c.favor.mult * RUN.favor);

    var badKey = c.fakeDim || c.wrongDim;
    if (badKey) {
      var badVal = c.fakeDim ? '赝' : '偏';
      if (RUN.truth[badKey] === badVal) v *= (c.fakePenalty || c.wrongPenalty);
    }
    return Math.round(v);
  }

  function endRun(kind, level) {
    var c = RUN.career;
    var completeness = Object.keys(RUN.intel).length / 4;
    var factor = level ? LIFE.VERDICT_FACTOR[level.name] : LIFE.UNVERIFIED;
    var cash = kind === 'flop' ? 0 : valueOf(RUN.depth, completeness, factor);
    if (kind === 'exhausted') cash = Math.round(cash / 2);

    // 登峰判定
    var done = false;
    var cond = c.peak.cond;
    if (cond === 'cash') done = cash >= c.peak.value;
    else if (cond === 'depth') done = RUN.depth >= c.peak.value && kind !== 'flop';
    else if (cond === 'favor') done = RUN.favor >= c.peak.value;

    if (done && !SAVE.peaks[c.key]) {
      SAVE.peaks[c.key] = true;
    }
    SAVE.runs += 1;
    SAVE.best[c.key] = Math.max(SAVE.best[c.key] || 0, cash);
    persist();

    renderSettle(kind, level, { cash: cash, completeness: completeness, factor: factor, done: done });
    show('settle');
  }

  function renderSettle(kind, level, m) {
    var c = RUN.career;
    var seal = $('#seal');
    seal.classList.remove('grey');

    var title, sub, advice;
    if (kind === 'flop') {
      seal.classList.add('grey');
      seal.textContent = '败';
      title = '栽了 · ' + c.name;
      sub = RUN.subject.name + ' · 第 ' + RUN.depth + ' 层';
      advice = c.lose;
    } else if (kind === 'exhausted') {
      seal.classList.add('grey');
      seal.textContent = '尽';
      title = c.res.name + '尽了';
      sub = RUN.subject.name + ' · 第 ' + RUN.depth + ' 层 · 只得一半';
      advice = '不是你选的收手，是' + c.res.name + '先到了头。';
    } else if (kind === 'stop') {
      seal.textContent = '收';
      title = '收手';
      sub = RUN.subject.name + ' · 第 ' + RUN.depth + ' 层 · 读到 ' + Object.keys(RUN.intel).length + ' 维';
      advice = '卦未成，所得只兑九成。你收手的地方，就是这一行的分量。';
    } else {
      seal.textContent = level.seal;
      if (level.name === '下' || level.name === '下下') seal.classList.add('grey');
      title = '成卦受判 · ' + level.name;
      sub = RUN.built.hex.sub + '　应《' + RUN.result.card.name + '》　' + RUN.result.relation.label;
      advice = level.line;
    }

    $('#settle-title').textContent = title;
    $('#settle-sub').textContent = sub;
    $('#settle-advice').textContent = advice;

    // 一句“本可如何”
    var badKey = c.fakeDim || c.wrongDim;
    var bad = badKey && RUN.truth[badKey] === (c.fakeDim ? '赝' : '偏');
    var loot = kind === 'flop' ? '随身之物尽失。' : '到手 <b>' + m.cash + '</b> 现银。';
    if (bad) {
      loot += c.fakeDim
        ? '　<em>这是赝品</em>——成交只值一成。若早读到「真伪」，本该在第几层就收手。'
        : '　<em>方向是偏的</em>——成果只值三成半。若早读到「方向」，本该及时换题。';
    }
    $('#settle-loot').innerHTML = loot;

    var rows = '';
    rows += '<div class="row"><span class="k">行当</span><span class="v">' + c.name + '（' + c.verb + '）</span><span class="n"></span></div>';
    rows += '<div class="row"><span class="k">深度</span><span class="v">第 ' + RUN.depth + ' 层 · 情报 '
      + Math.round(m.completeness * 100) + '%</span><span class="n"></span></div>';
    if (c.favor) rows += '<div class="row"><span class="k">好感</span><span class="v">' + RUN.favor + '（×' + (1 + c.favor.mult * RUN.favor).toFixed(1) + '）</span><span class="n"></span></div>';
    if (c.leverage && RUN.leverOn) rows += '<div class="row"><span class="k">杠杆</span><span class="v">收益 ×' + c.leverage.mult + '，反噬 ×' + c.leverage.riskMult + '</span><span class="n"></span></div>';
    rows += '<div class="row"><span class="k">卦判</span><span class="v">'
      + (kind === 'verdict' ? level.name + '　×' + m.factor : (kind === 'stop' ? '未成卦 · ×' + LIFE.UNVERIFIED : '无'))
      + '</span><span class="n">' + (kind === 'flop' ? '0' : '+' + m.cash) + '</span></div>';
    rows += '<div class="row total"><span class="k">登峰</span><span class="v">'
      + c.peak.text + '</span><span class="n ' + (m.done ? 'plus' : '') + '">'
      + (m.done ? '达成' : '未达') + '</span></div>';
    $('#ledger').innerHTML = rows;

    var banner = $('#peak-banner');
    if (m.done) {
      banner.innerHTML = '<b>登峰</b>　' + c.win + '　（' + peakCount() + ' / ' + LIFE.CAREERS.length + '）';
    } else {
      banner.innerHTML = '';
    }
    RUN.pendingEnding = false;
    if (peakCount() >= LIFE.PEAKS_TO_WIN && !SAVE.ended) {
      SAVE.ended = true;
      persist();
      RUN.pendingEnding = true;
      $('#btn-back').textContent = '走到最后';
    } else {
      $('#btn-back').textContent = '回街上';
    }
  }

  // ---------- 结局 ----------
  function showEnding() {
    var names = LIFE.CAREERS.filter(function (c) { return SAVE.peaks[c.key]; })
      .map(function (c) { return c.name; }).join('、');
    $('#ending-text').textContent = '这一世，你走通了 ' + names
      + '。签匣里的东西，早就不必再算了——该看的你都看过，该栽的你也栽过。';
    show('ending');
  }

  // ---------- 绑定 ----------
  document.addEventListener('DOMContentLoaded', function () {
    SAVE = load();
    renderHub();

    $('#btn-deepen').onclick = deepen;
    $('#btn-stop').onclick = function () {
      if (RUN && RUN.depth > 0) endRun('stop');
    };
    $('#btn-judge').onclick = judge;
    $('#btn-back').onclick = function () {
      if (RUN && RUN.pendingEnding) { showEnding(); return; }
      renderHub();
      show('hub');
    };
    $('#btn-ending-back').onclick = function () { renderHub(); show('hub'); };

    var dlg = $('#dlg-about');
    $('#btn-about').onclick = function () {
      if (typeof dlg.showModal === 'function') dlg.showModal();
      else dlg.setAttribute('open', '');
    };
    $('#btn-close-about').onclick = function () { dlg.close(); };
    dlg.addEventListener('click', function (ev) { if (ev.target === dlg) dlg.close(); });
  });
})();

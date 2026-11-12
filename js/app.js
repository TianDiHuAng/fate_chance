/* 《问一卦，抽一张》界面与流程
 * 五段：起念 → 起卦 → 卦规 → 定应 → 判词
 */
(function () {
  'use strict';

  var E = window.Engine;
  var HEX = window.HEXAGRAM_BY_CODE;
  var DOMAINS = window.DOMAINS;
  var POS_LABELS = ['天 · 时机', '地 · 处境', '人 · 可为'];
  var POS_SHORT = ['天', '地', '人'];
  var YAO_NAME = ['初', '二', '三', '四', '五', '上'];

  var $ = function (s) { return document.querySelector(s); };

  // ---------- 状态 ----------
  var S = {
    phase: 'intent',
    domain: null,
    question: '',
    lines: [],
    deck: [],
    hand: [],
    revealed: [false, false, false],
    built: null,
    rule: null,
    selected: null,
    analysis: null,
    grants: { redraw: 0, swap: 0 },
    mode: null,
    swapPick: null,
    busy: false,
    result: null,
  };

  // 真随机：优先 crypto；调试时可用 ?seed=123 复现同一局
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

  // ---------- 提示 ----------
  var toastTimer = null;
  function toast(msg) {
    var el = $('#toast');
    el.textContent = msg;
    el.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('is-on'); }, 2000);
  }

  // ---------- 进度 ----------
  var STEPS = [
    { key: 'intent', label: '念' },
    { key: 'cast', label: '卦' },
    { key: 'rule', label: '规' },
    { key: 'table', label: '应' },
    { key: 'verdict', label: '判' },
  ];

  function renderSteps() {
    var idx = STEPS.findIndex(function (s) { return s.key === S.phase; });
    $('#steps').innerHTML = STEPS.map(function (s, i) {
      var cls = i < idx ? 'is-done' : i === idx ? 'is-now' : '';
      return '<span class="step ' + cls + '">' + s.label + '</span>';
    }).join('');
  }

  function goto(phase) {
    S.phase = phase;
    document.querySelectorAll('.screen').forEach(function (el) {
      el.classList.toggle('is-active', el.dataset.screen === phase);
    });
    renderSteps();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ---------- 一 · 起念 ----------
  function renderDomains() {
    var box = $('#domains');
    box.innerHTML = DOMAINS.map(function (d, i) {
      return '<button type="button" class="chip" role="radio" aria-checked="false" data-i="' + i + '">'
        + d.name + '<span class="chip-el">' + d.element + '</span></button>';
    }).join('');

    box.addEventListener('click', function (ev) {
      var btn = ev.target.closest('.chip');
      if (!btn) return;
      var i = Number(btn.dataset.i);
      S.domain = DOMAINS[i];
      box.querySelectorAll('.chip').forEach(function (b) {
        b.setAttribute('aria-checked', String(b === btn));
      });
      $('#domain-hint').textContent = S.domain.name + '之问，属「' + S.domain.element + '」——' + S.domain.hint + '。';
      $('#btn-start').disabled = false;
    });
  }

  function startRound() {
    if (!S.domain) { toast('先选一个方向'); return; }
    S.question = ($('#question').value || '').trim();
    S.lines = [];
    S.hand = [];
    S.revealed = [false, false, false];
    S.built = null;
    S.rule = null;
    S.selected = null;
    S.analysis = null;
    S.grants = { redraw: 0, swap: 0 };
    S.mode = null;
    S.swapPick = null;
    S.result = null;
    S.deck = E.shuffle(rng);

    // 重置起卦界面
    paintHexColumn();
    $('#cast-meta').textContent = '六爻自成下而上。初爻在下。';
    $('#toss-read').textContent = '三枚铜钱：背为阳，字为阴。';
    $('#btn-read').classList.add('is-hidden');
    var toss = $('#btn-toss');
    toss.classList.remove('is-hidden');
    toss.disabled = false;
    toss.textContent = '掷第一次';
    document.querySelectorAll('.coin').forEach(function (c) {
      c.querySelector('.coin-face').textContent = '背';
    });

    goto('cast');
  }

  // ---------- 二 · 起卦 ----------
  function yaoName(i, yang) {
    var num = yang ? '九' : '六';
    if (i === 0) return '初' + num;
    if (i === 5) return '上' + num;
    return num + YAO_NAME[i];
  }

  function paintHexColumn() {
    var box = $('#hexcolumn');
    var rows = [];
    for (var i = 0; i < 6; i++) {
      var l = S.lines[i];
      if (!l) {
        rows.push('<div class="hline is-ghost">'
          + '<span class="pos">' + YAO_NAME[i] + '</span>'
          + '<span class="mark"></span>'
          + '<span class="bars"><span class="bar"></span></span>'
          + '</div>');
        continue;
      }
      var cls = 'hline' + (l.yang ? '' : ' is-yin') + (l.moving ? ' moving' : '');
      var bars = '<span class="bars">'
        + (l.yang ? '<span class="bar"></span>' : '<span class="bar"></span><span class="bar"></span>')
        + '</span>';
      rows.push('<div class="' + cls + '">'
        + '<span class="pos">' + yaoName(i, l.yang) + '</span>'
        + '<span class="mark">' + (l.mark || '') + '</span>'
        + bars
        + '</div>');
    }
    box.innerHTML = rows.join('');
  }

  function toss() {
    if (S.busy || S.lines.length >= 6) return;
    S.busy = true;
    var tossBtn = $('#btn-toss');
    tossBtn.disabled = true;

    var coins = document.querySelectorAll('.coin');
    coins.forEach(function (c) { c.classList.remove('tossing'); void c.offsetWidth; c.classList.add('tossing'); });

    setTimeout(function () {
      var res = E.tossCoins(rng);
      // 面：3=背(阳) 2=字(阴)
      coins.forEach(function (c, i) {
        c.querySelector('.coin-face').textContent = res.coins[i] === 3 ? '背' : '字';
        c.classList.add(res.coins[i] === 3 ? 'is-yang' : 'is-yin');
        c.classList.remove(res.coins[i] === 3 ? 'is-yin' : 'is-yang');
      });

      S.lines.push(res);
      paintHexColumn();

      var movingTxt = res.moving ? ' · <span class="moving">（动爻）</span>' : '';
      $('#toss-read').innerHTML = '第' + ['一', '二', '三', '四', '五', '六'][S.lines.length - 1]
        + '掷：' + res.coins.map(function (v) { return v === 3 ? '背' : '字'; }).join(' ')
        + ' → 和 ' + res.sum + ' 为 <span class="' + (res.yang ? 'yang' : '') + '">' + res.name + '</span>' + movingTxt;

      S.busy = false;

      if (S.lines.length >= 6) {
        var built = E.buildHexagram(S.lines);
        $('#cast-meta').textContent = built.hex.sub
          + '　' + (built.movingCount ? '动爻 ' + built.movingCount + ' · 之卦 ' + built.changed.sub : '六爻皆静');
        tossBtn.classList.add('is-hidden');
        var read = $('#btn-read');
        read.classList.remove('is-hidden');
        read.textContent = '读此卦 · ' + built.hex.sub;
      } else {
        tossBtn.disabled = false;
        tossBtn.textContent = '掷第' + ['二', '三', '四', '五', '六'][S.lines.length - 1] + '次';
      }
    }, 640);
  }

  function readHex() {
    S.built = E.buildHexagram(S.lines);
    // 手牌此刻抽出，但在定应屏才逐张翻开
    S.hand = S.deck.slice(0, 3);
    S.rule = E.makeRule(S.built, S.hand, S.domain.element);
    S.grants = { redraw: S.rule.grants.redraw, swap: S.rule.grants.swap };
    S.revealed = [false, false, false];
    S.selected = null;
    renderRule();
    goto('rule');
  }

  // ---------- 三 · 卦规 ----------
  function renderRule() {
    var b = S.built;
    var h = b.hex;
    $('#rule-glyph').textContent = h.glyph;
    $('#rule-name').textContent = h.sub + '（' + h.name + '）';
    $('#rule-sub').textContent = '上' + h.upper + ' · 下' + h.lower
      + (b.movingCount ? '　动爻 ' + b.movingCount + ' · 之卦 ' + b.changed.sub : '　六爻皆静');
    $('#rule-judgment').textContent = h.judgment;
    $('#rule-meaning').textContent = h.meaning;

    var r = S.rule;
    var rows = [];

    rows.push({
      dt: '内卦',
      dd: '<b>' + r.inner.name + ' · ' + r.inner.element + '</b>（下卦，为你所有）<br>'
        + r.inner.rule.text,
    });

    rows.push({
      dt: '外卦',
      dd: '<b>' + r.outer.name + ' · ' + r.outer.element + '</b>（上卦，为势所加）<br>'
        + '<span class="tag">' + r.outer.rule.title + '</span>' + r.outer.rule.text,
    });

    rows.push({
      dt: '动爻',
      dd: '<b>' + r.moving.title + '</b><br>' + r.moving.text,
    });

    if (r.notes.length) {
      rows.push({ dt: '碍', dd: r.notes.join('<br>') });
    }

    $('#rule-list').innerHTML = rows.map(function (row) {
      return '<div><dt>' + row.dt + '</dt><dd>' + row.dd + '</dd></div>';
    }).join('');

    var ys = r.yongshen;
    $('#rule-yongshen').textContent = '此卦用神：' + ys + '（内卦五行）· 所问属' + S.domain.element
      + '　·　你只能取合卦规的那一张。';
  }

  // ---------- 四 · 定应 ----------
  function renderTable() {
    var box = $('#cards');
    box.innerHTML = S.hand.map(function (c, i) {
      var pos = POS_SHORT[i];
      return '<button type="button" class="card' + (S.revealed[i] ? ' is-flipped' : '') + '" data-i="' + i + '" aria-label="' + POS_LABELS[i] + '">'
        + '<span class="state-mark"></span>'
        + '<span class="card-inner">'
        + '  <span class="card-face card-back"><span class="back-sigil">✶</span><span class="back-label">' + pos + '</span></span>'
        + '  <span class="card-face card-front">'
        + '    <span class="pos-label">' + POS_LABELS[i] + '</span>'
        + '    <span class="card-num">' + c.num + '</span>'
        + '    <span class="glyph">' + c.glyph + '</span>'
        + '    <span class="card-name">' + c.name + '</span>'
        + '    <span class="el-badge">' + c.element + (c.branch ? ' · ' + c.branch : '') + '</span>'
        + '  </span>'
        + '</span>'
        + '</button>';
    }).join('');

    var r = S.rule;
    var grade = ['绝', '紧', '中', '松'][Math.min(r.legal.length, 3)];
    $('#mini-hex').textContent = S.built.hex.glyph + ' ' + S.built.hex.name
      + '（用神 ' + r.yongshen + '）';
    $('#mini-rule').textContent = '此卦之限 · ' + grade + '　可取 '
      + (r.legal.length ? r.legal.map(function (i) { return '「' + POS_SHORT[i] + '」'; }).join('') : '无');

    renderOps();
    updateCardStates();
    updatePrompt();
  }

  function limitText(legal) {
    if (legal.length === 3) return '三才皆可取';
    return '可取 ' + legal.map(function (i) { return '「' + POS_SHORT[i] + '」'; }).join(' ');
  }

  function renderOps() {
    var box = $('#ops');
    var html = '';
    if (S.grants.swap > 0) {
      html += '<button type="button" class="ghost" id="btn-swap">'
        + (S.mode === 'swap' ? '取消交换' : '交换两牌（' + S.grants.swap + '）') + '</button>';
    }
    if (S.grants.redraw > 0) {
      html += '<button type="button" class="ghost" id="btn-redraw">'
        + (S.mode === 'redraw' ? '取消重抽' : '重抽一张（' + S.grants.redraw + '）') + '</button>';
    }
    box.innerHTML = html;

    var swapBtn = box.querySelector('#btn-swap');
    if (swapBtn) {
      swapBtn.onclick = function () {
        S.mode = S.mode === 'swap' ? null : 'swap';
        S.swapPick = null;
        S.selected = null;
        $('#btn-settle').disabled = true;
        renderTable();
      };
    }

    var redrawBtn = box.querySelector('#btn-redraw');
    if (redrawBtn) {
      redrawBtn.onclick = function () {
        S.mode = S.mode === 'redraw' ? null : 'redraw';
        S.swapPick = null;
        S.selected = null;
        $('#btn-settle').disabled = true;
        renderTable();
      };
    }
  }

  function updateCardStates() {
    var legal = S.rule.legal;
    document.querySelectorAll('.card').forEach(function (el) {
      var i = Number(el.dataset.i);
      el.classList.remove('state-legal', 'state-illegal', 'state-selected', 'state-overrule');
      if (!S.revealed[i]) return;
      if (S.selected === i) {
        el.classList.add('state-selected');
        if (legal.indexOf(i) < 0) el.classList.add('state-overrule');
        return;
      }
      if (legal.indexOf(i) >= 0) el.classList.add('state-legal');
      else el.classList.add('state-overrule');
    });
  }

  function updatePrompt() {
    var p = $('#prompt');
    p.classList.remove('is-warn');
    var r = S.rule;
    var allOpen = S.revealed.every(Boolean);

    if (S.mode === 'swap') {
      p.textContent = '交换模式：点两张牌，互换其位。换位会改变卦规是否许可——这一步常常是关键。';
      return;
    }
    if (S.mode === 'redraw') {
      p.textContent = '重抽模式：点一张牌，把它换掉。新牌落在原位。';
      return;
    }
    if (!allOpen) {
      var n = S.revealed.filter(Boolean).length;
      p.textContent = n === 0
        ? '逐张翻开三张牌。它们分别落在天（时机）、地（处境）、人（可为）之位。'
        : '已翻开 ' + n + ' 张。继续翻开剩下的。';
      return;
    }
    if (S.selected === null) {
      if (r.violated) {
        p.classList.add('is-warn');
        p.textContent = '此卦不许，手中无一可应——你只能越规取牌（判定扣二分）。'
          + r.inner.rule.text + '　三张皆可点，代价自付。';
        return;
      }
      var gate = r.legal.length === 1 ? '此卦之限极紧，只此一路。'
        : '依卦规「' + r.inner.name + '」：' + r.inner.rule.text;
      p.textContent = gate + '　高亮者可取；不亮者亦可越规取之，判定扣二分。';
      return;
    }
    var card = S.hand[S.selected];
    var over = r.legal.indexOf(S.selected) < 0;
    p.textContent = over
      ? '你越规取「' + POS_SHORT[S.selected] + '」位之「' + card.name + '」（' + card.element + '）作为应——扣二分。可以落定了。'
      : '你取「' + POS_SHORT[S.selected] + '」位之「' + card.name + '」（' + card.element + '）作为应。可以落定了。';
  }

  function onCardClick(i) {
    if (S.mode === 'swap') {
      if (!S.revealed[i]) { nudge(i); toast('未翻开的牌不能交换'); return; }
      if (S.swapPick === null) { S.swapPick = i; toast('再点一张，与之互换'); return; }
      if (S.swapPick === i) { S.swapPick = null; return; }
      var a = S.swapPick, b = i;
      var t = S.hand[a]; S.hand[a] = S.hand[b]; S.hand[b] = t;
      var tr = S.revealed[a]; S.revealed[a] = S.revealed[b]; S.revealed[b] = tr;
      S.grants.swap -= 1;
      S.mode = null; S.swapPick = null;
      recomputeRule();
      renderTable();
      toast('已换位：' + POS_SHORT[a] + ' ⇄ ' + POS_SHORT[b]);
      return;
    }

    if (S.mode === 'redraw') {
      if (S.grants.redraw <= 0) return;
      var used = new Set(S.hand.filter(function (c, k) { return k !== i; }).map(function (c) { return c.id; }));
      var next = null;
      for (var k = 0; k < S.deck.length; k++) {
        if (!used.has(S.deck[k].id) && S.deck[k].id !== S.hand[i].id) { next = S.deck[k]; break; }
      }
      if (!next) { toast('牌堆已尽'); S.mode = null; renderTable(); return; }
      S.hand[i] = next;
      S.revealed[i] = true;
      S.grants.redraw -= 1;
      S.mode = null;
      S.selected = null;
      recomputeRule();
      renderTable();
      toast('已重抽「' + POS_SHORT[i] + '」位，得「' + next.name + '」');
      return;
    }

    if (!S.revealed[i]) {
      S.revealed[i] = true;
      renderTable();
      return;
    }

    // 卦所不许的位置也能取——那叫越规，判定折二分。选择权永远在你手上。
    S.selected = i;
    updateCardStates();
    updatePrompt();
    $('#btn-settle').disabled = false;
    if (S.rule.legal.indexOf(i) < 0) toast('越规取牌：此位卦所不许，判定扣二分');
  }

  function nudge(i) {
    var el = document.querySelector('.card[data-i="' + i + '"]');
    if (!el) return;
    el.classList.remove('state-hint');
    void el.offsetWidth;
    el.classList.add('state-hint');
  }

  function recomputeRule() {
    S.rule = E.makeRule(S.built, S.hand, S.domain.element);
    // 交换/重抽不返还外卦与动爻授予的次数（已用掉的不退回）
    if (S.selected !== null && S.rule.legal.indexOf(S.selected) < 0) S.selected = null;
    $('#btn-settle').disabled = S.selected === null;
  }

  // ---------- 五 · 判词 ----------
  function settle() {
    if (S.selected === null) return;
    var res = E.judge({
      built: S.built,
      rule: S.rule,
      hand: S.hand,
      index: S.selected,
      domainElement: S.domain.element,
    });
    S.result = res;
    S.analysis = E.analyze({
      built: S.built,
      rule: S.rule,
      hand: S.hand,
      domainElement: S.domain.element,
    });
    renderVerdict();
    goto('verdict');
    try { drawSignCard(); } catch (err) { console.error('签卡绘制失败', err); }
  }

  function renderVerdict() {
    var r = S.result;
    var seal = $('#seal');
    seal.textContent = r.level.seal;
    seal.classList.remove('is-lucky', 'is-neutral');
    seal.classList.add(r.score >= 1 ? 'is-lucky' : 'is-neutral');
    // 重新触发盖章动画
    seal.style.animation = 'none';
    void seal.offsetWidth;
    seal.style.animation = '';

    $('#level-name').textContent = r.level.name;
    $('#level-sub').textContent = S.built.hex.sub + '　应「' + r.card.name + '」　'
      + r.relation.label + '　得分 ' + r.score
      + (S.built.movingCount ? '　之卦 ' + S.built.changed.sub : '　六爻皆静');

    var rows = '<div class="chain-row"><span class="lbl">用神</span>'
      + '<span class="val">内卦「' + S.built.hex.lower + '」属 <b>' + r.yongshen + '</b>；所问属 '
      + S.domain.element + '，此局以' + r.yongshen + '为主。</span>'
      + '<span class="num"></span></div>';

    r.steps.forEach(function (s) {
      rows += '<div class="chain-row"><span class="lbl">' + s.label + '</span>'
        + '<span class="val">' + s.detail + '</span>'
        + '<span class="num ' + (s.delta >= 0 ? 'plus' : 'minus') + '">'
        + (s.delta >= 0 ? '+' : '') + s.delta + '</span></div>';
    });

    rows += '<div class="chain-row total"><span class="lbl">合</span>'
      + '<span class="val">' + r.level.name + '　' + r.level.seal + '</span>'
      + '<span class="num">' + r.score + '</span></div>';

    $('#chain').innerHTML = rows;

    $('#advice-main').textContent = r.advice;
    $('#advice-sub').textContent = r.elementHint;

    $('#answer').innerHTML = '<span class="kw">' + r.card.keyword + '</span>'
      + '应落「' + POS_SHORT[r.index] + '」位，得《' + r.card.name + '》（' + r.card.en + '）：'
      + r.card.meaning;

    if (S.built.movingCount && S.built.changed) {
      $('#changed').innerHTML = '<b>走向</b>　此卦将变为《' + S.built.changed.sub + '》：'
        + S.built.changed.meaning;
    } else {
      $('#changed').textContent = '';
    }

    var posText = S.hand.map(function (c, i) {
      return POS_SHORT[i] + '「' + c.name + '」' + c.element + (c.branch ? '·' + c.branch : '');
    }).join('　');
    $('#card-caption').textContent = '三才：' + posText
      + (S.built.movingCount ? '　·　动爻 ' + S.built.movingCount + '，卦变为《' + S.built.changed.sub + '》' : '');

    renderReview();
  }

  function sgn(n) { return (n >= 0 ? '+' : '') + n; }

  function optDesc(o) {
    var c = S.hand[o.index];
    return '「' + POS_SHORT[o.index] + '」位「' + c.name + '」' + c.element
      + '（' + o.result.relation.short + ' ' + sgn(o.result.score) + '）';
  }

  /** 复盘：把「本可以更好」摆到桌面上，玩家才学得会生克 */
  function renderReview() {
    var a = S.analysis;
    var r = S.result;
    var el = $('#review');
    if (!a) { el.innerHTML = ''; return; }

    var over = S.rule.legal.indexOf(r.index) < 0;
    var ys = S.rule.yongshen;
    var giver = Object.keys(E.SHENG).filter(function (k) { return E.SHENG[k] === ys; })[0];
    var html = '<span class="rv-title">复盘</span>';

    if (a.hasLegal && !over && r.score >= a.bestLegal.result.score) {
      html += '<p class="rv-good">你取到了守规最优（' + sgn(r.score) + '）。此局没有更好的走法。</p>';
    } else if (a.hasLegal) {
      var best = a.bestLegal;
      var gap = best.result.score - r.score;
      html += '<p>守规最优是 ' + optDesc(best) + '；你取 '
        + optDesc({ index: r.index, result: r }) + '，差 <b>' + gap + '</b> 分。</p>';
      html += '<p>此卦用神为 <b>' + ys + '</b>——最贵的是「' + giver + '」（生用神）与「' + ys
        + '」（比和）；「' + ys + '」所生之「' + E.SHENG[ys] + '」会泄你的气。</p>';
    } else {
      html += '<p class="rv-bad">此卦不许，手中无一可应——本局没有守规最优，只能越规。</p>';
      html += '<p>越规之中最优是 ' + optDesc(a.bestOverall) + '。</p>';
    }

    if (over) {
      if (a.hasLegal) {
        var bl = a.bestLegal.result.score;
        html += '<p>你越规取了这一张（已折二分）。' + (r.score > bl
          ? '<span class="rv-good">破得值得：' + sgn(r.score) + ' 高于守规最优 ' + sgn(bl) + '。</span>'
          : '<span class="rv-bad">这一戒白破了：守规最优 ' + sgn(bl) + '，此取 ' + sgn(r.score) + '。</span>')
          + '</p>';
      } else {
        html += '<p>你越规取了这一张，此局本无守规之路，破戒是唯一走法。</p>';
      }
    }

    el.innerHTML = html;
  }

  // ---------- 签卡（canvas） ----------
  function drawSignCard() {
    var cv = $('#signcard');
    var ctx = cv.getContext('2d');
    var W = cv.width, H = cv.height;
    var r = S.result;
    var hex = S.built.hex;
    var card = r.card;

    // 底色
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#f4ecda');
    g.addColorStop(.55, '#efe5d2');
    g.addColorStop(1, '#e7d9bd');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // 纸纹
    ctx.save();
    ctx.globalAlpha = .05;
    ctx.strokeStyle = '#6b5a42';
    for (var i = 0; i < 220; i++) {
      var x = Math.random() * W, y = Math.random() * H;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.random() * 30 - 15, y + Math.random() * 3 - 1.5);
      ctx.stroke();
    }
    ctx.restore();

    // 边框
    ctx.strokeStyle = 'rgba(178,141,51,.55)';
    ctx.lineWidth = 2;
    ctx.strokeRect(26, 26, W - 52, H - 52);
    ctx.strokeStyle = 'rgba(178,141,51,.28)';
    ctx.lineWidth = 1;
    ctx.strokeRect(34, 34, W - 68, H - 68);

    var serif = '"Noto Serif SC","Source Han Serif SC","Songti SC","STSong","SimSun",serif';
    function font(size, weight) { return (weight || 400) + ' ' + size + 'px ' + serif; }
    function center(text, y, size, weight, color, spacing) {
      ctx.font = font(size, weight);
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      if (!spacing) { ctx.fillText(text, W / 2, y); return; }
      // 手动字距
      var chars = text.split('');
      var widths = chars.map(function (ch) { return ctx.measureText(ch).width + spacing; });
      var total = widths.reduce(function (a, b) { return a + b; }, 0) - spacing;
      var x = (W - total) / 2;
      ctx.textAlign = 'left';
      chars.forEach(function (ch, i) {
        ctx.fillText(ch, x, y);
        x += widths[i];
      });
    }
    function wrap(text, x, y, maxW, size, color, lh) {
      ctx.font = font(size);
      ctx.fillStyle = color;
      ctx.textAlign = 'left';
      var line = '', out = y;
      for (var i = 0; i < text.length; i++) {
        var test = line + text[i];
        if (ctx.measureText(test).width > maxW && line) {
          ctx.fillText(line, x, out);
          out += lh;
          line = text[i];
        } else line = test;
      }
      if (line) ctx.fillText(line, x, out);
      return out + lh;
    }

    // 抬头
    center('问一卦 · 抽一张', 96, 34, 600, '#1a1613', 4);
    center('ASK A HEXAGRAM, DRAW ONE', 124, 12, 400, '#8a7a68', 3);

    // 所问
    var qline = S.domain.name + '之问' + (S.question ? '：' + S.question : '');
    ctx.font = font(18);
    ctx.fillStyle = '#574b40';
    ctx.textAlign = 'center';
    ctx.fillText(qline.length > 26 ? qline.slice(0, 26) + '…' : qline, W / 2, 172);

    // 卦符
    center(hex.glyph, 300, 120, 400, '#1a1613');

    // 卦名与卦辞
    center(hex.sub, 366, 34, 600, '#1a1613', 5);
    var afterJudge = wrap(hex.judgment, 90, 410, W - 180, 19, '#574b40', 32);

    // 三张牌
    var cardW = 152, cardH = 214, gap = 26;
    var totalW = cardW * 3 + gap * 2;
    var startX = (W - totalW) / 2;
    var cardY = Math.max(afterJudge + 18, 500);

    S.hand.forEach(function (c, i) {
      var x = startX + i * (cardW + gap);
      var isYing = i === r.index;
      ctx.save();
      ctx.fillStyle = '#17130f';
      ctx.fillRect(x, cardY, cardW, cardH);
      ctx.strokeStyle = isYing ? '#a8382a' : 'rgba(178,141,51,.5)';
      ctx.lineWidth = isYing ? 3 : 1.5;
      ctx.strokeRect(x, cardY, cardW, cardH);

      ctx.textAlign = 'center';
      ctx.font = font(13);
      ctx.fillStyle = 'rgba(216,183,94,.6)';
      ctx.fillText(POS_LABELS[i], x + cardW / 2, cardY + 26);

      ctx.font = '40px "Segoe UI Symbol","Apple Symbols",serif';
      ctx.fillStyle = isYing ? '#e8c877' : '#d8b75e';
      ctx.fillText(c.glyph, x + cardW / 2, cardY + 92);

      ctx.font = font(19, 600);
      ctx.fillStyle = '#f0e7d4';
      ctx.fillText(c.name, x + cardW / 2, cardY + 138);

      ctx.font = font(13);
      ctx.fillStyle = '#b28d33';
      ctx.fillText(c.element + (c.branch ? ' · ' + c.branch : ''), x + cardW / 2, cardY + 170);

      if (isYing) {
        ctx.font = font(13, 600);
        ctx.fillStyle = '#e8a99b';
        ctx.fillText('应', x + cardW / 2, cardY + 196);
      }
      ctx.restore();
    });

    // 生克与判定
    var y = cardY + cardH + 48;
    center('用神 ' + r.yongshen + '　应牌 ' + card.element + '　' + r.relation.label, y, 16, 400, '#574b40', 1);
    y += 44;
    center(r.level.name, y, 36, 600, '#a8382a', 8);
    y += 32;
    center('得分 ' + r.score, y, 15, 400, '#8a7a68', 2);

    // 机
    y += 38;
    ctx.strokeStyle = 'rgba(178,141,51,.35)';
    ctx.beginPath(); ctx.moveTo(90, y); ctx.lineTo(W - 90, y); ctx.stroke();
    y += 32;
    y = wrap(r.advice, 90, y, W - 180, 18, '#1a1613', 31);
    y = wrap(r.elementHint, 90, y + 4, W - 180, 15, '#6b6156', 26);

    // 页脚
    var d = new Date();
    var stamp = d.getFullYear() + '.' + pad(d.getMonth() + 1) + '.' + pad(d.getDate())
      + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    center(stamp, H - 74, 12, 400, '#8a7a68', 2);
    center('本作之对应为游戏设定 · 不构成任何建议', H - 50, 11, 400, '#a79880', 1);
  }

  function pad(n) { return String(n).padStart(2, '0'); }

  function downloadCard() {
    var cv = $('#signcard');
    cv.toBlob(function (blob) {
      if (!blob) { toast('导出失败'); return; }
      var d = new Date();
      var name = '问一卦_' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate())
        + '_' + pad(d.getHours()) + pad(d.getMinutes()) + '.png';
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      toast('签卡已存');
    }, 'image/png');
  }

  function verdictText() {
    var r = S.result;
    var lines = [];
    lines.push('问一卦 · 抽一张');
    lines.push(S.domain.name + '之问' + (S.question ? '：' + S.question : ''));
    lines.push('');
    lines.push(S.built.hex.sub + '（' + S.built.hex.name + '）　' + S.built.hex.judgment);
    if (S.built.movingCount) lines.push('动爻 ' + S.built.movingCount + '，之卦 ' + S.built.changed.sub);
    lines.push('卦规：' + S.rule.inner.rule.text + ' / ' + S.rule.outer.rule.title + '：' + S.rule.outer.rule.text);
    lines.push('三才：' + S.hand.map(function (c, i) {
      return POS_SHORT[i] + '「' + c.name + '」' + c.element;
    }).join(' '));
    lines.push('应：「' + POS_SHORT[r.index] + '」位之「' + r.card.name + '」（' + r.card.element + '）');
    lines.push('判：' + r.relation.label + '　→　' + r.level.name + '（' + r.level.seal + '）　得分 ' + r.score);
    if (S.analysis && S.analysis.hasLegal && S.analysis.bestLegal.index !== r.index) {
      lines.push('复盘：守规最优是' + POS_SHORT[S.analysis.bestLegal.index] + '「'
        + S.hand[S.analysis.bestLegal.index].name + '」（'
        + sgn(S.analysis.bestLegal.result.score) + '），差 '
        + (S.analysis.bestLegal.result.score - r.score) + ' 分。');
    }
    lines.push('机：' + r.advice);
    lines.push('用神之嘱：' + r.elementHint);
    return lines.join('\n');
  }

  function copyVerdict() {
    var text = verdictText();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast('判词已复制'); }, fallback);
    } else fallback();

    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); toast('判词已复制'); }
      catch (e) { toast('复制失败，请手动选择'); }
      ta.remove();
    }
  }

  // ---------- 复位 ----------
  function again() {
    S.lines = [];
    S.hand = [];
    S.revealed = [false, false, false];
    S.built = null;
    S.rule = null;
    S.selected = null;
    S.analysis = null;
    S.mode = null;
    S.swapPick = null;
    S.result = null;
    S.grants = { redraw: 0, swap: 0 };
    paintHexColumn();
    $('#btn-settle').disabled = true;
    $('#btn-read').classList.add('is-hidden');
    var toss = $('#btn-toss');
    toss.classList.remove('is-hidden');
    toss.disabled = false;
    toss.textContent = '掷第一次';
    $('#cast-meta').textContent = '六爻自成下而上。初爻在下。';
    $('#toss-read').textContent = '三枚铜钱：背为阳，字为阴。';
    goto('intent');
  }

  // ---------- 绑定 ----------
  document.addEventListener('DOMContentLoaded', function () {
    renderDomains();
    renderSteps();

    $('#btn-start').addEventListener('click', startRound);
    $('#btn-toss').addEventListener('click', toss);
    $('#btn-read').addEventListener('click', readHex);
    $('#btn-draw').addEventListener('click', function () { renderTable(); goto('table'); });
    $('#btn-settle').addEventListener('click', settle);
    $('#btn-download').addEventListener('click', downloadCard);
    $('#btn-copy').addEventListener('click', copyVerdict);
    $('#btn-again').addEventListener('click', again);

    $('#cards').addEventListener('click', function (ev) {
      var el = ev.target.closest('.card');
      if (!el) return;
      onCardClick(Number(el.dataset.i));
    });

    $('#question').addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' && S.domain) startRound();
    });

    var dlg = $('#dlg-about');
    $('#btn-about').addEventListener('click', function () {
      if (typeof dlg.showModal === 'function') dlg.showModal();
      else dlg.setAttribute('open', '');
    });
    $('#btn-close-about').addEventListener('click', function () { dlg.close(); });
    dlg.addEventListener('click', function (ev) { if (ev.target === dlg) dlg.close(); });
  });
})();

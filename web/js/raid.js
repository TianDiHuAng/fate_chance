/* 「命市下潜」· 搜打撤主循环
 * 结构：大厅（升级/选标的）→ 下潜（逐层探，风险递增）→ 卦成受判（选应）→ 结算
 *
 * 一切标的、商号、传闻、价格均为虚构。本作不提供投资建议，不预测真实市场。
 */
(function () {
  'use strict';

  var E = window.Engine;
  var RAID = window.RAID;
  var TAROT = window.TAROT;
  var $ = function (s) { return document.querySelector(s); };
  var MAX_DEPTH = RAID.CONFIG.maxDepth;
  var POS = ['初', '二', '三', '四', '五', '上'];

  // ---------- 随机（支持 ?seed= 复现） ----------
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
      coin: RAID.CONFIG.startCoin,
      gear: { coin: 0, deck: 0, charm: 0 },
      runs: 0, deaths: 0, best: 0, profit: 0,
      slips: [],   // 签匣：卦成后留下的签（含碎签）
      cards: [],   // 牌册：撤离带回的大牌 id
      bag: { talisman: 0, lamp: 0, ink: 0, paper: 0 },
      loadout: { talisman: 0, lamp: 0 },
    };
  }
  function load() {
    try {
      var raw = localStorage.getItem(RAID.CONFIG.saveKey);
      if (!raw) return defaultSave();
      var s = JSON.parse(raw);
      if (!s || typeof s.coin !== 'number') return defaultSave();
      s.gear = Object.assign({ coin: 0, deck: 0, charm: 0 }, s.gear || {});
      s.slips = Array.isArray(s.slips) ? s.slips : [];
      s.cards = Array.isArray(s.cards) ? s.cards : [];
      s.bag = Object.assign({ talisman: 0, lamp: 0, ink: 0, paper: 0 }, s.bag || {});
      s.loadout = Object.assign({ talisman: 0, lamp: 0 }, s.loadout || {});
      return s;
    } catch (e) { return defaultSave(); }
  }
  function persist() {
    try { localStorage.setItem(RAID.CONFIG.saveKey, JSON.stringify(SAVE)); } catch (e) { /* 忽略 */ }
  }

  // ---------- 一局状态 ----------
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

  function tier(key) { return SAVE.gear[key] || 0; }

  function paintPurse() {
    $('#coin').textContent = SAVE.coin;
  }

  // ---------- 收藏：签匣与牌册 ----------
  function palaceOf(code) {
    var hex = window.HEXAGRAM_BY_CODE[code];
    return hex ? hex.upper : null;
  }

  function palaceProgress() {
    var groups = {};
    RAID.PALACES.forEach(function (p) { groups[p.key] = new Set(); });
    SAVE.slips.forEach(function (s) {
      if (s.broken) return;
      var p = palaceOf(s.code);
      if (p && groups[p]) groups[p].add(s.code);
    });
    return RAID.PALACES.map(function (p) {
      return { key: p.key, name: p.name, got: groups[p.key].size, need: 8, done: groups[p.key].size >= 8 };
    });
  }

  function completedPalaces() {
    return palaceProgress().filter(function (p) { return p.done; }).length;
  }

  function collectionStats() {
    var codes = new Set();
    SAVE.slips.forEach(function (s) { if (!s.broken) codes.add(s.code); });
    return {
      slips: SAVE.slips.length,
      shards: SAVE.slips.filter(function (s) { return s.broken; }).length,
      hexes: codes.size,
      cards: SAVE.cards.length,
      palaces: completedPalaces(),
    };
  }

  function rarityOf(level, movingCount) {
    if (level.name === '上上' && movingCount >= 3) return '绝';
    if (movingCount >= 3) return '珍';
    if (movingCount >= 1) return '稀';
    return '常';
  }

  function makeSlip(level, built, sel, depth) {
    var card = sel === null ? null : RUN.cards[sel];
    var g = RAID.SIGN_GRADE[level.name];
    return {
      code: built.code,
      sub: built.hex.sub,
      name: built.hex.name,
      glyph: built.hex.glyph,
      cardId: card ? card.id : null,
      cardName: card ? card.name : null,
      element: card ? card.element : null,
      level: level.name,
      seal: level.seal,
      grade: g.grade,
      cls: g.cls,
      rarity: rarityOf(level, built.movingCount),
      moving: built.movingCount,
      depth: depth,
      at: Date.now(),
      broken: false,
    };
  }

  function makeShard(depth) {
    return {
      broken: true,
      grade: '碎签',
      cls: 'g-shard',
      depth: depth,
      target: RUN.target.name,
      at: Date.now(),
    };
  }

  function collectCards(cards) {
    var have = new Set(SAVE.cards);
    cards.forEach(function (c) { have.add(c.id); });
    SAVE.cards = Array.from(have).slice(0, 22);
  }

  function pushSlip(slip) {
    SAVE.slips.unshift(slip);
    if (SAVE.slips.length > RAID.CONFIG.maxSlips) SAVE.slips.length = RAID.CONFIG.maxSlips;
  }
  function nextCost(key) {
    var g = RAID.GEAR[key];
    var lv = tier(key);
    return lv >= g.levels.length - 1 ? null : g.costs[lv];
  }

  // ---------- 大厅 ----------
  function renderHall() {
    paintPurse();
    $('#btn-stash').textContent = '签匣 · ' + SAVE.slips.length;

    $('#gear').innerHTML = Object.keys(RAID.GEAR).map(function (key) {
      var g = RAID.GEAR[key];
      var lv = tier(key);
      var cost = nextCost(key);
      var pips = g.levels.map(function (_, i) {
        return '<i class="' + (i <= lv ? 'on' : '') + '"></i>';
      }).join('');
      var canBuy = cost !== null && SAVE.coin >= cost;
      var btn = cost === null
        ? '<button class="gear-buy" type="button" disabled>已至极品</button>'
        : '<button class="gear-buy" type="button" data-buy="' + key + '" '
          + (canBuy ? '' : 'disabled') + '>升至「' + g.levels[lv + 1].name + '」· ' + cost + ' 签金</button>';
      return '<div class="gear-card">'
        + '<div class="gear-top"><span class="gear-glyph">' + g.glyph + '</span>'
        + '<span class="gear-name">' + g.name + '</span>'
        + '<span class="gear-tag">' + g.tagline + '</span></div>'
        + '<div class="gear-lv">' + g.levels[lv].name + '　<span>' + g.levels[lv].note + '</span></div>'
        + '<div class="pips">' + pips + '</div>'
        + '<div class="gear-desc">' + g.desc + '</div>'
        + btn
        + '</div>';
    }).join('');

    $('#targets').innerHTML = RAID.TARGETS.map(function (t) {
      var afford = SAVE.coin >= RAID.CONFIG.entryCost;
      return '<button class="target-card" type="button" data-target="' + t.key + '" '
        + (afford ? '' : 'disabled') + '>'
        + '<span class="tc-name">' + t.name + '</span>'
        + '<span class="tc-kind">' + t.kind + '</span>'
        + '<span class="tc-rumor">' + t.rumor + '</span>'
        + '<span class="tc-go">' + (afford ? '下潜 · ' + RAID.CONFIG.entryCost + ' 香火钱' : '香火钱不足') + '</span>'
        + '</button>';
    }).join('');

    $('#targets').querySelectorAll('[data-target]').forEach(function (btn) {
      btn.onclick = function () { startRun(btn.dataset.target); };
    });
    $('#gear').querySelectorAll('[data-buy]').forEach(function (btn) {
      btn.onclick = function () { buy(btn.dataset.buy); };
    });

    renderLoadout();
    renderMats();
  }

  function buy(key) {
    var cost = nextCost(key);
    if (cost === null) return;
    if (SAVE.coin < cost) { toast('香火钱不足'); return; }
    SAVE.coin -= cost;
    SAVE.gear[key] += 1;
    persist();
    renderHall();
    toast(RAID.GEAR[key].name + ' 升至「' + RAID.GEAR[key].levels[SAVE.gear[key]].name + '」');
  }

  // ---------- 随行与料 ----------
  function renderLoadout() {
    var keys = ['talisman', 'lamp'];
    var total = (SAVE.loadout.talisman || 0) + (SAVE.loadout.lamp || 0);
    $('#loadout').innerHTML = keys.map(function (k) {
      var it = RAID.ITEMS[k];
      var stock = SAVE.bag[k] || 0;
      var taken = SAVE.loadout[k] || 0;
      var canTake = stock - taken > 0 && total < RAID.CONFIG.loadoutSlots;
      var dis = taken > 0 || canTake ? '' : 'disabled';
      return '<div class="lo-item' + (taken ? ' on' : '') + '">'
        + '<span class="lo-g">' + it.glyph + '</span>'
        + '<span class="lo-mid"><span class="lo-n">' + it.name
        + '<em>存 ' + stock + '</em></span>'
        + '<span class="lo-d">' + it.desc + '</span></span>'
        + '<button class="lo-b" type="button" data-lo="' + k + '" ' + dis + '>'
        + (taken ? '不带' : (stock > 0 ? '带上' : '无')) + '</button>'
        + '</div>';
    }).join('');

    $('#loadout').querySelectorAll('[data-lo]').forEach(function (btn) {
      btn.onclick = function () {
        var k = btn.dataset.lo;
        var total2 = SAVE.loadout.talisman + SAVE.loadout.lamp;
        if (SAVE.loadout[k] > 0) {
          SAVE.loadout[k] -= 1;
        } else {
          if (total2 >= RAID.CONFIG.loadoutSlots) { toast('最多带两件'); return; }
          if ((SAVE.bag[k] || 0) <= 0) { toast('没有存货'); return; }
          SAVE.loadout[k] += 1;
        }
        persist();
        renderHall();
      };
    });
  }

  function renderMats() {
    var need = RAID.CRAFT.talisman.need;
    var ok = (SAVE.bag.ink || 0) >= need.ink && (SAVE.bag.paper || 0) >= need.paper;
    $('#mats').innerHTML = '<div class="mat-row">'
      + '<span class="mat">朱砂 <b>' + (SAVE.bag.ink || 0) + '</b></span>'
      + '<span class="mat">澄心纸 <b>' + (SAVE.bag.paper || 0) + '</b></span>'
      + '<button class="gear-buy" id="btn-craft" type="button" ' + (ok ? '' : 'disabled') + '>'
      + '画一道护身符（砂 ' + need.ink + ' · 纸 ' + need.paper + '）</button>'
      + '</div>';

    var b = $('#btn-craft');
    if (b) {
      b.onclick = function () {
        if (!ok) return;
        SAVE.bag.ink -= need.ink;
        SAVE.bag.paper -= need.paper;
        SAVE.bag.talisman += 1;
        persist();
        renderHall();
        toast('画成一道护身符');
      };
    }
  }

  // ---------- 开局 ----------
  function startRun(targetKey) {
    if (SAVE.coin < RAID.CONFIG.entryCost) { toast('香火钱不足'); return; }
    var target = RAID.TARGETS.filter(function (t) { return t.key === targetKey; })[0];
    if (!target) return;

    SAVE.coin -= RAID.CONFIG.entryCost;
    persist();
    paintPurse();

    // 真实值：开局抽定，之后一切读数都不得与之相违
    var truth = {
      dir: pick(['盛', '衰']),
      mag: pick(['小', '中', '大']),
      timing: pick(['初', '中', '末']),
      risk: pick(['稳', '危']),
    };

    RUN = {
      target: target,
      truth: truth,
      depth: 0,
      lines: [],
      cards: [],
      deck: E.shuffle(rng).slice(),
      intel: {},
      rerolls: tier('coin'),
      lastToss: null,
      lastLoot: null,
      selected: null,
      // 随行：从库中扣下，带进这一局
      talisman: SAVE.loadout.talisman || 0,
      lamp: (SAVE.loadout.lamp || 0) > 0,
      picked: { ink: 0, paper: 0 },
    };
    SAVE.bag.talisman -= SAVE.loadout.talisman || 0;
    SAVE.bag.lamp -= SAVE.loadout.lamp || 0;
    SAVE.loadout = { talisman: 0, lamp: 0 };
    persist();

    $('#dive-name').textContent = target.name;
    $('#dive-kind').textContent = target.kind + ' · 虚构标的';
    $('#prompt').className = 'prompt';
    $('#prompt').textContent = '第一层不设险。越深，情报越全，反噬也越重。';
    show('dive');
    renderDive();
  }

  // ---------- 下潜 ----------
  function riskFor(depth) {
    if (depth < 2) return 0;
    var base = RAID.RISK[depth] || 0.5;
    return Math.max(0.02, base - tier('charm') * 0.03);
  }

  function paintHex() {
    var box = $('#hexcolumn');
    var rows = [];
    for (var i = 0; i < MAX_DEPTH; i++) {
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
    box.innerHTML = rows.join('');
  }

  function paintDepth() {
    $('#depth-track').innerHTML = Array.from({ length: MAX_DEPTH }, function (_, i) {
      var n = i + 1;
      var cls = n <= RUN.depth ? 'on' : (n === RUN.depth + 1 ? 'now' : '');
      return '<i class="' + cls + '">' + n + '</i>';
    }).join('');
  }

  function paintIntel() {
    var keys = Object.keys(RUN.intel);
    $('#intel-count').textContent = keys.length + ' / 4';
    $('#intel').innerHTML = RAID.DIMS.map(function (d) {
      var got = RUN.intel[d.key];
      return '<li><span class="dim">' + d.name + '</span>'
        + (got
          ? '<span class="val">' + got.value + '</span><span class="src">第 ' + got.at + ' 层</span>'
          : '<span class="val unknown">· · ·</span><span class="src"></span>')
        + '</li>';
    }).join('');
  }

  function paintRisk() {
    var next = RUN.depth + 1;
    var r = riskFor(next);
    if (next > MAX_DEPTH) {
      $('#risk-val').textContent = '已至底';
      $('#risk-fill').style.width = '100%';
      $('#risk-note').textContent = '六爻已成，无法再深。';
      return;
    }
    $('#risk-val').textContent = next === 1 ? '不设险' : Math.round(r * 100) + '%';
    $('#risk-fill').style.width = Math.min(100, (r / 0.5) * 100) + '%';
    $('#risk-note').textContent = next === 1
      ? '第一层不设险——先给你一条情报。'
      : '击穿则情报尽散；法器可保底一部分。';
  }

  function renderDive() {
    paintHex();
    paintDepth();
    paintIntel();
    paintRisk();

    var next = RUN.depth + 1;
    var btn = $('#btn-deepen');
    btn.textContent = RUN.depth === 0 ? '探第一层' : (next > MAX_DEPTH ? '六爻已成' : '探第 ' + next + ' 层');
    btn.disabled = next > MAX_DEPTH;

    $('#btn-extract').disabled = RUN.depth === 0;

    // 重掷
    var ops = '';
    if (RUN.rerolls > 0 && RUN.lines.length > 0) {
      ops = '<button class="ghost" id="btn-reroll" type="button">重掷「' + POS[RUN.lines.length - 1]
        + '」爻（余 ' + RUN.rerolls + '）</button>';
    }
    $('#ops').innerHTML = ops;
    var rb = $('#ops').querySelector('#btn-reroll');
    if (rb) rb.onclick = reroll;

    if (RUN.lastToss) {
      var t = RUN.lastToss;
      $('#cast-note').innerHTML = '第' + RUN.lines.length + '爻：'
        + t.coins.map(function (v) { return v === 3 ? '背' : '字'; }).join('')
        + ' · 和 ' + t.sum + ' · ' + t.name + (t.moving ? '（动）' : '');
    }

    var carry = '';
    if (RUN.talisman > 0) carry += '<span class="chip-in">符 ×' + RUN.talisman + '</span>';
    if (RUN.lamp) carry += '<span class="chip-in">长明灯 亮</span>';
    if (RUN.picked.ink) carry += '<span class="chip-in">朱砂 ' + RUN.picked.ink + '</span>';
    if (RUN.picked.paper) carry += '<span class="chip-in">澄心纸 ' + RUN.picked.paper + '</span>';
    $('#carry').innerHTML = carry;
  }

  function deepen() {
    var next = RUN.depth + 1;
    if (next > MAX_DEPTH) return;

    // 先受险：护身符可以替你挡一次
    var r = riskFor(next);
    if (r > 0 && rng() < r) {
      if (RUN.talisman > 0) {
        RUN.talisman -= 1;
        toast('护身符碎了——替你在第 ' + next + ' 层挡下这一击');
      } else {
        RUN.depth = next;
        endRun('break');
        return;
      }
    }

    var toss = E.tossCoins(rng);
    RUN.lines.push(toss);
    RUN.lastToss = toss;

    var card = RUN.deck[RUN.cards.length] || pick(TAROT);
    RUN.cards.push(card);

    // 情报：每层 1 + 牌材质维 + 长明灯 1 维；动爻另加一维。每维都有「深处才见」的门槛。
    var gain = 1 + tier('deck') + (RUN.lamp ? 1 : 0) + (toss.moving ? 1 : 0);
    var unknown = RAID.DIMS.filter(function (d) {
      return !RUN.intel[d.key] && next >= d.minDepth;
    });
    for (var i = 0; i < gain && i < unknown.length; i++) {
      RUN.intel[unknown[i].key] = { value: RUN.truth[unknown[i].key], at: next };
    }

    // 掉落：除了情报牌，另有一件东西
    var loot = rollLoot(next);
    RUN.lastLoot = loot;
    if (loot !== 'none') {
      if (loot === 'talisman') RUN.talisman += 1;
      else if (loot === 'lamp') RUN.lamp = true;
      else RUN.picked[loot] = (RUN.picked[loot] || 0) + 1;
    }

    RUN.depth = next;

    if (next >= MAX_DEPTH) {
      renderDive();
      setTimeout(goResolve, 420);
      return;
    }

    var lootTxt = loot === 'none' ? '此层无物。' : '得「' + RAID.ITEMS[loot].name + '」。';
    $('#prompt').textContent = '第 ' + next + ' 层已探。' + describeGain(gain) + lootTxt
      + '　继续则反噬升至 ' + Math.round(riskFor(next + 1) * 100) + '%。';
    renderDive();
  }

  function rollLoot(depth) {
    var table = RAID.LOOT[Math.min(6, Math.max(1, depth))];
    var boost = RUN.target.vol > 1 ? 1.5 : 1;
    var pool = table.map(function (row) {
      var w = row[1];
      if (RAID.RARE_SOURCES.indexOf(row[0]) >= 0) w = Math.max(1, Math.round(w * boost));
      return [row[0], w];
    });
    var total = pool.reduce(function (a, p) { return a + p[1]; }, 0);
    var x = rng() * total;
    for (var i = 0; i < pool.length; i++) {
      x -= pool[i][1];
      if (x <= 0) return pool[i][0];
    }
    return 'none';
  }

  function describeGain(n) {
    var got = Math.min(n, Object.keys(RUN.intel).length);
    return got > 0 ? '得情报 ' + got + ' 维。' : '情报已尽，只剩卦。';
  }

  function reroll() {
    if (RUN.rerolls <= 0 || !RUN.lines.length) return;
    var i = RUN.lines.length - 1;
    var toss = E.tossCoins(rng);
    RUN.lines[i] = toss;
    RUN.lastToss = toss;
    RUN.rerolls -= 1;
    renderDive();
    toast('「' + POS[i] + '」爻已重掷：' + toss.name);
  }

  // ---------- 卦成受判 ----------
  function goResolve() {
    var built = E.buildHexagram(RUN.lines);
    RUN.built = built;
    $('#res-glyph').textContent = built.hex.glyph;
    $('#res-name').textContent = built.hex.sub;
    $('#res-sub').textContent = '上' + built.hex.upper + ' · 下' + built.hex.lower
      + (built.movingCount ? '　动爻 ' + built.movingCount : '　六爻皆静')
      + '　用神 ' + E.TRIGRAMS[triCode(built.hex.lower)].element;
    $('#res-meaning').textContent = built.hex.judgment + '　' + built.hex.meaning;

    $('#res-cards').innerHTML = RUN.cards.map(function (c, i) {
      return '<button class="card" type="button" data-card="' + i + '">'
        + '<span class="dp">' + POS[i] + ' 层</span>'
        + '<span class="glyph">' + c.glyph + '</span>'
        + '<span class="nm">' + c.name + '</span>'
        + '<span class="el">' + c.element + '</span>'
        + '</button>';
    }).join('');

    $('#res-cards').querySelectorAll('[data-card]').forEach(function (btn) {
      btn.onclick = function () {
        RUN.selected = Number(btn.dataset.card);
        $('#res-cards').querySelectorAll('.card').forEach(function (el) {
          el.classList.toggle('on', Number(el.dataset.card) === RUN.selected);
        });
        $('#btn-judge').disabled = false;
        var c = RUN.cards[RUN.selected];
        $('#res-prompt').textContent = '你取「' + POS[RUN.selected] + '」层之《' + c.name
          + '》（' + c.element + '）为应。落定即受判。';
      };
    });

    $('#btn-judge').disabled = true;
    $('#res-prompt').className = 'prompt';
    $('#res-prompt').textContent = '用神取内卦五行。挑一张，受判——判吉则情报兑现更高，判凶则大打折扣。';
    show('resolve');
  }

  var TRI = { 乾: '111', 兑: '110', 离: '101', 震: '100', 巽: '011', 坎: '010', 艮: '001', 坤: '000' };
  function triCode(name) { return TRI[name]; }

  function judge() {
    if (RUN.selected === null) return;
    var rule = E.makeRule(RUN.built, RUN.cards, '木');
    rule.legal = RUN.cards.map(function (_, i) { return i; }); // 受判时不设局规，全凭你选
    var res = E.judge({
      built: RUN.built,
      rule: rule,
      hand: RUN.cards,
      index: RUN.selected,
      domainElement: '木',
    });
    RUN.result = res;
    endRun('verdict', res.level);
  }

  // ---------- 结算 ----------
  function payoutOf(depth, completeness, factor) {
    var base = 44 * RUN.target.vol;
    var depthF = 1 + 0.35 * (depth - 1);
    var completeF = 0.4 + 0.6 * completeness;
    var dirF = RUN.truth.dir === '衰' ? 1.15 : 1;
    var palaceF = 1 + RAID.CONFIG.palaceBonus * completedPalaces();
    return Math.round(base * completeF * depthF * factor * dirF * palaceF);
  }

  function endRun(kind, level) {
    var completeness = Object.keys(RUN.intel).length / 4;
    var factor = level ? RAID.VERDICT_FACTOR[level.name] : RAID.UNVERIFIED;
    var gross = kind === 'break' ? 0 : payoutOf(RUN.depth, completeness, factor);
    var saved = kind === 'break' ? tier('charm') * 6 : 0;
    var payout = kind === 'break' ? saved : gross;
    var net = payout - RAID.CONFIG.entryCost;

    // ---- 战利品：钱之外，要能带出「东西」 ----
    var gotSlip = null;
    var gotCards = 0;
    if (kind === 'verdict') {
      gotSlip = makeSlip(level, RUN.built, RUN.selected, RUN.depth);
      pushSlip(gotSlip);
      var before = SAVE.cards.length;
      collectCards(RUN.cards);
      gotCards = SAVE.cards.length - before;
    } else if (kind === 'extract') {
      var b2 = SAVE.cards.length;
      collectCards(RUN.cards);
      gotCards = SAVE.cards.length - b2;
    } else if (kind === 'break' && RUN.depth >= RAID.SHARD_MIN_DEPTH) {
      gotSlip = makeShard(RUN.depth);
      pushSlip(gotSlip);
    }

    SAVE.coin = Math.max(0, SAVE.coin + net);
    SAVE.runs += 1;
    if (kind === 'break') SAVE.deaths += 1;
    SAVE.best = Math.max(SAVE.best, payout);
    SAVE.profit += net;

    // ---- 带出：只有活着带出去才算 ----
    var carried = { ink: 0, paper: 0, talisman: 0 };
    if (kind !== 'break') {
      carried.ink = RUN.picked.ink || 0;
      carried.paper = RUN.picked.paper || 0;
      carried.talisman = RUN.talisman || 0;
      SAVE.bag.ink += carried.ink;
      SAVE.bag.paper += carried.paper;
      SAVE.bag.talisman += carried.talisman;
    } else {
      carried.ink = RUN.picked.ink || 0;
      carried.paper = RUN.picked.paper || 0;
      carried.talisman = RUN.talisman || 0;
    }

    persist();
    paintPurse();

    // 若是击穿，算一句「你若早收手」
    var wouldHave = null;
    if (kind === 'break' && RUN.depth > 1) {
      var c2 = Math.min(4, Object.keys(RUN.intel).length) / 4;
      wouldHave = payoutOf(RUN.depth - 1, c2, RAID.UNVERIFIED);
    }

    renderResult(kind, level, {
      completeness: completeness, factor: factor, gross: gross,
      saved: saved, payout: payout, net: net, wouldHave: wouldHave,
      slip: gotSlip, cards: gotCards, carried: carried,
    });
    show('result');
  }

  function renderResult(kind, level, m) {
    var seal = $('#res-seal');
    seal.classList.remove('grey');
    var title, sub, advice;

    if (kind === 'break') {
      seal.classList.add('grey');
      seal.textContent = '破';
      title = '命数击穿';
      sub = RUN.target.name + ' · 第 ' + RUN.depth + ' 层 · 情报尽散';
      advice = m.saved > 0
        ? '击穿时能保住 ' + m.saved + ' 签金，是法器替你挡的那一下。'
        : '击穿，什么都带不出来。';
      if (m.wouldHave !== null) {
        advice += '　若在第 ' + (RUN.depth - 1) + ' 层封卦，本该得 ' + m.wouldHave + ' 签金——这一层，是你自己选着下去的。';
      }
    } else if (kind === 'extract') {
      seal.textContent = '封';
      title = '封卦撤离';
      sub = RUN.target.name + ' · 第 ' + RUN.depth + ' 层 · 得情报 '
        + Object.keys(RUN.intel).length + ' 维';
      advice = '卦未成，情报未经卦验，只兑九成。稳，但未尽——你收手的地方，就是这一局的价钱。';
    } else {
      seal.textContent = level.seal;
      if (level.name === '下' || level.name === '下下') seal.classList.add('grey');
      title = '受判 · ' + level.name;
      sub = RUN.built.hex.sub + '　应《' + RUN.result.card.name + '》　' + RUN.result.relation.label;
      advice = level.line + '　判词为「' + level.name + '」，情报按 ' + m.factor + ' 倍兑现。';
    }

    $('#result-title').textContent = title;
    $('#result-sub').textContent = sub;
    $('#result-advice').textContent = advice;

    // 战利品：一件「东西」，不是一个数字
    var items = [];
    if (m.carried.ink) items.push('朱砂 ×' + m.carried.ink);
    if (m.carried.paper) items.push('澄心纸 ×' + m.carried.paper);
    if (m.carried.talisman) items.push('护身符 ×' + m.carried.talisman);
    var itemTxt = items.length
      ? (kind === 'break' ? '　尽失：' + items.join('、') : '　带出：' + items.join('、'))
      : '';

    var lootLine = '';
    if (m.slip && !m.slip.broken) {
      lootLine = '所得：<b>' + m.slip.grade + '</b>《' + m.slip.sub + '》'
        + '　稀有 <b>' + m.slip.rarity + '</b>'
        + (m.cards ? '　牌 +' + m.cards : '');
    } else if (m.slip && m.slip.broken) {
      lootLine = '所得：<b>碎签</b>一枚（第 ' + m.slip.depth + ' 层）——兑不了钱，只能压在匣底。';
    } else if (kind === 'extract') {
      lootLine = m.cards > 0
        ? '所得：牌 +' + m.cards + '　<em>卦未成，无签</em>——签只在卦成之后才有。'
        : '所得：无。早早收手，连牌也未必带得出来。';
    }
    lootLine += itemTxt;

    var lootEl = $('#loot');
    if (lootEl) {
      lootEl.innerHTML = lootLine;
      lootEl.style.display = lootLine ? '' : 'none';
    }

    var rows = '';
    rows += row('标的', RUN.target.name + '（' + RUN.target.kind + '）', '');
    rows += row('深度', '第 ' + RUN.depth + ' 层 · 情报 ' + Math.round(m.completeness * 100) + '%',
      '', m.completeness >= 1 ? 'plus' : '');
    if (kind === 'verdict') {
      rows += row('卦判', RUN.built.hex.sub + ' · ' + level.name + '　×' + m.factor, '×' + m.factor);
    } else if (kind === 'extract') {
      rows += row('卦判', '未成卦 · 情报折价', '×' + RAID.UNVERIFIED);
    } else {
      rows += row('卦判', '命数击穿 · 情报尽散', '0');
    }
    rows += row('情报估值', '标的价值 × 完整度 × 深度 × 卦判', m.gross ? '+' + m.gross : '0');
    if (m.saved) rows += row('法器保底', '镇命鼎所留', '+' + m.saved);
    rows += row('随身', itemTxt ? itemTxt.replace('　', '') : '空手', '');
    rows += row('入场', '香火钱', '-' + RAID.CONFIG.entryCost);
    rows += '<div class="row total"><span class="k">净得</span>'
      + '<span class="v">' + (m.net >= 0 ? '入账' : '折本') + '</span>'
      + '<span class="n ' + (m.net >= 0 ? 'plus' : 'minus') + '">'
      + (m.net >= 0 ? '+' : '') + m.net + '</span></div>';
    $('#ledger').innerHTML = rows;
  }

  function row(k, v, n, cls) {
    return '<div class="row"><span class="k">' + k + '</span>'
      + '<span class="v">' + v + '</span>'
      + '<span class="n ' + (cls || '') + '">' + (n || '') + '</span></div>';
  }

  // ---------- 签匣 ----------
  function fmtDate(ts) {
    var d = new Date(ts);
    return (d.getMonth() + 1) + '.' + d.getDate();
  }

  function renderStash() {
    var st = collectionStats();
    $('#stash-stats').textContent = '签 ' + st.slips + ' 枚（碎 ' + st.shards + '）　卦 '
      + st.hexes + ' / 64　牌 ' + st.cards + ' / 22　宫 ' + st.palaces + ' / 8';

    $('#palaces').innerHTML = palaceProgress().map(function (p) {
      return '<div class="palace' + (p.done ? ' done' : '') + '">'
        + '<div class="pn">' + p.name + '</div>'
        + '<div class="pg">' + p.got + ' / ' + p.need + '</div></div>';
    }).join('');

    if (!SAVE.slips.length) {
      $('#slips').innerHTML = '<div class="empty-note">匣里还是空的。'
        + '<br>签只在六爻成卦、受判之后才留下——想收藏，就得潜到底。</div>';
    } else {
      $('#slips').innerHTML = SAVE.slips.slice(0, 60).map(function (s) {
        if (s.broken) {
          return '<div class="slip is-shard g-shard">'
            + '<span class="rar">碎</span>'
            + '<span class="sg">✕</span>'
            + '<span class="sn">碎签</span>'
            + '<span class="sb">第 ' + s.depth + ' 层</span>'
            + '<span class="sd">' + fmtDate(s.at) + '</span></div>';
        }
        return '<div class="slip ' + s.cls + (s.rarity === '绝' ? ' is-gold' : '') + '">'
          + '<span class="rar">' + (s.rarity || '常') + '</span>'
          + '<span class="sg">' + (s.glyph || '䷀') + '</span>'
          + '<span class="sn">' + (s.name || '') + '</span>'
          + '<span class="sb">' + s.grade + '</span>'
          + '<span class="sd">' + (s.cardName || '') + ' · ' + fmtDate(s.at) + '</span>'
          + '</div>';
      }).join('');
    }

    var have = new Set(SAVE.cards);
    $('#cardbook').innerHTML = window.TAROT.map(function (c) {
      var got = have.has(c.id);
      return '<div class="cb ' + (got ? 'have' : 'miss') + '">'
        + '<span class="cg">' + (got ? c.glyph : '·') + '</span>'
        + '<span class="cn">' + (got ? c.name : '？') + '</span></div>';
    }).join('');
  }

  // ---------- 绑定 ----------
  document.addEventListener('DOMContentLoaded', function () {
    SAVE = load();
    renderHall();
    $('#coin').textContent = SAVE.coin;

    $('#btn-deepen').onclick = deepen;
    $('#btn-extract').onclick = function () {
      if (RUN && RUN.depth > 0) endRun('extract');
    };
    $('#btn-judge').onclick = judge;
    $('#btn-back').onclick = function () { renderHall(); show('hall'); };

    $('#btn-stash').onclick = function () { renderStash(); show('stash'); };
    $('#btn-stash-back').onclick = function () { renderHall(); show('hall'); };

    var dlg = $('#dlg-about');
    $('#btn-about').onclick = function () {
      if (typeof dlg.showModal === 'function') dlg.showModal();
      else dlg.setAttribute('open', '');
    };
    $('#btn-close-about').onclick = function () { dlg.close(); };
    dlg.addEventListener('click', function (ev) { if (ev.target === dlg) dlg.close(); });
  });
})();

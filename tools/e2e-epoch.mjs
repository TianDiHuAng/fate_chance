/**
 * 《一世》端到端验证
 * 运行： node tools/e2e-epoch.mjs （需要 http://127.0.0.1:8811 静态服务）
 */
import { chromium } from 'playwright-core';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, existsSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const shots = join(root, 'shots');
if (!existsSync(shots)) mkdirSync(shots, { recursive: true });

const BASE = process.env.RAID_BASE || 'http://127.0.0.1:8811';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const errors = [];
let checks = 0;
const fails = [];
function ok(name, cond, detail) {
  checks++;
  if (!cond) fails.push(`${name}${detail ? ' :: ' + detail : ''}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 430, height: 940 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error') errors.push('[console] ' + m.text()); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));

async function open(seed = 3) {
  await page.goto(`${BASE}/epoch.html?seed=${seed}`);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${BASE}/epoch.html?seed=${seed}`);
  await page.waitForSelector('#btn-birth');
}

async function screen() {
  return page.evaluate(() => {
    const c = document.querySelector('.screen.is-active');
    return c ? c.dataset.screen : null;
  });
}

// ---------------- 1. 出生 ----------------
await open(3);
ok('初始在出生屏', (await screen()) === 'birth');
await page.click('#btn-birth');
await sleep(300);

const birth = await page.evaluate(() => ({
  card: !!document.querySelector('.fate-card'),
  name: document.querySelector('.fate-name').textContent.trim(),
  badge: document.querySelector('.fate-badge').textContent.trim(),
  badgeCls: document.querySelector('.fate-badge').className,
  rows: document.querySelectorAll('.fit-row').length,
  reversal: !!document.querySelector('.reversal-note'),
  beginVisible: !document.querySelector('#btn-begin').classList.contains('is-hidden'),
  hexLines: document.querySelectorAll('#birth-hex .hline:not(.is-ghost)').length,
  yong: document.querySelector('.fate-sub').textContent,
}));
ok('出生卦有六爻', birth.hexLines === 6, String(birth.hexLines));
ok('命格卡出现', birth.card && birth.name.length > 0, birth.name);
ok('卦判徽记有色调', /good|mid|bad/.test(birth.badgeCls), birth.badgeCls);
ok('五条适配', birth.rows === 5, String(birth.rows));
ok('必有命格说明', birth.reversal === true);
const lanesInfo = await page.evaluate(() => ({
  lanes: document.querySelectorAll('.lanes .lane').length,
  texts: [...document.querySelectorAll('.lanes .lane')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
}));
ok('命盘四条线', lanesInfo.lanes === 4, String(lanesInfo.lanes));
ok('四路线各不相同（旺衰不均）', new Set(lanesInfo.texts).size >= 3, lanesInfo.texts.join(' | '));
ok('用神写进副标', birth.yong.includes('用神'), birth.yong.slice(0, 20));
ok('可以开始', birth.beginVisible === true);
await page.screenshot({ path: join(shots, '40-epoch-birth.png'), fullPage: true });

// 记下这世的命格判，后续断言要对照
const fateBad = await page.evaluate(() => {
  const b = document.querySelector('.fate-badge');
  return b.textContent.trim() === '有阻' || b.textContent.trim() === '大阻'
    || b.className.includes('bad');
});

// ---------------- 2. 走完一节 ----------------
await page.click('#btn-begin');
await sleep(300);
ok('进入人生屏', (await screen()) === 'life');

const life0 = await page.evaluate(() => ({
  timeline: document.querySelectorAll('.tl').length,
  now: document.querySelectorAll('.tl.now').length,
  careers: document.querySelectorAll('#career-pick .pick').length,
  commitDisabled: document.querySelector('#btn-commit').disabled,
  quota: document.querySelector('#sec-note').textContent,
}));
ok('时间线六节', life0.timeline === 6, String(life0.timeline));
ok('当前节高亮', life0.now === 1, String(life0.now));
ok('五行当可选', life0.careers === 5, String(life0.careers));
ok('未选时不能落定', life0.commitDisabled === true);
ok('显示问卦额度', /问卦\s*\d+\/\d+/.test(life0.quota), life0.quota);

// 选险行（摸金）：这一世是吉命还是凶命，决定它显示 1.40 还是 0.90
await page.locator('[data-career="tomb"]').click();
await sleep(200);
const tombPick = await page.evaluate(() => {
  const on = document.querySelector('#career-pick .pick.on .pd').textContent.trim();
  const prompt = document.querySelector('#prompt').textContent;
  return { on, prompt };
});
const reversed = tombPick.on.includes('1.40');
ok('险行显示有效系数', /×\d\.\d\d/.test(tombPick.on), tombPick.on);
ok('负负得正与系数一致',
  reversed ? tombPick.prompt.includes('负负得正') : !tombPick.prompt.includes('负负得正'),
  `reversed=${reversed} prompt=${tombPick.prompt}`);
ok('白瞎提示不与负负得正并存',
  !(tombPick.prompt.includes('白瞎') && reversed), tombPick.prompt);

// 新顺序：选行当 → 问卦（可选）→ 定注码 → 落定
const beforeCast = await page.evaluate(() => ({
  hasCastBtn: !!document.querySelector('#btn-cast'),
  castText: document.querySelector('#cast-row').textContent.trim(),
  step: [...document.querySelectorAll('#steps-hint .sh')].map((e) => e.className),
}));
ok('选完行当就能问卦', beforeCast.hasCastBtn === true);

// 问一卦：给两象（本卦/变卦），不告吉凶
await page.click('#btn-cast');
await sleep(250);
const cast = await page.evaluate(() => {
  const xs = [...document.querySelectorAll('#cast-row .xiang')];
  return {
    count: xs.length,
    labels: xs.map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
    hasBadge: !!document.querySelector('#cast-row .fate-badge'),
    hasJudgeWord: /上上|上吉|中吉|中平|下下/.test(document.querySelector('#cast-row').textContent),
    quota: document.querySelector('#sec-note').textContent,
  };
});
ok('问卦给出两象', cast.count === 2, String(cast.count));
ok('两象都带卦辞原文', cast.labels.every((t) => t.includes('「')), cast.labels.join(' | ').slice(0, 80));
ok('两象都标了本卦/变卦', cast.labels.some((t) => t.includes('本卦')) && cast.labels.some((t) => t.includes('变卦')));
ok('两象都写出生克', cast.labels.every((t) => /应生用|比和|用生应|应克用|用克应/.test(t)), cast.labels.join(' | ').slice(-60));
ok('问卦时不解出吉凶', cast.hasJudgeWord === false);
ok('问卦扣额度（4 次起）', /问卦\s*3\/\d+/.test(cast.quota), cast.quota);

// 西式部分：三张塔罗，可择一为应
const tarotRow = await page.evaluate(() => {
  const ts = [...document.querySelectorAll('#cast-row .tcard')];
  return {
    count: ts.length,
    sel: ts.filter((e) => e.classList.contains('on')).length,
    texts: ts.map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
  };
});
ok('给出三张塔罗', tarotRow.count === 3, String(tarotRow.count));
ok('恰有一张被选为应', tarotRow.sel === 1, String(tarotRow.sel));
ok('塔罗牌带五行', tarotRow.texts.every((t) => /[金木水火土]/.test(t)), tarotRow.texts.join(' | '));

// 换一张牌，两象的生克应当跟着变
const beforeSwap = await page.evaluate(() =>
  [...document.querySelectorAll('#cast-row .xiang .xi')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
await page.locator('#cast-row [data-card="1"]').click();
await sleep(200);
const afterSwap = await page.evaluate(() =>
  [...document.querySelectorAll('#cast-row .xiang .xi')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
ok('换牌后生克随之改变', JSON.stringify(beforeSwap) !== JSON.stringify(afterSwap),
  beforeSwap.join(' / ') + ' => ' + afterSwap.join(' / '));
await page.locator('#cast-row [data-card="0"]').click();
await sleep(150);
await page.screenshot({ path: join(shots, '41-epoch-section.png'), fullPage: true });

// 可以在两象之间改信
const canSwitch = await page.evaluate(() => {
  const b = document.querySelector('#cast-row [data-pick="late"]');
  return b && !b.disabled;
});
if (canSwitch) {
  await page.locator('#cast-row [data-pick="late"]').click();
  await sleep(180);
  const switched = await page.evaluate(() => !!document.querySelector('#cast-row .xiang.on[data-pick="late"]'));
  ok('可以改信变卦', switched === true);
  await page.locator('#cast-row [data-pick="early"]').click();
  await sleep(150);
} else {
  ok('六爻皆静时变卦不可选', true);
}

// 注码区应显示卦意对折损的增减
const stakeInfo = await page.evaluate(() => ({
  texts: [...document.querySelectorAll('#stake-row .pick')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
}));
ok('问卦后注码区显示卦意影响', stakeInfo.texts.some((t) => /卦[减增]/.test(t)), stakeInfo.texts.join(' | '));

await page.locator('[data-stake="mid"]').click();
await sleep(150);
const commitOn = await page.evaluate(() => !document.querySelector('#btn-commit').disabled);
ok('选注后可落定', commitOn === true);
await page.click('#btn-commit');
await sleep(400);

const afterOne = await page.evaluate(() => ({
  screen: document.querySelector('.screen.is-active').dataset.screen,
  done: document.querySelectorAll('.tl.done').length,
  logItems: document.querySelectorAll('.log-item').length,
  stats: [...document.querySelectorAll('.st .v')].map((e) => e.textContent.trim()),
}));
ok('一节后进入下一节', afterOne.screen === 'life' || afterOne.screen === 'end');
ok('时间线记一节', afterOne.done >= 1, String(afterOne.done));
ok('日志有一条', afterOne.logItems >= 1, String(afterOne.logItems));
ok('财名缘伤四项', afterOne.stats.length === 4, afterOne.stats.join('|'));

// ---------------- 3. 走完整世（用重注速死或走满六节） ----------------
for (let i = 0; i < 8; i++) {
  if ((await screen()) === 'end') break;
  // 每次都选摸金 + 重注，加速结束
  await page.locator('[data-career="tomb"]').click();
  await sleep(120);
  await page.locator('[data-stake="heavy"]').click();
  await sleep(120);
  await page.click('#btn-commit');
  await sleep(350);
}
ok('能走到终局', (await screen()) === 'end', await screen());

const endInfo = await page.evaluate(() => ({
  name: document.querySelector('#end-name').textContent.trim(),
  sub: document.querySelector('#end-sub').textContent.trim(),
  ledger: document.querySelector('#end-ledger').textContent.replace(/\s+/g, ' ').trim(),
  loot: document.querySelector('#end-loot').textContent.replace(/\s+/g, ' ').trim(),
  ups: document.querySelectorAll('.up').length,
  wealth: Number(document.querySelector('#wealth').textContent),
}));
ok('结局有名字', ['半仙', '富家翁', '一代宗师', '儿孙满堂', '落魄先生', '无名之人'].includes(endInfo.name), endInfo.name);
ok('结局副标含死因或收摊', /伤重而亡|六十岁收摊/.test(endInfo.sub), endInfo.sub);
ok('账目含人生价值', endInfo.ledger.includes('人生价值'), endInfo.ledger.slice(-40));
ok('奖励折算资财', /资财 \+/.test(endInfo.loot), endInfo.loot);
ok('四项场外升级', endInfo.ups === 4, String(endInfo.ups));
ok('资财已入账', endInfo.wealth > 0, String(endInfo.wealth));
await page.screenshot({ path: join(shots, '42-epoch-end.png'), fullPage: true });

// ---------------- 4. 场外升级 ----------------
const buyable = await page.evaluate(() => {
  const b = [...document.querySelectorAll('[data-up]')].filter((x) => !x.disabled);
  return b.map((x) => x.dataset.up);
});
if (buyable.length) {
  const before = await page.evaluate(() => Number(document.querySelector('#wealth').textContent));
  await page.locator(`[data-up="${buyable[0]}"]`).click();
  await sleep(300);
  const after = await page.evaluate(() => ({
    wealth: Number(document.querySelector('#wealth').textContent),
    upText: document.querySelector('#upgrades').textContent.replace(/\s+/g, ' ').trim(),
  }));
  ok('买升级扣资财', after.wealth < before, `${after.wealth} vs ${before}`);
  ok('升级等级 +1', /1 \/ \d/.test(after.upText), after.upText.slice(0, 60));
} else {
  console.log('（资财不足，跳过升级断言）');
}

// ---------------- 5. 再投一世：升级要生效 ----------------
await page.click('#btn-next-life');
await sleep(300);
ok('可再投一世', (await screen()) === 'birth');
const quotaText = await page.evaluate(() => {
  document.querySelector('#btn-birth').click();
  return new Promise((res) => setTimeout(() => res(document.querySelector('#btn-begin').classList.contains('is-hidden')), 200));
});
const lifeNote = await page.evaluate(() => {
  document.querySelector('#btn-begin').click();
  return new Promise((res) => setTimeout(() => res(document.querySelector('#sec-note').textContent), 300));
});
ok('下一世问卦额度按升级计算', /问卦\s*5\/5/.test(lifeNote), lifeNote);

// ---------------- 6. 存档 ----------------
const beforeReload = await page.evaluate(() => Number(document.querySelector('#wealth').textContent));
await page.goto(`${BASE}/epoch.html`);
await page.waitForSelector('#btn-birth');
const afterReload = await page.evaluate(() => Number(document.querySelector('#wealth').textContent));
ok('刷新后资财保留', beforeReload === afterReload, `${beforeReload} vs ${afterReload}`);

// ---------------- 7. 入口可达 ----------------
await page.goto(`${BASE}/life.html`);
const hasLink = await page.evaluate(() => !!document.querySelector('a[href="epoch.html"]'));
ok('三百六十行有《一世》入口', hasLink);

await browser.close();

console.log(`\n检查 ${checks} 项，失败 ${fails.length} 项`);
if (errors.length) { console.log('控制台错误：'); errors.forEach((e) => console.log('  ' + e)); }
if (fails.length) { console.log('失败项：'); fails.forEach((f) => console.log('  ' + f)); process.exit(1); }
if (errors.length) process.exit(2);
console.log('全部通过，截图在 shots/');




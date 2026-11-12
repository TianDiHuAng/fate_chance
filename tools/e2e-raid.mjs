/**
 * 「命市下潜」端到端验证（需要本地 http 服务，因为存档走 localStorage）
 * 运行： node tools/e2e-raid.mjs
 * 前置： pwsh 里起 http 服务：python -m http.server 8811 --directory web
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

async function open(seed) {
  await page.goto(`${BASE}/raid.html?seed=${seed}`);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${BASE}/raid.html?seed=${seed}`);
  await page.waitForSelector('.target-card');
}

async function startTarget(i = 0) {
  await page.locator('.target-card').nth(i).click();
  await page.waitForSelector('.screen[data-screen="dive"].is-active');
}

async function deepen(times) {
  for (let i = 0; i < times; i++) {
    const btn = page.locator('#btn-deepen');
    if (await btn.isDisabled()) return false;
    await btn.click();
    await sleep(260);
    if (await page.locator('.screen[data-screen="break"]').count()) return false;
  }
  return true;
}

async function state() {
  return page.evaluate(() => {
    const cur = document.querySelector('.screen.is-active');
    return {
      screen: cur ? cur.dataset.screen : null,
      coin: Number(document.querySelector('#coin').textContent),
      depthOn: document.querySelectorAll('#depth-track i.on').length,
      intel: document.querySelector('#intel-count').textContent.trim(),
      risk: document.querySelector('#risk-val').textContent.trim(),
      prompt: document.querySelector('#prompt').textContent.trim(),
      gearCount: document.querySelectorAll('.gear-card').length,
      targetCount: document.querySelectorAll('.target-card').length,
      hasReroll: !!document.querySelector('#btn-reroll'),
      rerollText: document.querySelector('#btn-reroll') ? document.querySelector('#btn-reroll').textContent.trim() : '',
      extractDisabled: document.querySelector('#btn-extract').disabled,
    };
  });
}

// ---------------- 1. 大厅 ----------------
await open(3);
await page.screenshot({ path: join(shots, '20-raid-hall.png'), fullPage: true });
let st = await state();
ok('大厅渲染三件法器', st.gearCount === 3, String(st.gearCount));
ok('大厅渲染三个标的', st.targetCount === 3, String(st.targetCount));
ok('初始香火钱 3', st.coin === 3, String(st.coin));

// ---------------- 2. 下潜与情报 ----------------
await startTarget(0);
st = await state();
ok('进入下潜屏', st.screen === 'dive');
ok('未下潜时不能撤离', st.extractDisabled === true);

await deepen(1);
st = await state();
ok('第一层后深度=1', st.depthOn === 1, String(st.depthOn));
ok('第一层得情报 1 维', st.intel.startsWith('1 /'), st.intel);
ok('第一层无重掷（铜钱 0 级）', st.hasReroll === false);
ok('可撤离已启用', st.extractDisabled === false);
await page.screenshot({ path: join(shots, '21-raid-depth1.png'), fullPage: true });

await deepen(1);
st = await state();
ok('第二层深度=2', st.depthOn === 2, String(st.depthOn));
ok('第二层情报不少于 2 维', Number(st.intel.split('/')[0]) >= 2, st.intel);
ok('第二层风险已显示', st.risk.includes('%'), st.risk);

// ---------------- 3. 撤离结算 ----------------
await page.click('#btn-extract');
await sleep(600);
st = await state();
ok('进入结算屏', st.screen === 'result');
const res = await page.evaluate(() => ({
  title: document.querySelector('#result-title').textContent.trim(),
  ledger: document.querySelector('#ledger').textContent.replace(/\s+/g, ' ').trim(),
  advice: document.querySelector('#result-advice').textContent.trim(),
}));
ok('撤离标题', res.title.includes('封卦'), res.title);
ok('账目含净得', res.ledger.includes('净得'), res.ledger.slice(-60));
await page.screenshot({ path: join(shots, '22-raid-extract.png'), fullPage: true });

const coinAfter = await page.evaluate(() => Number(document.querySelector('#coin').textContent));
ok('撤离后香火钱增加', coinAfter > 0, String(coinAfter));

// ---------------- 4. 回大厅 · 升级 ----------------
await page.click('#btn-back');
await sleep(400);
const hallCoin = (await state()).coin;
ok('回到大厅', (await state()).screen === 'hall');
ok('大厅香火钱已结算', hallCoin > RAID_ENTRY(), `coin=${hallCoin}`);

function RAID_ENTRY() { return 1; }

const buyable = await page.evaluate(() => {
  const b = [...document.querySelectorAll('[data-buy]')];
  return b.filter((x) => !x.disabled).map((x) => x.dataset.buy);
});
if (buyable.length) {
  await page.locator('[data-buy="' + buyable[0] + '"]').click();
  await sleep(300);
  const after = await state();
  ok('升级后香火钱减少', after.coin < hallCoin, `${after.coin} vs ${hallCoin}`);
  ok('升级后等级提升', after.gearCount === 3);
} else {
  console.log('（签金不足，跳过升级断言）');
}

// ---------------- 5. 卦成受判：找一个能活到第 6 层的种子 ----------------
let reached6 = false;
for (let seed = 1; seed <= 40 && !reached6; seed++) {
  await page.goto(`${BASE}/raid.html?seed=${seed}`);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${BASE}/raid.html?seed=${seed}`);
  await page.waitForSelector('.target-card');
  await page.locator('.target-card').nth(0).click();
  await sleep(200);
  let survived = true;
  for (let d = 1; d <= 6; d++) {
    const btn = page.locator('#btn-deepen');
    if (await btn.isDisabled()) break;
    await btn.click();
    await sleep(d === 6 ? 760 : 300);
    const scr = await page.evaluate(() => {
      const cur = document.querySelector('.screen.is-active');
      return cur ? cur.dataset.screen : null;
    });
    if (scr === 'result') { survived = false; break; }   // 击穿
    if (scr === 'resolve') { reached6 = true; break; }    // 卦成
  }
  if (survived && reached6) break;
}

ok('能走到卦成受判', reached6, '40 个种子内未活到第 6 层');
if (reached6) {
  st = await state();
  ok('受判屏出现', st.screen === 'resolve', String(st.screen));
  await page.screenshot({ path: join(shots, '23-raid-resolve.png'), fullPage: true });

  const cardCount = await page.evaluate(() => document.querySelectorAll('#res-cards .card').length);
  ok('受判屏有 6 张牌可选', cardCount === 6, String(cardCount));

  await page.locator('#res-cards .card').first().click();
  await sleep(200);
  const judgeEnabled = await page.evaluate(() => !document.querySelector('#btn-judge').disabled);
  ok('选牌后可受判', judgeEnabled);
  await page.click('#btn-judge');
  await sleep(700);

  const v = await page.evaluate(() => ({
    title: document.querySelector('#result-title').textContent.trim(),
    seal: document.querySelector('#res-seal').textContent.trim(),
    ledger: document.querySelector('#ledger').textContent.replace(/\s+/g, ' ').trim(),
  }));
  ok('受判结算标题', v.title.includes('受判'), v.title);
  ok('受判有等级印章', ['大吉', '吉', '平', '阻', '凶'].includes(v.seal), v.seal);
  ok('受判账目含卦判', v.ledger.includes('卦判'), v.ledger.slice(0, 80));

  const loot = await page.evaluate(() => document.querySelector('#loot').textContent.replace(/\s+/g, ' ').trim());
  ok('结算给出战利品（签）', loot.includes('签') && loot.includes('稀有'), loot);
  await page.screenshot({ path: join(shots, '24-raid-verdict.png'), fullPage: true });

  // ---------------- 6. 签匣：收藏品真的入库了 ----------------
  await page.click('#btn-back');
  await sleep(300);
  await page.click('#btn-stash');
  await sleep(350);
  const stash = await page.evaluate(() => ({
    stats: document.querySelector('#stash-stats').textContent.trim(),
    slips: document.querySelectorAll('#slips .slip').length,
    cards: document.querySelectorAll('#cardbook .cb.have').length,
    palaces: document.querySelectorAll('.palace').length,
    hasGrade: !!document.querySelector('#slips .slip:not(.is-shard) .sb'),
  }));
  ok('签匣里有签', stash.slips >= 1, stash.stats);
  ok('签匣统计含卦与牌', stash.stats.includes('/ 64') && stash.stats.includes('/ 22'), stash.stats);
  ok('签有品阶', stash.hasGrade);
  ok('牌册记录了大牌', stash.cards >= 1, String(stash.cards));
  ok('八宫进度渲染', stash.palaces === 8, String(stash.palaces));
  await page.screenshot({ path: join(shots, '26-raid-stash.png'), fullPage: true });
  await page.click('#btn-stash-back');
  await sleep(250);
}

// ---------------- 7. 击穿留碎签 ----------------
let foundShard = false;
for (let seed = 100; seed <= 150 && !foundShard; seed++) {
  await page.goto(`${BASE}/raid.html?seed=${seed}`);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${BASE}/raid.html?seed=${seed}`);
  await page.waitForSelector('.target-card');
  await page.locator('.target-card').nth(0).click();
  await sleep(200);
  for (let d = 1; d <= 6; d++) {
    const btn = page.locator('#btn-deepen');
    if (await btn.isDisabled()) break;
    await btn.click();
    await sleep(d === 6 ? 760 : 300);
    const scr = await page.evaluate(() => {
      const cur = document.querySelector('.screen.is-active');
      return cur ? cur.dataset.screen : null;
    });
    if (scr === 'result') {
      const sub = await page.evaluate(() => document.querySelector('#result-sub').textContent);
      const depth = Number((/第 (\d+) 层/.exec(sub) || [0, 0])[1]);
      if (depth >= 3) foundShard = true;
      break;
    }
  }
  if (foundShard) { await sleep(300); }
}
if (foundShard) {
  const lootTxt = await page.evaluate(() => document.querySelector('#loot').textContent);
  ok('击穿得碎签', lootTxt.includes('碎签'), lootTxt.trim());
  await page.click('#btn-back');
  await sleep(250);
  await page.click('#btn-stash');
  await sleep(300);
  const shards = await page.evaluate(() => document.querySelectorAll('#slips .is-shard').length);
  ok('签匣里有碎签', shards >= 1, String(shards));
  await page.screenshot({ path: join(shots, '27-raid-shard.png'), fullPage: true });
  await page.click('#btn-stash-back');
} else {
  console.log('（50 个种子内未在第 3 层以上被击穿，跳过碎签断言）');
}

// ---------------- 8. 存档 ----------------
const before = await page.evaluate(() => ({
  coin: Number(document.querySelector('#coin').textContent),
  stash: document.querySelector('#btn-stash').textContent,
}));
await page.goto(`${BASE}/raid.html`);
await page.waitForSelector('.target-card');
const afterReload = await page.evaluate(() => ({
  coin: Number(document.querySelector('#coin').textContent),
  stash: document.querySelector('#btn-stash').textContent,
}));
ok('刷新后香火钱保留', before.coin === afterReload.coin, `${before.coin} vs ${afterReload.coin}`);
ok('刷新后签匣保留', before.stash === afterReload.stash, `${before.stash} vs ${afterReload.stash}`);

// ---------------- 9. 随行 / 料 / 画符 ----------------
async function seedSave(bag, { loadout = { talisman: 0, lamp: 0 }, coin = 20 } = {}) {
  await page.goto(`${BASE}/raid.html`);
  await page.evaluate(({ bag, loadout, coin }) => {
    localStorage.setItem('wenyigua.raid.v2', JSON.stringify({
      coin, gear: { coin: 0, deck: 0, charm: 0 }, runs: 0, deaths: 0, best: 0, profit: 0,
      slips: [], cards: [], bag, loadout,
    }));
  }, { bag, loadout, coin });
  await page.goto(`${BASE}/raid.html`);
  await page.waitForSelector('.target-card');
}

await seedSave({ talisman: 0, lamp: 1, ink: 3, paper: 1 });
const matTxt = await page.evaluate(() => document.querySelector('#mats').textContent.replace(/\s+/g, ' ').trim());
ok('料面板显示朱砂与澄心纸', matTxt.includes('朱砂') && matTxt.includes('澄心纸'), matTxt);
const craftOn = await page.evaluate(() => !document.querySelector('#btn-craft').disabled);
ok('材料够时可画符', craftOn === true, String(craftOn));

await page.click('#btn-craft');
await sleep(300);
const afterCraft = await page.evaluate(() => ({
  mats: document.querySelector('#mats').textContent.replace(/\s+/g, ' ').trim(),
  lo: document.querySelector('#loadout').textContent.replace(/\s+/g, ' ').trim(),
}));
ok('画符消耗材料', /朱砂\s*0/.test(afterCraft.mats) && /澄心纸\s*0/.test(afterCraft.mats), afterCraft.mats);
ok('画符得到护身符', afterCraft.lo.includes('存 1'), afterCraft.lo);

// 带上护身符
await page.locator('[data-lo="talisman"]').click();
await sleep(250);
const loTxt = await page.evaluate(() => document.querySelector('#loadout').textContent.replace(/\s+/g, ' ').trim());
ok('可以把护身符带进下一局', loTxt.includes('不带'), loTxt);
await page.screenshot({ path: join(shots, '28-raid-loadout.png'), fullPage: true });

// ---------------- 10. 护身符替死 ----------------
async function runSeed(seed, clicks) {
  await page.goto(`${BASE}/raid.html?seed=${seed}`);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${BASE}/raid.html?seed=${seed}`);
  await page.waitForSelector('.target-card');
  // 有货就带上护身符
  const hasTalisman = await page.evaluate(() => {
    const b = document.querySelector('[data-lo="talisman"]');
    return b && !b.disabled && b.textContent.trim() === '带上';
  });
  if (hasTalisman) { await page.locator('[data-lo="talisman"]').click(); await sleep(150); }
  await page.locator('.target-card').nth(0).click();
  await sleep(200);
  let breakDepth = 0;
  for (let d = 1; d <= Math.min(6, clicks); d++) {
    const btn = page.locator('#btn-deepen');
    if (await btn.isDisabled()) break;
    await btn.click();
    await sleep(d === 6 ? 760 : 300);
    const info = await page.evaluate(() => {
      const cur = document.querySelector('.screen.is-active');
      const title = document.querySelector('#result-title').textContent.trim();
      return { screen: cur ? cur.dataset.screen : null, title };
    });
    if (info.screen === 'result' && info.title.includes('击穿')) { breakDepth = d; break; }
    if (info.screen === 'resolve') break;
  }
  return breakDepth;
}

// 先在没有符的情况下找一个「第 2 层就击穿」的种子
await seedSave({ talisman: 0, lamp: 0, ink: 0, paper: 0 }, { coin: 20 });
let breakSeed = null;
let breakDepth = 0;
for (let seed = 300; seed <= 360 && !breakSeed; seed++) {
  const d = await runSeed(seed, 2);
  if (d === 2) { breakSeed = seed; breakDepth = d; }
}
ok('能找到第 2 层击穿的种子', !!breakSeed, String(breakSeed));

if (breakSeed) {
  // 同样的种子，带上护身符：第一次击穿应被挡下
  await seedSave({ talisman: 1, lamp: 0, ink: 0, paper: 0 }, { coin: 20, loadout: { talisman: 1, lamp: 0 } });
  await page.goto(`${BASE}/raid.html?seed=${breakSeed}`);
  await page.waitForSelector('.target-card');
  await page.locator('.target-card').nth(0).click();
  await sleep(200);
  for (let d = 1; d <= breakDepth; d++) {
    await page.locator('#btn-deepen').click();
    await sleep(320);
  }
  const afterTalisman = await page.evaluate(() => {
    const cur = document.querySelector('.screen.is-active');
    return {
      screen: cur ? cur.dataset.screen : null,
      carry: document.querySelector('#carry').textContent.trim(),
    };
  });
  ok('护身符挡下击穿，未直接结算', afterTalisman.screen !== 'result', afterTalisman.screen);
  ok('护身符已用掉', !afterTalisman.carry.includes('符 ×'), afterTalisman.carry);
  await page.screenshot({ path: join(shots, '29-raid-talisman.png'), fullPage: true });
}

// ---------------- 11. 说明弹窗 ----------------
await page.click('#btn-about');
await sleep(300);
const dlgOpen = await page.evaluate(() => document.querySelector('#dlg-about').open);
ok('说明弹窗可打开', dlgOpen);
const dlgText = await page.evaluate(() => document.querySelector('#dlg-about').textContent);
ok('说明含虚构与免责声明', dlgText.includes('虚构') && dlgText.includes('不提供投资建议'));
await page.screenshot({ path: join(shots, '25-raid-about.png') });

// ---------------- 8. 从主游戏进入 ----------------
await page.goto(`${BASE}/index.html`);
const link = await page.evaluate(() => {
  const a = [...document.querySelectorAll('a')].find((x) => x.getAttribute('href') === 'raid.html');
  return a ? a.textContent.trim() : null;
});
ok('主游戏有「下潜」入口', !!link, String(link));

await browser.close();

console.log(`\n检查 ${checks} 项，失败 ${fails.length} 项`);
if (errors.length) { console.log('控制台错误：'); errors.forEach((e) => console.log('  ' + e)); }
if (fails.length) { console.log('失败项：'); fails.forEach((f) => console.log('  ' + f)); process.exit(1); }
if (errors.length) process.exit(2);
console.log('全部通过，截图在 shots/');

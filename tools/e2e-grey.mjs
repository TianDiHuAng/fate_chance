/**
 * 灰底原型端到端验证
 * 运行： node tools/e2e-grey.mjs
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

async function hold(sel) {
  const box = await page.locator(sel).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await sleep(950);
  await page.mouse.up();
  await sleep(250);
}

await page.goto(`${BASE}/grey.html`);
await page.waitForSelector('#hold1');

// ---------------- 出生 ----------------
ok('出生屏可见', await page.locator('#s-birth').isVisible());
await hold('#hold1');
const afterA = await page.evaluate(() => ({
  yao: document.querySelectorAll('#yao1 span').length,
  box2: getComputedStyle(document.querySelector('#box2')).display !== 'none',
}));
ok('摇出三爻', afterA.yao === 3, String(afterA.yao));
ok('出现第二组', afterA.box2 === true);

await hold('#hold2');
const afterB = await page.evaluate(() => ({
  yao: document.querySelectorAll('#yao2 span').length,
  picks: document.querySelectorAll('#pickWrap button').length,
  startDisabled: document.querySelector('#btnStart').disabled,
}));
ok('摇出第二组三爻', afterB.yao === 3, String(afterB.yao));
ok('给出两个本命可选', afterB.picks === 2, String(afterB.picks));
ok('未选本命时不能开始', afterB.startDisabled === true);
await page.screenshot({ path: join(shots, '50-grey-birth.png'), fullPage: true });

await page.locator('#pickWrap button').first().click();
await sleep(150);
await page.click('#btnStart');
await sleep(300);

// ---------------- 第一节 ----------------
const runVisible = await page.locator('#s-run').isVisible();
ok('进入第一节', runVisible === true);
const bar = await page.evaluate(() => ({
  life: document.querySelectorAll('#life i').length,
  label: document.querySelector('#secLabel').textContent,
}));
ok('命灯 12 格', bar.life === 12, String(bar.life));
ok('显示节次与月令', /第.节/.test(bar.label) && /月令/.test(bar.label), bar.label);

await hold('#hold3');
const evidence = await page.evaluate(() => ({
  hex: document.querySelector('#hexName').textContent.trim(),
  judge: document.querySelector('#hexJudge').textContent.trim(),
  gua: document.querySelector('#evGua').textContent.replace(/\s+/g, ' ').trim(),
  month: document.querySelector('#evMonth').textContent.replace(/\s+/g, ' ').trim(),
  card: document.querySelector('#evCard').textContent.replace(/\s+/g, ' ').trim(),
  cards: document.querySelectorAll('#cardsWrap .card').length,
  hasAnswer: /得势|押中/.test(document.querySelector('#p-ev').textContent),
}));
ok('出卦名', evidence.hex.length >= 2, evidence.hex);
ok('出象辞与动静', evidence.judge.includes('「'), evidence.judge.slice(0, 40));
ok('证据一：卦指', evidence.gua.includes('指') && evidence.gua.includes('卦指') === false, evidence.gua);
ok('证据二：月令双卡旺衰', evidence.month.includes('旺') || evidence.month.includes('死'), evidence.month);
ok('证据三：牌', evidence.card.includes('《'), evidence.card);
ok('两张卡可选', evidence.cards === 2, String(evidence.cards));
ok('证据区不含答案', evidence.hasAnswer === false);

const twoCards = await page.evaluate(() =>
  [...document.querySelectorAll('#cardsWrap .card .cn')].map((e) => e.textContent.replace(/◀ 卦指/g, '').trim()));
ok('两张卡必是不同行当', twoCards[0] !== twoCards[1], twoCards.join(' vs '));
await page.screenshot({ path: join(shots, '51-grey-evidence.png'), fullPage: true });

// 断 + 注
const goDisabled = await page.evaluate(() => document.querySelector('#btnGo').disabled);
ok('未选前不能落定', goDisabled === true);

await page.locator('#cardsWrap .card').first().click();
await sleep(120);
await page.locator('[data-stake="mid"]').click();
await sleep(150);
const hint = await page.evaluate(() => ({
  text: document.querySelector('#pickHint').textContent.replace(/\s+/g, ' ').trim(),
  go: document.querySelector('#btnGo').disabled,
}));
ok('选卡选注后显示代价', hint.text.includes('命 −'), hint.text);
ok('可以落定', hint.go === false);
await page.screenshot({ path: join(shots, '52-grey-pick.png'), fullPage: true });

await page.click('#btnGo');
await sleep(300);

// 揭晓
const reveal = await page.evaluate(() => ({
  visible: getComputedStyle(document.querySelector('#p-reveal')).display !== 'none',
  who: document.querySelector('#rvWho').textContent.trim(),
  result: document.querySelector('#rvResult').textContent.trim(),
  why: document.querySelector('#rvWhy').textContent.replace(/\s+/g, ' ').trim(),
  life: Number(document.querySelector('#lifeNum').dataset.life),
}));
ok('揭晓得势', reveal.visible === true && reveal.who.length > 0, reveal.who);
ok('揭晓给出中/空', /押中|押空/.test(reveal.result), reveal.result);
ok('揭晓解释为什么', reveal.why.includes('月令') && reveal.why.includes('卦指'), reveal.why.slice(0, 60));
ok('揭晓会指出哪片说对了', /这一次/.test(reveal.why), reveal.why.slice(-50));
ok('落定后命灯有变化（中注 −1，土命中 +2 或押空再 −1）', reveal.life !== 12, String(reveal.life));
await page.screenshot({ path: join(shots, '53-grey-reveal.png'), fullPage: true });

// ---------------- 走完六节 ----------------
for (let i = 2; i <= 6; i++) {
  const btnText = await page.evaluate(() => document.querySelector('#btnNext').textContent);
  if (btnText.includes('到头')) break;
  await page.click('#btnNext');
  await sleep(250);
  const alive = await page.locator('#s-run').isVisible();
  if (!alive) break;
  await hold('#hold3');
  const stillRun = await page.locator('#s-run').isVisible();
  if (!stillRun) break;
  await page.locator('#cardsWrap .card').first().click();
  await sleep(100);
  await page.locator('[data-stake="light"]').click();
  await sleep(120);
  await page.click('#btnGo');
  await sleep(250);
}

// 结算
await page.evaluate(() => {
  const b = document.querySelector('#btnNext');
  if (b && !b.textContent.includes('到头')) b.click();
});
await sleep(400);
let ended = await page.locator('#s-end').isVisible();
if (!ended) {
  // 若还在跑，直接点到结算
  for (let i = 0; i < 8 && !ended; i++) {
    const next = page.locator('#btnNext');
    if (await next.count() && await next.isVisible()) await next.click();
    await sleep(250);
    const run = await page.locator('#s-run').isVisible();
    if (run) {
      const holdEl = page.locator('#hold3');
      if (await holdEl.isVisible() && await holdEl.evaluate((e) => getComputedStyle(e).pointerEvents !== 'none')) {
        await hold('#hold3');
        if (await page.locator('#cardsWrap .card').count()) {
          await page.locator('#cardsWrap .card').first().click();
          await sleep(100);
          await page.locator('[data-stake="light"]').click();
          await sleep(120);
          await page.click('#btnGo');
          await sleep(250);
        }
      }
    }
    ended = await page.locator('#s-end').isVisible();
  }
}

ok('能走到结算', ended === true);
const endInfo = await page.evaluate(() => ({
  name: document.querySelector('#endName').textContent.trim(),
  logRows: document.querySelectorAll('#endLog div').length,
}));
ok('结算给出结局', ['富家翁', '一代宗师', '儿孙满堂', '半仙', '落魄先生', '无名之人'].includes(endInfo.name), endInfo.name);
ok('结算列出这一世的卦', endInfo.logRows >= 1, String(endInfo.logRows));
await page.screenshot({ path: join(shots, '54-grey-end.png'), fullPage: true });

// ---------------- 再来一世 ----------------
await page.click('#btnAgain');
await sleep(300);
const restarted = await page.evaluate(() => ({
  birth: getComputedStyle(document.querySelector('#s-birth')).display !== 'none',
  bar: getComputedStyle(document.querySelector('#bar')).display === 'none',
  yao1: document.querySelectorAll('#yao1 span').length,
}));
ok('可以重开一世', restarted.birth === true && restarted.yao1 === 0, JSON.stringify(restarted));

await browser.close();

console.log(`\n检查 ${checks} 项，失败 ${fails.length} 项`);
if (errors.length) { console.log('控制台错误：'); errors.forEach((e) => console.log('  ' + e)); }
if (fails.length) { console.log('失败项：'); fails.forEach((f) => console.log('  ' + f)); process.exit(1); }
if (errors.length) process.exit(2);
console.log('全部通过，截图在 shots/');

/**
 * 《一世》互动版端到端验证
 * 运行： node tools/e2e-story.mjs
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
  await sleep(300);
}
const visible = (sel) => page.locator(sel).isVisible();

await page.goto(`${BASE}/story.html`);
await page.waitForSelector('#b0');

// ---------------- 起念 ----------------
ok('首页可见', await visible('#s0'));
await page.fill('#q', '今年该不该换地方');
await page.click('#b0');
await sleep(300);
ok('进入出生屏', await visible('#s1'));

// ---------------- 出生 ----------------
await hold('#h1');
const a1 = await page.evaluate(() => document.querySelectorAll('#y1 .ln').length);
ok('摇出三爻', a1 === 3, String(a1));
ok('出现第二组', await visible('#w2'));

await hold('#h2');
const a2 = await page.evaluate(() => document.querySelectorAll('#y2 .ln').length);
ok('第二组三爻', a2 === 3, String(a2));
const picks = await page.evaluate(() => document.querySelectorAll('#pickWrap button').length);
ok('两个底子可选', picks === 2, String(picks));
ok('未选不能开始', await page.evaluate(() => document.querySelector('#b1').disabled));
await page.screenshot({ path: join(shots, '60-story-birth.png'), fullPage: true });

await page.locator('#pickWrap button').first().click();
await sleep(150);
await page.click('#b1');
await sleep(350);
ok('进入第一节', await visible('#s2'));

// ---------------- 第一节 ----------------
const age0 = await page.evaluate(() => document.querySelector('#ageLead').textContent.trim());
ok('显示十七岁', age0.includes('十七'), age0);

await hold('#h3');
await sleep(600);
const hex = await page.evaluate(() => ({
  shown: getComputedStyle(document.querySelector('#hexBox')).display !== 'none',
  name: document.querySelector('#hexN').textContent.trim(),
  meta: document.querySelector('#hexT').textContent.trim(),
  judge: document.querySelector('#hexJ').textContent.trim(),
  scene: document.querySelector('#sceneTxt').textContent.trim(),
  echo: document.querySelector('#echoTxt').textContent.replace(/\s+/g, ' ').trim(),
  hasChoose: document.querySelectorAll('#sceneBox [data-a]').length,
  hasNumbers: /命灯|押注|伤害|生命值|\d+\s*\/\s*12/.test(document.body.textContent),
}));
ok('出卦名', hex.shown && hex.name.length >= 2, hex.name);
ok('卦名是真卦（含上下卦信息）', hex.meta.includes('上') && hex.meta.includes('下'), hex.meta);
ok('出象辞', hex.judge.includes('「'), hex.judge.slice(0, 30));
ok('出事境叙述', hex.scene.length > 10, hex.scene.slice(0, 30));
ok('出底子与外应', hex.echo.includes('外应'), hex.echo.slice(0, 40));
ok('两个选择', hex.hasChoose === 2, String(hex.hasChoose));
ok('没有任何游戏数值', hex.hasNumbers === false, '页面出现了命灯/押注类文字');
await page.screenshot({ path: join(shots, '61-story-scene.png'), fullPage: true });

// ---------------- 选择 ----------------
await page.click('#sceneBox [data-a="jin"]');
await sleep(300);
const out1 = await page.evaluate(() => ({
  shown: getComputedStyle(document.querySelector('#outBox')).display !== 'none',
  act: document.querySelector('#actWord').textContent.trim(),
  out: document.querySelector('#outTxt').textContent.trim(),
  after: document.querySelector('#afterTxt').textContent.trim(),
  next: document.querySelector('#b2').textContent.trim(),
}));
ok('选择后出后果', out1.shown && out1.out.length > 20, out1.out.slice(0, 30));
ok('标明选了进', out1.act === '进', out1.act);
ok('有一句多年之后的回声', out1.after.length > 8, out1.after.slice(0, 30));
ok('"继续"可点', out1.next === '继续', out1.next);
await page.screenshot({ path: join(shots, '62-story-outcome.png'), fullPage: true });

// ---------------- 走完六节 ----------------
for (let i = 2; i <= 6; i++) {
  await page.click('#b2');
  await sleep(300);
  const stillRun = await visible('#s2');
  if (!stillRun) break;
  await hold('#h3');
  await sleep(600);
  const act = i % 2 === 0 ? 'jin' : 'shou';
  await page.click(`#sceneBox [data-a="${act}"]`);
  await sleep(250);
}

await page.evaluate(() => {
  const b = document.querySelector('#b2');
  if (b && b.textContent.includes('六十')) b.click();
});
await sleep(400);
if (!(await visible('#s3'))) { await page.click('#b2'); await sleep(400); }

ok('走到收束', await visible('#s3'));
const fin = await page.evaluate(() => ({
  rows: document.querySelectorAll('#chron li').length,
  endName: document.querySelector('#endName').textContent.trim(),
  endSub: document.querySelector('#endSub').textContent.trim(),
  endTxt: document.querySelector('#endTxt').textContent.trim(),
  galHd: document.querySelector('#galHd').textContent.trim(),
  galSlots: document.querySelectorAll('#galGrid .g1').length,
  galGot: document.querySelectorAll('#galGrid .g1.got, #galGrid .g1.now').length,
  v2: document.querySelector('#verdict2').textContent.replace(/\s+/g, ' ').trim(),
  hasQ: document.querySelector('#verdict2').textContent.includes('该不该换地方'),
}));
ok('年表六行', fin.rows === 6, String(fin.rows));
ok('给出结局名', ['焰','刃','秤','渡','堰','井','石'].includes(fin.endName), fin.endName);
ok('结局副标含进守次数', /进 \d 次/.test(fin.endSub) && /守 \d 次/.test(fin.endSub), fin.endSub);
ok('结局有正文', fin.endTxt.length > 20, fin.endTxt.slice(0, 30));
ok('结局图鉴七个格', fin.galSlots === 7, String(fin.galSlots));
ok('本次结局计入图鉴', fin.galGot >= 1, String(fin.galGot));
ok('图鉴计数正确', /1 \/ 7/.test(fin.galHd), fin.galHd);
ok('回响底子与事境', fin.v2.length > 15, fin.v2.slice(0, 30));
ok('记得起念时问的事', fin.hasQ === true, fin.v2.slice(-40));
await page.screenshot({ path: join(shots, '63-story-end.png'), fullPage: true });

// ---------------- 再来一世 ----------------
await page.click('#b3');
await sleep(350);
const again = await page.evaluate(() => ({
  home: getComputedStyle(document.querySelector('#s0')).display !== 'none',
  q: document.querySelector('#q').value,
  yao1: document.querySelectorAll('#y1 .ln').length,
}));
ok('可以重开', again.home === true, JSON.stringify(again.home));
ok('清空上一次的输入与卦', again.q === '' && again.yao1 === 0, JSON.stringify(again));

await browser.close();

console.log(`\n检查 ${checks} 项，失败 ${fails.length} 项`);
if (errors.length) { console.log('控制台错误：'); errors.forEach((e) => console.log('  ' + e)); }
if (fails.length) { console.log('失败项：'); fails.forEach((f) => console.log('  ' + f)); process.exit(1); }
if (errors.length) process.exit(2);
console.log('全部通过，截图在 shots/');

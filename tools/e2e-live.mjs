import { chromium } from 'playwright-core';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, existsSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const shots = join(root, 'shots');
if (!existsSync(shots)) mkdirSync(shots, { recursive: true });

const LIVE = 'https://tiandihuang.github.io/fate_chance';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let checks = 0;
const fails = [];
const ok = (n, c, d) => { checks++; if (!c) fails.push(`${n}${d ? ' :: ' + d : ''}`); };

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 430, height: 940 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push('[console] ' + m.text()); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
page.on('requestfailed', (r) => errors.push('[404] ' + r.url()));

async function hold(sel) {
  const box = await page.locator(sel).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await sleep(950);
  await page.mouse.up();
  await sleep(320);
}

// ---------- 1. 首页 ----------
await page.goto(LIVE + '/', { waitUntil: 'networkidle' });
const home = await page.evaluate(() => ({
  title: document.title,
  hasDomain: !!document.querySelector('#domains .chip'),
}));
ok('首页能打开', home.title.length > 0, home.title);
ok('首页脚本已初始化', home.hasDomain === true);
await page.screenshot({ path: join(shots, '70-live-index.png'), fullPage: true });

// ---------- 2. story.html 跑完整一世 ----------
await page.goto(LIVE + '/story.html', { waitUntil: 'networkidle' });
await page.waitForSelector('#b0');
ok('互动版能打开', await page.locator('#s0').isVisible());

await page.fill('#q', '线上验证');
await page.click('#b0');
await sleep(250);
await hold('#h1');
await hold('#h2');
const picks = await page.evaluate(() => document.querySelectorAll('#pickWrap button').length);
ok('线上摇卦出两个底子', picks === 2, String(picks));

await page.locator('#pickWrap button').first().click();
await sleep(120);
await page.click('#b1');
await sleep(300);

for (let i = 1; i <= 6; i++) {
  await hold('#h3');
  await sleep(650);
  const hasScene = await page.evaluate(() =>
    getComputedStyle(document.querySelector('#sceneBox')).display !== 'none');
  ok(`第 ${i} 节出事境`, hasScene === true);
  await page.click(i % 2 === 0 ? '#sceneBox [data-a="jin"]' : '#sceneBox [data-a="shou"]');
  await sleep(220);
  // 第六节的按钮写着「走到六十岁」，也要点
  await page.click('#b2');
  await sleep(320);
}

const end = await page.evaluate(() => ({
  screen: getComputedStyle(document.querySelector('#s3')).display !== 'none',
  name: document.querySelector('#endName').textContent.trim(),
  rows: document.querySelectorAll('#chron li').length,
  gal: document.querySelector('#galHd').textContent.trim(),
}));
ok('线上能走到结局', end.screen === true);
ok('线上结局有名有姓', ['焰','刃','秤','渡','堰','井','石'].includes(end.name), end.name);
ok('线上年表六行', end.rows === 6, String(end.rows));
ok('线上图鉴已记录', /1 \/ 7/.test(end.gal), end.gal);
await page.screenshot({ path: join(shots, '71-live-story-end.png'), fullPage: true });

// ---------- 3. 其余五个页面都能起来 ----------
for (const [file, sel, label] of [
  ['grey.html', '#hold1', '灰底原型'],
  ['epoch.html', '#btn-birth', '一世游戏版'],
  ['raid.html', '.target-card', '命市下潜'],
  ['life.html', '.career', '三百六十行'],
]) {
  const before = errors.length;
  await page.goto(`${LIVE}/${file}`, { waitUntil: 'networkidle' });
  const has = await page.locator(sel).count();
  ok(`${label} 能打开`, has > 0, `selector ${sel}`);
  ok(`${label} 无加载错误`, errors.length === before, errors.slice(before).join(' | '));
}

await browser.close();

console.log(`\n线上检查 ${checks} 项，失败 ${fails.length} 项`);
const real = errors.filter((e) => !e.includes('favicon'));
if (real.length) { console.log('页面错误：'); real.forEach((e) => console.log('  ' + e)); }
if (fails.length) { fails.forEach((f) => console.log('  ✗ ' + f)); process.exit(1); }
console.log('线上全部正常');

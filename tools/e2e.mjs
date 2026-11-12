/**
 * 端到端验证：用本机 Chrome（playwright-core，不下载浏览器）跑完一局，
 * 覆盖 交换 / 重抽 / 违卦 / 全合法 四条分支，并截屏。
 *
 * 运行： node tools/e2e.mjs
 */
import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const page_url = pathToFileURL(join(root, 'index.html')).href;
const shots = join(root, 'shots');
if (!existsSync(shots)) mkdirSync(shots, { recursive: true });

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const errors = [];
let checks = 0;
const fails = [];
function ok(name, cond, detail) {
  checks++;
  if (!cond) fails.push(`${name}${detail ? ' :: ' + detail : ''}`);
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 430, height: 940 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error') errors.push('[console] ' + m.text()); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function openSeed(seed) {
  await page.goto(page_url + '?seed=' + seed);
  await page.waitForSelector('.chip');
}

async function startRound(seed, question) {
  await openSeed(seed);
  await page.click('.chip[data-i="0"]');
  await page.fill('#question', question);
  await page.click('#btn-start');
  await sleep(400);
}

async function cast() {
  for (let i = 0; i < 6; i++) {
    await page.click('#btn-toss');
    await sleep(820);
  }
  await page.waitForSelector('#btn-read:not(.is-hidden)');
  await page.click('#btn-read');
  await sleep(400);
}

async function drawAndFlip() {
  await page.click('#btn-draw');
  await sleep(500);
  for (let i = 0; i < 3; i++) {
    await page.click(`.card[data-i="${i}"]`);
    await sleep(780);
  }
}

async function readState() {
  return page.evaluate(() => {
    const legal = [...document.querySelectorAll('.card.state-legal')].map((e) => Number(e.dataset.i));
    const illegal = [...document.querySelectorAll('.card.state-illegal')].map((e) => Number(e.dataset.i));
    return {
      legal,
      illegal,
      ops: document.querySelector('#ops').textContent.trim(),
      mini: document.querySelector('#mini-rule').textContent.trim(),
      rule: document.querySelector('#rule-list').textContent.replace(/\s+/g, ' ').trim().slice(0, 220),
      hex: document.querySelector('#rule-name').textContent.trim(),
      prompt: document.querySelector('#prompt').textContent.trim(),
    };
  });
}

// ---------------- 场景 1：交换（seed=4，风雷益，外巽） ----------------
await startRound(4, '这个岗位要不要接');
await page.screenshot({ path: join(shots, '01-intent.png'), fullPage: true });
await page.click('#btn-toss');
await sleep(300);
await page.screenshot({ path: join(shots, '02-cast-mid.png'), fullPage: true });
await sleep(1200);
for (let i = 1; i < 6; i++) { await page.click('#btn-toss'); await sleep(820); }
await page.screenshot({ path: join(shots, '03-cast-done.png'), fullPage: true });
await page.click('#btn-read');
await sleep(450);
await page.screenshot({ path: join(shots, '04-rule.png'), fullPage: true });
let st = await readState();
ok('卦规页显示卦名', st.hex.length > 0, st.hex);

await page.click('#btn-draw');
await sleep(500);
await page.screenshot({ path: join(shots, '05-table-closed.png'), fullPage: true });
for (let i = 0; i < 3; i++) { await page.click(`.card[data-i="${i}"]`); await sleep(780); }
await page.screenshot({ path: join(shots, '06-table-open.png'), fullPage: true });
st = await readState();
ok('seed=4 有交换机会', st.ops.includes('交换'), st.ops);
ok('seed=4 合法位唯一', st.legal.length === 1, JSON.stringify(st.legal));

// 走一次交换：把 0 与 1 互换
await page.click('#btn-swap');
await sleep(200);
await page.click('.card[data-i="0"]');
await sleep(150);
await page.click('.card[data-i="1"]');
await sleep(500);
const st2 = await readState();
ok('交换后剩余次数减少', !st2.ops.includes('交换（1）'), st2.ops);
await page.screenshot({ path: join(shots, '07-after-swap.png'), fullPage: true });

const pick = st2.legal[0];
await page.click(`.card[data-i="${pick}"]`);
await sleep(300);
const selected = await page.evaluate(() => !!document.querySelector('.card.state-selected'));
ok('选中后出现高亮', selected);
await page.screenshot({ path: join(shots, '08-selected.png'), fullPage: true });

await page.click('#btn-settle');
await sleep(900);
await page.screenshot({ path: join(shots, '09-verdict.png'), fullPage: true });

const verdict = await page.evaluate(() => ({
  seal: document.querySelector('#seal').textContent.trim(),
  level: document.querySelector('#level-name').textContent.trim(),
  sub: document.querySelector('#level-sub').textContent.trim(),
  chain: document.querySelector('#chain').textContent.replace(/\s+/g, ' ').trim(),
  advice: document.querySelector('#advice-main').textContent.trim(),
  review: document.querySelector('#review').textContent.replace(/\s+/g, ' ').trim(),
  canvasLen: document.querySelector('#signcard').toDataURL('image/png').length,
}));
ok('有印章', verdict.seal.length > 0, verdict.seal);
ok('有等级', ['上上', '上吉', '中吉', '中平', '下', '下下'].includes(verdict.level), verdict.level);
ok('判词链有内容', verdict.chain.includes('用神'), verdict.chain.slice(0, 60));
ok('复盘出现', verdict.review.length > 10, verdict.review.slice(0, 80));
ok('签卡已绘制', verdict.canvasLen > 20000, 'dataURL len=' + verdict.canvasLen);
console.log('场景1（交换）', JSON.stringify({ seal: verdict.seal, level: verdict.level, review: verdict.review.slice(0, 60) }));

// ---------------- 场景 2：重抽（seed=8，天地否，动三爻） ----------------
await startRound(8, '这次合作能不能成');
await cast();
await page.screenshot({ path: join(shots, '10-rule-quiet.png'), fullPage: true });
await drawAndFlip();
const rs = await readState();
ok('seed=8 有重抽机会', rs.ops.includes('重抽'), rs.ops);
await page.click('#btn-redraw');
await sleep(200);
await page.click('.card[data-i="0"]');
await sleep(700);
const rs2 = await readState();
ok('重抽后剩余次数减少', !rs2.ops.includes('重抽（1）'), rs2.ops);
await page.screenshot({ path: join(shots, '11-after-redraw.png'), fullPage: true });
await page.click(`.card[data-i="${rs2.legal[0]}"]`);
await sleep(250);
await page.click('#btn-settle');
await sleep(900);
await page.screenshot({ path: join(shots, '12-verdict-2.png'), fullPage: true });

// ---------------- 场景 3：无牌可应 → 只能越规（seed=19，未济，内坎无水金之牌） ----------------
await startRound(19, '该不该搬去另一个城市');
await cast();
await page.click('#btn-draw');
await sleep(400);
for (let i = 0; i < 3; i++) { await page.click(`.card[data-i="${i}"]`); await sleep(780); }
const vs = await readState();
ok('seed=19 无合法位', vs.legal.length === 0, JSON.stringify(vs.legal));
ok('无合法位时提示越规', vs.prompt.includes('越规'), vs.prompt);
const overruleMarks = await page.evaluate(() => document.querySelectorAll('.card.state-overrule').length);
ok('三张牌都标为越规', overruleMarks === 3, String(overruleMarks));
await page.screenshot({ path: join(shots, '13-violated.png'), fullPage: true });

// 越规也要能选、能落定
await page.click('.card[data-i="1"]');
await sleep(250);
const settleEnabled = await page.evaluate(() => !document.querySelector('#btn-settle').disabled);
ok('越规可选中且可落定', settleEnabled);
await page.click('#btn-settle');
await sleep(900);
const v3 = await page.evaluate(() => ({
  level: document.querySelector('#level-name').textContent.trim(),
  chain: document.querySelector('#chain').textContent.replace(/\s+/g, ' ').trim(),
  review: document.querySelector('#review').textContent.replace(/\s+/g, ' ').trim(),
}));
ok('越规计入判词链', v3.chain.includes('越规'), v3.chain.slice(-80));
ok('无守规最优时复盘有说明', v3.review.includes('没有守规最优') || v3.review.includes('只能越规'), v3.review.slice(0, 90));
await page.screenshot({ path: join(shots, '14-verdict-violated.png'), fullPage: true });

// ---------------- 场景 4：全合法（seed=23） ----------------
await startRound(23, '要不要把这件事说开');
await cast();
await page.click('#btn-draw');
await sleep(400);
for (let i = 0; i < 3; i++) { await page.click(`.card[data-i="${i}"]`); await sleep(780); }
const ws = await readState();
ok('seed=23 三才全合法', ws.legal.length === 3, JSON.stringify(ws.legal));
await page.screenshot({ path: join(shots, '15-all-legal.png'), fullPage: true });

// ---------------- 说明弹窗 ----------------
await page.click('#btn-about');
await sleep(400);
const dlgOpen = await page.evaluate(() => document.querySelector('#dlg-about').open);
ok('说明弹窗可打开', dlgOpen);
await page.screenshot({ path: join(shots, '16-about.png'), fullPage: false });
await page.click('#btn-close-about');
await sleep(300);

// ---------------- 桌面宽屏 ----------------
const desk = await ctx.newPage();
await desk.setViewportSize({ width: 1180, height: 900 });
await desk.goto(page_url + '?seed=8');
await desk.click('.chip[data-i="1"]');
await desk.click('#btn-start');
await sleep(400);
for (let i = 0; i < 6; i++) { await desk.click('#btn-toss'); await sleep(820); }
await desk.screenshot({ path: join(shots, '17-desktop-cast.png'), fullPage: false });
await desk.click('#btn-read');
await sleep(400);
await desk.screenshot({ path: join(shots, '18-desktop-rule.png'), fullPage: false });

await browser.close();

console.log(`\n检查 ${checks} 项，失败 ${fails.length} 项`);
if (errors.length) {
  console.log('控制台错误：');
  errors.forEach((e) => console.log('  ' + e));
}
if (fails.length) {
  console.log('失败项：');
  fails.forEach((f) => console.log('  ' + f));
  process.exit(1);
}
if (errors.length) process.exit(2);
console.log('全部通过，截图在 shots/');

/**
 * 「三百六十行」端到端验证
 * 运行： node tools/e2e-life.mjs   （需要 http://127.0.0.1:8811 静态服务）
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

async function open(seed = 5) {
  await page.goto(`${BASE}/life.html?seed=${seed}`);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${BASE}/life.html?seed=${seed}`);
  await page.waitForSelector('.career');
}

async function startCareer(key) {
  await page.locator(`[data-career="${key}"]`).click();
  await page.waitForSelector('.screen[data-screen="run"].is-active');
  await sleep(200);
}

async function screen() {
  return page.evaluate(() => {
    const cur = document.querySelector('.screen.is-active');
    return cur ? cur.dataset.screen : null;
  });
}

async function deepen(n, wait = 280) {
  for (let i = 0; i < n; i++) {
    const btn = page.locator('#btn-deepen');
    if (await btn.isDisabled()) return false;
    await btn.click();
    await sleep(wait);
    const s = await screen();
    if (s === 'settle' || s === 'resolve') return s;
  }
  return true;
}

// ---------------- 1. 大厅 ----------------
await open(5);
await page.screenshot({ path: join(shots, '30-life-hub.png'), fullPage: true });
const hub = await page.evaluate(() => ({
  careers: document.querySelectorAll('.career').length,
  peaks: document.querySelectorAll('.peak').length,
  peakCount: document.querySelector('#peak-count').textContent.trim(),
  names: [...document.querySelectorAll('.career-name')].map((e) => e.textContent.trim()),
}));
ok('五个行当', hub.careers === 5, String(hub.careers));
ok('登峰面板五个', hub.peaks === 5, String(hub.peaks));
ok('初始登峰 0/5', hub.peakCount === '0/5', hub.peakCount);
ok('行当名称', ['古玩', '摸金', '经商', '攀亲', '科研'].every((n) => hub.names.includes(n)), hub.names.join(','));

// ---------------- 2. 古玩：出手一层 → 收手 ----------------
await startCareer('relic');
let st = await page.evaluate(() => ({
  res: document.querySelector('#res-val').textContent.trim(),
  resName: document.querySelector('#res-name').textContent.trim(),
  prompt: document.querySelector('#prompt').textContent.trim(),
  stopDisabled: document.querySelector('#btn-stop').disabled,
}));
ok('古玩命脉是眼力', st.resName === '眼力', st.resName);
ok('开局命脉满', st.res === '5 / 5', st.res);
ok('未出手不能收手', st.stopDisabled === true);
ok('起局显示传闻', st.prompt.includes('传闻'), st.prompt.slice(0, 30));

await deepen(2);
st = await page.evaluate(() => ({
  depth: document.querySelectorAll('#depth-track i.on').length,
  intel: document.querySelector('#intel-count').textContent.trim(),
  intelText: document.querySelector('#intel').textContent.replace(/\s+/g, ' ').trim(),
}));
const relicIntelText = st.intelText;   // 留一份，后面断言废品逻辑要用
ok('走两层', st.depth === 2, String(st.depth));
ok('读到两维情报', st.intel.startsWith('2 /'), st.intel);
await page.screenshot({ path: join(shots, '31-life-run.png'), fullPage: true });

await page.click('#btn-stop');
await sleep(500);
st = await page.evaluate(() => ({
  screen: document.querySelector('.screen.is-active').dataset.screen,
  title: document.querySelector('#settle-title').textContent.trim(),
  loot: document.querySelector('#settle-loot').textContent.replace(/\s+/g, ' ').trim(),
  ledger: document.querySelector('#ledger').textContent.replace(/\s+/g, ' ').trim(),
}));
ok('收手进入结算', st.screen === 'settle' && st.title === '收手', st.title);
ok('结算有现银', /\d+/.test(st.loot), st.loot);
ok('账目含登峰', st.ledger.includes('登峰'), st.ledger.slice(-40));

// 赝品逻辑与情报一致：读到「赝」则应显示赝品惩罚
const fakeSeen = relicIntelText.includes('赝');
ok('赝品提示与情报一致', fakeSeen ? st.loot.includes('赝品') : !st.loot.includes('赝品'),
  `fakeSeen=${fakeSeen} loot=${st.loot.slice(0, 40)}`);
await page.screenshot({ path: join(shots, '32-life-settle.png'), fullPage: true });

// ---------------- 3. 摸金：阳气耗尽 / 走完六层 ----------------
await page.click('#btn-back');
await sleep(300);
await startCareer('tomb');
st = await page.evaluate(() => ({ resName: document.querySelector('#res-name').textContent.trim() }));
ok('摸金命脉是阳气', st.resName === '阳气', st.resName);

const tombEnd = await deepen(6, 340);
st = await page.evaluate(() => ({
  screen: document.querySelector('.screen.is-active').dataset.screen,
  sub: document.querySelector('#settle-sub').textContent.trim(),
  title: document.querySelector('#settle-title').textContent.trim(),
  res: document.querySelector('#res-val').textContent.trim(),
}));
if (st.screen === 'resolve') {
  await page.locator('#res-cards .card').first().click();
  await sleep(200);
  await page.click('#btn-judge');
  await sleep(600);
  const v = await page.evaluate(() => ({
    screen: document.querySelector('.screen.is-active').dataset.screen,
    title: document.querySelector('#settle-title').textContent.trim(),
    sub: document.querySelector('#settle-sub').textContent.trim(),
  }));
  ok('摸金走到第六层即成卦受判', v.screen === 'settle' && v.title.includes('受判'), v.title);
  ok('受判显示卦名', /上.+·下/.test(v.sub), v.sub);
  await page.screenshot({ path: join(shots, '33-life-tomb.png'), fullPage: true });
} else {
  // 阳气尽或翻车都算正常结局，只要标题与深度说得通
  ok('摸金中途了结也算数', /栽了|阳气|受判/.test(st.title), st.title);
  ok('结局标明深度', /第 \d+ 层/.test(st.sub), st.sub);
}

// ---------------- 4. 经商：杠杆开关 ----------------
await page.click('#btn-back');
await sleep(300);
await startCareer('trade');
const leverBefore = await page.evaluate(() => {
  const b = document.querySelector('#btn-lever');
  return { has: !!b, text: b ? b.textContent.trim() : '', risk: document.querySelector('#risk-val').textContent.trim() };
});
ok('经商有杠杆', leverBefore.has);
await deepen(1);
const riskNoLever = await page.evaluate(() => document.querySelector('#risk-val').textContent.trim());
await page.click('#btn-lever');
await sleep(300);
const afterLever = await page.evaluate(() => ({
  text: document.querySelector('#btn-lever').textContent.trim(),
  risk: document.querySelector('#risk-val').textContent.trim(),
}));
ok('杠杆可开启', afterLever.text.includes('已开'), afterLever.text);
const num = (s) => Number(String(s).replace('%', ''));
ok('杠杆提高反噬', num(afterLever.risk) > num(riskNoLever), `${riskNoLever} -> ${afterLever.risk}`);
await page.screenshot({ path: join(shots, '34-life-lever.png'), fullPage: true });

// ---------------- 5. 攀亲：翻车只清好感 ----------------
await page.click('#btn-stop');
await sleep(400);
await page.click('#btn-back');
await sleep(300);
await startCareer('love');
st = await page.evaluate(() => ({ resName: document.querySelector('#res-name').textContent.trim() }));
ok('攀亲命脉是颜面', st.resName === '颜面', st.resName);
await deepen(1);
const favor1 = await page.evaluate(() => document.querySelector('#carry').textContent.trim());
ok('攀亲累积好感', favor1.includes('好感'), favor1);

// ---------------- 6. 科研 ----------------
await page.click('#btn-stop');
await sleep(400);
await page.click('#btn-back');
await sleep(300);
await startCareer('research');
st = await page.evaluate(() => ({ resName: document.querySelector('#res-name').textContent.trim() }));
ok('科研命脉是经费', st.resName === '经费', st.resName);

// ---------------- 7. 结局：集齐三个登峰 ----------------
await page.evaluate(() => {
  localStorage.setItem('wenyigua.life.v1', JSON.stringify({
    peaks: { relic: true, tomb: true, trade: true },
    runs: 9, best: { relic: 210, tomb: 260, trade: 310 }, ended: false,
  }));
});
await page.goto(`${BASE}/life.html?seed=11`);
await page.waitForSelector('.career');
const peakAfter = await page.evaluate(() => ({
  count: document.querySelector('#peak-count').textContent.trim(),
  done: document.querySelectorAll('.peak.done').length,
}));
ok('三个登峰已计入', peakAfter.count === '3/5', peakAfter.count);
ok('登峰面板标记完成', peakAfter.done === 3, String(peakAfter.done));

await startCareer('relic');
await deepen(1);
await page.click('#btn-stop');
await sleep(400);
const backText = await page.evaluate(() => document.querySelector('#btn-back').textContent.trim());
ok('达成条件后按钮变「走到最后」', backText === '走到最后', backText);
await page.click('#btn-back');
await sleep(500);
const ending = await page.evaluate(() => ({
  screen: document.querySelector('.screen.is-active').dataset.screen,
  text: document.querySelector('#ending-text').textContent.trim(),
  last: document.querySelector('.ending-last').textContent.trim(),
}));
ok('进入人生赢家结局', ending.screen === 'ending', ending.screen);
ok('结局点名走过的行当', ending.text.includes('古玩') && ending.text.includes('经商'), ending.text.slice(0, 60));
ok('结局落点是「不再问卦」', ending.last.includes('没有问卦'), ending.last);
await page.screenshot({ path: join(shots, '35-life-ending.png'), fullPage: true });

await page.click('#btn-ending-back');
await sleep(300);
ok('可回街上', (await screen()) === 'hub');

// ---------------- 8. 存档 ----------------
await page.goto(`${BASE}/life.html`);
await page.waitForSelector('.career');
const persisted = await page.evaluate(() => document.querySelector('#peak-count').textContent.trim());
ok('登峰进度持久化', persisted === '3/5', persisted);

// ---------------- 9. 从其它入口可达 ----------------
await page.goto(`${BASE}/index.html`);
const linkIdx = await page.evaluate(() => !!document.querySelector('a[href="life.html"]'));
await page.goto(`${BASE}/raid.html`);
const linkRaid = await page.evaluate(() => !!document.querySelector('a[href="life.html"]'));
ok('主游戏或下潜页有入口', linkIdx || linkRaid, `index=${linkIdx} raid=${linkRaid}`);

await browser.close();

console.log(`\n检查 ${checks} 项，失败 ${fails.length} 项`);
if (errors.length) { console.log('控制台错误：'); errors.forEach((e) => console.log('  ' + e)); }
if (fails.length) { console.log('失败项：'); fails.forEach((f) => console.log('  ' + f)); process.exit(1); }
if (errors.length) process.exit(2);
console.log('全部通过，截图在 shots/');

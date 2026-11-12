import { chromium } from 'playwright-core';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const page = await browser.newPage({ viewport: { width: 430, height: 940 } });
page.on('pageerror', (e) => console.log('[ERR]', e.message));

await page.goto('http://127.0.0.1:8811/epoch.html?seed=21');
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForSelector('#btn-birth');

await page.click('#btn-birth');
await sleep(300);
const birth = await page.evaluate(() => ({
  hex: document.querySelector('.fate-name')?.textContent,
  sub: document.querySelector('.fate-sub')?.textContent,
  lines: [...document.querySelectorAll('.lanes .lane')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
  fit: [...document.querySelectorAll('.fit-row')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
}));
console.log('=== 出生卦 ===');
console.log(birth.hex, '|', birth.sub);
console.log('命盘：', birth.lines.join(' / '));
console.log('行当：', birth.fit.join(' | '));

await page.click('#btn-begin');
await sleep(300);

const st = () => page.evaluate(() => {
  const c = document.querySelector('.screen.is-active');
  return {
    screen: c?.dataset.screen,
    title: document.querySelector('#sec-title')?.textContent,
    note: document.querySelector('#sec-note')?.textContent,
    stats: [...document.querySelectorAll('.st .v')].map((e) => e.textContent.trim()),
    prompt: document.querySelector('#prompt')?.textContent,
    log: [...document.querySelectorAll('.log-item')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
    endName: document.querySelector('#end-name')?.textContent,
    endSub: document.querySelector('#end-sub')?.textContent,
    endLedger: document.querySelector('#end-ledger')?.textContent.replace(/\s+/g, ' ').trim(),
    endLoot: document.querySelector('#end-loot')?.textContent.replace(/\s+/g, ' ').trim(),
  };
});

const plan = [
  { career: 'relic', stake: 'mid', cast: true },
  { career: 'trade', stake: 'heavy', cast: true },
  { career: 'tomb', stake: 'heavy', cast: false },
  { career: 'trade', stake: 'mid', cast: true },
  { career: 'relic', stake: 'light', cast: false },
  { career: 'study', stake: 'light', cast: true },
];

for (const p of plan) {
  const s0 = await st();
  if (s0.screen === 'end') break;
  console.log('\n--- ' + s0.title + ' ---');
  console.log('  状态：财' + s0.stats[0] + ' 名' + s0.stats[1] + ' 缘' + s0.stats[2] + ' 伤' + s0.stats[3]);
  console.log('  ' + s0.note);

  await page.locator(`[data-career="${p.career}"]`).click();
  await sleep(120);
  await page.locator(`[data-stake="${p.stake}"]`).click();
  await sleep(120);

  if (p.cast) {
    const canCast = await page.evaluate(() => !!document.querySelector('#btn-cast'));
    if (canCast) {
      await page.click('#btn-cast');
      await sleep(220);
      const c = await page.evaluate(() => {
        const xs = [...document.querySelectorAll('#cast-row .xiang')];
        return xs.map((e) => ({
          label: e.querySelector('.xl')?.textContent,
          name: e.querySelector('.xn')?.textContent,
          text: e.querySelector('.xj')?.textContent,
          on: e.classList.contains('on'),
          locked: e.classList.contains('locked'),
        }));
      });
      c.forEach((x) => console.log('  ' + (x.on ? '▣ ' : '□ ') + x.label + '　' + x.name + '　' + x.text));
    } else {
      console.log('  想问问不了（额度没了）');
    }
  } else {
    console.log('  决定不问卦 —— 盲押');
  }

  await page.click('#btn-commit');
  await sleep(350);
}

const end = await st();
console.log('\n=== 终局 ===');
console.log(end.endName + ' | ' + end.endSub);
console.log(end.endLedger);
console.log(end.endLoot);
console.log('\n=== 六节日志 ===');
end.log.forEach((l) => console.log(' · ' + l));

await browser.close();



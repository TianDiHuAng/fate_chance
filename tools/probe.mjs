import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const url = pathToFileURL(join(root, 'web', 'index.html')).href;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 430, height: 940 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto(url + '?seed=4');
await page.click('.chip[data-i="0"]');
await page.click('#btn-start');
await sleep(300);
for (let i = 0; i < 6; i++) { await page.click('#btn-toss'); await sleep(800); }
await page.click('#btn-read');
await sleep(300);
await page.click('#btn-draw');
await sleep(400);

const info = await page.evaluate(() => {
  const pick = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      sel,
      rect: { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) },
      display: cs.display,
      aspect: cs.aspectRatio,
      height: cs.height,
      width: cs.width,
      transform: cs.transform,
      backface: cs.backfaceVisibility,
      position: cs.position,
    };
  };
  return [
    pick('.cards'),
    pick('.card'),
    pick('.card-inner'),
    pick('.card-front'),
    pick('.card-back'),
  ];
});
console.log(JSON.stringify(info, null, 2));
await page.screenshot({ path: join(root, 'shots', 'probe-table.png'), fullPage: true });
await browser.close();

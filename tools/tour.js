#!/usr/bin/env node
/* Screenshot the real page at fractions of the night (--y) or at given shots (--shots 5:0.5,12:0.3 = shot index : local progress).
   node tools/tour.js --y 0,0.1,0.5 [--size 1280x720] [--q 0.5] [--out prefix] [--file index.html] [--wait 600] */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
const ys = args.shots ? args.shots.split(',') : (args.y || '0,0.25,0.5,0.75,1').split(',').map(Number);
const [W, H] = (args.size || '1280x720').split('x').map(Number);
const root = path.resolve(__dirname, '..');
const out = path.resolve(args.out || path.join(root, 'shots', 'tour'));
fs.mkdirSync(path.dirname(out), { recursive: true });
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const errs = new Set();
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_FILE_NOT_FOUND|ERR_NAME_NOT_RESOLVED|ERR_CONNECTION|ERR_TUNNEL|ERR_CERT|net::ERR/.test(m.text())) errs.add(m.text()); });
  page.on('pageerror', (e) => errs.add('pageerror: ' + e.message));
  await page.goto('file://' + path.join(root, args.file || 'index.html') + '?q=' + (args.q || 0.5), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => (window.__frames || 0) >= 2, null, { timeout: 180000 });
  await page.evaluate(() => { window.DREAM.ready && window.DREAM.ready.then(() => { window.__warm = true; }); });
  await page.waitForFunction(() => window.__warm, null, { timeout: 180000 }).catch(() => errs.add('warm-up timeout'));
  await page.evaluate(() => { window.DREAM.look.veil = 0; });
  for (const y of ys) {
    const info = await page.evaluate((y) => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (typeof y === 'string') { // "shotIndex:localProgress"
        const [i, lp] = y.split(':').map(Number);
        const ch = window.DREAM.chapters[i];
        window.scrollTo(0, ch.top + ch.height * (isNaN(lp) ? 0.5 : lp) - window.innerHeight / 2);
      } else window.scrollTo(0, max * y);
      return { max, vh: window.innerHeight };
    }, y);
    const f0 = await page.evaluate(() => window.__frames);
    await page.waitForFunction((f) => window.__frames >= f + 3, f0, { timeout: 180000 }).catch(() => errs.add('frame timeout at y=' + y));
    await page.waitForTimeout(parseInt(args.wait || '500', 10));
    const st = await page.evaluate(() => ({ active: window.DREAM.state.active, clock: document.getElementById('clock').textContent, stage: document.getElementById('stage').textContent }));
    const file = `${out}_y${String(y).replace(':', '-')}.png`;
    await page.screenshot({ path: file });
    console.log(file, JSON.stringify(st), 'screens:', (info.max / info.vh).toFixed(1));
  }
  await browser.close();
  if (errs.size) { console.log('\nERRORS:'); for (const e of errs) console.log(e.slice(0, 3000)); process.exitCode = 2; } else console.log('no errors');
})();

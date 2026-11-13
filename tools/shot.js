#!/usr/bin/env node
/* Screenshot a single scene through the real engine (post-processing included).

   node tools/shot.js --scene hypnagogia --p 0,0.5,1 --t 6 --out /some/dir/hyp
     --scene  scene id (required)
     --p      comma list of progress values 0..1          (default 0,0.25,0.5,0.75,1)
     --t      comma list of frozen times in seconds        (default 8)
     --size   WxH viewport                                 (default 960x540)
     --q      render scale                                 (default 1)
     --fade   crossfade weight                             (default 1)
     --out    output path prefix                           (default ./shots/<scene>)
   Writes <out>_p<progress>_t<time>.png and prints any shader/JS errors.
   Software GL is slow: a heavy raymarcher can take several seconds per frame — keep sizes small. */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
if (!args.scene) { console.error('usage: node tools/shot.js --scene ID [--p 0,0.5,1] [--t 8] [--size 960x540] [--q 1] [--out prefix]'); process.exit(1); }
const ps = (args.p || '0,0.25,0.5,0.75,1').split(',').map(Number);
const ts = (args.t || '8').split(',').map(Number);
const [W, H] = (args.size || '960x540').split('x').map(Number);
const root = path.resolve(__dirname, '..');
const out = path.resolve(args.out || path.join(root, 'shots', args.scene));
fs.mkdirSync(path.dirname(out), { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const errs = new Set();
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_FILE_NOT_FOUND/.test(m.text())) errs.add(m.text()); });
  page.on('pageerror', (e) => errs.add('pageerror: ' + e.message));
  for (const t of ts) for (const p of ps) {
    const url = 'file://' + path.join(root, 'dev.html') + `?scene=${args.scene}&p=${p}&t=${t}&q=${args.q || 1}&fade=${args.fade || 1}&bare=1`;
    const t0 = Date.now();
    await page.goto(url);
    await page.waitForFunction(() => (window.__frames || 0) >= 3, null, { timeout: 120000 }).catch(() => errs.add('timeout waiting for frames at p=' + p));
    const file = `${out}_p${p}_t${t}.png`;
    await page.screenshot({ path: file });
    console.log(file, `(${Date.now() - t0} ms)`);
  }
  await browser.close();
  if (errs.size) { console.log('\nERRORS:'); for (const e of errs) console.log(e.slice(0, 4000)); process.exitCode = 2; }
  else console.log('no errors');
})();

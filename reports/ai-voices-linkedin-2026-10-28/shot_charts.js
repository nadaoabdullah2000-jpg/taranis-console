const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const errs = [];
  const p = await b.newPage({ viewport: { width: 1000, height: 900 }, colorScheme: 'light', deviceScaleFactor: 2 });
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto('file://' + process.argv[2]); await p.waitForTimeout(600);
  for (const id of ['k-ppw', 'k-tech', 'k-lift', 'k-month', 'k-fmt']) await (await p.$('#' + id)).screenshot({ path: process.argv[3] + '/' + id + '.png' });
  console.log(errs.join('\n') || 'no errors'); await b.close();
})();

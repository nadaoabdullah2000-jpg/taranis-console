// Render check: screenshots of dashboard.html at desktop and phone width; prints page errors.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const errs = [];
  for (const [w, name] of [[1280, 'desktop'], [400, 'phone']]) {
    const p = await b.newPage({ viewport: { width: w, height: 900 } });
    p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
    await p.goto('file://' + __dirname + '/dashboard.html'); await p.waitForTimeout(700);
    await p.screenshot({ path: process.argv[2] + '/dash_' + name + '.png', fullPage: true });
    const over = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    console.log(name, 'horizontal overflow:', over);
  }
  console.log(errs.join('\n') || 'no errors'); await b.close();
})();

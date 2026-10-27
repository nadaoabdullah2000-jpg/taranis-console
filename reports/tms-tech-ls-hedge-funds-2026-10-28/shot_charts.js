// Screenshots each chart card of dashboard.html into charts/<chart-id>.png for the Word report.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1000, height: 900 }, colorScheme: 'light', deviceScaleFactor: 2 });
  await p.goto('file://' + __dirname + '/dashboard.html'); await p.waitForTimeout(700);
  for (const id of ['c-cad', 'c-month', 'c-mix', 'c-top', 'c-react', 'c-fmt', 'c-tech']) {
    const card = await p.evaluateHandle(i => document.getElementById(i).closest('.card'), id);
    await card.asElement().screenshot({ path: __dirname + '/charts/' + id + '.png' });
  }
  await b.close(); console.log('ok');
})();

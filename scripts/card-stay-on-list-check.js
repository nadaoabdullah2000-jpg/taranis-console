// Opportunities in demo mode: the new labels, then Approve and Reject on cards with the
// saves stubbed in the page (nothing is written anywhere). Checks the tab and scroll stay put.
const { chromium } = require('playwright');
const out = process.argv[2];
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 2 });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  p.on('dialog', d => d.accept());
  await p.goto('http://127.0.0.1:8765/index.html'); await p.click('#gate-demo');
  await p.waitForFunction(() => typeof OPPS_ROWS !== 'undefined' && OPPS_ROWS && !OPPS_LOADING, null, { timeout: 15000 });
  await p.evaluate(() => {
    // Stub the writes: return the patch as the saved row.
    supaPatch = async (t, f, patch) => [Object.assign({}, patch)];
    fullMandate = async (m) => Object.assign({}, m);
    hfGate = async () => true;
    const r = OPPS_ROWS;
    // Two sample cards for the labels: a Review held at 74% (hedge funds not confirmed) and a low match.
    r[0] = Object.assign({}, r[0], { investor_name: 'Sample Review investor', new_qualification: 'uncertain', qualification: 'uncertain',
      new_fit_score: 0.74, hf_evidence: null, asset_classes: ['Private Equity'], approved_at: null });
    r[1] = Object.assign({}, r[1], { investor_name: 'Sample low match investor', new_qualification: 'matched', qualification: 'matched',
      new_fit_score: 0.89, verdict_source: null, is_tech_investor: true, tech_signal: 'Alert text: technology', fit_reason: 'Low match: technology from the alert text only, no With Intelligence profile quote.',
      strategies: ['equity_long_short'], hf_evidence: 'confirmed', approved_at: null });
    for (let i = 2; i < Math.min(r.length, 8); i++) r[i] = Object.assign({}, r[i], { investor_name: 'Sample investor ' + i,
      new_qualification: 'uncertain', qualification: 'uncertain', new_fit_score: 0.6 + i / 100, approved_at: null, verdict_source: null });
    oppsMode = 'matched'; redrawOpps();
  });
  await p.waitForTimeout(900);
  const labels = await p.$$eval('.mcard .mcard-score', ns => ns.slice(0, 6).map(n => n.textContent.replace(/\s+/g, ' ').trim()));
  console.log('labels:', labels);
  await p.locator('main .mcard').first().screenshot({ path: out + '/labels-matched.png' });
  await p.evaluate(() => { oppsMode = 'review'; redrawOpps(); });
  await p.waitForTimeout(900);
  console.log('review labels:', await p.$$eval('.mcard .mcard-score', ns => ns.slice(0, 6).map(n => n.textContent.replace(/\s+/g, ' ').trim())));
  await p.locator('main .mcard').first().screenshot({ path: out + '/labels-review.png' });

  // Scroll to the third card, then Approve it and Reject the fourth.
  const cards = p.locator('main .mcard');
  console.log('cards', await cards.count());
  await cards.nth(0).scrollIntoViewIfNeeded();
  await p.evaluate(() => scrollMainTo(120)); await p.waitForTimeout(200);
  const before = await p.evaluate(() => ({ tab: current, y: mainScroller().scrollTop, hash: location.hash }));
  const clickIn = (i, name) => p.evaluate(([i, name]) => { const c = document.querySelectorAll('main .mcard')[i];
    [...c.querySelectorAll('button')].find(b => b.textContent.trim() === name).click(); }, [i, name]);
  await clickIn(0, 'Approve');
  await p.waitForTimeout(500);
  await clickIn(1, 'Reject');
  await p.waitForTimeout(700);
  const after = await p.evaluate(() => ({ tab: current, y: mainScroller().scrollTop, hash: location.hash }));
  console.log('before', before, 'after', after);
  const notes = await p.$$eval('.mcard-done-note', ns => ns.map(n => n.textContent));
  console.log('notes', notes);
  const box = await cards.nth(0).boundingBox();
  await p.screenshot({ path: out + '/stay.png', clip: { x: 250, y: Math.max(0, box.y - 20), width: 1030, height: Math.min(700, 1000 - Math.max(0, box.y - 20)) } });
  console.log('errors:', errs.length ? errs : 'none');
  await b.close();
})();

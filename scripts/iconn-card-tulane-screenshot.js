// Tulane's card (row 1379, its stored fields) with its loaded iConnections row: a possible match only.
const { chromium } = require('playwright');
const firm = {"notes":"Not certain it is the same firm, so left blank. Possible match: Tulane University (https://app.iconnections.io/allocators/company/7415/overview). Candidate \"Tulane University\" page shows White Plains, NY, not New Orleans; not confirmed.","read_on":"2026-11-12","read_status":"read","iconn_status":"candidate","investor_name":"Tulane University Endowment","wi_investor_id":"3948","iconn_firm_name":"Tulane University","iconn_profile_url":"https://app.iconnections.io/allocators/company/7415/overview"};
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 2 });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://127.0.0.1:8765/index.html'); await p.click('#gate-demo');
  await p.waitForFunction(() => typeof OPPS_ROWS !== 'undefined' && OPPS_ROWS && !OPPS_LOADING, null, { timeout: 15000 });
  await p.evaluate(async (firm) => {
    await openMandate(Object.assign({}, OPPS_ROWS[0], { id: 1379, investor_name: 'Tulane University Endowment', investor_country: 'US', investor_city: 'New Orleans',
      investor_type: 'Endowment', evidence: { wi_investor_id: '3948' } }));
    await new Promise(r => setTimeout(r, 700));
    document.querySelector('.iconn-sec').replaceWith(iconnSection({ links: [], firm, people: [] }));
  }, firm);
  await p.waitForTimeout(300);
  await p.locator('.iconn-sec').screenshot({ path: process.argv[2] });
  console.log('errors:', errs.length ? errs : 'none'); await b.close();
})();

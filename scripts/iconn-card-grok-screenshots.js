// The iConnections section with Grok's read: found, possible match (greyed), checked not found. Demo mode.
const { chromium } = require('playwright');
const out = process.argv[2];
const S = {
  found: { links: [{ firm: 'AARP', how: 'wi_id', certain: true, detail: '', people: ['Adam Esser'] }],
    firm: { iconn_status: 'found', iconn_firm_name: 'AARP', iconn_profile_url: 'https://app.iconnections.io/allocators/company/2281/overview', read_on: '2026-11-12' }, people: [] },
  candidate: { links: [], firm: { iconn_status: 'candidate', iconn_firm_name: 'Tulane University', iconn_profile_url: 'https://app.iconnections.io/allocators/company/7415/overview', read_on: '2026-11-12',
    notes: 'Not certain it is the same firm, so left blank. Possible match: Tulane University (https://app.iconnections.io/allocators/company/7415/overview). Candidate "Tulane University" page shows White Plains, NY, not New Orleans; not confirmed.' }, people: [] },
  notfound: { links: [], firm: { iconn_status: 'not_found', read_on: '2026-11-12' }, people: [] }
};
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 1100 }, deviceScaleFactor: 2 });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://127.0.0.1:8765/index.html'); await p.click('#gate-demo');
  await p.waitForFunction(() => typeof OPPS_ROWS !== 'undefined' && OPPS_ROWS && !OPPS_LOADING, null, { timeout: 15000 });
  for (const [k, d] of Object.entries(S)) {
    await p.evaluate(async (d) => {
      await openMandate(Object.assign({}, OPPS_ROWS[0], { investor_name: 'Sample' }));
      await new Promise(r => setTimeout(r, 700));
      document.querySelector('.iconn-sec').replaceWith(iconnSection(d));
    }, d);
    await p.waitForTimeout(300);
    await p.locator('.iconn-sec').screenshot({ path: `${out}/iconn2-${k}.png` });
  }
  console.log('errors:', errs.length ? errs : 'none'); await b.close();
})();

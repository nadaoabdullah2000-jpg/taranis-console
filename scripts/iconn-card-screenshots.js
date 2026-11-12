// The iConnections section on a real card layout (demo mode), in three states, light and dark.
// Sample data: 50 South Capital's real link and iConnections names; the "filled" firm details
// and contacts are placeholders showing where Grok's read will appear.
const { chromium } = require('playwright');
const out = process.argv[2];
const SAMPLES = {
  filled: { links: [{ firm: '50 South Capital', how: 'wi_id', certain: true, detail: 'With Intelligence id of the matched allocator row #2928',
      people: ['Bruce Tang', 'Eric Magaziner'] }],
    firm: { read_status: 'read', website: 'https://www.example.com', firm_linkedin: 'https://www.linkedin.com/company/example',
      general_email: 'info@example.com', phone: '+1 312 000 0000', address: '50 S. LaSalle Street, Chicago, IL', other_names: 'Example former name', read_on: '2026-11-12' },
    people: [{ contact_name: 'Sample Person A', title: 'Chief Investment Officer', email: 'a@example.com', phone: '', linkedin: 'https://www.linkedin.com/in/example-a' },
             { contact_name: 'Sample Person B', title: 'Director, Hedge Funds', email: 'b@example.com', phone: '+1 312 000 0001', linkedin: '' }] },
  linked: { links: [{ firm: '50 South Capital', how: 'wi_id', certain: true, detail: '', people: ['Bruce Tang', 'Eric Magaziner'] }], firm: null, people: [] },
  none: { links: [], firm: null, people: [] }
};
(async () => {
  const b = await chromium.launch();
  for (const scheme of ['light', 'dark']) {
    const p = await b.newPage({ viewport: { width: 1280, height: 1100 }, deviceScaleFactor: 2, colorScheme: scheme });
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://127.0.0.1:8765/index.html'); await p.click('#gate-demo');
    await p.waitForFunction(() => typeof OPPS_ROWS !== 'undefined' && OPPS_ROWS && !OPPS_LOADING, null, { timeout: 15000 }).catch(() => {});
    for (const [k, d] of Object.entries(SAMPLES)) {
      if (scheme === 'dark' && k !== 'filled') continue;
      await p.evaluate(async (d) => {
        const m = Object.assign({}, OPPS_ROWS[0], { investor_name: '50 South Capital Advisors', evidence: { wi_investor_id: '2147318702' } });
        await openMandate(m);
        await new Promise(r => setTimeout(r, 700));
        const sec = document.querySelector('.iconn-sec');
        sec.replaceWith(iconnSection(d));
      }, d);
      await p.waitForTimeout(300);
      const box = await p.locator('.iconn-sec').boundingBox();
      const top = Math.max(0, box.y - 260);
      await p.screenshot({ path: `${out}/iconn-${k}-${scheme}.png`, clip: { x: 250, y: top, width: 1010, height: Math.min(1100 - top, box.y - top + box.height + 40) } });
    }
    console.log(scheme, 'errors:', errs.length ? errs : 'none');
    await p.close();
  }
  await b.close();
})();

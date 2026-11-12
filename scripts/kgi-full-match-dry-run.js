// KGI Life (32): current rescore vs with Tech set by a person from its hedge fund intentions. Nothing written.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://127.0.0.1:8765/index.html'); await p.click('#gate-demo'); await p.waitForTimeout(800);
  const row = JSON.parse(process.argv[2]);
  const out = await p.evaluate((m) => {
    const now = rescore(m);
    const next = Object.assign({}, m, { is_tech_investor: true,
      tech_signal: 'Set by a person: research@taranis.net, 2026-11-12 (With Intelligence: $20m to M37 Offshore Fund, AI long/short; $37m to Tensor Edge Capital, semiconductor and software long/short, May-Jun 2026)' });
    const r = rescore(next);
    return { now: { q: now.q, s: now.s, low: !!now.low, tier: techTier(m) },
             next: { q: r.q, s: r.s, low: !!r.low, tier: techTier(next), lowMatch: lowMatch(Object.assign({}, next, { new_qualification: r.q })) } };
  }, row);
  console.log(JSON.stringify(out), 'errors:', errs.length ? errs : 'none'); await b.close();
})();

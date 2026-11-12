// Review sweep dry run (12 Nov 2026): rows (read-only copy) with the proposed evidence applied, rescored
// with the console's own rules; then the new Matched list ranked with "best match first". Nothing written.
const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const rows = JSON.parse(fs.readFileSync(__dirname + '/sweep_rows.json', 'utf8'));      // all Matched + candidate rows
  const changes = JSON.parse(fs.readFileSync(__dirname + '/sweep_changes.json', 'utf8')); // { wi: { eq, tech, techThemes } }
  const b = await chromium.launch(); const p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://127.0.0.1:8765/index.html'); await p.click('#gate-demo'); await p.waitForTimeout(800);
  const out = await p.evaluate(([rows, changes]) => {
    const res = [];
    const next = rows.map(r0 => {
      const r = Object.assign({}, r0, { evidence: Object.assign({}, r0.evidence || {}) });
      const c = changes[(r.evidence || {}).wi_investor_id];
      if (!c || r.new_qualification !== 'uncertain' || r.verdict_source === 'manual') return r;
      const before = { q: r.new_qualification, s: Number(r.new_fit_score), tier: techTier(r), ls: isStrongCore(r, sigText(r)) || !!(equityInHf(r) && equityInHf(r) !== 'review') };
      if (c.eq) r.evidence.equity_long_short = c.eq;
      if (c.tech) {
        r.evidence.tech_hf_intention = c.tech;
        if (!techQuoted(r) && !techSetByPerson(r)) { r.is_tech_investor = true; r.tech_signal = 'With Intelligence profile (theme line): "' + c.techQuote + '"'; }
      }
      const s = rescore(r);
      r.new_qualification = s.q; r.new_fit_score = s.s;
      const after = { q: s.q, s: s.s, tier: techTier(r), ls: isStrongCore(r, sigText(r)) || !!(equityInHf(r) && equityInHf(r) !== 'review') };
      res.push({ id: r.id, wi: r.evidence.wi_investor_id, name: (r.investor_name || '').slice(0, 44), before, after, eq: !!c.eq, tech: !!c.tech });
      return r;
    });
    const cards = dedupeInvestors(next.map(x => Object.assign({}, x)));
    const matched = sortMandates(cards, 'best').filter(m => bandOf(m) === 'matched')
      .map((m, i) => ({ n: i + 1, wi: (m.evidence || {}).wi_investor_id, name: (m.investor_name || '').slice(0, 44), s: Math.round(sortFit(m) * 100), tier: techTier(m) }));
    return { res, matched };
  }, [rows, changes]);
  fs.writeFileSync(__dirname + '/sweep_out.json', JSON.stringify(out, null, 1));
  console.log('changed rows', out.res.length, 'errors', errs.length ? errs : 'none');
  await b.close();
})();

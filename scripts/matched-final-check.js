// Final check after the sweep: every Matched row backed by long/short (incl. equity in a hedge-fund
// context) plus a quoted Tech, with the merged app's own rules; then the Matched order. Nothing written.
const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const rows = JSON.parse(fs.readFileSync(__dirname + '/final_matched.json', 'utf8'));
  const b = await chromium.launch(); const p = await b.newPage();
  await p.goto('http://127.0.0.1:8765/index.html'); await p.click('#gate-demo'); await p.waitForTimeout(800);
  const out = await p.evaluate((rows) => {
    const wiQuoted = {};
    for (const m of rows) { const w = (m.evidence || {}).wi_investor_id; if (w && techQuoted(m)) wiQuoted[w] = true; }
    const checks = rows.map(m => {
      const t = sigText(m), core = isStrongCore(m, t), eq = equityInHf(m);
      const ls = core || (eq && eq !== 'review'), quoted = techQuoted(m) || !!wiQuoted[(m.evidence || {}).wi_investor_id];
      return { id: m.id, name: (m.investor_name || '').slice(0, 40), manual: m.verdict_source === 'manual', ls: !!ls, quoted, ok: m.verdict_source === 'manual' || (ls && quoted) };
    });
    const order = sortMandates(dedupeInvestors(rows.map(x => Object.assign({}, x))), 'best')
      .map((m, i) => (i + 1) + '. ' + (m.investor_name || '').slice(0, 42) + ' ' + Math.round(sortFit(m) * 100) + '% t' + techTier(m));
    return { checks, order };
  }, rows);
  const fails = out.checks.filter(c => !c.ok);
  console.log('rows', out.checks.length, 'fail', fails.length, 'manual', out.checks.filter(c => c.manual).length);
  for (const f of fails) console.log('FAIL', JSON.stringify(f));
  console.log(out.order.join('\n'));
  await b.close();
})();

// Dry run: the live Matched rows (read-only copy) grouped and sorted by the app's own code,
// old order (no Tech tier) vs new order. Nothing is written.
const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const rows = JSON.parse(fs.readFileSync(__dirname + '/' + (process.argv[2] || 'matched.json'), 'utf8'));
  const b = await chromium.launch(); const p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://127.0.0.1:8765/index.html'); await p.click('#gate-demo'); await p.waitForTimeout(800);
  const out = await p.evaluate((rows) => {
    const cards = dedupeInvestors(rows.map(r => Object.assign({}, r)));
    const fmt = (m, i) => ({ n: i + 1, name: (m.investor_name || '').slice(0, 42), score: Math.round(sortFit(m) * 100), tier: techTier(m), crit: critOf(m).filter(Boolean).length });
    const now = sortMandates(cards, 'best').map(fmt);
    const real = techTier; techTier = () => 4;
    const old = sortMandates(cards, 'best').map(fmt);
    techTier = real;
    return { now, old, n: cards.length };
  }, rows);
  console.log('cards', out.n, 'errors', errs.length ? errs : 'none');
  const oldPos = Object.fromEntries(out.old.map(o => [o.name, o.n]));
  for (const o of out.now) console.log(String(o.n).padStart(2), '(was ' + String(oldPos[o.name]).padStart(2) + ')', o.name.padEnd(42), o.score + '%', 'tier ' + o.tier, o.crit + '/3');
  await b.close();
})();

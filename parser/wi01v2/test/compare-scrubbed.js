// Checks that each scrubbed fixture takes the same path through the parser as the
// real block it stands in for. Needs the real fixtures in fixtures/ (kept out of git).
//   node test/compare-scrubbed.js
// For each pair and each version it compares where the name came from (the
// "Investor" header span, a stated subject, a headline cut, the model, or nothing),
// whether parse_drift fired, the category, item type, date, asset class, region,
// button URLs found, headline presence, and the header gap in characters.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const load = (v) => ({
  det: new Function('$json', fs.readFileSync(path.join(root, v[0]), 'utf8')),
  norm: new Function('$json', '$', fs.readFileSync(path.join(root, v[1]), 'utf8')),
});
const V = {
  active: load(['nodes/active-e8e08232/deterministic-extraction.js', 'nodes/active-e8e08232/normalize-record-key.js']),
  proposed: load(['proposed/deterministic-extraction.news-headline-fix.js', 'nodes/active-e8e08232/normalize-record-key.js']),
  previous: load(['nodes/previous-e6d4c5a5/deterministic-extraction.js', 'nodes/previous-e6d4c5a5/normalize-record-key.js']),
};
const HDR = /color:#63626a[^>]*>\s*Investor\b[\s\S]{0,2000}?<span[^>]*>\s*([^<\s][^<]{1,89}?)\s*<\/span>/i;
const sig = (ver, c) => {
  const d = V[ver].det({ raw_block: c.block, source_message_id: 'm', raw_email_id: 1, block_index: 0, source_email_date: '2026-10-10' }).json;
  const r = V[ver].norm({ output: c.ai || {} }, () => ({ item: { json: d } })).json;
  const h = c.block.match(HDR);
  const n = r.investor_name;
  const ai = (c.ai || {}).investor_name;
  const from = n == null ? 'none'
    : (h && n === h[1].trim()) ? 'header'
    : (d.det_named_subject && n === d.det_named_subject.trim()) ? 'subject'
    : (n === d.det_investor_from_headline) ? 'headline-cut'
    : (n === ai) ? 'model' : 'other';
  return {
    from, words: n ? n.split(/\s+/).length : 0, drift: !!r.parse_drift,
    category: d.det_category, item: d.det_item_type, date: d.det_alert_date,
    asset: d.det_asset_class, region: d.det_region,
    urls: [d.det_view_article_url, d.det_view_intention_url, d.det_view_investor_url].map(Boolean).join(''),
    headline: !!d.det_headline, subject: !!d.det_named_subject,
    gap: h ? h.index + h[0].indexOf(h[1]) - c.block.search(/>\s*Investor\b/) : null,
  };
};
const pairs = [['fixtures/header-and-profile.fixtures.js', 'test/header-and-profile.scrubbed.fixtures.js'],
               ['fixtures/news-headline.fixtures.js', 'test/news-headline.scrubbed.fixtures.js']];
let diffs = 0, n = 0;
for (const [real, scr] of pairs) {
  if (!fs.existsSync(path.join(root, real))) { console.error('missing ' + real + ': nothing to compare against'); process.exit(2); }
  const A = require(path.join(root, real)), B = require(path.join(root, scr));
  if (A.length !== B.length) { console.log('case count differs in ' + scr); diffs++; continue; }
  console.log('\n# ' + scr);
  A.forEach((a, i) => {
    for (const ver of Object.keys(V)) {
      n++;
      const x = sig(ver, a), y = sig(ver, B[i]);
      const bad = Object.keys(x).filter(k => JSON.stringify(x[k]) !== JSON.stringify(y[k]));
      if (bad.length) diffs++;
      console.log((bad.length ? 'DIFF' : 'same'), ver.padEnd(8), B[i].id.padEnd(30), 'name from ' + y.from,
        y.gap != null ? ' header gap ' + x.gap + '/' + y.gap : '',
        bad.length ? '  ' + bad.map(k => k + ': ' + JSON.stringify(x[k]) + ' -> ' + JSON.stringify(y[k])).join('; ') : '');
    }
  });
}
console.log('\n' + n + ' case/version pairs compared, ' + diffs + ' differ');
process.exit(diffs ? 1 : 0);

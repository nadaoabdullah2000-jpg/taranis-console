// Runs WI 01 v2's two parser Code nodes outside n8n, on fixture blocks.
//   node test/run.js active|previous|proposed [scrubbed|real|all]
// The second argument picks the fixture sets: scrubbed (committed, the default when the
// real ones are absent), real (fixtures/, kept out of git) or all (default when both exist).
// active   = nodes/active-e8e08232   (published 12 Oct 2026)
// previous = nodes/previous-e6d4c5a5 (before the 12 Oct header fix)
// proposed = the 13 Oct news-headline fix + the active Normalize node
// A fixture's expect[<version>] is the investor_name that version must give;
// cases without one for that version are printed, not checked.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const which = process.argv[2] || 'active';
const files = {
  active:   ['nodes/active-e8e08232/deterministic-extraction.js', 'nodes/active-e8e08232/normalize-record-key.js'],
  previous: ['nodes/previous-e6d4c5a5/deterministic-extraction.js', 'nodes/previous-e6d4c5a5/normalize-record-key.js'],
  proposed: ['proposed/deterministic-extraction.news-headline-fix.js', 'nodes/active-e8e08232/normalize-record-key.js'],
}[which];
if (!files) { console.error('usage: node test/run.js active|previous|proposed'); process.exit(2); }
// The Code nodes read $json (and Normalize reads the Deterministic Extraction
// item through $()), so each body is wrapped as a function of those.
const det = new Function('$json', fs.readFileSync(path.join(root, files[0]), 'utf8'));
const norm = new Function('$json', '$', fs.readFileSync(path.join(root, files[1]), 'utf8'));

const pick = process.argv[3] || 'all';
const SCRUBBED = ['test/header-and-profile.scrubbed.fixtures.js', 'test/news-headline.scrubbed.fixtures.js'];
const REAL = ['fixtures/header-and-profile.fixtures.js', 'fixtures/news-headline.fixtures.js'];
if (!['all', 'scrubbed', 'real'].includes(pick)) { console.error('fixture set must be scrubbed, real or all'); process.exit(2); }
const sets = ['test/synthetic.fixtures.js']
  .concat(pick !== 'real' ? SCRUBBED : [], pick !== 'scrubbed' ? REAL : [])
  .filter(f => fs.existsSync(path.join(root, f)));
if (pick === 'real' && sets.length === 1) { console.error('the real fixtures are not in fixtures/'); process.exit(2); }
let checked = 0, failed = 0;
for (const f of sets) {
  console.log('\n# ' + f);
  for (const c of require(path.join(root, f))) {
    const d = det({ raw_block: c.block, source_message_id: 'm', raw_email_id: 1, block_index: 0, source_email_date: '2026-10-10' }).json;
    const r = norm({ output: c.ai || {} }, () => ({ item: { json: d } })).json;
    const got = r.investor_name, want = c.expect && c.expect[which];
    let tag = '    ';
    if (want !== undefined) { checked++; if (got === want) tag = 'ok  '; else { tag = 'FAIL'; failed++; } }
    console.log(tag, c.id.padEnd(34), '→', JSON.stringify(got) + (r.parse_drift ? '  (' + r.parse_drift + ')' : '')
      + (tag === 'FAIL' ? '   want ' + JSON.stringify(want) : ''));
  }
}
console.log('\n' + which + ': ' + checked + ' checked, ' + failed + ' failed');
process.exit(failed ? 1 : 0);

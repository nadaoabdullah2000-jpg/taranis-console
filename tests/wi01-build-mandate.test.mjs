/* Run with: npm test
   WI 01 "Build Mandate SQL": the verdict written to new_qualification (n8n/wi01-build-mandate-sql.js). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const code = readFileSync(new URL('../n8n/wi01-build-mandate-sql.js', import.meta.url), 'utf8');
const q = (m) => new Function('$json', code)(Object.assign({ investor_name: 'X', record_key: 'k' }, m)).json._query;
// new_qualification and new_fit_score are the last two-but-two values of the insert: read them from the SQL.
const verdict = (sql) => { const m = /'(matched|uncertain|low|needs_data|rejected)',\s*(NULL|[\d.]+),\s*(?:NULL|true|false),\s*(?:NULL|'[^']*')\)/.exec(sql); return m ? [m[1], m[2]] : null; };

test('long/short without technology is a review at 0.74 at most', () => {
  const v = verdict(q({ hard_status: 'uncertain', score_band: 'strong', sig_strong: true, sig_tech: false, in_market: true, open_to_emerging_managers: true }));
  assert.deepEqual(v, ['uncertain', '0.74']);
});
test('long/short + space is not a match', () => {
  const v = verdict(q({ hard_status: 'uncertain', score_band: 'strong_tech', sig_strong: true, sig_tech: false, sig_space: true }));
  assert.equal(v[0], 'uncertain');
});
test('long/short + technology is a match', () => {
  const v = verdict(q({ hard_status: 'pass', score_band: 'strong_tech', sig_strong: true, sig_tech: true }));
  assert.equal(v[0], 'matched');
  assert.ok(Number(v[1]) >= 0.9);
});

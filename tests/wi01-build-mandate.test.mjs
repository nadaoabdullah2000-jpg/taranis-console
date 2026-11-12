/* Run with: npm test
   WI 01 "Build Mandate SQL": the verdict written to new_qualification (n8n/wi01-build-mandate-sql.js). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const code = readFileSync(new URL('../n8n/wi01-build-mandate-sql.js', import.meta.url), 'utf8');
const q = (m) => new Function('$json', code)(Object.assign({ investor_name: 'X', record_key: 'k' }, m)).json._query;
// new_qualification and new_fit_score are the last two-but-two values of the insert: read them from the SQL.
const verdict = (sql) => { const m = /'(matched|uncertain|low|needs_data|rejected)',\s*(NULL|[\d.]+),\s*(?:NULL|true|false),\s*(?:NULL|'[^']*'),\s*(?:NULL|NOW\(\))\)/.exec(sql); return m ? [m[1], m[2]] : null; };

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

test('wi_enriched_at is set only when WI 01b enriched the alert (12 Nov 2026)', () => {
  assert.match(q({ _wi_enriched: true }), /,\s*NOW\(\)\) ON CONFLICT/);
  assert.match(q({ _wi_enriched: false }), /,\s*NULL\) ON CONFLICT/);
  assert.match(q({}), /wi_enriched_at=COALESCE\(EXCLUDED\.wi_enriched_at,wi_mandates\.wi_enriched_at\)/);
});
test('a name WI 01b corrected is logged with the alert name', () => {
  const sql = q({ _wi_name_corrected: true, _wi_name_from_alert: "O'Neil Fund", _wi_investor_id: '42' });
  assert.match(sql, /^WITH up AS \(INSERT INTO wi_mandates/);
  assert.match(sql, /'investor_name', 'O''Neil Fund', up\.investor_name, 'WI 01b name correction/);
  assert.match(sql, /SELECT \* FROM up;$/);
  assert.doesNotMatch(q({}), /^WITH/);
});

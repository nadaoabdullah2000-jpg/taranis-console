/* Run with: npm test
   WI 01c backfill, rebuilt 12 Nov 2026 (n8n/wi01c-backfill-fixed.js): blanks only, dollars, ISO countries, logged. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../n8n/wi01c-backfill-fixed.js', import.meta.url), 'utf8');
const profile = { id: '42', name: 'Mahi546 GmbH', summary: "An Austrian family office's profile.", type: { name: 'Family Office' },
  address: { city: 'Vienna', country: { name: 'Austria' } }, sfo: { family_names: [] },
  latest_aum: { value_usd: 7.21, ranges_usd: [{ label: '< $30m' }] },
  preferences: { asset_class: [{ name: 'Hedge Funds' }], allocations: [{ ticket_size: { value_lower_usd: 1, value_upper_usd: 5 } }] } };
const helpers = { httpRequest: async (o) => o.method === 'POST' ? { data: { searchInvestor: profile } } : { headers: { location: 'https://platform.withintelligence.com/explore/investors/42' }, body: '' } };
const run = async (rows, tok = { access_token: 'x', seconds_left: 3600 }) => {
  const $ = (n) => ({ first: () => ({ json: tok }) });
  const $input = { all: () => rows.map(json => ({ json })) };
  return new Function('$', '$input', 'return (async function(){' + src + '}).call(this)').call({ helpers }, $, $input);
};
const ROW = { id: 9999999, investor_name: 'Mahi546', investor_type: 'SFO', aum_usd: null, asset_classes: [], evidence: { x: 1 }, view_investor_url: 'https://t.example/abc' };

test('fills blanks only, in dollars, with the ISO country, and logs each value', async () => {
  const [{ json: o }] = await run([ROW]);
  const sql = o._update_query;
  assert.equal(o._wi_reason, 'ok');
  assert.ok(!o._filled.includes('investor_type'), 'the alert type is kept');
  assert.match(sql, /aum_usd = CASE WHEN aum_usd IS NULL THEN 7210000 ELSE aum_usd END/);
  assert.match(sql, /investor_country = CASE WHEN investor_country IS NULL THEN 'AT'/);
  assert.match(sql, /WHERE id = 9999999 AND wi_enriched_at IS NULL/);
  assert.match(sql, /wi_enriched_at = now\(\)/);
  assert.match(sql, /INSERT INTO wi_fill_log/);
  assert.match(sql, /\('Mahi546 GmbH', 'investor_name', 'Mahi546', 'Mahi546 GmbH'\)/);
  assert.match(sql, /"name_from_alert":"Mahi546"/);
});

test('an expired token stops the run before anything is written', async () => {
  await assert.rejects(() => run([ROW], { access_token: null }), /token missing or expiring/);
});

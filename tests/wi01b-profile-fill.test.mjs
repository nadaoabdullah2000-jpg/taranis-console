/* Run with: npm test
   WI 01b "Profile wins" draft (12 Nov 2026): With Intelligence money in millions becomes dollars,
   countries map through the full list (no first-two-letters fallback), and only blanks are filled. */
// Offline check of the WI 01b draft: a fake profile in millions, an Austrian address, an alert with some fields filled.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../n8n/wi01b-profile-fill.js', import.meta.url), 'utf8');
const profile = { id: '42', name: 'Mahi546 GmbH', summary: 'An Austrian family office.', type: { name: 'Family Office' },
  address: { city: 'Vienna', country: { name: 'Austria' } }, sfo: { family_names: [] },
  latest_aum: { value_usd: 7.21, ranges_usd: [{ label: '< $30m' }] },
  preferences: { asset_class: [{ name: 'Hedge Funds' }], allocations: [{ ticket_size: { value_lower_usd: 1, value_upper_usd: 5 } }] } };
const helpers = { httpRequest: async (o) => o.method === 'POST' ? { data: { searchInvestor: profile } } : { headers: {}, body: '' } };
const run = async (items) => {
  const $ = (n) => n === 'Read Auth' ? { first: () => ({ json: { access_token: 'x', seconds_left: 3600 } }) } : { all: () => items.map(json => ({ json })) };
  const fn = new Function('$', 'setTimeout', 'return (async function(){' + src + '}).call(this)');
  return fn.call({ helpers }, $, (f) => f());
};
const URL1 = 'https://platform.withintelligence.com/explore/investors/42';

test('a blank alert is filled, money in dollars, country from the full list', async () => {
  const [{ json: m }] = await run([{ investor_name: 'Mahi546', view_investor_url: URL1, evidence: '{}' }]);
  assert.equal(m.investor_country, 'AT');
  assert.equal(m.aum_usd, 7210000);
  assert.equal(m.ticket_min_usd, 1000000);
  assert.equal(m.ticket_max_usd, 5000000);
  assert.equal(m.investor_name, 'Mahi546 GmbH');
});

test('values the alert already has are kept (fill blanks only); the name is corrected and the old one kept', async () => {
  const [{ json: m }] = await run([{ investor_name: 'Mahi546', investor_country: 'AT', investor_type: 'SFO', aum_usd: 9000000, view_investor_url: URL1, evidence: '{}' }]);
  assert.equal(m.investor_type, 'SFO');
  assert.equal(m.aum_usd, 9000000);
  assert.ok(!m._wi_filled.includes('aum_usd'));
  assert.equal(m.investor_name, 'Mahi546 GmbH');
  assert.equal(m._wi_name_from_alert, 'Mahi546');
  assert.equal(JSON.parse(m.evidence).name_from_alert, 'Mahi546');
});

test('country names map to ISO codes; an unknown name stays blank', async () => {
  const want = { Slovenia: 'SI', Monaco: 'MC', Chile: 'CL', 'South Korea': 'KR', 'United Kingdom': 'GB', France: 'FR',
    Taiwan: 'TW', Austria: 'AT', Serbia: 'RS', Narnia: undefined };
  for (const [name, code] of Object.entries(want)) {
    profile.address.country.name = name;
    const [{ json: m }] = await run([{ investor_name: 'X', view_investor_url: URL1, evidence: '{}' }]);
    assert.equal(m.investor_country, code, name);
  }
  profile.address.country.name = 'Austria';
});

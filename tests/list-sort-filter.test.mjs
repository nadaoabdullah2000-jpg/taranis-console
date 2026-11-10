/* Run with: npm test
   The list sort (every option, both directions, empties last) and the
   emerging-managers filter, on the functions as they stand in app.js. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const grab = (a, b) => {
  const i = src.indexOf(a);
  assert.ok(i > -1, 'not found: ' + a);
  return src.slice(i, src.indexOf(b, i));
};
const store = {};
const ctx = { Date, Number, JSON, Intl, Array, String, isFinite,
  localStorage: { getItem: (k) => store[k] || null, setItem: (k, v) => { store[k] = v; } },
  OPPS_COUNTRY_NAMES: { GB: 'United Kingdom', US: 'United States', CH: 'Switzerland' },
  techOf: () => false, asText: (v) => Array.isArray(v) ? v.join(' ') : String(v || ''),
  // The verdict as app.js reads it, and the criteria met (given on the test rows).
  bandOf: (m) => String((m && m.new_qualification) || (m && m.qualification) || 'uncertain').trim().toLowerCase(),
  critOf: (m) => (m && m._crit) || [false, false, false] };
vm.createContext(ctx);
vm.runInContext(grab('const LIST_SORTS = [', '// The Sort dropdown')
  + grab('function assetMatches(', '// A row\'s verdict is new_qualification')
  + '\nthis.sortMandates = sortMandates; this.LIST_SORTS = LIST_SORTS; this.emergingOf = emergingOf; this.listPasses = listPasses; this.assetOptsFor = assetOptsFor; this.ASSET_OPTS = ASSET_OPTS;', ctx);
const ids = (rows) => rows.map(r => r.id);

const ROWS = [
  { id: 1, investor_name: 'beta Capital',  investor_country: 'US', new_qualification: 'matched',   new_fit_score: '0.9',  fit_score: 1,   alert_date: '2026-10-02', ticket_max_usd: '10000000', aum_usd: 9e8 },
  { id: 2, investor_name: 'Alpha Fund',    investor_country: 'GB', new_qualification: 'needs_data', new_fit_score: null, fit_score: 1,   alert_date: '2026-11-01', ticket_min_usd: 500000,     aum_usd: '1200000000' },
  { id: 3, investor_name: 'Zeta Partners', investor_country: '',   new_qualification: 'uncertain',  new_fit_score: 0.65, alert_date: null, created_at: '2026-09-01T10:00:00Z' },
  { id: 4, investor_name: 'Ünder Trust',   investor_country: 'CH', new_qualification: 'low',        new_fit_score: 0.2,  alert_date: '2026-08-15', ticket_max_usd: 2000000, aum_usd: 0 },
  { id: 5, investor_name: '',              organization_name: '',  qualification: 'uncertain', fit_score: '0.75', alert_date: '2026-07-01',
    _intentions: [{ alert_date: '2026-07-01' }, { alert_date: '2026-11-03' }] }
];

test('every sort option is wired, and the dropdown keeps its keys', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.LIST_SORTS.map(([k]) => k))),
    ['best', 'score_asc', 'latest', 'oldest', 'ticket', 'ticket_asc', 'aum', 'aum_asc', 'name', 'name_desc', 'country', 'unread']);
});

test('score sorts as a number and follows the verdict, not the stale intake score', () => {
  // #2 has a verdict but no re-score: its old fit_score of 1 must not put it first.
  // Best match first goes by verdict: matched, review, needs data, low fit.
  assert.deepEqual(ids(ctx.sortMandates(ROWS, 'best')), [1, 5, 3, 2, 4]);
  assert.deepEqual(ids(ctx.sortMandates(ROWS, 'score_asc')), [4, 3, 5, 1, 2]);   // no score is last both ways
});

test('dates sort as dates; a folded card uses its newest alert', () => {
  assert.deepEqual(ids(ctx.sortMandates(ROWS, 'latest')), [5, 2, 1, 3, 4]);
  assert.deepEqual(ids(ctx.sortMandates(ROWS, 'oldest')), [4, 3, 1, 2, 5]);
});

test('ticket and AUM sort as numbers (text "10000000" is not below "2000000"), empties last', () => {
  assert.deepEqual(ids(ctx.sortMandates(ROWS, 'ticket')), [1, 4, 2, 5, 3]);
  assert.deepEqual(ids(ctx.sortMandates(ROWS, 'ticket_asc')), [2, 4, 1, 5, 3]);
  assert.deepEqual(ids(ctx.sortMandates(ROWS, 'aum')).slice(0, 2), [2, 1]);
  assert.deepEqual(ids(ctx.sortMandates(ROWS, 'aum_asc')).slice(0, 2), [1, 2]);
});

test('names sort A–Z / Z–A ignoring case and accents; blank names last', () => {
  assert.deepEqual(ids(ctx.sortMandates(ROWS, 'name')), [2, 1, 4, 3, 5]);
  assert.deepEqual(ids(ctx.sortMandates(ROWS, 'name_desc')), [3, 4, 1, 2, 5]);
  assert.deepEqual(ids(ctx.sortMandates(ROWS, 'country')).slice(0, 3), [4, 2, 1]);   // Switzerland, United Kingdom, United States
});

test('sorting does not change the rows it is given', () => {
  const copy = ROWS.slice();
  ctx.sortMandates(ROWS, 'name');
  assert.deepEqual(ids(ROWS), ids(copy));
  assert.equal(ctx.sortMandates(null, 'best').length, 0);
});

test('emerging managers: Yes / No / Unknown from the profile, never guessed', () => {
  assert.equal(ctx.emergingOf({ open_to_emerging_managers: true }), 'yes');
  assert.equal(ctx.emergingOf({ open_to_emerging_managers: false }), 'no');
  assert.equal(ctx.emergingOf({ open_to_emerging_managers: null }), 'unknown');
  assert.equal(ctx.emergingOf({}), 'unknown');
  assert.equal(ctx.emergingOf({ open_to_emerging_managers: null, _intentions: [{ open_to_emerging_managers: false }] }), 'no');
  assert.equal(ctx.emergingOf({ open_to_emerging_managers: false, _intentions: [{ open_to_emerging_managers: true }] }), 'yes');
  const F = { q: '', country: '', type: '', strategy: '', asset: '', tmin: '', emerging: 'unknown' };
  assert.equal(ctx.listPasses({ open_to_emerging_managers: null }, F), true);
  assert.equal(ctx.listPasses({ open_to_emerging_managers: true }, F), false);
  assert.equal(ctx.listPasses({ open_to_emerging_managers: true }, F, 'emerging'), true);
});

const vmArr = (x) => JSON.parse(JSON.stringify(x));
test('strategy -> asset class: a strategy lists and selects only its own asset classes', () => {
  const opts = vmArr(ctx.assetOptsFor('equity_long_short'));
  assert.deepEqual(opts.map(o => o[0]), ['', 'hedge', 'equity', 'tech_equity']);
  assert.match(opts[0][1], /^All for Equity long\/short/);
  assert.equal(vmArr(ctx.assetOptsFor('')).length, vmArr(ctx.ASSET_OPTS).length);
  const els = { strategies: ['equity_long_short'], asset_classes: ['Equity'] };
  const tech = { strategies: '["equity"]', asset_classes: '["Semiconductors"]' };
  const pe = { strategies: ['buyout'], asset_classes: ['Private Equity'] };
  const elsPE = { strategies: ['equity_long_short'], asset_classes: ['Private Equity'] };
  const noAssets = { strategies: ['Equity-Long/Short'], asset_classes: [] };
  const F = (s, a) => ({ q: '', country: '', type: '', strategy: s, asset: a || '', tmin: '', emerging: '' });
  assert.equal(ctx.listPasses(els, F('equity_long_short')), true);
  assert.equal(ctx.listPasses(tech, F('equity_long_short')), true);
  assert.equal(ctx.listPasses(tech, F('equity_long_short', 'equity')), false);   // one class picked
  assert.equal(ctx.listPasses(tech, F('equity_long_short', 'tech_equity')), true);
  assert.equal(ctx.listPasses(elsPE, F('equity_long_short')), false);            // PE is not an ELS class
  assert.equal(ctx.listPasses(noAssets, F('equity_long_short')), true);          // nothing contradicts it
  assert.equal(ctx.listPasses(pe, F('equity_long_short')), false);
  assert.equal(ctx.listPasses(pe, F('private_equity')), true);
  assert.equal(ctx.listPasses(pe, F('', 'equity')), false);                       // private equity is not listed equity
  assert.equal(ctx.listPasses({ strategies: ['cta'], asset_classes: ['Hedge Funds'] }, F('cta')), true);
  assert.equal(ctx.listPasses({ strategies: ['credit'], asset_classes: ['Hedge Funds'] }, F('credit')), true);
});

test('best match first: verdict before score, then score, then more criteria met, then the newest intention', () => {
  const rows = [
    { id: 10, new_qualification: 'uncertain', new_fit_score: 0.74, alert_date: '2026-11-09', _crit: [true, false, false] },   // capped review, 1 of 3, newest
    { id: 11, new_qualification: 'uncertain', new_fit_score: 0.74, alert_date: '2026-10-01', _crit: [true, true, false] },    // capped review, 2 of 3
    { id: 12, new_qualification: 'matched',   new_fit_score: 0.75, alert_date: '2026-06-01', _crit: [true, false, false] },
    { id: 13, new_qualification: 'matched',   new_fit_score: 1,    alert_date: '2026-06-01', _crit: [true, true, false] },
    { id: 14, new_qualification: 'needs_data', new_fit_score: null, alert_date: '2026-11-10' },
    { id: 15, new_qualification: 'low',       new_fit_score: 0.25, alert_date: '2026-11-10' },
    { id: 16, new_qualification: 'uncertain', new_fit_score: 0.74, alert_date: '2026-11-10', _crit: [true, false, false] }   // 1 of 3, newer than #10
  ];
  assert.deepEqual(ids(ctx.sortMandates(rows, 'best')), [13, 12, 11, 16, 10, 14, 15]);
});

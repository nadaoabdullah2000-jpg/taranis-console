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
  techOf: () => false, asText: (v) => Array.isArray(v) ? v.join(' ') : String(v || '') };
vm.createContext(ctx);
vm.runInContext(grab('const LIST_SORTS = [', '// The Sort dropdown')
  + grab('function assetMatches(', '// A row\'s verdict is new_qualification')
  + '\nthis.sortMandates = sortMandates; this.LIST_SORTS = LIST_SORTS; this.emergingOf = emergingOf; this.listPasses = listPasses;', ctx);
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
  assert.deepEqual(ids(ctx.sortMandates(ROWS, 'best')), [1, 5, 3, 4, 2]);
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

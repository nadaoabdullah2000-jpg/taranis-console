/* Run with: npm test
   I-Connections rows show the firm's With Intelligence link and stored
   profile (schema-22, 10 Nov 2026). Only an id becomes a link. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const grab = (a, b) => src.slice(src.indexOf(a), src.indexOf(b, src.indexOf(a)));
const ctx = { ICONN: { wi: {} } }; vm.createContext(ctx);
vm.runInContext([grab('function iconnMoney', '\n}') + '\n}', grab('function iconnWiOf', 'function iconnFitCell'),
  'this.iconnWiOf = iconnWiOf; this.iconnWiUrl = iconnWiUrl; this.iconnWiFacts = iconnWiFacts;'].join('\n'), ctx);

test('only a With Intelligence id becomes a link', () => {
  assert.equal(ctx.iconnWiUrl('2147330186'), 'https://platform.withintelligence.com/explore/investors/2147330186');
  assert.equal(ctx.iconnWiUrl('-374934189'), 'https://platform.withintelligence.com/explore/investors/-374934189');
  assert.equal(ctx.iconnWiUrl('javascript:alert(1)'), null);
  assert.equal(ctx.iconnWiUrl(null), null);
});

test('the stored profile reads as one line', () => {
  const p = { name: 'Louisiana School Employees Retirement System', type: 'Public D.B.', country: 'US', aum_band: 'USD 2.6bn',
    ticket_min_usd: 10000000, ticket_max_usd: 50000000, emerging: true, strategies: ['Equity', 'Event Driven', 'Multi-Strategy', 'Macro'] };
  assert.equal(ctx.iconnWiFacts(p), 'Public D.B. · US · USD 2.6bn · ticket $10m–$50m · emerging managers: yes · Equity, Event Driven, Multi-Strategy +1');
  assert.equal(ctx.iconnWiFacts({ type: 'Endowment', ticket_max_usd: 5000000 }), 'Endowment · ticket $5m');
  assert.equal(ctx.iconnWiFacts(null), '');
});

test('a firm finds its entry by any of its rows', () => {
  ctx.ICONN.wi = { 7: { wi_id: '1904' } };
  assert.equal(ctx.iconnWiOf({ row_nos: [3, 7] }).wi_id, '1904');
  assert.equal(ctx.iconnWiOf({ row_nos: [4] }), null);
});

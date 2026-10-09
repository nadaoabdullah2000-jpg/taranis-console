/* Run with: npm test
   Only a reject that disqualifies the whole investor hides its other open rows
   in Opportunities (entityRejected in app.js). Reasons are taken from stored rows. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const grab = (a, b) => src.slice(src.indexOf(a), src.indexOf(b, src.indexOf(a)));
const ctx = {};
vm.createContext(ctx);
vm.runInContext([
  grab('const KNOWN_MANAGERS', '\n'),
  grab('const RE_NOT_ALLOCATOR', '\n'),
  grab('function wiReasonsOf', 'function isNotMandate'),
  grab('const RE_ENTITY_REJECT', 'function isSwiss'),
  'this.entityRejected = entityRejected;'
].join('\n'), ctx);
const rej = (reasons, extra) => ctx.entityRejected(Object.assign({ hard_fail_reasons: reasons }, extra || {}));

test('a reject about the investor itself hides the investor', () => {
  assert.equal(rej(['Deutsche Bank raises capital rather than placing it, so it is not an investor']), true);
  assert.equal(rej(['Not an allocator - investment consultant reporting what its clients want']), true);
  assert.equal(rej(['Not an allocator - asset manager; the alert is a market outlook, not an allocation']), true);
  assert.equal(rej(['Not a direct allocator / misattributed L/S signal - assets managed via MassPRIM state pool.']), true);
  assert.equal(rej([], { investor_name: 'Bridgewater Associates' }), true);
  assert.equal(rej(['Asset class excludes hedge funds'], { investor_type: 'Venture Capital' }), true);
  assert.equal(rej([], { investor_type: 'hedge fund' }), true);
});

test('a reject of one mandate or item does not hide the investor', () => {
  assert.equal(rej(['Asset class excludes hedge funds', 'No eligible strategy: special situations']), false);
  assert.equal(rej(['Asset class excludes hedge funds: Equity'], { investor_type: 'Public D.B.' }), false);
  assert.equal(rej(['Not an investor mandate - WI filed it under performance']), false);
  assert.equal(rej(['Not an investor mandate — performance report']), false);
  assert.equal(rej(['Asset class excludes hedge funds', 'No eligible strategy', 'Ineligible type: venture capital'],
    { investor_type: 'Wealth Manager' }), false);
  assert.equal(rej(['Criteria mismatch - wants $500m+ AuM and a 10-year record']), false);
});

/* Run with: npm test
   The Space criterion (4 Nov 2026): explicit space wording only. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const a = src.indexOf('const RE_SPACE'), b = src.indexOf('// The hard rule', a);
const ctx = { sigText: () => '' }; vm.createContext(ctx);
vm.runInContext(src.slice(a, b) + '\nthis.spaceOf = spaceOf; this.spaceStatus = spaceStatus; this.MC = ' + JSON.stringify(null) + ';', ctx);
const MATCH = /const MATCH_CRITERIA = (\[[^\]]+\])/.exec(src)[1];

test('the three scored criteria are long/short or quant, technology and space', () => {
  assert.deepEqual(JSON.parse(MATCH.replace(/'/g, '"')), ['Long/short or quant', 'Technology focus', 'Space']);
});

test('space wording counts; ordinary uses of "space" and satellite allocations do not', () => {
  for (const t of ['invests in the space economy', 'backs satellite operators', 'aerospace and defence', 'new space startups', 'launch vehicles'])
    assert.equal(ctx.spaceOf({}, t), true, t);
  for (const t of ['office space in London', 'a leader in the AI space', 'liquid credit for satellite allocations', 'interested in satellite funds', ''])
    assert.equal(ctx.spaceOf({}, t), false, t);
});

test('the stored signal decides yes; no stored signal and no wording is unknown', () => {
  assert.equal(ctx.spaceStatus({ is_space: true }, ''), 'yes');
  assert.equal(ctx.spaceStatus({ is_space: false }, ''), 'no');
  assert.equal(ctx.spaceStatus({ is_space: null }, ''), 'unknown');
  assert.equal(ctx.spaceStatus({ is_space: false }, 'space technology'), 'yes');
});

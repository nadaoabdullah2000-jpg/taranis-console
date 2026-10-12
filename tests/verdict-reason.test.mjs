/* Run with: npm test
   The mandate banner's reason comes from the same source as its verdict
   (verdictReason in app.js), never from the model's fit_reason. Rows are
   stored rows from 12 Oct 2026, trimmed to the fields the rule reads. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const grab = (a, b) => src.slice(src.indexOf(a), src.indexOf(b, src.indexOf(a)));
const ctx = { el: () => ({}), htmlToText: (s) => String(s || ''), cleanText: String, session: null };
vm.createContext(ctx);
vm.runInContext([
  grab('const jsonArr', '\n};') + '\n};',
  grab('function scoreText', '\n}') + '\n}',
  grab('const KNOWN_MANAGERS', '\n'),
  grab('const MATCH_CRITERIA', 'function ensureMatchCss'),
  'this.verdictReason = verdictReason; this.aiOpinion = aiOpinion;'
].join('\n'), ctx);
const why = (m) => ctx.verdictReason(m);

const NYU = { id: 2026, investor_type: 'endowment', investor_country: 'US', investor_tag: 'Intentions',
  strategies: ['macro', 'relative_value', 'multi_strategy', 'quant'], asset_classes: ['hedge funds'],
  open_to_emerging_managers: true,
  intention_summary: 'Planning to make new commitments to hedge funds focusing on various strategies.',
  appetite_raw: "The investor's primary investment themes include energy transition, artificial intelligence, digital infrastructure, healthcare and longevity, security and defense, and financial technology.",
  evidence: { strategy: 'macro, relative value, multi-strategy, and quant' }, hard_fail_reasons: [],
  new_qualification: 'matched', new_fit_score: 1, fit_reason: 'macro/CTA - wrong fit' };

test('a matched row reads from the rule, not the model', () => {
  const r = why(NYU);
  assert.match(r, /^Quant stated, technology interest, buys hedge funds/);
  assert.doesNotMatch(r, /wrong fit/);
  const kgi = { investor_type: 'Insurance', investor_country: 'TA', investor_city: 'Taipei', strategies: ['equity_long_short'],
    asset_classes: ['hedge funds'], hard_fail_reasons: ['Investor outside GB/CH/US: TA'],
    new_qualification: 'matched', new_fit_score: 1, fit_reason: 'Hard criteria failure' };
  assert.match(why(kgi), /^Long\/short equity stated/);
  assert.doesNotMatch(why(kgi), /failure/);
});

test('rejected, low, review and needs data each say why in the rule\'s terms', () => {
  assert.equal(why({ strategies: ['high_yield'], asset_classes: ['Fixed Income'], investor_type: 'pension fund',
    hard_fail_reasons: ['Asset class excludes hedge funds', 'Investor outside GB/CH/US: NL', 'No eligible strategy: high yield'],
    new_qualification: 'rejected', fit_reason: 'Hard criteria failure' }), 'Does not buy hedge funds; no long/short or quant.');
  assert.match(why({ strategies: ['multi_strategy'], asset_classes: ['hedge funds'],
    appetite_raw: 'equity market-neutral and trend-following', new_qualification: 'low', fit_reason: 'Hard criteria failure' }),
    /^Only market-neutral stated/);
  assert.match(why({ intention_summary: 'Primary investment themes focus on artificial intelligence, financial technology.',
    new_qualification: 'uncertain', fit_reason: 'Hard criteria failure' }), /^Technology interest, but no long\/short or quant stated/);
  assert.match(why({ strategies: ['government_bonds'], asset_classes: [], new_qualification: 'needs_data',
    fit_reason: 'hedge-fund allocator, strategy not stated - needs data' }), /^Hedge-fund appetite not stated; .*needs data/);
});

test('a person\'s own reason is kept; a hand verdict without one is marked', () => {
  const k2 = { verdict_source: 'manual', new_qualification: 'rejected',
    fit_reason: 'Not an investor mandate — headline (no investor named)', hard_fail_reasons: [] };
  assert.equal(why(k2), 'Decided by hand: Not an investor mandate — headline (no investor named)');
  const set = { verdict_source: 'manual', new_qualification: 'needs_data', asset_classes: ['Equity'],
    fit_reason: 'Hedge-fund allocator, strategy not stated - needs data' };
  assert.match(why(set), /^Set by hand\. /);
  assert.doesNotMatch(why(set), /Hedge-fund allocator/);
});

test('the model\'s text survives only as the folded AI opinion', () => {
  assert.notEqual(ctx.aiOpinion(NYU), null);
  assert.equal(ctx.aiOpinion({ fit_reason: 'Hard criteria failure' }), null);
});

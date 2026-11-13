/* Run with: npm test
   Low fit (CTA / macro / market-neutral) only when the mandate itself is about
   that strategy, not because the word sits in the investor's whole With
   Intelligence strategy list; underscore tags such as equity_long_short read
   as long/short (9 Nov 2026). Rows are stored rows, trimmed. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const grab = (a, b) => src.slice(src.indexOf(a), src.indexOf(b, src.indexOf(a)));
const ctx = { Intl, el: () => ({}), htmlToText: (s) => String(s || ''), cleanText: String, session: null };
vm.createContext(ctx);
vm.runInContext([
  grab('const jsonArr', '\n};') + '\n};',
  grab('function scoreText', '\n}') + '\n}',
  grab('const KNOWN_MANAGERS', '\n'),
  grab('const REGION_NAMES', '// WI\'s tags and types as words'),
  grab('const MATCH_CRITERIA', 'function ensureMatchCss'),
  'this.rescore = rescore; this.verdictReason = verdictReason; this.lsTier = lsTier;'
].join('\n'), ctx);

const base = { investor_country: 'US', investor_tag: null, asset_classes: ['Hedge Funds'], hf_evidence: 'confirmed',
  open_to_emerging_managers: true, evidence: { wi_investor_id: '1' } };

// 776 Illinois SURS: an investor export whose ten-tag menu includes macro and cta.
const SURS = { ...base, id: 776, investor_type: 'Pension Fund', alert_type: 'Investor export',
  intention_summary: 'The State Universities Retirement System of Illinois (SURS) is a US-based public defined benefit retirement savings plan.',
  strategies: ['other', 'relative_value', 'multi_strategy', 'credit', 'macro', 'cta', 'long_volatility', 'tail_risk', 'alternative_risk_premia', 'commodities'] };
// 1353 NYC Fire: the menu also lists equity_long_short.
const NYCF = { ...base, id: 1353, investor_type: 'Pension Fund', hf_evidence: 'unconfirmed',
  intention_summary: 'The New York City Fire Retirement System defined benefit pension fund.',
  strategies: ['macro', 'equity', 'credit', 'event_driven', 'other', 'cta', 'multi_strategy', 'relative_value', 'em_macro',
    'equity_long_short', 'merger_arbitrage', 'equity_market-neutral', 'long_bias_equity', 'alternative_markets_cta', 'commodities'] };

test('a CTA or macro tag in a long strategy menu does not make the row low fit', () => {
  const r = ctx.rescore(SURS);
  assert.notEqual(r.q, 'low');
  assert.equal(r.q, 'needs_data');
});

test('equity_long_short reads as long/short', () => {
  const r = ctx.rescore(NYCF);
  assert.equal(r.band, 'strong');
  assert.equal(r.q, 'uncertain');           // hedge fund investing unconfirmed caps it at review
  assert.equal(r.s, 0.74);
  // Matched requires long/short AND technology (11 Nov 2026): long/short alone waits for a decision.
  const one = ctx.rescore({ ...base, investor_type: 'Insurance', strategies: ['equity_long_short'] });
  assert.equal(one.q, 'uncertain');
  assert.ok(one.s <= 0.74);
  // Technology from the alert text alone is a low match (11 Nov 2026): matched, but capped at 89%,
  // below every quoted match; a With Intelligence quote makes a full match.
  const textOnly = ctx.rescore({ ...base, investor_type: 'Insurance', strategies: ['equity_long_short'], intention_summary: 'Wants technology managers.' });
  assert.equal(textOnly.q, 'matched');
  assert.equal(textOnly.low, true);
  assert.ok(textOnly.s <= 0.89);
  const both = ctx.rescore({ ...base, investor_type: 'Insurance', strategies: ['equity_long_short'], is_tech_investor: true,
    tech_signal: 'With Intelligence profile (Grok): "Favours technology-focused long/short managers."' });
  assert.equal(both.q, 'matched');
  assert.ok(both.s >= 0.90);
  const person = ctx.rescore({ ...base, investor_type: 'Insurance', strategies: ['equity_long_short'], is_tech_investor: true,
    tech_signal: 'Set by a person: someone, 2026-11-11' });
  assert.equal(person.q, 'matched');
});

test('a mandate that is itself about macro or CTA is still low fit', () => {
  const said = ctx.rescore({ ...SURS, intention_summary: 'Searching for a global macro manager for a $50m mandate.' });
  assert.equal(said.q, 'low');
  assert.match(ctx.verdictReason({ ...SURS, intention_summary: 'Searching for a global macro manager.', new_qualification: 'low', new_fit_score: 0.25 }),
    /Only global macro stated/);
  const shortList = ctx.rescore({ ...SURS, intention_summary: 'Mandate has been added.', strategies: ['CTA', 'Trend-Following'] });
  assert.equal(shortList.q, 'low');
});

test('checked, no matching strategy: short hedge-fund strategy list with no long/short, tech or space is Low fit (13 Nov 2026)', () => {
  const mh = { ...base, investor_type: 'Corporate D.B.', asset_classes: ['Public Markets', 'Hedge Funds'], strategies: ['Macro', 'Convertible Bonds', 'Commodities'] };
  assert.equal(ctx.rescore(mh).q, 'low');
  const marked = { ...base, asset_classes: ['Hedge Funds'], strategies: ['Coinvestment'], evidence: { no_matching_strategy: 'Checked 13 Nov 2026' } };
  assert.equal(ctx.rescore(marked).q, 'low');
  const none = { ...base, asset_classes: ['Hedge Funds', 'Private Equity'], strategies: ['Corporate Bonds', 'Growth Capital'] };
  assert.equal(ctx.rescore(none).q, 'needs_data');
});

test('a long/short tag in a long strategy list counts unless the newest hedge fund intention contradicts it (13 Nov 2026)', () => {
  const menu = { ...base, asset_classes: ['Hedge Funds', 'Private Equity', 'Equity'], strategies: ['macro', 'event_driven', 'credit', 'relative_value', 'long/short equity'],
    intention_summary: 'Plans new hedge fund commitments.', is_tech_investor: true, tech_signal: 'With Intelligence profile (Grok): "Prioritizes technology."' };
  assert.equal(ctx.rescore(menu).q, 'matched');
  // the newest hedge fund intention names other strategies only: the menu tag does not count
  const contradicted = { ...menu, evidence: { wi_investor_id: '1', newest_intention_criteria: { long_short: false, at: '2026-11-13' } } };
  assert.notEqual(ctx.rescore(contradicted).q, 'matched');
});

test('"quantitative analysis" in a due-diligence process is not quant (13 Nov 2026)', () => {
  const dd = { ...base, investor_type: 'Asset Manager', intention_summary: 'The first step is focused on quantitative analysis of the manager.' };
  assert.notEqual(ctx.rescore(dd).band.indexOf('strong'), 0);
  assert.equal(ctx.rescore({ ...dd, intention_summary: 'Favors quantitative strategies.' }).band, 'strong');
});

test('the hire cap is lifted only when long/short and Tech both come from the profile (13 Nov 2026)', () => {
  const hire = { ...base, investor_tag: 'People', investor_type: 'Endowment', strategies: ['equity', 'long/short equity'],
    is_tech_investor: true, tech_signal: 'With Intelligence profile (Grok): "The investor\'s investment theme over the next 12-18 months is artificial intelligence."' };
  assert.equal(ctx.rescore(hire).band, 'hire');                       // tags only: stays a hire
  const quoted = { ...hire, evidence: { wi_investor_id: '1', equity_long_short: '"focusing on macro, multi-strategy, equity hedge" (hedge fund intention, 2026-10-06)' } };
  assert.equal(ctx.rescore(quoted).q, 'matched');
  assert.equal(ctx.rescore({ ...quoted, is_tech_investor: null, tech_signal: null, intention_summary: 'technology' }).band, 'hire'); // Tech from alert text: stays a hire
});

test('long/short evidence ranks: long/short equity, then equity hedge, then plain equity (13 Nov 2026)', () => {
  const hf = { ...base, asset_classes: ['Hedge Funds'] };
  assert.equal(ctx.lsTier({ ...hf, intention_summary: 'Seeks equity long/short managers.' }), 1);
  assert.equal(ctx.lsTier({ ...hf, evidence: { wi_investor_id: '1', equity_long_short: '"commitments to event driven and equity hedge funds" (hedge fund intention, 2026-05-12)' } }), 2);
  assert.equal(ctx.lsTier({ ...hf, evidence: { wi_investor_id: '1', equity_long_short: '"Strategies include relative value, equity, macro" (hedge fund intention, 2025-12-23)' } }), 3);
  assert.equal(ctx.lsTier({ ...hf, strategies: ['equity'] }), 3);
  assert.equal(ctx.lsTier({ ...hf, strategies: ['macro', 'credit', 'cta', 'relative value', 'long/short equity'] }), 2);  // menu tag: one step lower
  assert.equal(ctx.lsTier({ ...hf, intention_summary: 'Wants 130/30 equity and long-only equity funds.', strategies: [] }), 4);
});

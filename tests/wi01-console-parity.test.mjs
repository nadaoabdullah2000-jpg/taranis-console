/* Run with: npm test
   WI 01 "Apply Taranis Hard Criteria" and the console's rescore() read the same row the same way (13 Nov 2026):
   long/short (text, hedge fund intention quote, tags, the newest-intention marker, a "not long/short" check),
   Technology (text, profile quote, a person's choice), Space, the "no matching strategy" marker, hf_evidence and the
   hire cap. Each case is checked on both. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const grab = (a, b) => src.slice(src.indexOf(a), src.indexOf(b, src.indexOf(a)));
const ctx = { Intl, el: () => ({}), htmlToText: (s) => String(s || ''), cleanText: String, session: null };
vm.createContext(ctx);
vm.runInContext([grab('const jsonArr', '\n};') + '\n};', grab('function scoreText', '\n}') + '\n}', grab('const KNOWN_MANAGERS', '\n'),
  grab('const REGION_NAMES', '// WI\'s tags and types as words'), grab('const MATCH_CRITERIA', 'function ensureMatchCss'),
  'this.rescore = rescore;'].join('\n'), ctx);
const code = readFileSync(new URL('../n8n/wi01-apply-hard-criteria.js', import.meta.url), 'utf8');
const wi01 = (m) => new Function('$json', code)(Object.assign({}, m, { strategies: JSON.stringify(m.strategies || []), asset_classes: JSON.stringify(m.asset_classes || []) })).json;
const norm = (b) => (b === 'strong_tech' || b === 'strong') ? 'strong' : b;
const both = (m) => { const c = ctx.rescore(m); const w = wi01(m); return [norm(c.band), w.hard_status === 'fail' ? 'rejected' : norm(w.score_band)]; };

const base = { investor_name: 'Some Pension', investor_type: 'Public D.B.', investor_country: 'US', asset_classes: ['Hedge Funds'],
  intention_summary: 'Plans new hedge fund commitments.', source_links: [{ label: 'View investor', url: '' }], evidence: { wi_investor_id: '1' } };
const cases = {
  'long menu tag': { strategies: ['macro', 'credit', 'cta', 'relative value', 'long/short equity'] },
  'long menu tag, contradicted': { strategies: ['macro', 'credit', 'cta', 'relative value', 'long/short equity'], evidence: { wi_investor_id: '1', newest_intention_criteria: { long_short: false } } },
  'equity quote': { asset_classes: ['Hedge Funds', 'Equity'], evidence: { wi_investor_id: '1', equity_long_short: '"Strategies include equity, macro" (hedge fund intention)' } },
  'checked not long/short': { strategies: ['equity'], evidence: { wi_investor_id: '1', equity_not_long_short: 'long-only' } },
  'person says no Tech': { strategies: ['long/short equity'], intention_summary: 'Wants software managers.', is_tech_investor: false, tech_signal: 'Set by a person: x' },
  'profile Tech quote': { strategies: ['long/short equity'], is_tech_investor: true, tech_signal: 'With Intelligence profile (Grok): "AI."' },
  'no matching strategy marker': { evidence: { wi_investor_id: '1', no_matching_strategy: 'Checked' } },
  'not a hedge fund investor': { strategies: ['long/short equity'], hf_evidence: 'no' },
  'hire, tags only': { investor_tag: 'People', investor_type: 'Endowment', strategies: ['equity', 'long/short equity'], is_tech_investor: true, tech_signal: 'With Intelligence profile (Grok): "AI."' },
  'hire, profile quotes': { investor_tag: 'People', investor_type: 'Endowment', strategies: ['equity', 'long/short equity'], is_tech_investor: true, tech_signal: 'With Intelligence profile (Grok): "AI."',
    evidence: { wi_investor_id: '1', equity_long_short: '"equity hedge" (hedge fund intention)' } },
  'quantitative analysis': { intention_summary: 'The first step is quantitative analysis of the manager; plans hedge fund commitments.' },
  '130/30 equity': { intention_summary: 'Hedge funds: seeks 130/30 equity funds.' },
  'profile Space': { is_space: true }
};
for (const [name, c] of Object.entries(cases)) {
  test('console and WI 01 agree: ' + name, () => { const [a, b] = both(Object.assign({}, base, c)); assert.equal(b, a); });
}

test('a new alert for an enriched investor inherits its stored evidence and gets the card verdict (13 Nov 2026)', () => {
  // Wyoming-like: the alert itself says nothing about long/short or technology.
  const alert = Object.assign({}, base, { asset_classes: ['Hedge Funds', 'Equity'], intention_summary: 'Wyoming Retirement System names a new deputy CIO.', investor_tag: 'Intentions' });
  const stored = { inherit_from_id: 1375,
    inherit_evidence: { equity_long_short: '"commitments to event driven and equity hedge funds" (hedge fund intention, 2026-05-12)' },
    inherit_is_tech: true, inherit_tech_signal: 'With Intelligence profile (Grok): "Primary themes include artificial intelligence."' };
  const bare = wi01(alert);
  assert.notEqual(norm(bare.score_band), 'strong');                       // without inheritance: scored lower
  const w = wi01(Object.assign({}, alert, { _inherit: stored }));
  assert.equal(w.score_band, 'strong_tech'); assert.equal(w.hard_status, 'pass');
  assert.deepEqual(w._inherited, ['evidence.equity_long_short', 'is_tech_investor']);
  // the console, re-scoring the row as stored, gives the same verdict
  const row = Object.assign({}, alert, { evidence: w.evidence, is_tech_investor: w.is_tech_investor, tech_signal: w.tech_signal });
  assert.equal(ctx.rescore(row).q, 'matched');
  // never over the alert's own value: a person's "no" on the new row stays
  const own = wi01(Object.assign({}, alert, { is_tech_investor: false, tech_signal: 'Set by a person: x', _inherit: stored }));
  assert.equal(own.is_tech_investor, false); assert.ok(!own._inherited.includes('is_tech_investor'));
});

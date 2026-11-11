/* Run with: npm test
   A rescore from the investor's newest intention can find that it no longer asks
   for long/short (evidence.newest_intention_criteria.long_short = false, 11 Nov
   2026). The card must then show long/short as not met, not a tick from the
   older strategy tags. Rows are stored rows, trimmed. */
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
  grab('const TARANIS_CRITERIA', '/* Whether the allocator'),
  grab('function taranisScorecard', 'const MARK'),
  grab('const MATCH_CRITERIA', 'function ensureMatchCss'),
  'this.rescore = rescore; this.critStatus = critStatus; this.critOf = critOf; this.taranisScorecard = taranisScorecard;'
].join('\n'), ctx);

// 358 Texas Permanent School Fund: two tags, one long/short; its newest intention
// (25 Aug 2026) does not ask for long/short.
const TPSF = { id: 358, investor_country: 'US', investor_type: 'Endowment', asset_classes: ['Hedge Funds'],
  hf_evidence: 'confirmed', open_to_emerging_managers: null,
  intention_summary: 'Texas Permanent School Fund Corporation plans hedge fund commitments.',
  strategies: ['Equity', 'Long/Short Equity'] };
const marked = (m) => ({ ...m, evidence: { wi_investor_id: '1', newest_intention_criteria: { long_short: false, at: '2026-11-11' } } });

test('without the marker the long/short tag is a tick', () => {
  assert.equal(ctx.critStatus({ ...TPSF, evidence: { wi_investor_id: '1' } })[0], 'yes');
});

test('the newest intention without long/short shows it as not met', () => {
  const m = marked(TPSF);
  assert.equal(ctx.critStatus(m)[0], 'no');
  assert.equal(ctx.critOf(m)[0], false);
  const card = ctx.taranisScorecard(m)[0];
  assert.equal(card.state, 'failed');
  assert.match(card.note, /newest intention/i);
});

test('the marker also works through evidence_scored and as a JSON string', () => {
  const m = { ...TPSF, evidence_scored: JSON.stringify({ newest_intention_criteria: { long_short: false } }) };
  assert.equal(ctx.critStatus(m)[0], 'no');
});

test('rescore agrees with the card: never matched on the old tag', () => {
  const r = ctx.rescore({ ...marked(TPSF), is_tech_investor: true, tech_signal: 'Set by a person (test)' });
  assert.notEqual(r.q, 'matched');
});

test('long_short true or a missing marker changes nothing', () => {
  const m = { ...TPSF, evidence: { newest_intention_criteria: { long_short: true } } };
  assert.equal(ctx.critStatus(m)[0], 'yes');
});

/* Run with: npm test
   The Tech evidence tier (techTier in app.js, 12 Nov 2026) that "best match first" sorts on
   within a verdict: 1 a stated tech / AI interest (Grok quote, or a person's Tech choice),
   2 a "primary investment themes" line, 3 alert text only, 4 none. Quotes are stored ones. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const start = src.indexOf('const RE_THEMES_LINE = ');
const end = src.indexOf('\n}\n', src.indexOf('function techTier(m)', start)) + 3;
const ctx = {
  // Stand-ins for the app's own helpers that techTierOfRow calls.
  evidenceObj: (m) => (m && m.evidence && typeof m.evidence === 'object') ? m.evidence : {},
  techSetByPerson: (m) => /^Set by a person/.test(String((m && m.tech_signal) || '')),
  techOf: (m) => !!(m && (m.is_tech_investor === true || /\b(tech|technology|ai)\b/i.test(m.intention_summary || '')))
};
vm.createContext(ctx);
vm.runInContext(src.slice(start, end) + '\nthis.techTier = techTier;', ctx);
const grok = (q) => ({ is_tech_investor: true, tech_signal: 'With Intelligence profile (Grok): "' + q + '"' });

test('a stated tech or AI interest is tier 1', () => {
  for (const q of [
    'Key sectors of interest include AI and related technologies.',
    'Prioritizes opportunities in technology while maintaining a highly selective approach to oil and gas investments.',
    'Plans to increase its investments in AI and other high-growth companies in the United States.',
    'with a focus on investments in technology and healthcare.'
  ]) assert.equal(ctx.techTier(grok(q)), 1, q);
  assert.equal(ctx.techTier({ is_tech_investor: true, tech_signal: 'Set by a person: someone, 2026-11-11' }), 1);
});

test('a themes line is tier 2, whether Grok or the theme-line read stored it', () => {
  assert.equal(ctx.techTier(grok("The investor's primary investment themes over the next 12-18 months focus on artificial intelligence.")), 2);
  assert.equal(ctx.techTier(grok('Primary investment themes over the next 12-18 months focus on digital infrastructure and AI.')), 2);
  assert.equal(ctx.techTier({ is_tech_investor: true,
    tech_signal: 'With Intelligence profile (theme line): "primary investment themes over the next 12-18 months target artificial intelligence"' }), 2);
});

test('a themes line inside a hedge fund intention is tier 1 (evidence.tech_hf_intention)', () => {
  const okabena = { is_tech_investor: true,
    tech_signal: 'With Intelligence profile (Grok): "The investor\'s primary investment themes over the next 12-18 months focus on energy transition, digital infrastructure, artificial intelligence."',
    evidence: { tech_hf_intention: '"... digital infrastructure, artificial intelligence ..." (hedge fund intention, 2026-02-23)' } };
  assert.equal(ctx.techTier(okabena), 1);
  assert.equal(ctx.techTier(Object.assign({}, okabena, { evidence: {} })), 2);
  // Alert-text Tech stays a low match even with a hedge fund intention stored.
  assert.equal(ctx.techTier({ is_tech_investor: null, intention_summary: 'technology', evidence: { tech_hf_intention: 'x' } }), 3);
});

test('alert text only is tier 3, no technology tier 4, a person\'s No is tier 4', () => {
  assert.equal(ctx.techTier({ is_tech_investor: null, tech_signal: null, intention_summary: 'Looking at technology managers.' }), 3);
  assert.equal(ctx.techTier({ is_tech_investor: null, tech_signal: null, intention_summary: 'Credit only.' }), 4);
  assert.equal(ctx.techTier({ is_tech_investor: false, tech_signal: 'Set by a person: someone, 2026-11-11' }), 4);
});

test('the strongest tier across the card\'s alerts counts', () => {
  const card = Object.assign(grok('The investor\'s primary investment themes include AI.'),
    { _intentions: [grok('Interested in AI, energy transition and biotech.')] });
  assert.equal(ctx.techTier(card), 1);
});

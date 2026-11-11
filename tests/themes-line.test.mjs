/* Run with: npm test
   With Intelligence "investment themes" lines (11 Nov 2026): a line naming a technology theme
   counts as technology; security & defence counts as Space. Same rule in WI 01. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const grab = (a, b) => src.slice(src.indexOf(a), src.indexOf(b, src.indexOf(a)));
const ctx = {};
vm.createContext(ctx);
vm.runInContext([grab('const RE_TECH =', '// Technology, as the score reads it.'),
  grab('const RE_SPACE', '\n'), 'this.isTech = isTech; this.RE_SPACE = RE_SPACE;'].join('\n'), ctx);
const wi01 = readFileSync(new URL('../n8n/wi01-apply-hard-criteria.js', import.meta.url), 'utf8');
const THEME_TECH = eval(wi01.match(/const THEME_TECH = (\/.*\/i);/)[1]);
const SPACE = eval(wi01.match(/const SPACE = (\/.*\/i);/)[1]);

const UTIMCO = "the investor's investment theme over the next 12-18 months includes artificial intelligence.";
const GTF = "the investor's primary investment themes over the next 12-18 months focus on healthcare and longevity, and security and defense.";
const MIX = "the investor's primary investment themes include energy transition, blockchain and digital infrastructure.";
const CAUTION = "consultant, aon, expressed caution over ai-driven investment themes and recommended diversifying away from equity-linked exposures.";

test('a themes line naming AI, blockchain or digital infrastructure is technology (app and WI 01)', () => {
  for (const t of [UTIMCO, MIX]) { assert.equal(ctx.isTech(t), true, t); assert.equal(THEME_TECH.test(t), true, t); }
});
test('healthcare and security & defence themes are not technology', () => {
  assert.equal(ctx.isTech(GTF), false); assert.equal(THEME_TECH.test(GTF), false);
});
test('a caution about AI-driven themes is not technology', () => {
  assert.equal(ctx.isTech(CAUTION), false); assert.equal(THEME_TECH.test(CAUTION), false);
});
test('AI outside a themes line still needs a tech word', () => {
  assert.equal(ctx.isTech('uses ai in its investment process.'), false);
});
test('security & defence is Space; cybersecurity is not', () => {
  for (const t of [GTF, 'themes include security & defence', 'security and defence']) { assert.equal(ctx.RE_SPACE.test(t), true, t); assert.equal(SPACE.test(t), true, t); }
  assert.equal(ctx.RE_SPACE.test('themes include cybersecurity and data'), false);
  assert.equal(SPACE.test('themes include cybersecurity and data'), false);
});

test('profile-read evidence is shown, not scored (industry tags, stored intentions, via-fund names)', () => {
  const src2 = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  const c2 = {}; vm.createContext(c2);
  const g = (a, b) => src2.slice(src2.indexOf(a), src2.indexOf(b, src2.indexOf(a)));
  vm.runInContext(g('const EVIDENCE_NOT_SCORED', 'function evidenceText') + g('function evidenceText', '// Strategy tags are read as words') + '; this.evidenceText = evidenceText;', c2);
  const t = c2.evidenceText({ wi_investor_id: '1', wi_industries: ['Technology', 'Software & Computer Services'],
    wi_intentions: [{ note: 'Looking for long/short equity managers.' }], discovery: { via_fund: 'Global Equity Long Short Fund' },
    wi_themes_line: 'themes include artificial intelligence', emerging_evidence: 'Considers emerging managers.' });
  assert.doesNotMatch(t, /technology|software|long\/short|long short|artificial/i);
  assert.match(t, /emerging managers/);
});

test('equity in a hedge-fund context counts toward long/short; long-only, private equity and checked exclusions do not', () => {
  const src3 = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  const c3 = {}; vm.createContext(c3);
  const g = (a, b) => src3.slice(src3.indexOf(a), src3.indexOf(b, src3.indexOf(a)));
  vm.runInContext([g('const jsonArr', '\n};') + '\n};', g('function stratWords', '\n}') + '\n}',
    g('const RE_EQ_TAG', '// Long/short without the equity rule'), 'this.equityInHf = equityInHf;'].join('\n'), c3);
  const hf = { asset_classes: ['Hedge Funds'] };
  assert.equal(c3.equityInHf({ ...hf, strategies: ['macro', 'equity', 'multi_strategy'] }), 'tag');      // Maihar: may match
  assert.equal(c3.equityInHf({ ...hf, strategies: ['Fundamental Equity'] }), 'tag');
  assert.equal(c3.equityInHf({ asset_classes: ['Hedge Funds', 'Equity', 'Private Equity'], strategies: ['Equity'] }), 'review');   // mixed: Review only
  assert.equal(c3.equityInHf({ ...hf, strategies: ['Equity', 'Long Only'] }), 'review');                    // long-only beside it
  assert.equal(c3.equityInHf({ ...hf, strategies: ['Equity'], evidence: { equity_review_only: 'fund vehicle' } }), 'review');
  assert.equal(c3.equityInHf({ asset_classes: ['Hedge Funds', 'Equity'], strategies: ['Equity'], evidence: { equity_long_short: 'quote' } }), 'quote');
  assert.equal(c3.equityInHf({ asset_classes: ['Equity', 'Fixed Income'], strategies: ['Equity'] }), null);  // no hedge-fund context
  assert.equal(c3.equityInHf({ ...hf, strategies: ['Long Only', 'Equity Market-Neutral'] }), null);
  assert.equal(c3.equityInHf({ asset_classes: [], strategies: [], intention_summary: 'Planning new hedge fund commitments to relative value, equity and macro.' }), 'text');
  assert.equal(c3.equityInHf({ asset_classes: [], strategies: [], intention_summary: 'Planning new private equity and hedge fund commitments.' }), null);
  assert.equal(c3.equityInHf({ asset_classes: [], strategies: [], intention_summary: 'Hedge funds alongside long-only equity.' }), null);
  assert.equal(c3.equityInHf({ ...hf, strategies: ['equity'], evidence: { equity_not_long_short: 'public equity commitments only' } }), null);
});

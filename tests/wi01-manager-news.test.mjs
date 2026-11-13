/* Run with: npm test
   WI 01 "Apply Taranis Hard Criteria": manager news found by its links and
   headline (11 Nov 2026), on the node code as it stands in n8n/. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const code = readFileSync(new URL('../n8n/wi01-apply-hard-criteria.js', import.meta.url), 'utf8');
const run = (m) => new Function('$json', code)(Object.assign({ strategies: '[]', asset_classes: '[]' }, m)).json;
const links = (...labels) => JSON.stringify(labels.map(label => ({ label, url: '' })));
const isMgrNews = (j) => /manager news \((With Intelligence links only|headline is a manager event)/.test(String(j.hard_fail_reasons || ''));

test('untagged manager stories are manager news', () => {
  assert.ok(isMgrNews(run({ investor_name: 'HF Ranch', intention_summary: "Ex-Citadel analyst's startup HF Ranch unveils firm leadership",
    source_links: links('View manager', "Ex-Citadel analyst's startup HF Ranch unveils firm leadership", 'View article') })));
  assert.ok(isMgrNews(run({ investor_name: 'Startup HF Convexa', intention_summary: 'Startup HF Convexa taps QVR founder as CIO',
    source_links: links('View manager', 'Startup HF Convexa taps QVR founder as CIO', 'View article') })));
  assert.ok(isMgrNews(run({ investor_name: 'X', intention_summary: 'Ex-analyst to debut small-cap fund', source_links: links('Ex-analyst to debut small-cap fund', 'View article') })));
});

test('allocators stay', () => {
  // an investor page, even with a hire headline
  assert.ok(!isMgrNews(run({ investor_name: 'Heinz Endowments', intention_summary: 'Heinz Endowments taps Kresge for CIO',
    source_links: links('View investor', 'Heinz Endowments taps Kresge for CIO', 'View article') })));
  // a seeder that backs startups, linked to its manager page
  assert.ok(!isMgrNews(run({ investor_name: 'Stable Asset Management', intention_summary: 'Stable bolsters top seeding role as it backs more startups',
    source_links: links('View manager', 'Stable bolsters top seeding role as it backs more startups') })));
  // a search, with no investor page
  assert.ok(!isMgrNews(run({ investor_name: "Seidor founding family's new CIO", investor_type: 'family office',
    intention_summary: "Seidor founding family's new CIO launches l/s HF search", source_links: links("Seidor founding family's new CIO launches l/s HF search", 'View article') })));
});

test('Matched needs long/short AND technology (11 Nov 2026)', () => {
  const ls = run({ investor_name: 'Pension A', investor_type: 'Public D.B.', intention_summary: 'Searching for long/short equity managers.', source_links: links('View investor') });
  assert.equal(ls.hard_status, 'uncertain');
  assert.equal(ls.score_band, 'strong');
  const lt = run({ investor_name: 'Pension B', investor_type: 'Public D.B.', intention_summary: 'Searching for technology long/short equity managers.', source_links: links('View investor') });
  assert.equal(lt.hard_status, 'pass');
  assert.equal(lt.score_band, 'strong_tech');
  const ls_space = run({ investor_name: 'Pension C', investor_type: 'Public D.B.', intention_summary: 'Searching for long/short managers in the space economy.', source_links: links('View investor') });
  assert.equal(ls_space.hard_status, 'uncertain');
});

test('equity in a hedge-fund context counts toward long/short (11 Nov 2026)', () => {
  const base = { investor_type: 'Foundation', source_links: links('View investor') };
  // a hedge-fund sentence naming equity, with technology: a match
  const txt = run({ ...base, investor_name: 'F1', intention_summary: 'Planning new hedge fund commitments to relative value, equity and multi-strategy, with a focus on artificial intelligence and technology.' });
  assert.equal(txt.sig_strong, true); assert.equal(txt.hard_status, 'pass'); assert.equal(txt.score_band, 'strong_tech');
  // an equity tag, hedge funds the only asset class: long/short (a match with technology)
  const onlyHf = run({ ...base, investor_name: 'F2', asset_classes: '["Hedge Funds"]', strategies: '["macro","equity","multi_strategy","credit"]', intention_summary: 'Focus on technology.' });
  assert.equal(onlyHf.sig_strong, true); assert.equal(onlyHf.hard_status, 'pass');
  // an equity tag beside other asset classes: long/short for review only, never a match
  const mixed = run({ ...base, investor_name: 'F3', asset_classes: '["Hedge Funds","Equity","Private Equity"]', strategies: '["macro","equity","multi_strategy","credit"]', intention_summary: 'Focus on technology.' });
  assert.equal(mixed.sig_strong, true); assert.equal(mixed.hard_status, 'uncertain'); assert.equal(mixed.score_band, 'strong');
  // long-only beside it: review only
  const lo = run({ ...base, investor_name: 'F4', asset_classes: '["Hedge Funds"]', strategies: '["equity","long_only","macro","credit"]', intention_summary: 'Focus on technology.' });
  assert.equal(lo.hard_status, 'uncertain');
  // private equity / long-only equity in a hedge-fund sentence: not long/short
  const pe = run({ ...base, investor_name: 'F5', intention_summary: 'New private equity and hedge fund commitments; hedge funds alongside long-only equity.' });
  assert.equal(pe.sig_strong, false);
});

test('checked, no matching strategy is low fit; no hedge-fund strategy stated stays needs data (13 Nov 2026)', () => {
  const hf = JSON.stringify(['Hedge Funds']);
  assert.equal(run({ investor_name: 'X Pension', investor_type: 'Corporate D.B.', asset_classes: hf,
    strategies: JSON.stringify(['Macro', 'Convertible Bonds', 'Commodities']) }).score_band, 'low');
  assert.equal(run({ investor_name: 'Y Endowment', investor_type: 'Endowment', asset_classes: hf,
    intention_summary: 'Planning to make new hedge fund commitments. Strategies: Event-Driven, Macro, and Multi-Strategy.' }).score_band, 'low');
  assert.equal(run({ investor_name: 'Z Endowment', investor_type: 'Endowment', asset_classes: hf,
    intention_summary: 'Planning to make new commitments over the next 12-18 months.' }).score_band, 'needs_data');
  // a long menu is the whole With Intelligence menu: no conclusion
  assert.equal(run({ investor_name: 'W Fund', investor_type: 'Pension', asset_classes: hf,
    strategies: JSON.stringify(['macro', 'credit', 'event_driven', 'cta', 'multi_strategy']) }).score_band, 'needs_data');
});

test('WI 01: a long/short tag in a long strategy list does not make long/short; "quantitative analysis" is not quant (13 Nov 2026)', () => {
  const base = { investor_name: 'Some Pension', investor_type: 'Public D.B.', investor_country: 'US', asset_classes: JSON.stringify(['Hedge Funds', 'Equity']),
    intention_summary: 'Plans new hedge fund commitments.', source_links: JSON.stringify([{ label: 'View investor', url: '' }]) };
  assert.equal(run({ ...base, strategies: JSON.stringify(['macro', 'event_driven', 'credit', 'relative_value', 'long/short equity']) }).sig_strong, false);
  assert.equal(run({ ...base, strategies: JSON.stringify(['macro', 'long/short equity']) }).sig_strong, true);
  assert.equal(run({ ...base, intention_summary: 'The first step is focused on quantitative analysis of the manager.' }).sig_strong, false);
});

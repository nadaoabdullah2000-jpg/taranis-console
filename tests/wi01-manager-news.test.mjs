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
